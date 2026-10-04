# Verification record

## Status at source freeze

This source package is prepared for review and hosted verification. No GitHub publication, paid service, permission expansion, local browser launch, or local Scribus installation/launch was performed by this build task.

Locally executed:

- Node24.19.0 build and52 behavioral/static test groups ([exact local record](local-check.json))
- JavaScript syntax and standalone-bundle parsing
-42 Python/lxml oracle regression tests (local lxml6.1.1; hosted pin6.0.2)
- Independent lxml + raw byte-mask checks on actual Node-produced synthetic revised output and byte-identical no-op
-11 native-harness non-native unit tests, Python compilation and shell syntax

**Not executed in this local environment:** sandboxed Chromium UI workflow; real native fixture generation; browser-download-to-Scribus reopen; native character/paragraph styles/geometry/image resolution/overflow; native PDF export/render and visual inspection. Their code exists, but these gates remain unrun. Mobile/browser appearance has not been visually validated here.

## Source review status

Independent source review is incomplete. One reported functional issue involving caller-owned objects changing while asynchronous hashes were pending has been repaired. Packet/correction/edit/approval inputs are detached before asynchronous work, and the same validated snapshots are used for application. Six delayed-digest regressions pass, including the reported pending newline substitution and approval-list changes. Approved output wording and frame eligibility are checked again before release. This repair does not constitute a completed independent source review.

## Hosted release gate

`.github/workflows/verify.yml` defines two required jobs:

1. Node22 and24 build/unit tests and independent byte/XML oracle
2. Sandboxed Chromium plus pinned official Ubuntu Scribus1.6.1-0ubuntu7 on ubuntu-24.04. This job generates real fixtures, uses the complete browser workflow and its download events, independently compares downloaded bytes, and reopens outputs in fresh Scribus processes under Xvfb

The hosted suite covers desktop English and Japanese,390px Japanese mobile screenshots, keyboard entry, original/review/current imports, separate trusted-original binding, explicit selection/approval, current-file replacement, reset, invalid imports, no-op output, repeat application, conflicting sidebar edits, and actual downloaded packet/SLA/receipt files. Script assertions alone do not establish visual quality; inspect its screenshots when the job runs.

The native short fixture changes `Open ` + `studio` to `Community ` + `studio`, preserving the designer-current x80/width260, changed named styles, sidebar18:30, repeated words in a separate caption and a relative image asset. A returned sidebar correction based on18:00 conflicts. The long replacement deliberately overflows; native reports must show overflow without any style/geometry shrink. Native PDFs are exported and rendered; the final reviewer should inspect those rendered pages too.

A passing source review or parser suite cannot replace these gates. When hosted verification completes, record the exact repository commit and Actions run URL, retain all artifacts, inspect screenshots/PDF rasters, and update this file with only observed results. Do not call the product native-verified before the real checks pass.

## Independent oracle

`tools/oracle.py` shares no JavaScript parser/patch implementation. It uses lxml with DTD/entity/network behavior disabled, then an independent lexical byte scanner. It validates every non-CH value, topology, text/tails and unassigned CH; changed output runs must equal a separately authored expected JSON. Only actually changed approved CH value byte spans are masked. Every remaining byte must match. Unchanged runs are never masked merely because they belong to a selected frame.

## Acceptance boundaries

Only the pinned1.6.1 native consumer is in the authored release gate. Other1.6.x versions, operating systems, third-party fonts, linked stories, tables and complex real projects are not established by that gate. The parser profile accepts bounded1.6.x files, but acceptance does not prove rendering compatibility. Every production document still needs native Scribus review.
