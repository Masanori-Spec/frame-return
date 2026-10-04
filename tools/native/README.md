# Hosted-native Scribus gate

This harness is a second oracle after the browser tests. It creates real native
fixtures, then opens **the browser-downloaded SLA bytes** in a new Scribus
process. It must not be replaced by XML-only tests or generated browser inputs.

## Exact supported environment

- GitHub-hosted `ubuntu-24.04`, Linux, Ubuntu noble
- Official Ubuntu archive packages `scribus=1.6.1-0ubuntu7` and
  `scribus-data=1.6.1-0ubuntu7`; no PPA, AppImage or unversioned fallback
- Runtime `scribus.scribus_version == '1.6.1'`
- DejaVu Sans Book and DejaVu Sans Bold from `fonts-dejavu-core`
- Xvfb, xauth and Poppler command-line tools

`install-ci.sh` checks the runner and OS before apt installation. The driver
checks the package pin again and Scripter checks its runtime version. Both
installation and native process execution refuse to run outside a GitHub Actions
Linux job. No native installation or native launch was performed while authoring
this harness. A checked-in harness is **not** evidence of a native pass.

The Scribus packages are exactly pinned. Supporting packages and the runner image
are recorded in each report, not claimed to be a fully reproducible OS image.

## Integration contract for the workflow and browser test

Run from the repository root, with a fresh artifact directory:

```sh
bash tools/native/install-ci.sh
python3 tools/native/harness.py generate --workdir native-artifacts
# Start the application. Run the browser native-roundtrip test here.
python3 tools/native/harness.py check --workdir native-artifacts \
  --input native-artifacts/returned-short.sla --case short
python3 tools/native/harness.py check --workdir native-artifacts \
  --input native-artifacts/returned-long.sla --case long
```

1. `generate` saves `baseline.sla` and `current.sla` through Scribus Scripter,
   and writes `manifest.json`, the relative asset, readback evidence and a current
   PDF preview. Treat `manifest.json` as the browser test's input contract.
2. Browser imports the real `baseline.sla`, exports its text handoff, edits the
   headline's **first run**, imports the real `current.sla`, applies the text
   handoff, and downloads a returned SLA. The app's actual download event must
   produce `returned-short.sla` beside `current.sla`. Do not synthesize or repair
   that file in the test.
3. Short runs are exactly `['Community ', 'studio']`, yielding
   `Community studio`. The second run remains unchanged.
4. Repeat from the same unchanged fixtures for the long case. Runs are exactly
   `['Community ' * 100, 'studio']`, yielding 1,006 characters. Download directly
   as `returned-long.sla` beside `current.sla`, so the original relative asset
   resolves. `manifest.cases.long.runs` supplies the exact strings.
5. `check` independently parses the returned file and launches a **fresh** native
   process for each case. It does not run the app core to create its input, patch
   it, resave it, or silently fix native import failures.
6. Upload the complete `native-artifacts/` directory with `if: always()` plus
   browser screenshots/traces. Gate release claims on both `check-short.json`
   and `check-long.json` reporting `ok: true` for the workflow's exact SHA.

Give the workflow a job timeout (suggested: 15 minutes). The driver gives each
native process a 120-second timeout; `--timeout` permits 1–600 seconds. Process
groups are killed on timeout, including Xvfb. The apt steps have their own
timeouts. Missing result, wrong result nonce, native exception, wrong version,
nonzero exit, missing export or timeout all fail closed.

## Fixture details

All coordinates use points. Four uniquely named top-level objects are generated:

| Object | Baseline | Current |
|---|---|---|
| `headline` | `(40,48,200,48)`, `Open ` + `studio` | `(80,48,260,48)`, same text |
| `sidebar` | `18:00` | `18:30` |
| `caption` | Starts with the same `Open studio` words | Unchanged |
| `hero-image` | `assets/checker.png` | Unchanged relative reference |

Text frames are ordinary, unlinked text. The headline has two named character
styles: `HeadlinePrimary` (bold, Ink) and `HeadlineSecondary` (Book, accent).
Both named definitions are redefined from 20pt to 24pt in current; the second
definition also changes from AccentBaseline to AccentCurrent. Native resolved
character styles and the serialized `CHARSTYLE` definitions are both checked.

The content, layout, styles and generated PNG are deterministic. Scribus 1.6.1
serializes some native object identities using pointer hashes; raw SLA/PDF bytes
are therefore **not** claimed to repeat across separate runs. Native outputs are
left untouched, and their SHA-256 hashes bind all checks to that run's fixtures.

## What the gate verifies

- Real native save, correct 1.6.1 `StoryText` serialization, exactly two headline
  ITEXT runs with the expected named-style parents
- Current named style definitions differ from baseline, use 24pt and current
  accent; current native geometry is x=80, width=260
- Returned XML differs from current only in authorized headline `CH`; named
  styles, all run style attributes, scaling, frame geometry, unrelated objects
  and relative asset reference survive unchanged
- Fresh native `openDoc`, full text and **every character's** resolved font,
  point size, fill color, named character style and paragraph style, compressed
  to runs in the report. Headline paragraph styles are mapped from the captured
  current native style runs as replacement lengths change, with no assumed
  default style name
- Sidebar remains `18:30`; caption and image readbacks remain unchanged. The
  caption deliberately repeats `Open studio`, proving the headline-only edit
- `getImageFile` resolves to the same asset hash, and the native PDF embeds a real
  96×96 image; merely finding a path string cannot satisfy the gate
- Short replacement does not overflow; long replacement does overflow via native
  `textOverflows`. No shrink-to-fit or auto-resize path is used
- Native PDF export, Poppler text readback and rendered page PNG
- Returned SLA hash is identical before and after native verification

No dialogs are intentionally opened. The worker catches exceptions and writes a
result, then exits the process explicitly. Unexpected native dialogs are treated
as timeouts, never as success. A new isolated profile and HOME is used for every
Scribus launch.

## Safe local checks (no native application)

```sh
python3 -m unittest discover -s tools/native -p 'test_*.py' -v
python3 -m py_compile tools/native/*.py
bash -n tools/native/install-ci.sh
```

These only validate the harness logic and syntax. They do not establish Scribus
compatibility, browser-to-native success, or a passing native gate. See
`SOURCES.md` for the exact source evidence used to author the harness.
