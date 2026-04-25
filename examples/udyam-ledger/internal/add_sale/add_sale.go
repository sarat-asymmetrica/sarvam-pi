// Package addsale implements the add-sale subcommand: append a new sale
// record to sales.jsonl in the working directory.
//
// Sale records are stored as one JSON object per line so the file is both
// append-only-friendly (durable) and trivially streamable for the
// weekly-summary subcommand.
package addsale

import (
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"os"
	"strconv"
	"strings"
	"time"
)

// LedgerFile is the default ledger path. Tests pass a custom one.
const LedgerFile = "sales.jsonl"

// Sale is a single ledger entry. Amount is stored in paise (integer) so we
// never lose paise to float rounding.
type Sale struct {
	Timestamp string `json:"ts"`             // RFC3339
	Item      string `json:"item"`           // freeform short label
	Paise     int64  `json:"paise"`          // amount in paise (1 INR = 100 paise)
	Currency  string `json:"currency,omitempty"`
}

// Add validates inputs, builds a Sale, and appends it to ledgerPath. Returns
// the appended Sale and a bilingual confirmation message.
func Add(paiseArg, item, ledgerPath string, now time.Time) (Sale, string, error) {
	item = strings.TrimSpace(item)
	if item == "" {
		return Sale{}, "", errors.New("item must not be empty / item khaali nahi ho sakta")
	}

	paise, err := strconv.ParseInt(strings.TrimSpace(paiseArg), 10, 64)
	if err != nil {
		return Sale{}, "", fmt.Errorf("invalid amount %q: %w / amount sahi nahi hai", paiseArg, err)
	}
	if paise <= 0 {
		return Sale{}, "", errors.New("amount must be positive / amount positive hona chahiye")
	}

	sale := Sale{
		Timestamp: now.UTC().Format(time.RFC3339),
		Item:      item,
		Paise:     paise,
		Currency:  "INR",
	}

	if err := appendSale(ledgerPath, sale); err != nil {
		return Sale{}, "", fmt.Errorf("append failed / ledger me nahi likh paaye: %w", err)
	}

	return sale, formatConfirmation(sale), nil
}

func appendSale(path string, sale Sale) error {
	f, err := os.OpenFile(path, os.O_APPEND|os.O_CREATE|os.O_WRONLY, 0o644)
	if err != nil {
		return err
	}
	defer f.Close()
	enc := json.NewEncoder(f)
	return enc.Encode(sale)
}

// formatConfirmation produces the bilingual confirmation line.
//   "Namaste — sold {item} for ₹{rupees}.{paise} (paise: {paise}). Dhanyavad!"
func formatConfirmation(s Sale) string {
	rupees := s.Paise / 100
	paise := s.Paise % 100
	return fmt.Sprintf(
		"Namaste — sold %s for ₹%d.%02d (paise: %d). Dhanyavad!",
		s.Item, rupees, paise, s.Paise,
	)
}

// Run is the CLI entry point: parses os.Args-style positional arguments,
// runs Add, prints the confirmation to w, and returns the exit code.
func Run(args []string, ledgerPath string, w io.Writer) int {
	if len(args) < 2 {
		fmt.Fprintln(w, "usage: udyam-ledger add-sale <amount-paise> <item>")
		return 2
	}
	if ledgerPath == "" {
		ledgerPath = LedgerFile
	}
	_, msg, err := Add(args[0], strings.Join(args[1:], " "), ledgerPath, time.Now())
	if err != nil {
		fmt.Fprintln(w, "✗", err.Error())
		return 3
	}
	fmt.Fprintln(w, "✓", msg)
	return 0
}
