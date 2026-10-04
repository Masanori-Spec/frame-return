# FrameReturn

指定した文章を校正担当者に渡し、制作が進んだ Scribus レイアウトに戻す、小さなローカル処理ツールです。

A bounded copyediting handoff for existing Scribus layouts. The designer keeps moving, resizing and styling the working layout while selected wording is reviewed. Returned edits apply only if the assigned frame's complete baseline wording and run/paragraph structure still match.

**Current status: implementation and local parser/oracle checks; hosted browser and real Scribus acceptance gates are pending.** See [verification](docs/VERIFICATION.md). Do not treat the checked-in native harness as a native compatibility pass.

## Use / 使い方

Open `dist/index.html` in a modern browser. It is a self-contained file, with Japanese and English UI, and no server calls or local history. Alternatively, `npm run serve` serves the same file at `http://127.0.0.1:4173/frame-return/`.

1. **Prepare / 依頼:** In Scribus, assign stable, unique names to the text frames. Save an uncompressed SLA. Import that original SLA, explicitly select 1–32 eligible frames, and download `frame-return-review.json`. Keep the original review packet; give a copy to the copyeditor
2. **Review / 校正:** Import the review JSON. Edit words within each style run. Run and paragraph boundaries are fixed. Download `frame-return-corrections.json`
3. **Return / 適用:** Import the original review packet kept by the designer, the returned corrections, and the designer's latest SLA. Check the corrections. Approve each changed frame or explicitly exclude it. Conflicting frames block all output until excluded or assigned again from a fresh baseline
4. Download the revised SLA and receipt. Save the revised SLA **beside the current SLA**, so existing relative image paths continue to resolve. Reopen in Scribus and check styles, text overflow and exported PDF before use

When performed in a single browser session, the original packet/corrections carry forward between steps. A new session requires importing them again. Every new import invalidates previous comparison/output; reset clears all in-memory data. Closing the page loses unsaved work.

The browser does not render a Scribus page, promise text fit, auto-shrink, or package image assets. Review packets contain assigned wording; share them only with intended reviewers.

## Supported profile

- Uncompressed, XML 1.0, UTF-8 `SCRIBUSUTF8NEW` SLA declaring Scribus 1.6.x; 16 MiB maximum
- At most 32 selected uniquely named top-level ordinary `PAGEOBJECT` text frames (`PTYPE=4`, `NEXTITEM=BACKITEM=-1`, nonnegative page index)
- Up to 3,000 Unicode code points including paragraph breaks and 128 `ITEXT` runs per frame; at most 256 story elements
- Ordinary `ITEXT CH` runs, `para` paragraph boundaries and one final `trail`. Native `StoryText` needs its initial childless `DefaultStyle`; bounded legacy direct runs are parsed too, but are not a native-tested format
- Edit only text inside an existing run. Empty replacements are accepted; no paragraph or run insertion, deletion, merging or movement
- Unsupported linked/grouped/master/off-page/inline/table/note/variable/mark/special-tab/break/soft-hyphen constructs are excluded. Unsupported selected frames cannot produce a packet. Newly unsupported assigned frames become conflicts

The application uses unique frame names and complete baseline run structure/text, **not ItemID**, for matching. Frame renames and recreating frames with reused names are outside the guarantee. No fuzzy matching or word-based global replacement occurs. Identical text in unrelated frames stays untouched.

## Output contract

Only approved changed `ITEXT` `CH` attribute value ranges are patched in the **current** SLA. Every other input byte remains unchanged: current styles, geometry, item IDs, asset references, other text, attribute order, quoting and line endings. Changed values are XML-escaped using the existing quote delimiter. No-op output is byte-identical.

The receipt includes original/current/output SHA-256, packet identity, per-frame applied/unchanged/excluded status and changed run indexes. The original review packet is independently required when applying returns; its canonical contents must match the packet embedded in the corrections. SHA-256 checks integrity and identity, not authorship or a digital signature. Obtain the original assignment from a trusted source.

Repeated application is rejected as stale, even when current text already equals the requested replacement. A return is for one baseline, not an ongoing synchronization link.

## Develop and verify

```sh
npm ci --ignore-scripts
python3 -m pip install -r requirements.txt
npm run check
npm run fixture
npm run test:oracle
python3 -m unittest discover -s tools/native -p 'test_*.py' -v
```

`generated/` examples are **synthetic parser fixtures**, not valid native roundtrip evidence. The hosted GitHub Actions gate generates real fixtures in exact official Ubuntu Scribus `1.6.1-0ubuntu7`, exercises the sandboxed browser and its real downloads, and opens them in fresh Scribus processes under Xvfb. See [native gate](tools/native/README.md).

No project license has been selected. Runtime and development dependencies retain their own licenses; see [third-party notices](docs/THIRD_PARTY.md).

## Why this scope

The editorial handoff concept already exists in WordsFlow and InCopy. FrameReturn explores a small selected-frame return workflow for existing Scribus files. It is not a full editorial system, a replacement for native layout review, or a novelty claim. See [prior art](docs/PRIOR_ART.md) and [algorithm](docs/ALGORITHM.md).
