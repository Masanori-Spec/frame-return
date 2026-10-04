# Verification record

## Verified hosted baseline

All five jobs passed in [Actions run37220146519](https://github.com/Masanori-Spec/frame-return/actions/runs/37220146519), for commit `e4628478bf4ccbba9ccbbfee198c1dbc0683bff5`, on2026-10-04:

-53 Node behavioral/static test groups on Node22 and24
-42 independent Python/lxml oracle regression tests and actual-output byte/XML comparisons
-11 native-harness non-native tests
-16 sandboxed Chromium browser cases; no page errors or external requests
- Real fixtures generated in official Ubuntu Scribus1.6.1-0ubuntu7, and actual short/long browser downloads reopened in separate fresh Scribus processes under Xvfb

All eight browser screenshots and the native PDF rasters from that run were visually inspected. The inspection found three small Japanese/mobile UI issues: an existing success notice did not follow a language switch, a conflict explanation stayed English, and the mobile reset text wrapped awkwardly. The current follow-up changes address only those observed issues and add focused regressions. They pass55 Node groups locally, but **the follow-up revision still requires its own hosted CI and screenshot inspection**. The previous run proves its recorded commit, not changes made afterward.

No browser or Scribus application was launched locally for these changes. No security settings were altered and browser sandboxing was not disabled. The initial combined Ubuntu24.04 job could not start bundled Chromium under that runner's user-namespace policy; the workflow now uses supported separate runners without changing those policies.

## Five-job hosted workflow

`.github/workflows/verify.yml` runs:

1. Unit/byte-oracle job on Node22, Ubuntu24.04
2. Unit/byte-oracle job on Node24, Ubuntu24.04
3. Native fixture generation on Ubuntu24.04, uploading `frame-return-native-fixtures`
4. Sandboxed Chromium on Ubuntu22.04, consuming those fixtures and uploading its actual SLA downloads in `frame-return-browser-downloads`, plus screenshot/trace evidence in `frame-return-browser-evidence`
5. Fresh native reopening on Ubuntu24.04, consuming the actual downloads without regenerating or repairing them, and uploading `frame-return-native-reopen-evidence`

All native stages retain exact official Ubuntu packages `scribus=1.6.1-0ubuntu7` and `scribus-data=1.6.1-0ubuntu7`. Native scripts recheck the package/runtime versions. Workflow dependencies require successful generation and browser checks before reopening. Relative image assets travel with the synthetic fixtures; output SLA files remain beside the current SLA.

## Observed native results

The short fixture returned `Community ` + `studio` in place of `Open ` + `studio`. Native readback confirmed x80/y48/width260/height48, current24pt bold/book character styles and named-style parents, unchanged current paragraph style, sidebar18:30, the repeated original words in another caption, and the same resolved relative checker image. The short headline did not overflow.

The long fixture contained1,006 characters and did overflow. Native readback retained the same24pt styles and geometry; no automatic shrinking occurred. Both returned SLA files remained byte-unchanged during native verification. PDF export, text extraction, embedded-image checks and rasterization passed; the resulting page images were inspected.

Observed actual-download SHA-256 values for this baseline run:

- Short: `2d0411ca1527394906b8222fe0530e8cc842e2993be1f067c0a0a7fe4110d32a`
- Long: `ec9fe513756b6b702259c0d93bd622c6f88dc1392d3ca3c46af5117bca7f6729`

Native IDs are process-dependent, so those fixture/output hashes identify this run rather than a cross-run reproducible document.

## Browser coverage

The16 cases cover Japanese/English desktop,390px Japanese mobile, keyboard entry, explicit frame selection/approval, original review packet kept separately, source/review/correction/current imports, reset, malformed imports, byte-identical no-op downloads, stale repeat application, sidebar conflicts and explicit exclusions, actual packet/SLA/receipt downloads, and real native short/long fixtures. The mobile case now additionally asserts translated notices after language switching, Japanese conflict details, reversible English/Japanese switching, and an unwrapped reset action without horizontal overflow.

The required PDFs are Scribus-native layout exports, not printouts of the browser's copyediting interface. The browser does not provide a Scribus layout preview.

## Source review status

Independent source review is incomplete. One reported functional issue involving caller-owned objects changing while asynchronous hashes were pending was repaired. Packet/correction/edit/approval inputs are detached before asynchronous work, and the same validated snapshots are used for application. Six delayed-digest regressions pass, including pending newline substitution and approval-list changes. Approved output wording and frame eligibility are checked again before release. Functional checks do not constitute a completed independent source review.

## Independent oracle and local checks

`tools/oracle.py` shares no JavaScript parser/patch implementation. It uses lxml with DTD/entity/network behavior disabled, then an independent lexical byte scanner. Every non-CH value, topology, text/tail and unassigned CH is checked; changed runs must equal a separately authored expected JSON. Only actually changed approved CH byte spans are masked; every remaining byte must match. No-ops require full byte identity.

Current local checks:55 Node groups on Node24.19.0,42 oracle tests, two generated-output comparisons,11 harness tests, build/bundle parsing, JavaScript/Python syntax and shell syntax. Local lxml is6.1.1; hosted lxml is pinned6.0.2. See [local record](local-check.json).

## Acceptance boundaries

Consumer verification covers pinned Scribus1.6.1 on Linux with the stated synthetic fixtures and DejaVu fonts. Other1.6.x versions, operating systems, fonts, complex production files, linked stories, tables and other excluded constructs are not established by these results. The parser accepts its bounded1.6.x profile, but that is not a universal rendering guarantee. Preserve original documents and review every real output in Scribus, including overflow, styles, images and PDF, before production use.
