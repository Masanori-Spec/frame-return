#!/usr/bin/env python3
"""Run with python tests/oracle.test.py; the oracle needs Python lxml."""

import importlib.util
import json
from pathlib import Path
import subprocess
import sys
import tempfile
import unittest


ORACLE_PATH = Path(__file__).resolve().parents[1] / "tools" / "oracle.py"
SPEC = importlib.util.spec_from_file_location("frame_return_oracle", ORACLE_PATH)
oracle = importlib.util.module_from_spec(SPEC)
sys.modules[SPEC.name] = oracle
SPEC.loader.exec_module(oracle)

CURRENT = b'''<?xml version="1.0" encoding="UTF-8"?>
<!-- keep comment spacing -->
<SCRIBUSUTF8NEW Version="1.6.3">
 <DOCUMENT TITLE="Example &amp; test">
  <PAGEOBJECT PTYPE="4" ANNAME="headline" ItemID="27" XPOS="10.000" YPOS="20" WIDTH="320" HEIGHT="80">
   <ITEXT CH="Local " FONT="Noto Sans" FONTSIZE="24"/>
   <ITEXT FONTSIZE='24' CH='studio' FONT='Noto Sans'/>
  </PAGEOBJECT>
  <PAGEOBJECT ANNAME="body" PTYPE="4" ItemID="99" XPOS="12">
   <ITEXT CH="Leave &amp; keep" FONT="Noto Serif"/>
  </PAGEOBJECT>
  <COLOR NAME="ink" RGB="#102030"/>
 </DOCUMENT>
</SCRIBUSUTF8NEW>
<?preserve exactly?>
'''
EXPECTED = {"frames": {"headline": ["Community ", "studio"]}}
OUTPUT = CURRENT.replace(b'CH="Local "', b'CH="Community "')


