// Package weeklysummary reads sales.jsonl and emits a bilingual summary of
// the most recent 7-day window.
//
// The week is classified as calm / busy / peak using the digital-root regime
// fusion from the math primitive: DR(total_paise) → R1/R2/R3 → label.
// This is the "math at the heart" pattern in action: classification falls
// out of an O(1) deterministic rule, not a heuristic.
package weeklysummary

import (
	"bufio"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"os"
	"strings"
	"time"

	digitalroot "udyam-ledger/internal/math/digital_root"
)

// Sale is the on-disk record shape (matches add_sale.Sale).
type Sale struct {
	Timestamp string `json:"ts"`
	Item      string `json:"item"`
	Paise     int64  `json:"paise"`
	Currency  string `json:"currency,omitempty"`
}

// Summary captures the computed week metrics.
type Summary struct {
	Window     time.Duration
	WindowFrom time.Time
	WindowTo   time.Time
	Count      int
	TotalPaise int64
	DR         int
	Regime     digitalroot.Regime
	Label      string // calm | busy | peak (bilingual: shaant | vyast | charam)
	BilingualLabel string
}

// Default window length: last 7 days, ending at the reference time.
const DefaultWindow = 7 * 24 * time.Hour

// Load reads ledgerPath and returns all sales. Missing file => empty slice
// (a fresh shopkeeper has no sales yet, not an error).
func Load(ledgerPath string) ([]Sale, error) {
	f, err := os.Open(ledgerPath)
	if err != nil {
		if errors.Is(err, os.ErrNotExist) {
			return nil, nil
		}
		return nil, err
	}
	defer f.Close()
	return parse(f)
}

func parse(r io.Reader) ([]Sale, error) {
	var out []Sale
	sc := bufio.NewScanner(r)
	sc.Buffer(make([]byte, 0, 64*1024), 1024*1024)
	for sc.Scan() {
		line := strings.TrimSpace(sc.Text())
		if line == "" {
			continue
		}
		var s Sale
		if err := json.Unmarshal([]byte(line), &s); err != nil {
			return nil, fmt.Errorf("invalid ledger line: %w", err)
		}
		out = append(out, s)
	}
	return out, sc.Err()
}

// Compute filters sales to the [now-window, now] interval and returns a
// Summary. Bilingual labels follow regime mapping:
//
//	R1 (exploration)   → calm   / shaant
//	R2 (optimization)  → busy   / vyast
//	R3 (stabilization) → peak   / charam
func Compute(sales []Sale, now time.Time, window time.Duration) Summary {
	if window <= 0 {
		window = DefaultWindow
	}
	from := now.Add(-window)

	s := Summary{
		Window:     window,
		WindowFrom: from,
		WindowTo:   now,
	}
	for _, sale := range sales {
		ts, err := time.Parse(time.RFC3339, sale.Timestamp)
		if err != nil {
			continue // skip malformed timestamps
		}
		if ts.Before(from) || ts.After(now) {
			continue
		}
		s.Count++
		s.TotalPaise += sale.Paise
	}

	// Digital root operates on integers; cast to int (sum-of-digits is
	// invariant under int width for normal shopkeeper totals).
	s.DR = digitalroot.DR(int(s.TotalPaise))
	s.Regime = digitalroot.DRToRegime(s.DR)
	s.Label, s.BilingualLabel = labelFor(s.Regime)
	return s
}

func labelFor(r digitalroot.Regime) (en, hi string) {
	switch r {
	case digitalroot.R1:
		return "calm", "shaant"
	case digitalroot.R2:
		return "busy", "vyast"
	case digitalroot.R3:
		return "peak", "charam"
	}
	return "calm", "shaant"
}

// Format returns the bilingual report as a string.
func Format(s Summary) string {
	if s.Count == 0 {
		return "Namaste — no sales in the last 7 days. (कोई बिक्री नहीं हुई।) Dhanyavad!"
	}
	rupees := s.TotalPaise / 100
	paise := s.TotalPaise % 100
	header := fmt.Sprintf(
		"Namaste — weekly summary (%s to %s)",
		s.WindowFrom.Format("2006-01-02"),
		s.WindowTo.Format("2006-01-02"),
	)
	body := fmt.Sprintf(
		"  Sales:    %d entries\n  Total:    ₹%d.%02d (%d paise)\n  DR(total): %d → regime %s\n  Week is:  %s / %s",
		s.Count, rupees, paise, s.TotalPaise, s.DR, s.Regime, s.Label, s.BilingualLabel,
	)
	return header + "\n" + body + "\n  Dhanyavad!"
}

// Run is the CLI entry point.
func Run(args []string, ledgerPath string, w io.Writer) int {
	if ledgerPath == "" {
		ledgerPath = "sales.jsonl"
	}
	sales, err := Load(ledgerPath)
	if err != nil {
		fmt.Fprintln(w, "✗ failed to read ledger:", err)
		return 3
	}
	summary := Compute(sales, time.Now(), DefaultWindow)
	fmt.Fprintln(w, Format(summary))
	return 0
}
