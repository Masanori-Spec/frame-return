# Native pin and API evidence

Researched 2026-10-04. Primary source: the exact upstream Scribus 1.6.1 source
archive distributed by the official Ubuntu archive, read without building,
installing or launching Scribus. No university website was accessed.

## Package and source pin

- [Ubuntu noble amd64 Scribus package](https://packages.ubuntu.com/en/noble/amd64/scribus)
  lists `1.6.1-0ubuntu7` and requires the matching `scribus-data` version.
- [Official source descriptor](https://archive.ubuntu.com/ubuntu/pool/universe/s/scribus/scribus_1.6.1-0ubuntu7.dsc)
  identifies the exact upstream archive and its SHA-256.
- [Official upstream source archive](https://archive.ubuntu.com/ubuntu/pool/universe/s/scribus/scribus_1.6.1.orig.tar.xz),
  73,266,900 bytes, SHA-256
  `e09dd78e6db61d01b9321108fededbccd6ec0ab352dd5bafdb8b041f0ef79e99`.
  The downloaded source archive's checksum matched the descriptor during this
  research. No unverified binary download is used by the harness; apt uses the
  runner's configured signed official archive.

The paths and line ranges below refer to that archive's `scribus-1.6.1/` root.
Do not substitute the moving master branch: its format/API may differ.

## Native SLA writer

`scribus/plugins/fileloader/scribus150format/scribus150format_save.cpp`:

- Lines 1791–1800: `writeStoryText` writes a `StoryText` wrapper containing
  `DefaultStyle` followed by `writeITEXTs` output.
- Lines 1803–1936: text runs use `ITEXT` elements and `CH`; paragraph boundaries
  use `para`; the final paragraph style uses `trail`. Other special characters
  can produce separate elements and are intentionally absent from these fixtures.
- Lines 948–1014: `putCStyle`/`putNamedCStyle` write `CPARENT`, `FONT`, `FONTSIZE`,
  `FCOLOR`, `SCALEH`, `SCALEV` and other inherited/direct style attributes. Named
  styles use `CNAME`; `writeCharStyles` writes `CHARSTYLE` definitions.
- Lines 2180–2204: unlinked frames use `NEXTITEM=-1`, `BACKITEM=-1`; ordinary
  unlinked text writes its `StoryText` inside its object.
- Line 2781: user-supplied object names are written as `ANNAME`.
- Line 2839: a normal image's `PFILE` is written using `Path2Relative`.
- Object identifiers use native pointer hashes. Semantically deterministic
  fixtures must not be described as byte-identical between processes.

This directly resolves the 1.6.1 wrapper-versus-legacy question: generated native
files use `PAGEOBJECT/StoryText/ITEXT`, not direct `PAGEOBJECT/ITEXT`.

## Scripter entry and termination

- `scribus/scribusapp.cpp`: defines `--no-gui/-g`, `--no-splash/-ns`,
  `--lang/-l`, `--prefs/-pr`, `--python-script/-py`. Its parser requires the
  Python-script option after ordinary options and handles following arguments
  specially. The harness therefore passes the job via environment + JSON.
- `scribus/plugins/scriptplugin/cmddoc.h/.cpp`: documents/implements
  `newDocument`, `saveDocAs`, `openDoc`, `setInfo`, `closeDoc`.
  `newDocument` swaps its supplied dimensions for landscape orientation; the
  fixture passes `(340, 500)` to obtain an actual `(500, 340)` point page.
  `closeDoc` clears modified state before closing, avoiding a save prompt.
- `scribus/plugins/scriptplugin/scriptplugin.cpp`: registers `scribus_version`,
  the Scripter functions used here, and PDFfile.
- The outer driver enforces wall-clock deadlines independently of the native
  event loop. The worker uses standard Python result-file flushing and
  `os._exit`, avoiding Scripter's interactive exception presentation.

## Text, named styles, geometry and image readback

- `scribus/plugins/scriptplugin/cmdtext.h/.cpp`: `getAllText` returns whole
  story text, but a current text selection limits it. The harness clears
  selection first. `selectText` counts characters from zero; `getFont`,
  `getFontSize`, `getTextColor` read the first selected character. Every
  character is examined, including overflowed text.
- `cmdtext.cpp`, `scribus_istextoverflowing`: native `textOverflows` invalidates
  layout, lays the frame out and returns `frameOverflows()`. The harness also
  explicitly calls `layoutText` before readback.
- `cmdtext.h/.cpp`: `getPrevLinkedFrame` and `getNextLinkedFrame` return None
  at the respective unlinked boundaries.
- `cmdstyle.h/.cpp`, `scribus_createcharstyle`: supports named character
  styles and calls `redefineCharStyles(..., false)`, allowing an existing named
  definition to be updated. In this version `scaleh=1.0` and `scalev=1.0`
  produce native 100% scaling (internal multiplication by 1000).
- `cmdobj.h/.cpp`: `setCharacterStyle` applies a named character style to a
  text selection. `getCharacterStyle` reads the selected character's parent
  style name. `getParagraphStyle` reads the selected character's paragraph
  parent-style name (or None); the harness records the actual value at every
  character and maps the source run's value when replacement length changes.
- `cmdgetprop.h/.cpp`: `getPosition` and `getSize` use document measurement
  units; the worker sets points. `getImageFile` returns the loaded image path.
- `cmdmani.h/.cpp`, `cmdobj.h/.cpp`: native create, move, resize, load-image
  and scale-image-to-frame functions used for fixture construction.
- `scribus/pageitem.h`: ordinary TextFrame has type value 4; ImageFrame has
  type value 2. Group/table/path-text fixtures are intentionally excluded.

## PDF oracle

- `scribus/plugins/scriptplugin/objpdffile.cpp` and
  `doc/en/scripterapi-PDFfile.html`: `PDFfile.file`, `pages`, `version`,
  `fontEmbedding`, `fonts`, `compress`, `downsample`, and `save` are supported.
  `fontEmbedding=0` embeds fonts and `downsample=0` prevents image downsampling.
- Poppler's installed `pdfimages -list`, `pdftotext`, and `pdftoppm` provide
  independent exported-image, text and raster evidence. Their package versions
  are recorded in the manifest/report rather than silently assumed.

## Verification boundary

Source inspection proves API and serialization intent. It is not an execution
pass. Only completed hosted CI with the generated fixtures, real browser
downloads and successful fresh native checks establishes this release gate.
