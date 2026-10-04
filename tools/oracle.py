#!/usr/bin/env python3
"""Independent, fail-closed preservation oracle for FrameReturn SLA output.

Usage:
  python tools/oracle.py --current current.sla --output output.sla \
      --expected expected.json --report report.json

Expected JSON is exactly {"frames": {"unique ANNAME": ["CH", "CH", ...]}}.
Each list contains all ITEXT CH values, in document order, owned by that named
PTYPE="4" PAGEOBJECT. ITEXT within a nested PAGEOBJECT belongs to the nested
object. ItemID is never used for identity. An empty frames object means no edit.

Two independent views are checked: an lxml tree and a purpose-built lexical
scanner over the original UTF-8 bytes. Only the raw value of a CH attribute
whose expected decoded value actually changes may differ. Whitespace, quotes,
entity spellings in unchanged runs, XML declarations, comments, and everything
else must survive byte for byte. DTDs, custom entities, namespaces, malformed
UTF-8, and oversized inputs fail closed. No network access is performed.
"""

from __future__ import annotations

import argparse
from dataclasses import dataclass
import json
from pathlib import Path
import re
import sys
from typing import Any

from lxml import etree


MAX_SLA_BYTES = 16 * 1024 * 1024
MAX_EXPECTED_BYTES = 1024 * 1024
MAX_ELEMENTS = 200_000
MAX_DEPTH = 128
MAX_ATTRIBUTES = 256
MAX_FRAMES = 10_000
MAX_NAME_LENGTH = 4096
XML_SPACE = b" \t\r\n"
PREDEFINED = {"amp": "&", "lt": "<", "gt": ">", "quot": '"', "apos": "'"}
REFERENCE = re.compile(r"&(#x[0-9A-Fa-f]+|#[0-9]+|amp|lt|gt|quot|apos);")
DECLARATION_ENCODING = re.compile(br"\bencoding\s*=\s*(['\"])(.*?)\1")


class OracleError(ValueError):
    def __init__(self, code: str, message: str):
        super().__init__(message)
        self.code = code


def fail(code: str, message: str) -> None:
    raise OracleError(code, message)


@dataclass(frozen=True)
class Attribute:
    start: int
    end: int
    value: str


@dataclass(frozen=True)
class LexElement:
    tag: str
    path: tuple[int, ...]
    attributes: dict[str, Attribute]
    owner: tuple[int, ...] | None


def decode_attribute(raw: bytes) -> str:
    # XML 1.0 attribute normalization occurs BEFORE character-reference expansion.
    value = raw.decode("utf-8").replace("\r\n", " ")
    value = value.replace("\r", " ").replace("\n", " ").replace("\t", " ")
    result: list[str] = []
    position = 0
    for match in REFERENCE.finditer(value):
        prefix = value[position:match.start()]
        if "&" in prefix:
            fail("entity", "Only predefined XML entities and numeric references are allowed")
        result.append(prefix)
        reference = match.group(1)
        if reference.startswith("#"):
            try:
                character = int(reference[2:], 16) if reference.startswith("#x") else int(reference[1:])
            except (ValueError, OverflowError):
                fail("entity", "Invalid numeric character reference")
            if not (character in (9, 10, 13) or 0x20 <= character <= 0xD7FF
                    or 0xE000 <= character <= 0xFFFD or 0x10000 <= character <= 0x10FFFF):
                fail("entity", "Invalid XML character reference")
            result.append(chr(character))
        else:
            result.append(PREDEFINED[reference])
        position = match.end()
    if "&" in value[position:]:
        fail("entity", "Only predefined XML entities and numeric references are allowed")
    result.append(value[position:])
    return "".join(result)


