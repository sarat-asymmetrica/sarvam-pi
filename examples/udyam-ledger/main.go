// udyam-ledger — tiny shopkeeper bookkeeping CLI.
//
// Entry point dispatches to subcommands based on argv[1]:
//   add-sale         — append a sale to sales.jsonl
//   weekly-summary   — print the current week's summary (bilingual)
//   export-csv       — export the current week's sales to CSV
//
// Subcommand implementations live in internal/<subcommand>/.
package main

import (
	"fmt"
	"os"

	addsale "udyam-ledger/internal/add_sale"
	exportcsv "udyam-ledger/internal/export_csv"
	weeklysummary "udyam-ledger/internal/weekly_summary"
)

const ledgerFile = "sales.jsonl"

func usage() {
	fmt.Fprintln(os.Stderr, "udyam-ledger — sales ledger for kirana store owners")
	fmt.Fprintln(os.Stderr, "")
	fmt.Fprintln(os.Stderr, "Commands:")
	fmt.Fprintln(os.Stderr, "  add-sale <amount-paise> <item>   Log a sale to sales.jsonl")
	fmt.Fprintln(os.Stderr, "  weekly-summary                   Print this week's summary (Hindi/English)")
	fmt.Fprintln(os.Stderr, "  export-csv [out.csv]             Export this week's sales to CSV")
	fmt.Fprintln(os.Stderr, "  help                             Show this message")
}

func main() {
	if len(os.Args) < 2 {
		usage()
		os.Exit(2)
	}
	switch os.Args[1] {
	case "help", "-h", "--help":
		usage()
	case "add-sale":
		os.Exit(addsale.Run(os.Args[2:], ledgerFile, os.Stdout))
	case "weekly-summary":
		os.Exit(weeklysummary.Run(os.Args[2:], ledgerFile, os.Stdout))
	case "export-csv":
		os.Exit(exportcsv.Run(os.Args[2:], ledgerFile, os.Stdout))
	default:
		fmt.Fprintf(os.Stderr, "unknown command: %s\n\n", os.Args[1])
		usage()
		os.Exit(2)
	}
}
