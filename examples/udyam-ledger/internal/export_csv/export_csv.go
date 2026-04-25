// Package exportcsv writes the most-recent week of sales to a CSV file
// suitable for the shopkeeper's accountant.
//
// Headers (per the brief): date, item, amount, paise, total_paise.
// "amount" is the rupees-and-paise display string ("125.50"); "paise" is
// the raw integer; "total_paise" is the running sum so the accountant can
// scan the bottom row.
package exportcsv

import (
	"encoding/csv"
	"fmt"
	"io"
	"os"
	"strconv"
	"time"

	weeklysummary "udyam-ledger/internal/weekly_summary"
)

const DefaultOutFile = "weekly_export.csv"

// Headers are the canonical column order. Keep stable for accountant tooling.
var Headers = []string{"date", "item", "amount", "paise", "total_paise"}

// Export writes the sales (filtered to the current 7-day window relative to
// `now`) to w as CSV. Returns count of rows written and final running total.
func Export(sales []weeklysummary.Sale, now time.Time, w io.Writer) (int, int64, error) {
	cw := csv.NewWriter(w)
	defer cw.Flush()
	if err := cw.Write([]string{"# udyam-ledger weekly export — saptaahik bikri (₹ in paise)"}); err != nil {
		return 0, 0, err
	}
	if err := cw.Write(Headers); err != nil {
		return 0, 0, err
	}

	from := now.Add(-weeklysummary.DefaultWindow)
	var total int64
	rows := 0
	for _, s := range sales {
		ts, err := time.Parse(time.RFC3339, s.Timestamp)
		if err != nil {
			continue
		}
		if ts.Before(from) || ts.After(now) {
			continue
		}
		total += s.Paise
		rupees := s.Paise / 100
		paise := s.Paise % 100
		if err := cw.Write([]string{
			ts.Format("2006-01-02"),
			s.Item,
			fmt.Sprintf("%d.%02d", rupees, paise),
			strconv.FormatInt(s.Paise, 10),
			strconv.FormatInt(total, 10),
		}); err != nil {
			return rows, total, err
		}
		rows++
	}
	cw.Flush()
	return rows, total, cw.Error()
}

// Run is the CLI entry point. args[0] (optional) overrides the output path.
func Run(args []string, ledgerPath string, w io.Writer) int {
	if ledgerPath == "" {
		ledgerPath = "sales.jsonl"
	}
	outPath := DefaultOutFile
	if len(args) > 0 && args[0] != "" {
		outPath = args[0]
	}

	sales, err := weeklysummary.Load(ledgerPath)
	if err != nil {
		fmt.Fprintln(w, "✗ failed to read ledger:", err)
		return 3
	}
	if len(sales) == 0 {
		fmt.Fprintln(w, "✗ ledger is empty / ledger khaali hai")
		return 4
	}

	out, err := os.Create(outPath)
	if err != nil {
		fmt.Fprintln(w, "✗ failed to create CSV:", err)
		return 5
	}
	defer out.Close()

	rows, total, err := Export(sales, time.Now(), out)
	if err != nil {
		fmt.Fprintln(w, "✗ export failed:", err)
		return 6
	}
	rupees := total / 100
	paise := total % 100
	fmt.Fprintf(w, "✓ Wrote %d rows to %s — total ₹%d.%02d (Dhanyavad!)\n", rows, outPath, rupees, paise)
	return 0
}