def scan_xml(data: bytes) -> list[LexElement]:
    """Find attribute byte spans without XML serialization or lxml offsets."""
    records: list[LexElement] = []
    # Entries are [tag, path, next element-child ordinal, nearest PAGEOBJECT path].
    stack: list[list[Any]] = []
    length = len(data)
    cursor = 0
    roots = 0

    def space(position: int) -> int:
        while position < length and data[position] in XML_SPACE:
            position += 1
        return position

    def name(position: int) -> tuple[str, int]:
        start = position
        while position < length and data[position] not in XML_SPACE + b"/>=?'\"<":
            position += 1
        if position == start:
            fail("xml", "Missing XML name")
        result = data[start:position].decode("utf-8")
        if ":" in result:
            fail("namespace", "Namespaced XML is outside the supported SLA profile")
        return result, position

    while cursor < length:
        opening = data.find(b"<", cursor)
        if opening < 0:
            break
        cursor = opening
        if data.startswith(b"<!--", cursor):
            end = data.find(b"-->", cursor + 4)
            if end < 0:
                fail("xml", "Unterminated XML comment")
            cursor = end + 3
            continue
        if data.startswith(b"<![CDATA[", cursor):
            end = data.find(b"]]>", cursor + 9)
            if end < 0:
                fail("xml", "Unterminated CDATA section")
            cursor = end + 3
            continue
        if data.startswith(b"<?", cursor):
            end = data.find(b"?>", cursor + 2)
            if end < 0:
                fail("xml", "Unterminated processing instruction")
            if data.startswith(b"<?xml", cursor) and cursor + 5 < length and data[cursor + 5] in XML_SPACE:
                encoding = DECLARATION_ENCODING.search(data[cursor:end])
                if encoding and encoding.group(2).upper() not in (b"UTF-8", b"UTF8"):
                    fail("encoding", "The XML declaration must declare UTF-8")
            cursor = end + 2
            continue
        if data.startswith(b"<!", cursor):
            fail("dtd", "DTD and entity declarations are forbidden")
        if data.startswith(b"</", cursor):
            tag, cursor = name(cursor + 2)
            cursor = space(cursor)
            if cursor >= length or data[cursor:cursor + 1] != b">":
                fail("xml", "Malformed closing tag")
            if not stack or stack[-1][0] != tag:
                fail("xml", "Unbalanced XML tags")
            stack.pop()
            cursor += 1
            continue

        tag, cursor = name(cursor + 1)
        attributes: dict[str, Attribute] = {}
        while True:
            before_space = cursor
            cursor = space(cursor)
            if data.startswith(b"/>", cursor):
                self_closing = True
                cursor += 2
                break
            if data.startswith(b">", cursor):
                self_closing = False
                cursor += 1
                break
            if cursor >= length or cursor == before_space:
                fail("xml", "Malformed or unterminated start tag")
            attribute_name, cursor = name(cursor)
            if attribute_name == "xmlns":
                fail("namespace", "Namespaced XML is outside the supported SLA profile")
            if attribute_name in attributes:
                fail("xml", "Duplicate XML attribute")
            cursor = space(cursor)
            if data[cursor:cursor + 1] != b"=":
                fail("xml", "Missing attribute equals sign")
            cursor = space(cursor + 1)
            if data[cursor:cursor + 1] not in (b"'", b'"'):
                fail("xml", "Unquoted attribute")
            quote = data[cursor:cursor + 1]
            start = cursor + 1
            end = data.find(quote, start)
            if end < 0:
                fail("xml", "Unterminated attribute value")
            attributes[attribute_name] = Attribute(start, end, decode_attribute(data[start:end]))
            if len(attributes) > MAX_ATTRIBUTES:
                fail("resource_limit", "Too many attributes on an element")
            cursor = end + 1

        if stack:
            path = stack[-1][1] + (stack[-1][2],)
            stack[-1][2] += 1
            owner = stack[-1][3]
        else:
            roots += 1
            if roots > 1:
                fail("xml", "Multiple XML document elements")
            path = ()
            owner = None
        if len(stack) + 1 > MAX_DEPTH:
            fail("resource_limit", "XML nesting exceeds the supported bound")
        if tag == "PAGEOBJECT":
            owner = path
        records.append(LexElement(tag, path, attributes, owner))
        if len(records) > MAX_ELEMENTS:
            fail("resource_limit", "XML contains too many elements")
        if not self_closing:
            stack.append([tag, path, 0, owner])
    if stack:
        fail("xml", "Unclosed XML elements")
    if not records:
        fail("xml", "Missing XML document element")
    return records


def element_walk(root: etree._Element):
    stack = [(root, (), None)]
    while stack:
        element, path, owner = stack.pop()
        if element.tag == "PAGEOBJECT":
            owner = path
        yield element, path, owner
        children = [child for child in element if isinstance(child.tag, str)]
        stack.extend((child, path + (index,), owner) for index, child in reversed(list(enumerate(children))))


def parse_document(data: bytes, label: str):
    if len(data) > MAX_SLA_BYTES:
        fail("resource_limit", f"{label} exceeds the 16 MiB SLA limit")
    try:
        data.decode("utf-8", errors="strict")
    except UnicodeDecodeError:
        fail("encoding", f"{label} is not valid UTF-8")
    lexical = scan_xml(data)
    parser = etree.XMLParser(resolve_entities=False, load_dtd=False, no_network=True,
                             recover=False, huge_tree=False, remove_comments=False,
                             remove_pis=False, strip_cdata=False)
    try:
        root = etree.fromstring(data, parser=parser)
    except (etree.XMLSyntaxError, ValueError):
        fail("xml", f"{label} is not well-formed XML")
    if root.getroottree().docinfo.doctype:
        fail("dtd", "DTD and entity declarations are forbidden")
    if root.tag != "SCRIBUSUTF8NEW":
        fail("profile", f"{label} is not a SCRIBUSUTF8NEW document")
    semantic = list(element_walk(root))
    if len(semantic) != len(lexical):
        fail("parser_disagreement", "Lexical and lxml element inventories disagree")
    for (element, path, owner), token in zip(semantic, lexical):
        if element.nsmap or "{" in element.tag or any("{" in name or ":" in name for name in element.attrib):
            fail("namespace", "Namespaced XML is outside the supported SLA profile")
        attributes = {name: value.value for name, value in token.attributes.items()}
        if (element.tag != token.tag or path != token.path or owner != token.owner
                or dict(element.attrib) != attributes):
            fail("parser_disagreement", "Lexical and lxml parsing disagree")
    return root, semantic, lexical


