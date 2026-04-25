package weeklysummary

import (
	"bytes"
	"encoding/json"
	"os"
	"path/filepath"
	"strings"
	"testing"
	"time"

	digitalroot "udyam-ledger/internal/math/digital_root"
)

func writeLedger(t *testing.T, sales []Sale) string {
	t.Helper()
	path := filepath.Join(t.TempDir(), "sales.jsonl")
	f, err := os.Create(path)
	if err != nil {
		t.Fatal(err)
	}
	defer f.Close()
	enc := json.NewEncoder(f)
	for _, s := range sales {
		if err := enc.Encode(s); err != nil {
			t.Fatal(err)
		}
	}
	return path
}

func TestCompute_FiltersOutsideWindow(t *testing.T) {
	now := time.Date(2026, 4, 25, 12, 0, 0, 0, time.UTC)
	sales := []Sale{
		{Timestamp: now.Add(-2 * 24 * time.Hour).Format(time.RFC3339), Item: "in", Paise: 1000},
		{Timestamp: now.Add(-30 * 24 * time.Hour).Format(time.RFC3339), Item: "old", Paise: 99999},
	}
	s := Compute(sales, now, DefaultWindow)
	if s.Count != 1 || s.TotalPaise != 1000 {
		t.Errorf("count=%d total=%d, want 1/1000", s.Count, s.TotalPaise)
	}
}

func TestCompute_RegimeFromDR(t *testing.T) {
	// DR(7) = 7 → R1 (calm). Total 700 paise → DR 7 → R1.
	now := time.Date(2026, 4, 25, 12, 0, 0, 0, time.UTC)
	sales := []Sale{
		{Timestamp: now.Add(-1 * time.Hour).Format(time.RFC3339), Paise: 700, Item: "tea"},
	}
	s := Compute(sales, now, DefaultWindow)
	if s.DR != 7 {
		t.Errorf("DR = %d, want 7", s.DR)
	}
	if s.Regime != digitalroot.R1 {
		t.Errorf("regime = %v, want R1", s.Regime)
	}
	if s.Label != "calm" || s.BilingualLabel != "shaant" {
		t.Errorf("labels = %s/%s, want calm/shaant", s.Label, s.BilingualLabel)
	}
}

func TestCompute_R2Busy(t *testing.T) {
	// Total 2000 → DR 2 → R2 (busy/vyast).
	now := time.Date(2026, 4, 25, 12, 0, 0, 0, time.UTC)
	sales := []Sale{
		{Timestamp: now.Add(-1 * time.Hour).Format(time.RFC3339), Paise: 2000, Item: "x"},
	}
	s := Compute(sales, now, DefaultWindow)
	if s.Regime != digitalroot.R2 || s.Label != "busy" {
		t.Errorf("regime/label = %v/%s, want R2/busy", s.Regime, s.Label)
	}
	if s.BilingualLabel != "vyast" {
		t.Errorf("bilingual = %s, want vyast", s.BilingualLabel)
	}
}

func TestCompute_R3Peak(t *testing.T) {
	// Total 9000 → DR 9 → R3 (peak/charam).
	now := time.Date(2026, 4, 25, 12, 0, 0, 0, time.UTC)
	sales := []Sale{
		{Timestamp: now.Add(-1 * time.Hour).Format(time.RFC3339), Paise: 9000, Item: "x"},
	}
	s := Compute(sales, now, DefaultWindow)
	if s.Regime != digitalroot.R3 || s.Label != "peak" {
		t.Errorf("regime/label = %v/%s, want R3/peak", s.Regime, s.Label)
	}
	if s.BilingualLabel != "charam" {
		t.Errorf("bilingual = %s, want charam", s.BilingualLabel)
	}
}

func TestCompute_Empty(t *testing.T) {
	s := Compute(nil, time.Now(), DefaultWindow)
	if s.Count != 0 || s.TotalPaise != 0 {
		t.Errorf("expected zero summary, got %+v", s)
	}
}

func TestFormat_BilingualHeader(t *testing.T) {
	now := time.Date(2026, 4, 25, 12, 0, 0, 0, time.UTC)
	s := Compute([]Sale{
		{Timestamp: now.Add(-1 * time.Hour).Format(time.RFC3339), Paise: 12500, Item: "chai"},
	}, now, DefaultWindow)
	out := Format(s)
	for _, want := range []string{"Namaste", "Dhanyavad", "Total:", "DR(total)"} {
		if !strings.Contains(out, want) {
			t.Errorf("output missing %q:\n%s", want, out)
		}
	}
}

func TestFormat_EmptyMessage(t *testing.T) {
	out := Format(Summary{})
	if !strings.Contains(out, "no sales") {
		t.Errorf("empty summary should mention no sales: %s", out)
	}
}

func TestLoad_MissingFile(t *testing.T) {
	sales, err := Load(filepath.Join(t.TempDir(), "nope.jsonl"))
	if err != nil {
		t.Fatalf("expected nil error for missing file, got %v", err)
	}
	if len(sales) != 0 {
		t.Errorf("expected empty slice, got %d", len(sales))
	}
}

func TestLoad_RoundTrip(t *testing.T) {
	now := time.Date(2026, 4, 25, 12, 0, 0, 0, time.UTC)
	in := []Sale{
		{Timestamp: now.Format(time.RFC3339), Item: "chai", Paise: 1500},
		{Timestamp: now.Format(time.RFC3339), Item: "biscuit", Paise: 800},
	}
	path := writeLedger(t, in)
	got, err := Load(path)
	if err != nil {
		t.Fatal(err)
	}
	if len(got) != 2 || got[0].Item != "chai" || got[1].Paise != 800 {
		t.Errorf("roundtrip mismatch: %+v", got)
	}
}

func TestRun_HappyPath(t *testing.T) {
	// Use a timestamp relative to actual time.Now so the test is robust to
	// when the system clock is read inside Run (which uses time.Now directly).
	now := time.Now().UTC()
	in := []Sale{
		{Timestamp: now.Add(-time.Hour).Format(time.RFC3339), Item: "chai", Paise: 1500},
	}
	path := writeLedger(t, in)
	var w bytes.Buffer
	code := Run(nil, path, &w)
	if code != 0 {
		t.Fatalf("Run exit = %d", code)
	}
	if !strings.Contains(w.String(), "DR(total)") {
		t.Errorf("output missing DR line: %s", w.String())
	}
}
