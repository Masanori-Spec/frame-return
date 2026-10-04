"""Scripter entry point. Imported only by the pinned Scribus process in hosted CI.

Every path is provided by harness.py. All exceptions are caught and written to a
machine-readable result before os._exit: no interactive Scripter error dialogs.
No output SLA is resaved during verification.
"""

import hashlib
import json
import os
from pathlib import Path
import sys
import traceback

sys.path.insert(0, os.environ["FRAME_RETURN_NATIVE_TOOLS"])
from contract import (ASSET_RELATIVE_PATH, BASE_RUNS, CAPTION, FONT_BOLD, FONT_BOOK,
                      IMAGE_NAME, LONG_RUNS, PRIMARY_STYLE, SCRIBUS_VERSION,
                      SECONDARY_STYLE, SHORT_RUNS, TEXT_NAMES)


def require(condition, message):
    if not condition:
        raise AssertionError(message)


def close_enough(actual, expected, label):
    require(len(actual) == len(expected), label + ": wrong dimensions")
    require(all(abs(a - b) < 0.001 for a, b in zip(actual, expected)),
            "%s: %r != %r" % (label, actual, expected))


def define_headline_styles(s, current):
    # createCharStyle intentionally redefines the existing style of this name.
    # Native 1.6.1 implementation calls redefineCharStyles(..., false).
    size = 24 if current else 20
    s.createCharStyle(name=PRIMARY_STYLE, font=FONT_BOLD, fontsize=size,
                      fillcolor="Ink", scaleh=1.0, scalev=1.0)
    s.createCharStyle(name=SECONDARY_STYLE, font=FONT_BOOK, fontsize=size,
                      fillcolor="AccentCurrent" if current else "AccentBaseline",
                      scaleh=1.0, scalev=1.0)


def plain_text(s, name, text, box, size):
    s.createText(*box, name)
    s.setText(text, name)
    s.setFont(FONT_BOOK, name)
    s.setFontSize(size, name)
    s.setTextColor("Ink", name)
    s.setTextDistances(0, 0, 0, 0, name)
    s.setLineSpacing(size * 1.25, name)


def read_text_frame(s, name):
    s.selectText(0, 0, name)
    s.layoutText(name)
    text = s.getAllText(name)
    # Inspect EVERY character, including the invisible overflow portion. RLE is
    # only an output-size reduction, never a sampling shortcut.
    style_runs = []
    for index in range(len(text)):
        s.selectText(index, 1, name)
        style = {"font": s.getFont(name), "size": s.getFontSize(name),
                 "color": s.getTextColor(name),
                 "namedStyle": s.getCharacterStyle(name),
                 "paragraphStyle": s.getParagraphStyle(name)}
        if style_runs and style_runs[-1]["style"] == style:
            style_runs[-1]["length"] += 1
        else:
            style_runs.append({"start": index, "length": 1, "style": style})
    s.selectText(0, 0, name)
    return {"text": text, "geometry": list(s.getPosition(name)) + list(s.getSize(name)),
            "type": s.getObjectType(name), "previous": s.getPrevLinkedFrame(name),
            "next": s.getNextLinkedFrame(name),
            "overflow": bool(s.textOverflows(name, 1)), "styleRuns": style_runs}


def snapshot(s):
    require(s.pageCount() == 1, "Fixture must contain exactly one page")
    close_enough(s.getPageSize(), [500, 340], "Page dimensions")
    result = {name: read_text_frame(s, name) for name in TEXT_NAMES}
    for name, frame in result.items():
        require(frame["type"] == "TextFrame", name + " is not ordinary text")
        require(frame["previous"] is None and frame["next"] is None,
                name + " unexpectedly links to another frame")
    require(s.getObjectType(IMAGE_NAME) == "ImageFrame", "Missing image frame")
    image_file = Path(s.getImageFile(IMAGE_NAME)).resolve()
    require(image_file.is_file(), "Native image path does not resolve")
    result[IMAGE_NAME] = {"resolvedPath": str(image_file),
                          "sha256": hashlib.sha256(image_file.read_bytes()).hexdigest(),
                          "geometry": list(s.getPosition(IMAGE_NAME)) + list(s.getSize(IMAGE_NAME))}
    return result


def assert_headline(frame, runs, current, source_frame=None):
    require(frame["text"] == "".join(runs), "Headline text readback mismatch")
    close_enough(frame["geometry"], [80, 48, 260, 48] if current else [40, 48, 200, 48],
                 "Headline geometry")
    size = 24 if current else 20
    # Capture the actual paragraph-style readback, including None when native
    # returns it. Never assume a locale-specific default paragraph-style name.
    # The synthetic source has exactly two original character-style runs;
    # preserve each corresponding run's paragraph style as text length changes.
    source = source_frame if source_frame is not None else frame
    require(source["text"] == "".join(BASE_RUNS), "Paragraph-style source is not the unchanged native headline")
    source_styles = source["styleRuns"]
    require(len(source_styles) == 2 and
            [(run["start"], run["length"]) for run in source_styles] ==
            [(0, len(BASE_RUNS[0])), (len(BASE_RUNS[0]), len(BASE_RUNS[1]))],
            "Unexpected source style-run topology for paragraph-style mapping")
    paragraph_styles = [run["style"]["paragraphStyle"] for run in source_styles]
    expected = [
        {"start": 0, "length": len(runs[0]), "style":
         {"font": FONT_BOLD, "size": size, "color": "Ink", "namedStyle": PRIMARY_STYLE,
          "paragraphStyle": paragraph_styles[0]}},
        {"start": len(runs[0]), "length": len(runs[1]), "style":
         {"font": FONT_BOOK, "size": size,
          "color": "AccentCurrent" if current else "AccentBaseline",
          "namedStyle": SECONDARY_STYLE, "paragraphStyle": paragraph_styles[1]}},
    ]
    require(frame["styleRuns"] == expected,
            "Native resolved character/paragraph styles changed: %r != %r" % (frame["styleRuns"], expected))


