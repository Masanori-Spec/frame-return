# Hosted evidence snapshot

Recorded run: [37220860607](https://github.com/Masanori-Spec/frame-return/actions/runs/37220860607)  
Tested commit: `09a08b05e2b5b1e50897763d895473f253ecb357`  
All five jobs passed on 2026-10-04. Independent source review remains incomplete.

`verification.json` records test counts, inspected images, file hashes and the tested application-file hashes. The files below are unchanged copies of hosted artifacts. Large traces and logs are omitted from the source package; the Actions run retains the full workflow context.

## Browser

`browser/` contains eight screenshots, the 16-case report, browser command-line evidence for sandboxing, synthetic-output oracles, and the actual short/long review and correction packet downloads. All screenshots were inspected. Japanese notices and conflict details translate on language switching, and the mobile reset action stays on one line.

## Native consumer

`native/` contains the real Scribus-generated baseline/current SLA, actual short/long browser-downloaded SLA, relative `assets/checker.png`, receipts, expected values, independent oracles, native check reports, and three native PDFs with page rasters. Save these SLA files in this directory to preserve their relative asset path.

The short replacement reads “Community studio” and fits. The long replacement has 1,006 characters and intentionally overflows. Both preserve current 24 pt mixed styles, x=80, width=260, sidebar 18:30, the separate repeated-text caption and the resolved image. Native verification does not resave the browser-produced SLA.

The native documents are synthetic fixtures. Passing them does not establish universal compatibility for real projects, other fonts, other versions, linked frames or excluded constructs. Review production outputs in Scribus.