def validate_expected(expected: Any) -> dict[str, list[str]]:
    if not isinstance(expected, dict) or set(expected) != {"frames"} or not isinstance(expected["frames"], dict):
        fail("expected_schema", 'Expected JSON must contain exactly a "frames" object')
    frames = expected["frames"]
    if len(frames) > MAX_FRAMES:
        fail("resource_limit", "Too many expected frames")
    total = 0
    for name, values in frames.items():
        if not isinstance(name, str) or not name or len(name) > MAX_NAME_LENGTH:
            fail("expected_schema", "Each expected frame must have a nonempty bounded ANNAME")
        if not isinstance(values, list) or any(not isinstance(value, str) for value in values):
            fail("expected_schema", "Each expected frame must contain an ordered list of CH strings")
        total += len(values)
        try:
            name.encode("utf-8")
            for value in values:
                value.encode("utf-8")
        except UnicodeEncodeError:
            fail("expected_schema", "Expected values must be valid Unicode")
    if total > MAX_ELEMENTS:
        fail("resource_limit", "Too many expected ITEXT values")
    return frames


def selected_runs(semantic, frames: dict[str, list[str]], label: str):
    names: dict[str, list[tuple[Any, tuple[int, ...]]]] = {}
    owned: dict[tuple[int, ...], list[tuple[Any, tuple[int, ...]]]] = {}
    for element, path, owner in semantic:
        if element.tag == "PAGEOBJECT" and element.get("ANNAME") is not None:
            names.setdefault(element.get("ANNAME"), []).append((element, path))
        if element.tag == "ITEXT" and owner is not None:
            owned.setdefault(owner, []).append((element, path))
    result = {}
    for name, values in frames.items():
        candidates = names.get(name, [])
        if len(candidates) != 1:
            fail("frame_identity", f"{label}: expected frame {name!r} must have a unique PAGEOBJECT ANNAME")
        element, frame_path = candidates[0]
        if element.get("PTYPE") != "4":
            fail("frame_identity", f"{label}: frame {name!r} is not PTYPE=4")
        runs = owned.get(frame_path, [])
        if len(runs) != len(values):
            fail("run_count", f"{label}: ITEXT count differs from expected for frame {name!r}")
        if any("CH" not in run.attrib for run, _ in runs):
            fail("missing_ch", f"{label}: an ITEXT in frame {name!r} has no CH attribute")
        result[name] = runs
    return result


def document_nodes(root):
    first = root
    while first.getprevious() is not None:
        first = first.getprevious()
    result = []
    while first is not None:
        result.append(first)
        first = first.getnext()
    return result


def compare_trees(current, output, mutable: set[tuple[int, ...]]) -> int:
    def kind(node):
        if isinstance(node, etree._Comment):
            return ("comment",)
        if isinstance(node, etree._ProcessingInstruction):
            return ("pi", node.target)
        if not isinstance(node.tag, str):
            fail("entity", "Entity nodes are forbidden")
        return ("element", node.tag)

    left, right = document_nodes(current), document_nodes(output)
    if len(left) != len(right):
        fail("topology", "Document-level node topology changed")
    stack = [(a, b, () if a is current else None) for a, b in zip(left, right)]
    count = 0
    while stack:
        a, b, path = stack.pop()
        count += 1
        if kind(a) != kind(b) or len(a) != len(b):
            fail("topology", "XML element, comment, or processing-instruction topology changed")
        if a.text != b.text or a.tail != b.tail:
            fail("xml_content", "XML text or tail content outside CH changed")
        attributes_a, attributes_b = dict(a.attrib), dict(b.attrib)
        if path in mutable:
            attributes_a.pop("CH", None)
            attributes_b.pop("CH", None)
        if attributes_a != attributes_b:
            fail("attributes", "An unapproved XML attribute changed")
        ordinal = 0
        for child_a, child_b in zip(a, b):
            child_path = None
            if isinstance(child_a.tag, str):
                child_path = path + (ordinal,) if path is not None else None
                ordinal += 1
            stack.append((child_a, child_b, child_path))
    return count


