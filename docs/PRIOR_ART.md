# Workflow and existing products

Research reviewed 2026-10-04. The observations below concern scope and workflow; they are not novelty, patentability, market-size or superiority claims.

## Existing solutions

- [WordsFlow, Em Software](https://emsoftware.com/products/WordsFlow/) already links Word content with InDesign stories and merges later wording changes while production continues. It supports a substantially broader linked workflow. FrameReturn does not invent concurrent copyediting and layout work
- [Adobe InCopy sharing content](https://helpx.adobe.com/incopy/desktop/work-with-indesign/managed-files/sharing-content.html) documents the InCopy/InDesign editorial workflow. Assignment and sharing concepts are established; FrameReturn does not provide that ecosystem, native editing-to-fit, check-out management or collaboration service
- [scribus_utils](https://github.com/gvellut/scribus_utils) includes a text import script using XML-like style markup. Its README describes lossless text export as unfinished. This is a close utility-scale alternative; the narrower FrameReturn addition is selected-frame assignment, a returned packet, and guarded application against a newer layout
- [ScribusGenerator](https://github.com/berteh/ScribusGenerator) uses data and prepared templates/placeholders to generate Scribus/PDF documents. FrameReturn starts with existing copy and returns selected wording corrections rather than data-driven template generation
- [Scribus text documentation](https://github.com/scribusproject/scribus/blob/master/doc/en/WwText.html) covers native direct editing, Story Editor and imports. Native Scribus remains the authoritative editor and final layout consumer

Historical Scribus forum discussions about [parallel editing/merging](https://forums.scribus.net/index.php?topic=689.0) and [text export/edit/import friction](https://forums.scribus.net/index.php?topic=572.0) motivate this workflow. They do not establish that old defects persist in current versions.

## Deliberate difference

The prototype serves small, existing Scribus documents with a browser-local handoff requiring no placeholder preparation: choose named text frames, review fixed style runs, and return approved wording to current bytes. Whole assigned wording and structure guard against stale returns, while the designer's newer geometry/style/unrelated edits remain byte-preserved. It intentionally sacrifices flexible paragraph editing, linked stories and rich editorial integration for a narrow inspectable operation.

This is useful only if the real consumer gate passes. An XML-only demonstration is insufficient to claim Scribus compatibility. The app does not promise reader-perfect layout, matching line breaks, preserved overflow behavior or automatic fit after different-length copy.

## Identity and serialization finding

Scribus's [serialization source](https://raw.githubusercontent.com/scribusproject/scribus/master/scribus/plugins/fileloader/scribus150format/scribus150format_save.cpp) derives ItemID from an in-memory item hash. ItemID is not used as a persistent document identity. The exact 1.6.1 source archive and Scripter APIs are recorded in [native sources](../tools/native/SOURCES.md).

No university sites were used. No customer contact, product purchase, permissions expansion or patent-candidate publication was performed for this build.
