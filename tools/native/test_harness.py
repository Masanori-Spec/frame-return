"""Fast, non-native harness tests. These never install or launch Scribus."""
import os
import copy
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch
import xml.etree.ElementTree as ET

import harness
from contract import (ASSET_RELATIVE_PATH, BASE_RUNS, CAPTION, FONT_BOLD, FONT_BOOK,
                      LONG_RUNS, PRIMARY_STYLE, SECONDARY_STYLE, SHORT_RUNS)
with patch.dict(os.environ, {"FRAME_RETURN_NATIVE_TOOLS": str(Path(__file__).resolve().parent)}):
    import scribus_worker


def synthetic_xml(runs=BASE_RUNS):
    root = ET.Element("SCRIBUSUTF8NEW", Version="1.6.1")
    doc = ET.SubElement(root, "DOCUMENT")
    for name in ("headline", "sidebar", "caption"):
        item = ET.SubElement(doc, "PAGEOBJECT", ANNAME=name, PTYPE="4", NEXTITEM="-1", BACKITEM="-1")
        story = ET.SubElement(item, "StoryText")
        ET.SubElement(story, "DefaultStyle", FONT="DejaVu Sans Book")
        for index, text in enumerate(runs if name == "headline" else ["unchanged"]):
            ET.SubElement(story, "ITEXT", CH=text, FONTSIZE="24", CPARENT="Style" + str(index))
        ET.SubElement(story, "trail")
    ET.SubElement(doc, "PAGEOBJECT", ANNAME="hero-image", PTYPE="2", PFILE=ASSET_RELATIVE_PATH)
    return root


class HarnessTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.work = Path(self.temp.name)
        harness.write_checker(self.work / ASSET_RELATIVE_PATH)
        self.current = self.work / "current.sla"
        ET.ElementTree(synthetic_xml()).write(self.current, encoding="utf-8")

    def tearDown(self):
        self.temp.cleanup()

    def output(self, runs):
        path = self.work / "returned.sla"
        ET.ElementTree(synthetic_xml(runs)).write(path, encoding="utf-8")
        return path

    def test_short_and_long_allow_only_first_run_text(self):
        for runs in (SHORT_RUNS, LONG_RUNS):
            with self.subTest(length=len(runs[0])):
                result = harness.assert_only_requested_text_changed(self.current, self.output(runs), runs)
                self.assertTrue(result["onlyAuthorizedCHChanged"])

    def test_rejects_style_shrink(self):
        path = self.output(LONG_RUNS)
        root = ET.parse(path)
        root.find("DOCUMENT/PAGEOBJECT/StoryText/ITEXT").set("FONTSIZE", "10")
        root.write(path)
        with self.assertRaisesRegex(AssertionError, "besides"):
            harness.assert_only_requested_text_changed(self.current, path, LONG_RUNS)

    def test_rejects_unrelated_text_change(self):
        path = self.output(SHORT_RUNS)
        root = ET.parse(path)
        root.findall("DOCUMENT/PAGEOBJECT")[1].find("StoryText/ITEXT").set("CH", "lost update")
        root.write(path)
        with self.assertRaisesRegex(AssertionError, "besides"):
            harness.assert_only_requested_text_changed(self.current, path, SHORT_RUNS)

    def test_rejects_lost_named_style_definition(self):
        current = ET.parse(self.current)
        ET.SubElement(current.find("DOCUMENT"), "CHARSTYLE", CNAME="HeadlinePrimary", FONTSIZE="24")
        current.write(self.current)
        with self.assertRaisesRegex(AssertionError, "besides"):
            harness.assert_only_requested_text_changed(self.current, self.output(SHORT_RUNS), SHORT_RUNS)

    def test_rejects_linked_frame(self):
        root = ET.parse(self.current)
        root.find("DOCUMENT/PAGEOBJECT").set("NEXTITEM", "42")
        root.write(self.current)
        with self.assertRaisesRegex(AssertionError, "unlinked"):
            harness.read_sla(self.current)

    def test_rejects_extra_story_content(self):
        root = ET.parse(self.current)
        ET.SubElement(root.find("DOCUMENT/PAGEOBJECT/StoryText"), "MARK")
        root.write(self.current)
        with self.assertRaisesRegex(AssertionError, "unsupported"):
            harness.read_sla(self.current)

    def test_png_is_deterministic(self):
        other = self.work / "other.png"
        harness.write_checker(other)
        self.assertEqual(harness.sha256(other), harness.sha256(self.work / ASSET_RELATIVE_PATH))
        self.assertEqual(other.read_bytes()[:8], b"\x89PNG\r\n\x1a\n")

    def test_headline_paragraph_styles_map_from_current_for_both_lengths(self):
        source = {"text": "Open studio", "geometry": [80, 48, 260, 48], "styleRuns": [
            {"start": 0, "length": 5, "style": {"font": FONT_BOLD, "size": 24,
             "color": "Ink", "namedStyle": PRIMARY_STYLE, "paragraphStyle": "Actual source style"}},
            {"start": 5, "length": 6, "style": {"font": FONT_BOOK, "size": 24,
             "color": "AccentCurrent", "namedStyle": SECONDARY_STYLE, "paragraphStyle": None}},
        ]}
        for runs in (SHORT_RUNS, LONG_RUNS):
            result = copy.deepcopy(source)
            result["text"] = "".join(runs)
            result["styleRuns"][0]["length"] = len(runs[0])
            result["styleRuns"][1]["start"] = len(runs[0])
            scribus_worker.assert_headline(result, runs, True, source_frame=source)
            result["styleRuns"][0]["style"]["paragraphStyle"] = "Unexpected replacement"
            with self.assertRaisesRegex(AssertionError, "paragraph styles changed"):
                scribus_worker.assert_headline(result, runs, True, source_frame=source)

    def test_caption_deliberately_repeats_original_words(self):
        self.assertTrue(CAPTION.startswith("".join(BASE_RUNS)))

    def test_native_launch_guard_is_before_any_subprocess(self):
        with patch.dict(os.environ, {}, clear=True), patch("harness.run_bounded") as call:
            with self.assertRaisesRegex(AssertionError, "restricted"):
                harness.environment_record()
            call.assert_not_called()

    def test_timeout_kills_group(self):
        import sys
        with self.assertRaisesRegex(RuntimeError, "Timed out"):
            harness.run_bounded([sys.executable, "-c", "import time; time.sleep(30)"], timeout=0.05)


if __name__ == "__main__":
    unittest.main()