def export_pdf(s, destination):
    pdf = s.PDFfile()
    pdf.file = str(destination)
    pdf.pages = [1]
    pdf.version = 14
    pdf.fontEmbedding = 0
    pdf.fonts = [FONT_BOOK, FONT_BOLD]
    pdf.compress = 1
    pdf.downsample = 0
    pdf.save()
    require(destination.is_file() and destination.stat().st_size > 1000, "PDF export missing")


def generate(s, job):
    work = Path(job["workdir"])
    # 1.6.1 swaps the supplied width/height for LANDSCAPE; supply the portrait
    # dimensions to obtain a 500x340 point page (and keep sidebar on the page).
    require(s.newDocument((340, 500), (24, 24, 24, 24), s.LANDSCAPE,
                          1, s.UNIT_POINTS, s.PAGE_1, 0, 1), "Document creation failed")
    s.setInfo("FrameReturn synthetic CI fixture", "FrameReturn native fixture", "No personal data")
    s.defineColorRGB("Ink", 25, 35, 45)
    s.defineColorRGB("AccentBaseline", 173, 58, 55)
    s.defineColorRGB("AccentCurrent", 0, 114, 122)
    define_headline_styles(s, False)
    s.createText(40, 48, 200, 48, "headline")
    s.setText("".join(BASE_RUNS), "headline")
    s.setTextDistances(0, 0, 0, 0, "headline")
    s.setLineSpacing(30, "headline")
    s.selectText(0, len(BASE_RUNS[0]), "headline")
    s.setCharacterStyle(PRIMARY_STYLE, "headline")
    s.selectText(len(BASE_RUNS[0]), len(BASE_RUNS[1]), "headline")
    s.setCharacterStyle(SECONDARY_STYLE, "headline")
    s.selectText(0, 0, "headline")
    plain_text(s, "sidebar", "18:00", (370, 48, 90, 44), 18)
    plain_text(s, "caption", CAPTION, (40, 275, 420, 35), 11)
    s.createImage(40, 130, 96, 96, IMAGE_NAME)
    s.loadImage(str(work / ASSET_RELATIVE_PATH), IMAGE_NAME)
    s.setScaleImageToFrame(1, 1, IMAGE_NAME)
    baseline = snapshot(s)
    assert_headline(baseline["headline"], BASE_RUNS, False)
    require(not baseline["headline"]["overflow"], "Baseline unexpectedly overflows")
    s.saveDocAs(str(work / "baseline.sla"))
    s.moveObjectAbs(80, 48, "headline")
    s.sizeObject(260, 48, "headline")
    define_headline_styles(s, True)
    s.setText("18:30", "sidebar")
    current = snapshot(s)
    assert_headline(current["headline"], BASE_RUNS, True)
    require(not current["headline"]["overflow"], "Current unexpectedly overflows")
    s.saveDocAs(str(work / "current.sla"))
    export_pdf(s, work / "current.pdf")
    s.closeDoc()
    return {"baseline": baseline, "current": current}


def check(s, job):
    path = Path(job["input"])
    require(s.openDoc(str(path)), "Native openDoc failed")
    s.setUnit(s.UNIT_POINTS)
    result = snapshot(s)
    runs = SHORT_RUNS if job["case"] == "short" else LONG_RUNS
    expected = job["currentSnapshot"]
    assert_headline(result["headline"], runs, True, source_frame=expected["headline"])
    require(result["headline"]["overflow"] == (job["case"] == "long"),
            "Native overflow result does not match case")
    require(result["sidebar"]["text"] == "18:30", "Unrelated sidebar update was lost")
    require(result["caption"]["text"] == CAPTION, "Unrelated caption changed")
    for name in ("sidebar", "caption", IMAGE_NAME):
        require(result[name] == expected[name], name + " changed relative to current native readback")
    export_pdf(s, Path(job["pdf"]))
    # The browser-produced bytes remain untouched: no saveDoc or saveDocAs here.
    s.closeDoc()
    return {"readback": result, "pdf": job["pdf"], "freshProcess": True,
            "browserDownloadResaved": False}


def main():
    job = json.loads(Path(os.environ["FRAME_RETURN_NATIVE_JOB"]).read_text(encoding="utf-8"))
    result = {"ok": False, "nonce": job["nonce"], "mode": job["mode"]}
    try:
        import scribus as s
        version = str(s.scribus_version)
        result["scribusVersion"] = version
        require(version == SCRIBUS_VERSION, "Unexpected native version " + version)
        fonts = set(s.getFontNames())
        require(FONT_BOOK in fonts and FONT_BOLD in fonts, "Pinned fixture fonts unavailable")
        result.update(generate(s, job) if job["mode"] == "generate" else check(s, job))
        result["ok"] = True
    except BaseException as error:
        result["error"] = str(error)
        result["traceback"] = traceback.format_exc()
    with open(job["result"], "w", encoding="utf-8") as stream:
        json.dump(result, stream, ensure_ascii=False, indent=2)
        stream.write("\n")
        stream.flush()
        os.fsync(stream.fileno())
    # The outer process owns cleanup/timeouts. Explicit termination also avoids
    # dialogs, unsaved-document prompts, and a lingering Qt event loop.
    sys.stdout.flush()
    sys.stderr.flush()
    os._exit(0 if result["ok"] else 1)


if __name__ == "__main__":
    main()
