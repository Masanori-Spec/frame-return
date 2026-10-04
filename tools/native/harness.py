#!/usr/bin/env python3
"""Hosted-native Scribus gate. No native process runs outside GitHub Actions.

    python3 tools/native/harness.py generate --workdir native-artifacts
    python3 tools/native/harness.py check --workdir native-artifacts \
        --input native-artifacts/returned-short.sla --case short

Native generation and each verification use different Scribus processes and
fresh profiles. The input to check must be the browser download itself.
"""

import argparse
import hashlib
import json
import os
from pathlib import Path
import re
import shutil
import signal
import struct
import subprocess
import sys
import tempfile
import uuid
import xml.etree.ElementTree as ET
import zlib

from contract import (ASSET_RELATIVE_PATH, BASE_RUNS, IMAGE_NAME, PRIMARY_STYLE,
                      SCRIBUS_PACKAGE, SCRIBUS_VERSION, SECONDARY_STYLE, TEXT_NAMES,
                      public_contract)

TOOLS = Path(__file__).resolve().parent


def require(condition, message):
    if not condition:
        raise AssertionError(message)


def write_json(path, data):
    path.write_text(json.dumps(data, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")


def sha256(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


def run_bounded(command, *, timeout, env=None, cwd=None):
    """Timeout covers descendants, including Qt and the Xvfb wrapper/server."""
    process = subprocess.Popen(command, stdout=subprocess.PIPE, stderr=subprocess.STDOUT,
                               stdin=subprocess.DEVNULL, text=True, env=env, cwd=cwd,
                               start_new_session=True)
    try:
        output, _ = process.communicate(timeout=timeout)
    except subprocess.TimeoutExpired:
        os.killpg(process.pid, signal.SIGKILL)
        output, _ = process.communicate()
        raise RuntimeError("Timed out after %ss: %r\n%s" % (timeout, command, output))
    require(process.returncode == 0,
            "Command failed (%s): %r\n%s" % (process.returncode, command, output))
    return output


def environment_record():
    require(os.environ.get("GITHUB_ACTIONS") == "true" and os.environ.get("RUNNER_OS") == "Linux",
            "Native launch is restricted to the hosted GitHub Actions Linux job")
    release = Path("/etc/os-release").read_text()
    require(re.search(r'^ID=ubuntu$', release, re.M) and
            re.search(r'^VERSION_ID="24\.04"$', release, re.M),
            "The native pin requires ubuntu-24.04")
    for executable in ("scribus", "xvfb-run", "pdfimages", "pdftotext", "pdftoppm"):
        require(shutil.which(executable), "Missing required executable " + executable)
    packages = run_bounded(["dpkg-query", "-W", "-f=${Package}=${Version}\n", "scribus",
                            "scribus-data", "fonts-dejavu-core", "xvfb", "xauth", "poppler-utils"], timeout=15)
    found = dict(line.split("=", 1) for line in packages.splitlines())
    for package in ("scribus", "scribus-data"):
        require(found.get(package) == SCRIBUS_PACKAGE, "Package pin mismatch: " + package)
    return {"packages": found, "githubRunId": os.environ.get("GITHUB_RUN_ID"),
            "githubSha": os.environ.get("GITHUB_SHA"), "runnerImage": os.environ.get("ImageVersion")}


def launch_scribus(work, mode, timeout, **extra):
    label = mode if mode == "generate" else "check-" + extra["case"]
    logs = work / "logs"
    logs.mkdir(exist_ok=True)
    result_path = logs / (label + ".worker.json")
    job_path = logs / (label + ".job.json")
    job = {"mode": mode, "workdir": str(work), "result": str(result_path),
           "nonce": uuid.uuid4().hex, **extra}
    write_json(job_path, job)
    result_path.unlink(missing_ok=True)
    # Fresh HOME and --prefs prevent inherited profiles/fonts/defaults or a
    # remembered open document from affecting this individual native process.
    with tempfile.TemporaryDirectory(prefix="frame-return-native-") as home:
        prefs = Path(home) / "prefs"
        prefs.mkdir()
        runtime = Path(home) / "runtime"
        runtime.mkdir(mode=0o700)
        env = dict(os.environ, HOME=home, XDG_CONFIG_HOME=str(Path(home) / "config"),
                   XDG_CACHE_HOME=str(Path(home) / "cache"), XDG_RUNTIME_DIR=str(runtime),
                   QT_QPA_PLATFORM="xcb", LANG="C.UTF-8", LC_ALL="C.UTF-8", TZ="UTC",
                   FRAME_RETURN_NATIVE_JOB=str(job_path), FRAME_RETURN_NATIVE_TOOLS=str(TOOLS))
        # -py is the last option; paths are passed in a JSON job rather than
        # depending on Scribus' unusual Python-argument/document-argument split.
        command = ["xvfb-run", "-a", "-s", "-screen 0 1280x1024x24", "scribus",
                   "-g", "-ns", "-l", "en", "-pr", str(prefs),
                   "-py", str(TOOLS / "scribus_worker.py")]
        try:
            output = run_bounded(command, timeout=timeout, env=env, cwd=work)
        except BaseException as error:
            (logs / (label + ".log")).write_text(str(error), encoding="utf-8")
            if result_path.exists():
                raise RuntimeError(result_path.read_text(encoding="utf-8")) from error
            raise
        (logs / (label + ".log")).write_text(output, encoding="utf-8")
    require(result_path.is_file(), "Scripter returned without a native result")
    result = json.loads(result_path.read_text(encoding="utf-8"))
    require(result.get("nonce") == job["nonce"] and result.get("ok") is True,
            "Missing, failed, or stale native result: " + str(result))
    require(result.get("scribusVersion") == SCRIBUS_VERSION, "Scripter version mismatch")
    return result


def write_checker(path):
    """Deterministic 96x96 RGB asset, entirely synthetic, standard-library PNG."""
    def chunk(kind, payload):
        return struct.pack(">I", len(payload)) + kind + payload + struct.pack(">I", zlib.crc32(kind + payload))
    raw = bytearray()
    for y in range(96):
        raw.append(0)
        for x in range(96):
            raw.extend((220, 40, 170) if (x // 12 + y // 12) % 2 else (15, 185, 200))
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_bytes(b"\x89PNG\r\n\x1a\n" + chunk(b"IHDR", struct.pack(">IIBBBBB", 96, 96, 8, 2, 0, 0, 0))
                     + chunk(b"IDAT", zlib.compress(bytes(raw), 9)) + chunk(b"IEND", b""))


def read_sla(path):
    data = path.read_bytes()
    require(len(data) < 10_000_000, "Unexpectedly large synthetic fixture")
    require(b"<!ENTITY" not in data.upper() and b"SYSTEM" not in data.upper() and b"PUBLIC" not in data.upper(),
            "External entities/DTDs are not part of the fixture contract")
    root = ET.fromstring(data, parser=ET.XMLParser(target=ET.TreeBuilder(insert_comments=True, insert_pis=True)))
    require(root.tag == "SCRIBUSUTF8NEW" and root.get("Version") == SCRIBUS_VERSION,
            "Unexpected SLA format/version")
    document = root.find("DOCUMENT")
    require(document is not None, "Missing DOCUMENT")
    items = document.findall("PAGEOBJECT")
    require(len(items) == 4, "Expected exactly four top-level native objects")
    names = [item.get("ANNAME") for item in items]
    require(len(set(names)) == 4 and set(names) == set(TEXT_NAMES) | {IMAGE_NAME},
            "Unexpected, missing, or duplicate object names")
    frames = dict(zip(names, items))
    for name in TEXT_NAMES:
        item = frames[name]
        require(item.get("PTYPE") == "4" and item.get("NEXTITEM") == "-1" and item.get("BACKITEM") == "-1",
                "Fixture text must be ordinary and unlinked: " + name)
        require(item.find("PAGEOBJECT") is None, "Nested object unexpectedly present")
        story = item.find("StoryText")
        require(story is not None, "Native 1.6.1 StoryText wrapper missing")
        require(all(child.tag in ("DefaultStyle", "ITEXT", "trail") and len(child) == 0 for child in story),
                "Fixture contains unsupported story children")
    image_path = frames[IMAGE_NAME].get("PFILE", "")
    require(image_path == ASSET_RELATIVE_PATH, "Asset must use the original relative path: " + image_path)
    require((path.parent / image_path).resolve().is_file(), "Relative image asset missing")
    return root, frames


def tree_signature(node):
    # Attribute ordering, quote style and indentation may change in an XML
    # serializer. All actual nodes, values, order and meaningful text may not.
    return (node.tag, tuple(sorted(node.attrib.items())), (node.text or "").strip(),
            (node.tail or "").strip(), tuple(tree_signature(child) for child in node))


def headline_runs(frames):
    return frames["headline"].findall("StoryText/ITEXT")


def named_styles(root):
    styles = {node.get("CNAME"): dict(node.attrib) for node in root.findall("DOCUMENT/CHARSTYLE")}
    return {name: styles[name] for name in (PRIMARY_STYLE, SECONDARY_STYLE)}


def inspect_generated(work):
    baseline, base_frames = read_sla(work / "baseline.sla")
    current, current_frames = read_sla(work / "current.sla")
    for frames in (base_frames, current_frames):
        require([node.get("CH") for node in headline_runs(frames)] == BASE_RUNS,
                "Headline must serialize as exactly two native ITEXT runs")
        require([node.get("CPARENT") for node in headline_runs(frames)] == [PRIMARY_STYLE, SECONDARY_STYLE],
                "Headline must inherit its two named styles")
    base_styles, current_styles = named_styles(baseline), named_styles(current)
    for name in base_styles:
        require(float(base_styles[name]["FONTSIZE"]) == 20 and float(current_styles[name]["FONTSIZE"]) == 24,
                "Current named-style definition was not updated")
        require(base_styles[name] != current_styles[name], "Named style did not change: " + name)
        for styles in (base_styles, current_styles):
            require(float(styles[name]["SCALEH"]) == 100 and float(styles[name]["SCALEV"]) == 100,
                    "Unexpected named-style character scaling")
    require(current_styles[SECONDARY_STYLE]["FCOLOR"] == "AccentCurrent", "Current named color missing")
    return {"baselineNamedStyles": base_styles, "currentNamedStyles": current_styles,
            "currentHeadlineRunAttributes": [dict(node.attrib) for node in headline_runs(current_frames)]}


def assert_only_requested_text_changed(current_path, output_path, expected_runs):
    current, current_frames = read_sla(current_path)
    output, output_frames = read_sla(output_path)
    before = headline_runs(current_frames)
    after = headline_runs(output_frames)
    require(len(before) == len(after) == 2, "Mixed style-run topology changed")
    require([node.get("CH") for node in after] == expected_runs, "Unexpected downloaded text runs")
    for old, new in zip(before, after):
        new.set("CH", old.get("CH"))
    require(tree_signature(current) == tree_signature(output),
            "Browser output changed something besides the authorized headline CH value")
    # This equality also proves named styles, SCALEH/SCALEV, frame size, all
    # unrelated objects and image references survived without auto-fit changes.
    return {"onlyAuthorizedCHChanged": True, "namedStylesPreserved": True,
            "scaleAndGeometryPreserved": True, "allUnrelatedXmlPreserved": True}


def inspect_pdf(pdf, label, expected_text=None):
    require(pdf.read_bytes().startswith(b"%PDF-"), "Native export is not a PDF")
    images = run_bounded(["pdfimages", "-list", str(pdf)], timeout=30)
    (pdf.parent / (label + ".images.txt")).write_text(images, encoding="utf-8")
    # A resolvable path alone is insufficient. Require a real embedded 96x96
    # image from native export, proving the relative asset was loaded/rendered.
    require(any(len(parts := line.split()) > 5 and parts[0].isdigit() and
                parts[2] == "image" and parts[3:5] == ["96", "96"]
                for line in images.splitlines()), "Native PDF did not embed the fixture image")
    text = run_bounded(["pdftotext", "-layout", str(pdf), "-"], timeout=30)
    (pdf.parent / (label + ".text.txt")).write_text(text, encoding="utf-8")
    require("18:30" in text, "Native PDF lost current sidebar text")
    if expected_text:
        require("".join(expected_text.split()) in "".join(text.split()), "Expected headline missing from PDF")
    prefix = pdf.parent / (label + "-page")
    run_bounded(["pdftoppm", "-f", "1", "-singlefile", "-r", "120", "-png", str(pdf), str(prefix)], timeout=45)
    png = prefix.with_suffix(".png")
    require(png.is_file() and png.stat().st_size > 1000, "Native PDF raster preview missing")
    return {"pdfSha256": sha256(pdf), "embeddedFixtureImage": True,
            "preview": str(png), "previewSha256": sha256(png)}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("mode", choices=("generate", "check"))
    parser.add_argument("--workdir", required=True, type=Path)
    parser.add_argument("--input", type=Path)
    parser.add_argument("--case", choices=("short", "long"))
    parser.add_argument("--timeout", type=int, default=120)
    args = parser.parse_args()
    require(1 <= args.timeout <= 600, "Timeout must be between 1 and 600 seconds")
    if args.mode == "check":
        require(args.input and args.case, "check requires --input and --case")
    environment = environment_record()
    work = args.workdir.resolve()
    work.mkdir(parents=True, exist_ok=True)
    if args.mode == "generate":
        require(not any((work / name).exists() for name in ("baseline.sla", "current.sla", "manifest.json")),
                "Generation requires a fresh workdir, refusing to overwrite fixture evidence")
        write_checker(work / ASSET_RELATIVE_PATH)
        native = launch_scribus(work, "generate", args.timeout)
        manifest = {**public_contract(), "environment": environment, "native": native,
                    "xml": inspect_generated(work), "pdf": inspect_pdf(work / "current.pdf", "current", "Open studio"),
                    "sha256": {name: sha256(work / name) for name in
                               ("baseline.sla", "current.sla", ASSET_RELATIVE_PATH)}}
        write_json(work / "manifest.json", manifest)
        print("Generated pinned native fixtures:", work / "manifest.json")
    else:
        report_path = work / ("check-" + args.case + ".json")
        # A failed repeat must never leave behind an earlier successful report.
        write_json(report_path, {"schema": "frame-return-native-check/v1", "ok": False,
                                 "case": args.case, "stage": "check-not-completed"})
        path = args.input.resolve()
        require(path.is_file() and path.parent == work, "Save the browser download directly beside current.sla")
        require(path.name not in ("current.sla", "baseline.sla"), "Do not overwrite the native fixtures")
        manifest = json.loads((work / "manifest.json").read_text(encoding="utf-8"))
        for name, digest in manifest["sha256"].items():
            require(sha256(work / name) == digest, "Native fixture was modified: " + name)
        expected = public_contract()["cases"][args.case]
        original_hash = sha256(path)
        xml = assert_only_requested_text_changed(work / "current.sla", path, expected["runs"])
        pdf = work / ("returned-" + args.case + ".pdf")
        native = launch_scribus(work, "check", args.timeout, input=str(path), case=args.case,
                                pdf=str(pdf), currentSnapshot=manifest["native"]["current"])
        require(sha256(path) == original_hash, "Browser download bytes changed during native checking")
        report = {"schema": "frame-return-native-check/v1", "ok": True, "case": args.case,
                  "environment": environment, "input": str(path), "inputSha256": original_hash,
                  "xml": xml, "native": native,
                  "pdf": inspect_pdf(pdf, "returned-" + args.case,
                                     expected["text"] if args.case == "short" else "Community")}
        write_json(report_path, report)
        print("PASS: native reopened", args.case, "case; overflow =", expected["overflow"])


if __name__ == "__main__":
    try:
        main()
    except BaseException as error:
        if isinstance(error, SystemExit):
            raise
        print("NATIVE GATE FAILED:", str(error), file=sys.stderr)
        sys.exit(1)