class PreservationOracleTests(unittest.TestCase):
    def reject(self, output, expected=EXPECTED, current=CURRENT, code=None):
        with self.assertRaises(oracle.OracleError) as context:
            oracle.verify_bytes(current, output, expected)
        if code:
            self.assertEqual(context.exception.code, code)
        return context.exception.code

    def test_accepts_exact_ch_only_patch(self):
        report = oracle.verify_bytes(CURRENT, OUTPUT, EXPECTED)
        self.assertTrue(report["ok"])
        self.assertEqual(report["counts"]["changed_ch_values"], 1)
        self.assertFalse(report["no_op"])

    def test_style_attribute_change_is_detected(self):
        self.reject(OUTPUT.replace(b'FONTSIZE="24"', b'FONTSIZE="25"'), code="attributes")

    def test_geometry_change_is_detected(self):
        self.reject(OUTPUT.replace(b'XPOS="10.000"', b'XPOS="11.000"'), code="attributes")

    def test_unrelated_attribute_change_is_detected(self):
        self.reject(OUTPUT.replace(b'RGB="#102030"', b'RGB="#102031"'), code="attributes")

    def test_unselected_frame_text_change_is_detected(self):
        self.reject(OUTPUT.replace(b'CH="Leave &amp; keep"', b'CH="Do not keep"'), code="attributes")

    def test_wrong_approved_text_is_detected(self):
        self.reject(OUTPUT.replace(b'CH="Community "', b'CH="Communities "'), code="expected_text")

    def test_itext_splitting_is_detected(self):
        self.reject(OUTPUT.replace(b'CH="Community "', b'CH="Community "/><ITEXT CH=""'), code="run_count")

    def test_tree_topology_change_is_detected(self):
        self.reject(OUTPUT.replace(b'<COLOR NAME="ink" RGB="#102030"/>', b'<COLOR NAME="ink" RGB="#102030"/><EXTRA/>'), code="topology")

    def test_tail_change_is_detected(self):
        self.reject(OUTPUT.replace(b'</PAGEOBJECT>\n  <COLOR', b'</PAGEOBJECT>extra\n  <COLOR'), code="xml_content")

    def test_comment_change_is_detected(self):
        self.reject(OUTPUT.replace(b'keep comment spacing', b'changed comment text'), code="xml_content")

    def test_document_processing_instruction_is_checked(self):
        self.reject(OUTPUT.replace(b'<?preserve exactly?>', b'<?preserve changed?>'), code="xml_content")

    def test_attribute_reordering_is_detected_even_when_tree_equal(self):
        self.reject(OUTPUT.replace(b'FONT="Noto Sans" FONTSIZE="24"', b'FONTSIZE="24" FONT="Noto Sans"'), code="preservation_bytes")

    def test_quote_reserialization_is_detected(self):
        self.reject(OUTPUT.replace(b"CH='studio'", b'CH="studio"'), code="preservation_bytes")

    def test_unchanged_run_entity_reserialization_is_detected(self):
        self.reject(OUTPUT.replace(b"CH='studio'", b"CH='st&#117;dio'"), code="preservation_bytes")

    def test_approved_value_may_change_escaped_byte_length(self):
        expected = {"frames": {"headline": ['A & B < "C" > D\n', "studio"]}}
        output = CURRENT.replace(b'CH="Local "', b'CH="A &amp; B &lt; &quot;C&quot; &gt; D&#10;"')
        self.assertTrue(oracle.verify_bytes(CURRENT, output, expected)["ok"])

    def test_two_changed_values_with_different_quote_styles(self):
        expected = {"frames": {"headline": ["New ", "日本語"]}}
        output = CURRENT.replace(b'CH="Local "', b'CH="New "').replace(b"CH='studio'", "CH='日本語'".encode())
        self.assertEqual(oracle.verify_bytes(CURRENT, output, expected)["counts"]["changed_ch_values"], 2)

    def test_noop_empty_frame_map_is_byte_identical(self):
        report = oracle.verify_bytes(CURRENT, CURRENT, {"frames": {}})
        self.assertTrue(report["no_op"])

    def test_noop_selected_unchanged_values_is_byte_identical(self):
        expected = {"frames": {"headline": ["Local ", "studio"]}}
        self.assertTrue(oracle.verify_bytes(CURRENT, CURRENT, expected)["no_op"])
        self.reject(CURRENT.replace(b"CH='studio'", b'CH="studio"'), expected, code="noop_bytes")

    def test_noop_line_ending_reserialization_is_detected(self):
        self.reject(CURRENT.replace(b'\n', b'\r\n'), {"frames": {}}, code="noop_bytes")

    def test_duplicate_name_cannot_use_itemid_as_fallback(self):
        current = CURRENT.replace(b'ANNAME="body"', b'ANNAME="headline"')
        self.reject(current, EXPECTED, current, "frame_identity")

    def test_nontext_object_with_duplicate_name_is_ambiguous(self):
        current = CURRENT.replace(b'ANNAME="body" PTYPE="4"', b'ANNAME="headline" PTYPE="2"')
        self.reject(current, EXPECTED, current, "frame_identity")

    def test_itemid_change_is_not_approved(self):
        self.reject(OUTPUT.replace(b'ItemID="27"', b'ItemID="28"'), code="attributes")

    def test_unique_name_must_identify_ptype_four(self):
        current = CURRENT.replace(b'PTYPE="4" ANNAME="headline"', b'PTYPE="2" ANNAME="headline"')
        self.reject(current, EXPECTED, current, "frame_identity")

    def test_encoded_frame_name_is_independently_decoded(self):
        current = CURRENT.replace(b'ANNAME="headline"', b'ANNAME="h&#101;adline"')
        output = current.replace(b'CH="Local "', b'CH="Community "')
        self.assertTrue(oracle.verify_bytes(current, output, EXPECTED)["ok"])

    def test_attribute_literal_whitespace_normalization_matches_lxml(self):
        current = CURRENT.replace(b"CH='studio'", b"CH='stu\r\n\t\rdio'")
        output = current.replace(b'CH="Local "', b'CH="Community "')
        expected = {"frames": {"headline": ["Community ", "stu   dio"]}}
        self.assertTrue(oracle.verify_bytes(current, output, expected)["ok"])

    def test_nested_pageobject_has_its_own_runs(self):
        current = CURRENT.replace(b'  </PAGEOBJECT>', b'   <PAGEOBJECT PTYPE="4" ANNAME="nested"><ITEXT CH="child"/></PAGEOBJECT>\n  </PAGEOBJECT>', 1)
        output = current.replace(b'CH="Local "', b'CH="Community "')
        self.assertTrue(oracle.verify_bytes(current, output, EXPECTED)["ok"])
        self.reject(output.replace(b'CH="child"', b'CH="edited"'), EXPECTED, current, "attributes")

    def test_dtd_and_entity_declaration_are_rejected(self):
        payload = b'<!DOCTYPE SCRIBUSUTF8NEW [<!ENTITY x "Local ">]>'
        current = CURRENT.replace(b'<!-- keep comment spacing -->', payload)
        self.reject(current, {"frames": {}}, current, "dtd")

    def test_external_dtd_is_rejected_before_lxml(self):
        current = CURRENT.replace(b'<!-- keep comment spacing -->', b'<!DOCTYPE SCRIBUSUTF8NEW SYSTEM "https://example.invalid/schema.dtd">')
        self.reject(current, {"frames": {}}, current, "dtd")

    def test_custom_reference_is_rejected(self):
        current = CURRENT.replace(b'CH="Local "', b'CH="&unknown;"')
        self.reject(current, {"frames": {}}, current, "entity")

    def test_doctype_text_inside_comment_is_harmless(self):
        current = CURRENT.replace(b'keep comment spacing', b'<!DOCTYPE is just comment text')
        self.assertTrue(oracle.verify_bytes(current, current, {"frames": {}})["ok"])

    def test_cdata_with_tag_like_content_is_not_tokenized(self):
        current = CURRENT.replace(b'<COLOR NAME="ink"', b'<![CDATA[<ITEXT CH="bogus"/>]]><COLOR NAME="ink"')
        output = current.replace(b'CH="Local "', b'CH="Community "')
        self.assertTrue(oracle.verify_bytes(current, output, EXPECTED)["ok"])

    def test_namespace_is_rejected(self):
        current = CURRENT.replace(b'<DOCUMENT ', b'<DOCUMENT xmlns="urn:test" ')
        self.reject(current, {"frames": {}}, current, "namespace")

    def test_prefixed_attribute_is_rejected(self):
        current = CURRENT.replace(b'<DOCUMENT ', b'<DOCUMENT xml:space="preserve" ')
        self.reject(current, {"frames": {}}, current, "namespace")

    def test_malformed_utf8_is_rejected(self):
        self.reject(CURRENT + b'\xff', {"frames": {}}, code="encoding")

    def test_non_utf8_xml_declaration_is_rejected(self):
        current = CURRENT.replace(b'encoding="UTF-8"', b'encoding="ISO-8859-1"')
        self.reject(current, {"frames": {}}, current, "encoding")

    def test_unbalanced_xml_is_rejected(self):
        self.reject(CURRENT.replace(b'</DOCUMENT>', b'</WRONG>'), {"frames": {}}, code="xml")

    def test_resource_depth_bound(self):
        current = b'<SCRIBUSUTF8NEW>' + b'<A>' * oracle.MAX_DEPTH + b'</A>' * oracle.MAX_DEPTH + b'</SCRIBUSUTF8NEW>'
        self.reject(current, {"frames": {}}, current, "resource_limit")

    def test_resource_attribute_bound(self):
        attributes = b' '.join(f'a{i}="x"'.encode() for i in range(oracle.MAX_ATTRIBUTES + 1))
        current = b'<SCRIBUSUTF8NEW ' + attributes + b'/>'
        self.reject(current, {"frames": {}}, current, "resource_limit")

    def test_resource_byte_bound(self):
        current = b' ' * (oracle.MAX_SLA_BYTES + 1)
        self.reject(current, {"frames": {}}, current, "resource_limit")

    def test_invalid_expected_schema(self):
        for expected in ({}, {"frames": []}, {"frames": {"headline": "wrong"}}, {"frames": {}, "typo": 1}):
            with self.subTest(expected=expected):
                self.reject(CURRENT, expected, code="expected_schema")

    def test_missing_ch_is_rejected_for_selected_frame(self):
        current = CURRENT.replace(b'CH="Local " ', b'')
        self.reject(current, EXPECTED, current, "missing_ch")

    def test_cli_writes_success_and_failure_reports(self):
        with tempfile.TemporaryDirectory() as directory:
            base = Path(directory)
            current, output, expected, report = [base / name for name in ("current.sla", "output.sla", "expected.json", "report.json")]
            current.write_bytes(CURRENT)
            output.write_bytes(OUTPUT)
            expected.write_text(json.dumps(EXPECTED), encoding="utf-8")
            command = [sys.executable, str(ORACLE_PATH), "--current", str(current), "--output", str(output), "--expected", str(expected), "--report", str(report)]
            result = subprocess.run(command, capture_output=True, text=True)
            self.assertEqual(result.returncode, 0, result.stderr + result.stdout)
            self.assertTrue(json.loads(report.read_text())["ok"])
            output.write_bytes(OUTPUT.replace(b'XPOS="10.000"', b'XPOS="11.000"'))
            result = subprocess.run(command, capture_output=True, text=True)
            self.assertEqual(result.returncode, 1)
            self.assertEqual(json.loads(report.read_text())["error"]["code"], "attributes")
            expected.write_text('{"frames": {}, "frames": {}}', encoding="utf-8")
            result = subprocess.run(command, capture_output=True, text=True)
            self.assertEqual(result.returncode, 1)
            self.assertEqual(json.loads(report.read_text())["error"]["code"], "expected_schema")


if __name__ == "__main__":
    unittest.main(verbosity=2)
