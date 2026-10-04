# Verification record

## Verified hosted build

All five jobs passed in [Actions run 37220860607](https://github.com/Masanori-Spec/frame-return/actions/runs/37220860607), for commit `09a08b05e2b5b1e50897763d895473f253ecb357`, on 2026-10-04:

- 55 Node behavioral/static test groups on Node 22 and 24
- 42 independent Python/lxml oracle regression tests and actual-output byte/XML comparisons
- 11 native-harness non-native tests
- 16 sandboxed Chromium browser cases; no page errors or external requests
- Real fixtures generated in official Ubuntu Scribus 1.6.1-0ubuntu7, followed by actual short/long browser downloads reopened in separate fresh Scribus processes under Xvfb

All eight browser screenshots and three native PDF rasters from that run were visually inspected. Japanese success notices follow language changes, conflict details translate to Japanese, and the mobile reset action stays on one line. No clipping or overlap was found. These were targeted corrections to issues observed in the earlier passing run 37220146519.

The [compact evidence snapshot](evidence/hosted/README.md) contains unchanged hosted artifact files, their SHA-256 values and the tested application-file hashes. The snapshot records the cited application commit. Later documentation or evidence-publication commits must have their own final-head CI checked before delivery; they do not change the historical run recorded here.

No browser or Scribus application was launched locally for these changes. No security settings were altered and browser sandboxing was not disabled. The initial combined Ubuntu 24.04 job could not start bundled Chromium under that runner's user-namespace policy; the workflow uses supported separate runners without changing those policies.

## Five-job hosted workflow

`.github/workflows/verify.yml` runs:

1. Unit/byte-oracle job on Node 22, Ubuntu 24.04
2. Unit/byte-oracle job on Node 24, Ubuntu 24.04
3. Native fixture generation on Ubuntu 24.04, uploading `frame-return-native-fixtures`
4. Sandboxed Chromium on Ubuntu 22.04, consuming those fixtures and uploading its actual SLA downloads in `frame-return-browser-downloads`, plus screenshot/trace evidence in `frame-return-browser-evidence`
5. Fresh native reopening on Ubuntu 24.04, consuming the actual downloads without regenerating or repairing them, and uploading `frame-return-native-reopen-evidence`

All native stages retain exact official Ubuntu packages `scribus=1.6.1-0ubuntu7` and `scribus-data=1.6.1-0ubuntu7`. Native scripts recheck package/runtime versions. Workflow dependencies require successful generation and browser checks before reopening. Relative image assets travel with the synthetic fixtures; output SLA files remain beside the current SLA.

## Observed native results

The short fixture returned `Community ` + `studio` in place of `Open ` + `studio`. Native readback confirmed x=80, y=48, width=260, height=48, current 24 pt bold/book character styles and named-style parents, the unchanged current paragraph style, sidebar 18:30, repeated original words in another caption, and the same resolved relative checker image. The short headline did not overflow.

The long fixture contained 1,006 characters and did overflow. Native readback retained the same 24 pt styles and geometry; no automatic shrinking occurred. Both returned SLA files remained byte-unchanged during native verification. PDF export, text extraction, embedded-image checks and rasterization passed; the page images were inspected. Packet/correction identity and original/current/output receipt hashes match the actual files.

Actual-download SHA-256 values for the recorded run:

- Short: `674d0cf4186f7f6094f884c44ee04b12f38af43131a54e043f93aaf18f1f4943`
- Long: `494c30e2ee6186a34af8c896b3a4b201b2fd408bbcbe7008ef2b5262b69c1ca0`

Native IDs are process-dependent, so those fixture/output hashes identify this run rather than a cross-run reproducible document.

## Browser coverage

The 16 cases cover Japanese/English desktop, 390 px Japanese mobile, keyboard entry, explicit frame selection/approval, the separately retained original review packet, source/review/correction/current imports, reset, malformed imports, byte-identical no-op downloads, stale repeat application, sidebar conflicts and explicit exclusions, actual packet/SLA/receipt downloads, and real native short/long fixtures. The mobile case additionally asserts translated notices after language switching, Japanese conflict details, reversible English/Japanese switching, and an unwrapped reset action without horizontal overflow.

The required PDFs are Scribus-native layout exports, not printouts of the browser's copyediting interface. The browser does not provide a Scribus layout preview.

## Source review status

Independent source review is incomplete. One reported functional issue involving caller-owned objects changing while asynchronous hashes were pending was repaired. Packet/correction/edit/approval inputs are detached before asynchronous work, and the same validated snapshots are used for application. Six delayed-digest regressions pass, including pending newline substitution and approval-list changes. Approved output wording and frame eligibility are checked again before release. Functional checks do not constitute a completed independent source review.

## Independent oracle and local checks

`tools/oracle.py` shares no JavaScript parser/patch implementation. It uses lxml with DTD/entity/network behavior disabled, then an independent lexical byte scanner. Every non-CH value, topology, text/tail and unassigned CH is checked; changed runs must equal a separately authored expected JSON. Only actually changed approved CH byte spans are masked; every remaining byte must match. No-ops require full byte identity.

Local checks pass: 55 Node groups on Node 24.19.0, 42 oracle tests, two generated-output comparisons, 11 harness tests, build/bundle parsing, JavaScript/Python syntax and shell syntax. Local lxml is 6.1.1; hosted lxml is pinned to 6.0.2. See the [local record](local-check.json).

## Acceptance boundaries

Consumer verification covers pinned Scribus 1.6.1 on Linux with the stated synthetic fixtures and DejaVu fonts. Other 1.6.x versions, operating systems, fonts, complex production files, linked stories, tables and other excluded constructs are not established by these results. The parser accepts its bounded 1.6.x profile, but that is not a universal rendering guarantee. Preserve original documents and review every real output in Scribus, including overflow, styles, images and PDF, before production use.