def outside_segments(data: bytes, lexical: list[LexElement], mutable: set[tuple[int, ...]]) -> list[bytes]:
    # Segment comparison is deliberately not marker substitution: untrusted input
    # cannot manufacture a marker collision or hide bytes between adjacent edits.
    spans = []
    for token in lexical:
        if token.path in mutable:
            if token.tag != "ITEXT" or "CH" not in token.attributes:
                fail("lexical_target", "An approved CH span is missing")
            attribute = token.attributes["CH"]
            spans.append((attribute.start, attribute.end))
    if len(spans) != len(mutable):
        fail("lexical_target", "Approved CH span count does not match")
    segments = []
    position = 0
    for start, end in spans:
        if start < position or end < start:
            fail("lexical_target", "Approved CH spans overlap")
        segments.append(data[position:start])
        position = end
    segments.append(data[position:])
    return segments


def verify_bytes(current: bytes, output: bytes, expected: Any) -> dict[str, Any]:
    frames = validate_expected(expected)
    current_root, current_semantic, current_lexical = parse_document(current, "current")
    output_root, output_semantic, output_lexical = parse_document(output, "output")
    current_runs = selected_runs(current_semantic, frames, "current")
    output_runs = selected_runs(output_semantic, frames, "output")
    mutable: set[tuple[int, ...]] = set()
    approved_runs = 0
    for name, expected_values in frames.items():
        for (before, before_path), (after, after_path), value in zip(current_runs[name], output_runs[name], expected_values):
            approved_runs += 1
            if before_path != after_path:
                fail("topology", f"ITEXT topology changed in frame {name!r}")
            if after.get("CH") != value:
                fail("expected_text", f"Output CH does not exactly match expected text in frame {name!r}")
            if before.get("CH") != value:
                mutable.add(before_path)
    nodes_checked = compare_trees(current_root, output_root, mutable)
    if not mutable and current != output:
        fail("noop_bytes", "A semantic no-op must be byte-identical to current SLA")
    if outside_segments(current, current_lexical, mutable) != outside_segments(output, output_lexical, mutable):
        fail("preservation_bytes", "Raw bytes outside the approved changed CH values differ")
    return {
        "ok": True,
        "oracle": "FrameReturn independent lxml and lexical preservation oracle",
        "checks": {
            "secure_parse": True,
            "unique_frame_identity": True,
            "expected_ch_sequences": True,
            "xml_topology": True,
            "unapproved_attributes_text_and_tails": True,
            "raw_bytes_outside_changed_ch": True,
            "noop_byte_identity": True,
        },
        "counts": {"selected_frames": len(frames), "approved_itext_runs": approved_runs,
                   "changed_ch_values": len(mutable), "xml_nodes_checked": nodes_checked},
        "bytes": {"current": len(current), "output": len(output)},
        "no_op": not mutable,
    }


def read_bounded(path: Path, limit: int) -> bytes:
    with path.open("rb") as source:
        content = source.read(limit + 1)
    if len(content) > limit:
        fail("resource_limit", f"Input {path.name!r} exceeds its resource bound")
    return content


def unique_json_object(pairs):
    result = {}
    for key, value in pairs:
        if key in result:
            fail("expected_schema", "Expected JSON contains duplicate object keys")
        result[key] = value
    return result


def main(argv=None) -> int:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    for option in ("current", "output", "expected", "report"):
        parser.add_argument(f"--{option}", required=True, type=Path)
    args = parser.parse_args(argv)
    if args.report.resolve() in {args.current.resolve(), args.output.resolve(), args.expected.resolve()}:
        print("Report destination must not overwrite an input", file=sys.stderr)
        return 2
    try:
        expected_bytes = read_bounded(args.expected, MAX_EXPECTED_BYTES)
        expected = json.loads(expected_bytes.decode("utf-8"), object_pairs_hook=unique_json_object)
        report = verify_bytes(read_bounded(args.current, MAX_SLA_BYTES),
                              read_bounded(args.output, MAX_SLA_BYTES), expected)
    except OracleError as error:
        report = {"ok": False, "error": {"code": error.code, "message": str(error)}}
    except (OSError, UnicodeError, json.JSONDecodeError, RecursionError) as error:
        report = {"ok": False, "error": {"code": "input", "message": str(error)}}
    try:
        args.report.write_text(json.dumps(report, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    except OSError as error:
        print(f"Unable to write oracle report: {error}", file=sys.stderr)
        return 2
    print(json.dumps(report, ensure_ascii=False))
    return 0 if report["ok"] else 1


if __name__ == "__main__":
    raise SystemExit(main())
