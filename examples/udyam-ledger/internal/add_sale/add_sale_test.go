package addsale

import (
	"bytes"
	"encoding/json"
	"os"
	"path/filepath"
	"strings"
	"testing"
	"time"
)

func tempLedger(t *testing.T) string {
	t.Helper()
	return filepath.Join(t.TempDir(), "sales.jsonl")
}

func readAll(t *testing.T, path string) []Sale {
	t.Helper()
	data, err := os.ReadFile(path)
	if err != nil {
		t.Fatalf("read ledger: %v", err)
	}
	var out []Sale
	for _, line := range strings.Split(strings.TrimSpace(string(data)), "\n") {
		if line == "" {
			continue
		}
		var s Sale
		if err := json.Unmarshal([]byte(line), &s); err != nil {
			t.Fatalf("parse line %q: %v", line, err)
		}
		out = append(out, s)
	}
	return out
}

func TestAdd_HappyPath(t *testing.T) {
	path := tempLedger(t)
	now := time.Date(2026, 4, 25, 10, 30, 0, 0, time.UTC)

	sale, msg, err := Add("12500", "chai", path, now)
	if err != nil {
		t.Fatalf("Add: %v", err)
	}
	if sale.Paise != 12500 {
		t.Errorf("paise = %d, want 12500", sale.Paise)
	}
	if sale.Item != "chai" {
		t.Errorf("item = %q, want chai", sale.Item)
	}
	if !strings.Contains(msg, "Namaste") || !strings.Contains(msg, "Dhanyavad") {
		t.Errorf("confirmation missing bilingual greeting: %s", msg)
	}
	if !strings.Contains(msg, "₹125.00") {
		t.Errorf("confirmation missing formatted rupees: %s", msg)
	}

	got := readAll(t, path)
	if len(got) != 1 {
		t.Fatalf("ledger has %d entries, want 1", len(got))
	}
}

func TestAdd_AppendsMultiple(t *testing.T) {
	path := tempLedger(t)
	now := time.Date(2026, 4, 25, 10, 30, 0, 0, time.UTC)

	if _, _, err := Add("1000", "biscuit", path, now); err != nil {
		t.Fatal(err)
	}
	if _, _, err := Add("25000", "rice 5kg", path, now); err != nil {
		t.Fatal(err)
	}
	got := readAll(t, path)
	if len(got) != 2 {
		t.Fatalf("got %d entries, want 2", len(got))
	}
	if got[1].Item != "rice 5kg" {
		t.Errorf("second entry item = %q", got[1].Item)
	}
}

func TestAdd_EmptyItem(t *testing.T) {
	_, _, err := Add("100", "  ", tempLedger(t), time.Now())
	if err == nil {
		t.Fatal("expected error for empty item")
	}
	if !strings.Contains(err.Error(), "khaali") {
		t.Errorf("error not bilingual: %v", err)
	}
}

func TestAdd_NonNumericAmount(t *testing.T) {
	_, _, err := Add("abc", "chai", tempLedger(t), time.Now())
	if err == nil {
		t.Fatal("expected error for non-numeric amount")
	}
}

func TestAdd_ZeroAmount(t *testing.T) {
	_, _, err := Add("0", "chai", tempLedger(t), time.Now())
	if err == nil {
		t.Fatal("expected error for zero amount")
	}
}

func TestAdd_NegativeAmount(t *testing.T) {
	_, _, err := Add("-50", "chai", tempLedger(t), time.Now())
	if err == nil {
		t.Fatal("expected error for negative amount")
	}
}

func TestRun_HappyPath(t *testing.T) {
	path := tempLedger(t)
	var w bytes.Buffer
	code := Run([]string{"5000", "milk", "1L"}, path, &w)
	if code != 0 {
		t.Fatalf("Run exit = %d, want 0; output=%s", code, w.String())
	}
	if !strings.Contains(w.String(), "milk 1L") {
		t.Errorf("output missing combined item: %q", w.String())
	}
}

func TestRun_BadArgs(t *testing.T) {
	var w bytes.Buffer
	code := Run([]string{"5000"}, tempLedger(t), &w)
	if code != 2 {
		t.Errorf("Run exit = %d, want 2", code)
	}
	if !strings.Contains(w.String(), "usage:") {
		t.Errorf("missing usage line: %q", w.String())
	}
}

func TestRun_BadAmount(t *testing.T) {
	var w bytes.Buffer
	code := Run([]string{"oops", "chai"}, tempLedger(t), &w)
	if code != 3 {
		t.Errorf("Run exit = %d, want 3", code)
	}
}
