package exportcsv

import (
	"bytes"
	"encoding/csv"
	"path/filepath"
	"strings"
	"testing"
	"time"

	weeklysummary "udyam-ledger/internal/weekly_summary"
)

func makeSales(now time.Time) []weeklysummary.Sale {
	return []weeklysummary.Sale{
		{Timestamp: now.Add(-2 * 24 * time.Hour).Format(time.RFC3339), Item: "chai", Paise: 1500},
		{Timestamp: now.Add(-1 * 24 * time.Hour).Format(time.RFC3339), Item: "rice 5kg", Paise: 25000},
		{Timestamp: now.Add(-30 * 24 * time.Hour).Format(time.RFC3339), Item: "old", Paise: 9999},
	}
}

func TestExport_FiltersWindow(t *testing.T) {
	now := time.Date(2026, 4, 25, 12, 0, 0, 0, time.UTC)
	var buf bytes.Buffer
	rows, total, err := Export(makeSales(now), now, &buf)
	if err != nil {
		t.Fatal(err)
	}
	if rows != 2 {
		t.Errorf("rows = %d, want 2 (third record outside window)", rows)
	}
	if total != 26500 {
		t.Errorf("total = %d, want 26500", total)
	}
}

func TestExport_HeaderAndRows(t *testing.T) {
	now := time.Date(2026, 4, 25, 12, 0, 0, 0, time.UTC)
	var buf bytes.Buffer
	if _, _, err := Export(makeSales(now), now, &buf); err != nil {
		t.Fatal(err)
	}

	r := csv.NewReader(&buf)
	r.FieldsPerRecord = -1 // tolerate the comment line that has 1 field
	records, err := r.ReadAll()
	if err != nil {
		t.Fatalf("parse CSV: %v", err)
	}
	if len(records) < 4 {
		t.Fatalf("expected at least 4 rows (comment + header + 2 data), got %d", len(records))
	}
	header := records[1]
	for i, h := range Headers {
		if header[i] != h {
			t.Errorf("header[%d] = %q, want %q", i, header[i], h)
		}
	}

	dataRows := records[2:]
	if dataRows[0][1] != "chai" || dataRows[0][2] != "15.00" {
		t.Errorf("first data row wrong: %v", dataRows[0])
	}
	if dataRows[1][4] != "26500" {
		t.Errorf("second running-total wrong: %v (want 26500)", dataRows[1][4])
	}
}

func TestRun_EmptyLedger(t *testing.T) {
	tmp := t.TempDir()
	var w bytes.Buffer
	code := Run([]string{filepath.Join(tmp, "out.csv")}, filepath.Join(tmp, "missing.jsonl"), &w)
	if code != 4 {
		t.Errorf("Run on missing ledger exit = %d, want 4", code)
	}
	if !strings.Contains(w.String(), "khaali") {
		t.Errorf("error not bilingual: %s", w.String())
	}
}
