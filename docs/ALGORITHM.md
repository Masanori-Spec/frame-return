# Application algorithm

## 1. Parse without changing bytes

A fatal UTF-8 decode preserves an optional BOM. Reject non-XML-1.0 scalars, DTD/entity declarations, CDATA, processing instructions after the initial declaration, namespaces, non-UTF-8 declarations, malformed XML and text-node content. XML comments and indentation are preserved. SAX supplies well-formedness checks with early depth/element bounds. A separate strict lexical scanner records every attribute value's JavaScript string offsets, quote delimiter, decoded value, ancestry and topology. Literal XML attribute CRLF normalization uses one space, matching XML 1.0.

Input is at most 16 MiB, with 200,000 elements and 64 levels of nesting. The returned SLA is never XML-serialized: it is made from slices of the original Unicode string, encoded back to UTF-8. Fatal decoding plus scalar validation ensures untouched character slices encode to the same input bytes, including BOM and line endings.

Public asynchronous operations first detach caller-owned packets, correction arrays, edit arrays and approval/exclusion options; SLA bytes are decoded before yielding. Validation returns detached data snapshots. Nested operations use those snapshots, so a caller changing an object while SHA-256 is pending cannot change the data later applied. After patching, approved run text and frame eligibility are checked again.

## 2. Derive the assigned profile

Find all PAGEOBJECT/MASTEROBJECT/FRAMEOBJECT names, including nontext objects, to detect ambiguous names. Only uniquely named top-level PTYPE=4 PAGEOBJECT text frames with explicit unlinked markers and ordinary content are eligible. Names are case-sensitive; whitespace is not trimmed for identity. Whole eligible story content, ordered element skeleton and paragraph/run positions are captured. Styles are deliberately excluded from the baseline guard: the designer may change them while wording is out for review.

Each review packet has strict versioned fields and a SHA-256 of canonical sorted-key JSON, excluding its id. It contains the original file's hash, filename, declared Scribus version, and the selected complete baseline frame structures/text. It contains no coordinates or asset bytes.

## 3. Review within fixed run boundaries

Correction values must correspond one-for-one and in order to each original run. No addition/removal/reordering is accepted. Replacement text cannot contain tabs, newlines, paragraph separators, object replacement characters, soft hyphens or private-use controls. The total 3,000-code-point limit applies after replacement, including fixed paragraph boundaries. Empty wording is allowed without deleting the run itself.

A return embeds the packet for portability, but the designer must separately supply the trusted original review packet. The two packets must match canonically, after both have passed schema/hash validation. This prevents a returned packet with a recomputed checksum and different baseline from silently changing the assignment. It does not establish the author's identity or defend against replacing both copies.

## 4. Compare against the current SLA

Find exactly one matching eligible frame name. Require the wrapper, complete element skeleton, paragraph/run positions and all baseline run text to match exactly. Geometry, style attributes and definitions may differ. No approximate textual matching, normalization of composed/decomposed Unicode, global word replacement, same-frame partial merge or ItemID matching occurs.

Missing or ambiguous names, unsupported new structure, any changed assigned wording, and any changed run segmentation become conflicts. Even if current wording equals the return, reject it deterministically as stale/already applied. Unchanged returned wording still guards its assigned baseline; concurrent edits do not evade a conflict by returning a no-op.

The UI requires a deliberate approval or exclusion decision for each changed frame. Conflicts must be explicitly excluded. No revised SLA is produced while an included conflict or unapproved changed frame remains. Decisions are not carried across reimports/reanalysis.

## 5. Patch exact ranges

For every approved changed run, XML-escape only its CH value, respecting the current quote delimiter. Apply patches from highest offset to lowest so preceding offsets stay valid. Skip equal run values entirely; their original entity spelling remains unchanged. Reparse the result before releasing it. Record all hashes and decisions in a receipt. Return immutable current bytes plus selected wording changes; never resave via Scribus during the browser patch.

## 6. Separate preservation from layout

The Python/lxml oracle independently parses both files, validates expected CH sequences and every other XML field, then independently masks only changed CH value byte ranges. Remaining byte sequences must be identical. A no-op comparison requires full byte identity.

Preserved bytes do not mean the replacement fits. Hosted native gates generate the fixture, exercise actual browser file imports/downloads, reopen output in a fresh pinned Scribus process, check Scripter readbacks, resolve the relative image, inspect overflow, export PDF and render it. The long case must overflow without shrinking. Production users still review every real document in Scribus.
