import test from 'node:test';
import assert from 'node:assert/strict';
import {
  FrameError, LIMITS, canonical, sha256, safeText, inspectSla, createPacket,
  parseJson, validatePacket, createReturn, validateReturn, analyzeReturn,
  applyReturn, serialize,
} from '../src/core.mjs';
import { parseXml, utf8, decodeAttr, escapeAttr } from '../src/xml.mjs';
import { sampleSla } from '../src/fixture.mjs';

const clone = value => structuredClone(value);
const attr = value => String(value).replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('"', '&quot;');
const normalBody = '<StoryText><DefaultStyle/><ITEXT CH="Open "/><ITEXT CH="studio"/><trail/></StoryText>';
const attributes = { PTYPE: '4', ANNAME: 'headline', OwnPage: '0', NEXTITEM: '-1', BACKITEM: '-1', ItemID: '7' };
function objectXml({ attrs = {}, body = normalBody, tag = 'PAGEOBJECT' } = {}) {
  const merged = { ...attributes, ...attrs };
  const values = Object.entries(merged).filter(([, value]) => value !== null).map(([key, value]) => `${key}="${attr(value)}"`).join(' ');
  return `<${tag} ${values}>${body}</${tag}>`;
}
function documentXml(objects = objectXml(), { version = '1.6.1', before = '', after = '' } = {}) {
  return `${before}<SCRIBUSUTF8NEW Version="${version}"><DOCUMENT><PAGE NUM="0"/>${objects}</DOCUMENT></SCRIBUSUTF8NEW>${after}`;
}
const minimal = options => documentXml(objectXml(options));
const coded = (...codes) => error => error instanceof FrameError && (!codes.length || codes.includes(error.code));
async function resign(packet) {
  const { id, ...payload } = packet;
  packet.id = await sha256(canonical(payload));
  return packet;
}
async function correction(names = ['headline'], edits = { headline: ['Community ', 'studio'] }, source = sampleSla()) {
  const packet = await createPacket(source, names, 'baseline.sla');
  return { packet, result: await createReturn(packet, edits) };
}
function onlyFrame(input) { return inspectSla(input).frames[0]; }

test('synthetic Scribus 1.6 fixture exposes eligible named stories, runs, and paragraphs', () => {
  const doc = inspectSla(sampleSla());
  assert.equal(doc.version, '1.6.1');
  assert.deepEqual(doc.frames.map(f => [f.name, f.eligible, f.page]), [['headline', true, 1], ['sidebar', true, 1], ['caption', true, 1]]);
  assert.deepEqual(doc.frames[0].runs.map(({ paragraph, run, text }) => ({ paragraph, run, text })), [
    { paragraph: 0, run: 0, text: 'Open ' }, { paragraph: 0, run: 1, text: 'studio' },
  ]);
  assert.equal(doc.frames[2].text, 'Open studio, open doors.\n地域のアトリエへ。 Café & café.');
  assert.equal(doc.frames[0].wrapper, 'StoryText');
  assert.deepEqual(doc.frames[0].skeleton, ['ITEXT', 'ITEXT', 'trail']);
});

test('valid direct ITEXT/para/trail profile is supported without inventing a wrapper', async () => {
  const source = minimal({ body: '<ITEXT CH="A"/><para/><ITEXT CH="B"/><trail/>' });
  const frame = onlyFrame(source);
  assert.equal(frame.eligible, true);
  assert.equal(frame.wrapper, 'direct');
  assert.equal(frame.text, 'A\nB');
  assert.deepEqual(frame.runs.map(({ paragraph, run }) => [paragraph, run]), [[0, 0], [1, 0]]);
  const packet = await createPacket(source, ['headline']);
  const result = await createReturn(packet, { headline: ['Alpha', 'Beta'] });
  const applied = await applyReturn(source, result, { originalPacket: packet, approvedNames: ['headline'] });
  assert.equal(applied.output, source.replace('CH="A"', 'CH="Alpha"').replace('CH="B"', 'CH="Beta"'));
});

test('strict UTF-8 input accepts string, bytes, and ArrayBuffer without dropping BOM', () => {
  const source = '\uFEFF' + sampleSla();
  const bytes = new TextEncoder().encode(source);
  assert.equal(utf8(source), source);
  assert.equal(utf8(bytes), source);
  assert.equal(utf8(bytes.buffer), source);
  assert.equal(inspectSla(bytes).raw, source);
  for (const invalid of [new Uint8Array([0xC0, 0xAF]), new Uint8Array([0xED, 0xA0, 0x80]), new Uint8Array([0xFF]), '\uD800', '\uDC00']) {
    assert.throws(() => utf8(invalid), coded('encoding'));
  }
  assert.equal(utf8('😀'), '😀');
});

test('input and JSON limits count UTF-8 bytes rather than JavaScript code units', () => {
  assert.equal(utf8('a'.repeat(LIMITS.bytes)).length, LIMITS.bytes);
  assert.throws(() => utf8('a'.repeat(LIMITS.bytes + 1)), coded('size'));
  assert.throws(() => utf8('界'.repeat(Math.floor(LIMITS.bytes / 3) + 1)), coded('size'));
  assert.throws(() => utf8(new Uint8Array(LIMITS.bytes + 1)), coded('size'));
  const json = '["' + 'a'.repeat(LIMITS.packetBytes - 4) + '"]';
  assert.equal(parseJson(json)[0].length, LIMITS.packetBytes - 4);
  assert.throws(() => parseJson(json + ' '), coded('packet'));
  assert.throws(() => parseJson(JSON.stringify('界'.repeat(Math.floor(LIMITS.packetBytes / 3) + 1))), coded('packet'));
  assert.throws(() => parseJson('not JSON'), coded('packet'));
  assert.throws(() => parseJson({}), coded('packet'));
});

test('attribute normalization follows XML CRLF and reference-expansion ordering', () => {
  assert.equal(decodeAttr('A\r\nB\rC\nD\tE'), 'A B C D E');
  assert.equal(decodeAttr('A&#10;B&#13;C&#9;D'), 'A\nB\rC\tD');
  assert.equal(decodeAttr('&amp;&lt;&gt;&quot;&apos;&#65;&#x1F600;'), '&<>"\'A😀');
  const source = minimal({ body: '<StoryText><DefaultStyle/><ITEXT CH="A\r\nB"/><trail/></StoryText>' });
  assert.equal(onlyFrame(source).text, 'A B');
  assert.equal(onlyFrame(source).eligible, true);
  for (const raw of ['&unknown;', '&', '&#0;', '&#xD800;', '&#1114112;', '&x', '<']) {
    assert.throws(() => decodeAttr(raw), coded('xml'));
  }
});

test('XML declarations accept only complete XML 1.0 UTF-8 grammar', () => {
  const source = minimal();
  for (const declaration of [
    '<?xml version="1.0"?>', "<?xml version='1.0' encoding='utf-8'?>",
    '<?xml\tversion = "1.0"\nencoding="UTF-8" standalone="yes" ?>',
    '\uFEFF<?xml version="1.0" standalone="no"?>',
  ]) assert.equal(onlyFrame(declaration + source).eligible, true, declaration);
  for (const declaration of [
    '<?xml version="1.1"?>', '<?xml version="1.0" encoding="ISO-8859-1"?>',
    '<?xml version="1.0" encoding="UTF8"?>', '<?xml version="1.0" standalone="whatever"?>',
    '<?xml version="1.0" xxx="yes"?>', '<?xml encoding="UTF-8" version="1.0"?>',
    '<?xml version="1.0" version="1.0"?>', '<?xml?>', '<?xml version="1.0" standalone="yes" encoding="UTF-8"?>',
    '<?xml version="1.0"?bad?>',
  ]) assert.throws(() => inspectSla(declaration + source), coded('xml', 'encoding'), declaration);
});

test('XML rejects dangerous declarations, entities, namespaces, and malformed syntax', () => {
  const source = minimal();
  const cases = [
    '<!DOCTYPE SCRIBUSUTF8NEW>' + source,
    '<!DOCTYPE SCRIBUSUTF8NEW SYSTEM "https://example.invalid/evil.dtd">' + source,
    '<!DOCTYPE SCRIBUSUTF8NEW [<!ENTITY e "Open ">]>' + source,
    source.replace('CH="Open "', 'CH="&e;"'),
    source.replace('<DOCUMENT>', '<DOCUMENT xmlns="urn:test">'),
    source.replace('<DOCUMENT>', '<DOCUMENT xmlns:x="urn:test">'),
    source.replace('<DOCUMENT>', '<DOCUMENT xml:space="preserve">'),
    source.replace('<DOCUMENT>', '<x:DOCUMENT>').replace('</DOCUMENT>', '</x:DOCUMENT>'),
    source.replace('<DOCUMENT>', '<DOCUMENT><!CDATA[bad]]>'),
    source.replace('<DOCUMENT>', '<DOCUMENT><![CDATA[hidden]]>'),
    source.replace('CH="Open "', 'CH="Open " CH="other"'),
    source.replace('CH="Open "', 'CH=unquoted'),
    source.replace('CH="Open "', 'CH="literal < tag"'),
    source.replace('</DOCUMENT>', '</WRONG>'),
    source.replace('/><ITEXT', '><ITEXT'),
    source + source,
    source + '<?extra instruction?>',
    '<!--before--><?xml version="1.0"?>' + source,
    source.replace('<DOCUMENT>', '<!--not--valid--><DOCUMENT>'),
  ];
  for (const value of cases) assert.throws(() => inspectSla(value), coded('xml', 'encoding'));
});

test('XML rejects illegal characters even in comments and non-XML whitespace', () => {
  const source = minimal();
  for (const character of ['\u0000', '\u0001', '\u000B', '\u000C', '\u001F', '\uFFFE', '\uFFFF']) {
    assert.throws(() => inspectSla('<!--a' + character + 'b-->' + source), coded('xml'));
    assert.throws(() => inspectSla(source.replace('<DOCUMENT>', '<DOCUMENT>' + character)), coded('xml'));
  }
  for (const character of ['\u00A0', '\uFEFF', '\u2003']) {
    assert.throws(() => inspectSla(source.replace('<DOCUMENT>', '<DOCUMENT>' + character)), coded('xml'));
    assert.throws(() => inspectSla(source.replace('PTYPE="4" ', 'PTYPE="4"' + character)), coded('xml'));
  }
  assert.equal(onlyFrame('<!--preserve ordinary comment-->' + source + '\r\n\t ').eligible, true);
});

test('XML rejects non-whitespace element text and resource-bound violations early', () => {
  assert.throws(() => inspectSla(minimal().replace('<DOCUMENT>', '<DOCUMENT>words')), coded('xml'));
  assert.throws(() => parseXml('<x>'.repeat(LIMITS.depth + 1) + '</x>'.repeat(LIMITS.depth + 1)), coded('size', 'xml'));
  assert.throws(() => parseXml('<root>' + '<x/>'.repeat(LIMITS.elements) + '</root>'), coded('size', 'xml'));
  assert.equal(parseXml('<x>'.repeat(LIMITS.depth) + '</x>'.repeat(LIMITS.depth)).nodes.length, LIMITS.depth);
});

test('SLA root, version, and DOCUMENT topology are bounded', () => {
  for (const version of ['1.6.0', '1.6.1', '1.6.99']) assert.equal(onlyFrame(documentXml(objectXml(), { version })).eligible, true);
  for (const version of ['1.4.8', '1.5.8', '1.7.0', '1.6', '1.6.1.0', ' 1.6.1']) {
    assert.throws(() => inspectSla(documentXml(objectXml(), { version })), coded('version'));
  }
  assert.throws(() => inspectSla('<SCRIBUSUTF8NEW Version="1.6.1"/>'), coded('document'));
  assert.throws(() => inspectSla('<SCRIBUSUTF8NEW Version="1.6.1"><DOCUMENT/><DOCUMENT/></SCRIBUSUTF8NEW>'), coded('document'));
  assert.throws(() => inspectSla(minimal().replaceAll('SCRIBUSUTF8NEW', 'OTHER')), coded('version'));
});

test('frame identity is unique ANNAME across object types, never ItemID fallback', async () => {
  for (const tag of ['PAGEOBJECT', 'MASTEROBJECT', 'FRAMEOBJECT']) {
    const source = documentXml(objectXml() + objectXml({ tag, attrs: { PTYPE: '2', ItemID: 'different' } }));
    assert.equal(onlyFrame(source).eligible, false);
    assert.match(onlyFrame(source).reasons.join(';'), /not unique/);
    await assert.rejects(createPacket(source, ['headline']), coded('selection'));
  }
  for (const name of ['', ' headline', 'headline ', 'x'.repeat(201), 'head\nline']) {
    const source = minimal({ attrs: { ANNAME: name === 'head\nline' ? 'temporary' : name } }).replace('ANNAME="temporary"', 'ANNAME="head&#10;line"');
    assert.equal(onlyFrame(source).eligible, false, JSON.stringify(name));
  }
  assert.equal(onlyFrame(minimal({ attrs: { ItemID: null } })).eligible, true);
  assert.equal(onlyFrame(minimal({ attrs: { ANNAME: '見出し' } })).eligible, true);
});

test('master, inline, group-nested, and nontext frames cannot be selected', async () => {
  for (const tag of ['MASTEROBJECT', 'FRAMEOBJECT']) {
    assert.equal(onlyFrame(minimal({ tag })).eligible, false);
  }
  const nested = documentXml(objectXml({ attrs: { ANNAME: 'group', PTYPE: '12' }, body: objectXml() }));
  assert.equal(onlyFrame(nested).eligible, false);
  const image = minimal({ attrs: { PTYPE: '2' } });
  assert.equal(inspectSla(image).frames.length, 0);
  await assert.rejects(createPacket(image, ['headline']), coded('selection'));
});

test('unlinked status must be explicit in both directions', () => {
  for (const [key, value] of [['NEXTITEM', '8'], ['BACKITEM', '8'], ['NEXTITEM', null], ['BACKITEM', null], ['NEXTITEM', ''], ['NEXTITEM', '-01']]) {
    assert.equal(onlyFrame(minimal({ attrs: { [key]: value } })).eligible, false, `${key}=${value}`);
  }
});

test('page identity is an explicit representable nonnegative decimal page index', () => {
  for (const page of [null, '', '-1', 'bogus', '0.5', 'NaN', 'Infinity', ' 0', '00', '+0', '1e2', '0x10', '9007199254740991', '9007199254740992']) {
    assert.equal(onlyFrame(minimal({ attrs: { OwnPage: page } })).eligible, false, `OwnPage=${page}`);
  }
  assert.equal(onlyFrame(minimal({ attrs: { OwnPage: '1' } })).page, 2);
  assert.equal(onlyFrame(minimal({ attrs: { OnMasterPage: 'Master A' } })).eligible, false);
});

test('unsupported special-frame flags fail closed while explicit zero flags remain eligible', () => {
  for (const key of ['isNoteFrame', 'isTableItem', 'isGroupControl', 'isInline', 'AUTOTEXT', 'groups', 'GROUPS', 'NUMGROUP', 'isAutoText']) {
    assert.equal(onlyFrame(minimal({ attrs: { [key]: '1' } })).eligible, false, key);
    assert.equal(onlyFrame(minimal({ attrs: { [key]: '0' } })).eligible, true, `${key}=0`);
  }
  // Native Scribus writes these position values for ordinary objects too.
  assert.equal(onlyFrame(minimal({ attrs: { gXpos: '40.5', gYpos: '80' } })).eligible, true);
});

test('StoryText requires its one leading childless default style and exclusive wrapper', () => {
  for (const body of [
    '<StoryText><ITEXT CH="A"/><trail/></StoryText>',
    '<StoryText><DefaultStyle><EXTRA/></DefaultStyle><ITEXT CH="A"/><trail/></StoryText>',
    '<StoryText><DefaultStyle/><DefaultStyle/><ITEXT CH="A"/><trail/></StoryText>',
    normalBody + '<EXTRA/>', normalBody + normalBody,
  ]) assert.equal(onlyFrame(minimal({ body })).eligible, false, body);
});

test('only ordinary childless ITEXT, para, and a single final trail are eligible', () => {
  for (const body of [
    '<ITEXT CH="A"/>', '<trail/><ITEXT CH="A"/>', '<ITEXT CH="A"/><trail/><trail/>',
    '<ITEXT CH="A"/><trail/><para/>', '<ITEXT CH="A"><EXTRA/></ITEXT><trail/>',
    '<ITEXT CH="A"/><para><EXTRA/></para><trail/>', '<ITEXT CH="A"/><trail><EXTRA/></trail>',
    '<ITEXT/><trail/>', '<ITEXT CH="A" Unicode="65"/><trail/>', '<ITEXT CH="A" COBJ="0"/><trail/>',
    '<trail/>', '<ITEXT CH="A"/><breakline/><trail/>', '<ITEXT CH="A"/><tab/><trail/>',
    '<ITEXT CH="A"/><MARK/><trail/>', '<ITEXT CH="A"/><var/><trail/>',
  ]) assert.equal(onlyFrame(minimal({ body })).eligible, false, body);
  assert.equal(onlyFrame(minimal({ body: '<ITEXT CH=""/><trail/>' })).eligible, true);
});

test('safeText rejects unsupported breaks, objects, controls, and all private-use planes', () => {
  for (const character of ['\t', '\n', '\r', '\u00AD', '\u2028', '\u2029', '\uFFFC', '\uFFFD', '\uE000', '\uF8FF', '\u{F0000}', '\u{FFFFD}', '\u{100000}', '\u{10FFFD}', '\uD800']) {
    assert.throws(() => safeText('a' + character + 'b'), coded('text'));
  }
  for (const value of [null, 1, ['text']]) assert.throws(() => safeText(value), coded('text'));
  assert.throws(() => safeText('', { empty: false }), coded('text'));
  for (const value of ['', '日本語 Café café 😀', 'A & < > " \'', '👩‍💻', 'العربية']) assert.equal(safeText(value), value);
});

test('limits cover runs, story elements, Unicode code points, and paragraph breaks', async () => {
  const direct = body => minimal({ body });
  assert.equal(onlyFrame(direct('<ITEXT CH="x"/>'.repeat(LIMITS.runs) + '<trail/>')).eligible, true);
  assert.equal(onlyFrame(direct('<ITEXT CH="x"/>'.repeat(LIMITS.runs + 1) + '<trail/>')).eligible, false);
  assert.equal(onlyFrame(direct('<ITEXT CH="A"/>' + '<para/>'.repeat(254) + '<trail/>')).eligible, true);
  assert.equal(onlyFrame(direct('<ITEXT CH="A"/>' + '<para/>'.repeat(255) + '<trail/>')).eligible, false);
  assert.equal(onlyFrame(direct(`<ITEXT CH="${'😀'.repeat(LIMITS.chars)}"/><trail/>`)).eligible, true);
  assert.equal(onlyFrame(direct(`<ITEXT CH="${'a'.repeat(LIMITS.chars)}"/><para/><trail/>`)).eligible, false);
  const source = direct('<ITEXT CH="A"/><para/><trail/>');
  const packet = await createPacket(source, ['headline']);
  await createReturn(packet, { headline: ['a'.repeat(LIMITS.chars - 1)] });
  await assert.rejects(createReturn(packet, { headline: ['a'.repeat(LIMITS.chars)] }), coded('text'));
});

test('packet creation selects 1–32 known distinct eligible frames in requested order', async () => {
  const source = sampleSla();
  for (const names of [[], ['headline', 'headline'], ['missing'], ['hero-image'], null, 'headline']) {
    await assert.rejects(createPacket(source, names), coded('selection'));
  }
  const many = documentXml(Array.from({ length: 33 }, (_, i) => objectXml({ attrs: { ANNAME: `f${i}`, ItemID: `${i}` } })).join(''));
  const names = Array.from({ length: 32 }, (_, i) => `f${i}`);
  assert.equal((await createPacket(many, names)).frames.length, 32);
  await assert.rejects(createPacket(many, [...names, 'f32']), coded('selection'));
  const packet = await createPacket(source, ['caption', 'headline'], 'x'.repeat(300));
  assert.deepEqual(packet.frames.map(f => f.name), ['caption', 'headline']);
  assert.equal(packet.source.name.length, 200);
  assert.equal(packet.source.sha256, await sha256(source));
  assert.equal(packet.source.scribusVersion, '1.6.1');
  assert.deepEqual(await validatePacket(packet), packet);
  assert.notEqual(await validatePacket(packet), packet);
  assert.equal('node' in packet.frames[0], false);
  assert.equal('ItemID' in packet.frames[0], false);
});

test('packet canonicalization is key-order independent but binds every baseline field', async () => {
  assert.equal(canonical({ b: 2, a: [1, { z: 'é', a: true }] }), canonical({ a: [1, { a: true, z: 'é' }], b: 2 }));
  const packet = await createPacket(sampleSla(), ['headline']);
  const reordered = Object.fromEntries(Object.entries(packet).reverse());
  assert.deepEqual(await validatePacket(reordered), reordered);
  assert.notEqual(await validatePacket(reordered), reordered);
  assert.equal(serialize(packet).at(-1), '\n');
  assert.deepEqual(parseJson(serialize(packet)), packet);
  const changed = clone(packet);
  changed.source.name = 'different.sla';
  await assert.rejects(validatePacket(changed), coded('packet'));
  const changedText = clone(packet);
  changedText.frames[0].runs[0].text = 'Other ';
  changedText.frames[0].text = 'Other studio';
  await assert.rejects(validatePacket(changedText), coded('packet'));
});

test('packet validation rejects malformed schemas even if an attacker recomputes the hash', async () => {
  const base = await createPacket(sampleSla(), ['headline']);
  const mutations = [
    p => { p.extra = true; }, p => { delete p.format; }, p => { p.version = 2; },
    p => { p.source.extra = 1; }, p => { p.source.sha256 = 'bad'; }, p => { p.source.scribusVersion = '1.7.0'; },
    p => { p.frames = []; }, p => { p.frames.push(clone(p.frames[0])); },
    p => { p.frames[0].extra = 1; }, p => { p.frames[0].page = 0; }, p => { p.frames[0].page = 1.5; },
    p => { p.frames[0].name = ''; }, p => { p.frames[0].wrapper = 'Other'; },
    p => { p.frames[0].skeleton.push('trail'); }, p => { p.frames[0].skeleton = ['trail', 'ITEXT', 'ITEXT']; },
    p => { p.frames[0].skeleton[0] = 'MARK'; }, p => { p.frames[0].skeleton = []; },
    p => { p.frames[0].runs[0].extra = true; }, p => { p.frames[0].runs[0].run = 1; },
    p => { p.frames[0].runs[0].paragraph = 1; }, p => { p.frames[0].runs.pop(); },
    p => { p.frames[0].runs[0].text = 'bad\ntext'; }, p => { p.frames[0].text = 'wrong joined text'; },
    p => { p.frames[0].runs[0].text = 'a'.repeat(LIMITS.chars + 1); p.frames[0].text = p.frames[0].runs.map(r => r.text).join(''); },
  ];
  for (const mutate of mutations) {
    const packet = clone(base); mutate(packet); await resign(packet);
    await assert.rejects(validatePacket(packet), coded('packet', 'text'));
  }
  for (const value of [null, [], {}, { ...base, id: 'not a hash' }]) await assert.rejects(validatePacket(value), coded('packet'));
});

test('corrections retain baseline, allow empty replacement runs, and preserve ordering', async () => {
  const packet = await createPacket(sampleSla(), ['headline', 'caption']);
  const original = clone(packet);
  const result = await createReturn(packet, { headline: ['', 'New & studio'] });
  assert.deepEqual(packet, original);
  assert.deepEqual(result.returns[0], { name: 'headline', values: ['', 'New & studio'] });
  assert.deepEqual(result.returns[1].values, packet.frames[1].runs.map(r => r.text));
  assert.deepEqual(await validateReturn(result), result);
  assert.notEqual(await validateReturn(result), result);
  await assert.rejects(createReturn(packet, { unknown: ['A'] }), coded('packet'));
  await assert.rejects(createReturn(packet, { headline: ['wrong run count'] }), coded('packet'));
  await assert.rejects(createReturn(packet, { headline: ['break\n', 'studio'] }), coded('text'));
});

test('correction validation rejects missing, duplicated, reordered, and malformed returns', async () => {
  const { result } = await correction(['headline', 'caption']);
  const mutations = [
    r => { r.extra = true; }, r => { r.format = 'other'; }, r => { r.version = 2; },
    r => { r.returns.pop(); }, r => { r.returns.reverse(); }, r => { r.returns[1] = clone(r.returns[0]); },
    r => { r.returns[0].extra = true; }, r => { r.returns[0].name = 'unknown'; },
    r => { r.returns[0].values = 'string'; }, r => { r.returns[0].values = []; },
    r => { r.returns[0].values[0] = null; }, r => { r.returns[0].values[0] = 'a'.repeat(LIMITS.chars + 1); },
    r => { r.returns[0].values[0] = '\u{100000}'; },
  ];
  for (const mutate of mutations) {
    const changed = clone(result); mutate(changed);
    await assert.rejects(validateReturn(changed), coded('packet', 'text'));
  }
});

test('every analysis and application requires the separately retained original packet', async () => {
  const { packet, result } = await correction();
  await assert.rejects(analyzeReturn(sampleSla(true), result), coded('packet'));
  await assert.rejects(applyReturn(sampleSla(true), result, { approvedNames: ['headline'] }), coded('packet'));
  const noChange = await createReturn(packet);
  await assert.rejects(applyReturn(sampleSla(), noChange), coded('packet'));
  assert.equal((await applyReturn(sampleSla(), noChange, { originalPacket: packet })).output, sampleSla());
});

test('recomputed embedded packet cannot replace the trusted original baseline', async () => {
  const { packet, result } = await correction();
  const forged = clone(result);
  forged.packet.frames[0].runs[0].text = 'Revised ';
  forged.packet.frames[0].text = 'Revised studio';
  await resign(forged.packet);
  await validateReturn(forged);
  const revisedCurrent = sampleSla(true).replace('CH="Open "', 'CH="Revised "');
  await assert.rejects(analyzeReturn(revisedCurrent, forged, packet), coded('packet'));
  await assert.rejects(applyReturn(revisedCurrent, forged, { originalPacket: packet, approvedNames: ['headline'] }), coded('packet'));
  const differentSource = clone(result);
  differentSource.packet.source.name = 'someone-elses.sla';
  await resign(differentSource.packet);
  await assert.rejects(analyzeReturn(sampleSla(), differentSource, packet), coded('packet'));
});

test('trusted packet binding tolerates property reordering but not extra fields', async () => {
  const { packet, result } = await correction();
  // Reverse recursively without changing any values; canonical binding is semantic JSON.
  const reverse = value => Array.isArray(value) ? value.map(reverse) : value && typeof value === 'object'
    ? Object.fromEntries(Object.entries(value).reverse().map(([key, child]) => [key, reverse(child)])) : value;
  const analysis = await analyzeReturn(sampleSla(true), reverse(result), reverse(packet));
  assert.equal(analysis.frames[0].status, 'ready');
  const extra = { ...packet, unexpected: true };
  await assert.rejects(analyzeReturn(sampleSla(), result, extra), coded('packet'));
});

test('multiple approved frames patch their own runs without touching intervening objects', async () => {
  const packet = await createPacket(sampleSla(), ['caption', 'headline']);
  const result = await createReturn(packet, {
    headline: ['Community ', 'atelier'],
    caption: ['Everyone is welcome.', '地域のアトリエへ。 Café & café.'],
  });
  const current = sampleSla(true);
  const applied = await applyReturn(current, result, { originalPacket: packet, approvedNames: ['headline', 'caption'] });
  const expected = current.replace('CH="Open "', 'CH="Community "')
    .replace('CH="studio"', 'CH="atelier"')
    .replace('CH="Open studio, open doors."', 'CH="Everyone is welcome."');
  assert.equal(applied.output, expected);
  assert.deepEqual(applied.receipt.changedRuns, [
    { name: 'caption', run: 0 }, { name: 'headline', run: 0 }, { name: 'headline', run: 1 },
  ]);
});

test('newer geometry, named styles, direct styles, ItemID, and unrelated text survive exact CH-only patching', async () => {
  const { packet, result } = await correction();
  const current = sampleSla(true).replace('FONT="DejaVu Sans Book" FONTSIZE="20" FCOLOR="Ink"', 'FONT="Changed Font" FONTSIZE="27" FCOLOR="Accent"');
  const analysis = await analyzeReturn(current, result, packet);
  assert.equal(analysis.frames[0].status, 'ready');
  assert.notEqual(analysis.sourceSha256, analysis.currentSha256);
  const applied = await applyReturn(current, result, { originalPacket: packet, approvedNames: ['headline'] });
  assert.equal(applied.output, current.replace('CH="Open "', 'CH="Community "'));
  assert.match(applied.output, /ItemID="8124"/);
  assert.match(applied.output, /XPOS="80" YPOS="48" WIDTH="260"/);
  assert.match(applied.output, /CH="18:30"/);
  assert.match(applied.output, /PFILE="assets\/checker.png"/);
  assert.match(applied.output, /FONT="Changed Font" FONTSIZE="27"/);
});

test('byte preservation covers BOM, CRLF, comments, attribute order, quotes, and unchanged entity spellings', async () => {
  const source = '\uFEFF' + minimal({ body: "<StoryText><DefaultStyle/><!--持続--><ITEXT FONT='A' CH='Open '/><ITEXT CH='st&#117;dio' FONT='B'/><trail/></StoryText>" }).replaceAll('><', '>\r\n<') + '\r\n';
  const { packet, result } = await correction(['headline'], { headline: ['A & <B> "C" \'D\' 😀', 'studio'] }, source);
  const applied = await applyReturn(new TextEncoder().encode(source), result, { originalPacket: packet, approvedNames: ['headline'] });
  const expected = source.replace("CH='Open '", "CH='A &amp; &lt;B&gt; \"C\" &apos;D&apos; 😀'");
  assert.deepEqual(new TextEncoder().encode(applied.output), new TextEncoder().encode(expected));
  assert.match(applied.output, /CH='st&#117;dio'/);
  assert.equal(applied.output.charCodeAt(0), 0xFEFF);
});

test('patching several runs is offset-safe with Unicode and changing escaped lengths', async () => {
  const source = minimal({ body: '<StoryText><DefaultStyle/><ITEXT CH="日本語" FONT="A"/><ITEXT CH="😀" FONT="B"/><para/><ITEXT CH="é" FONT="C"/><trail/></StoryText>' });
  const values = ['😀 & "one"', '', '界 <two> & café'];
  const { packet, result } = await correction(['headline'], { headline: values }, source);
  const applied = await applyReturn(source, result, { originalPacket: packet, approvedNames: ['headline'] });
  assert.equal(applied.output, source.replace('CH="日本語"', 'CH="😀 &amp; &quot;one&quot;"').replace('CH="😀"', 'CH=""').replace('CH="é"', 'CH="界 &lt;two&gt; &amp; café"'));
  assert.deepEqual(onlyFrame(applied.output).runs.map(r => r.text), values);
  assert.deepEqual(applied.receipt.changedRuns, [{ name: 'headline', run: 0 }, { name: 'headline', run: 1 }, { name: 'headline', run: 2 }]);
});

test('unchanged and excluded returns are exact no-ops without implicit re-escaping', async () => {
  const source = minimal({ body: "<ITEXT CH='Op&#101;n '/><ITEXT CH='studio'/><trail/>" });
  const packet = await createPacket(source, ['headline']);
  const unchanged = await createReturn(packet);
  const noOp = await applyReturn(source, unchanged, { originalPacket: packet });
  assert.equal(noOp.output, source);
  assert.deepEqual(noOp.receipt.changedRuns, []);
  assert.equal(noOp.receipt.frames[0].status, 'unchanged');
  const result = await createReturn(packet, { headline: ['Changed ', 'studio'] });
  const excluded = await applyReturn(source, result, { originalPacket: packet, excludeNames: ['headline'] });
  assert.equal(excluded.output, source);
  assert.equal(excluded.receipt.frames[0].status, 'excluded');
});

test('complete baseline comparison catches stale changes even in an unedited run', async () => {
  const { packet, result } = await correction();
  const current = sampleSla(true).replace('CH="studio"', 'CH="laboratory"');
  const analysis = await analyzeReturn(current, result, packet);
  assert.equal(analysis.frames[0].status, 'conflict');
  assert.match(analysis.frames[0].reason, /complete baseline/);
  await assert.rejects(applyReturn(current, result, { originalPacket: packet, approvedNames: ['headline'] }), coded('conflict'));
});

test('already-applied returns are rejected as stale and cannot silently replay', async () => {
  const { packet, result } = await correction();
  const first = await applyReturn(sampleSla(true), result, { originalPacket: packet, approvedNames: ['headline'] });
  const again = await analyzeReturn(first.output, result, packet);
  assert.equal(again.frames[0].status, 'conflict');
  assert.match(again.frames[0].reason, /Already applied/);
  await assert.rejects(applyReturn(first.output, result, { originalPacket: packet, approvedNames: ['headline'] }), coded('conflict'));
  assert.equal((await applyReturn(first.output, result, { originalPacket: packet, excludeNames: ['headline'] })).output, first.output);
});

test('missing, renamed, duplicated, linked, and newly unsupported current frames conflict', async () => {
  const { packet, result } = await correction(['headline'], { headline: ['Community ', 'studio'] }, minimal());
  const cases = [
    documentXml(''), minimal({ attrs: { ANNAME: 'renamed' } }),
    documentXml(objectXml() + objectXml({ attrs: { ItemID: '8' } })),
    minimal({ attrs: { NEXTITEM: '8' } }), minimal({ attrs: { isNoteFrame: '1' } }),
    minimal({ attrs: { PTYPE: '2' } }),
  ];
  for (const current of cases) {
    const analysis = await analyzeReturn(current, result, packet);
    assert.equal(analysis.frames[0].status, 'conflict');
    await assert.rejects(applyReturn(current, result, { originalPacket: packet, approvedNames: ['headline'] }), coded('conflict'));
    assert.equal((await applyReturn(current, result, { originalPacket: packet, excludeNames: ['headline'] })).output, current);
  }
});

test('splitting, merging, changing paragraph boundaries, and switching wrappers conflict', async () => {
  const source = minimal();
  const { packet, result } = await correction(['headline'], { headline: ['Community ', 'studio'] }, source);
  for (const body of [
    '<StoryText><DefaultStyle/><ITEXT CH="Open studio"/><trail/></StoryText>',
    '<StoryText><DefaultStyle/><ITEXT CH="Op"/><ITEXT CH="en "/><ITEXT CH="studio"/><trail/></StoryText>',
    '<StoryText><DefaultStyle/><ITEXT CH="Open "/><para/><ITEXT CH="studio"/><trail/></StoryText>',
    '<ITEXT CH="Open "/><ITEXT CH="studio"/><trail/>',
  ]) assert.equal((await analyzeReturn(minimal({ body }), result, packet)).frames[0].status, 'conflict');
  const redistributed = minimal({ body: '<StoryText><DefaultStyle/><ITEXT CH="Op"/><ITEXT CH="en studio"/><trail/></StoryText>' });
  assert.equal((await analyzeReturn(redistributed, result, packet)).frames[0].status, 'conflict');
});

test('canonically equivalent Unicode wording still conflicts instead of silently normalizing', async () => {
  const source = minimal({ body: '<ITEXT CH="café"/><trail/>' });
  const { packet, result } = await correction(['headline'], { headline: ['coffee'] }, source);
  const current = source.replace('café', 'café');
  assert.equal((await analyzeReturn(current, result, packet)).frames[0].status, 'conflict');
});

test('mixed ready, conflicting, and unchanged frames require explicit approval and exclusion', async () => {
  const packet = await createPacket(sampleSla(), ['headline', 'sidebar', 'caption']);
  const result = await createReturn(packet, { headline: ['Community ', 'studio'], sidebar: ['19:00'] });
  const current = sampleSla(true);
  const analysis = await analyzeReturn(current, result, packet);
  assert.deepEqual(analysis.frames.map(f => f.status), ['ready', 'conflict', 'unchanged']);
  await assert.rejects(applyReturn(current, result, { originalPacket: packet, approvedNames: ['headline'] }), coded('conflict'));
  await assert.rejects(applyReturn(current, result, { originalPacket: packet, excludeNames: ['sidebar'] }), coded('approval'));
  const applied = await applyReturn(current, result, { originalPacket: packet, approvedNames: ['headline'], excludeNames: ['sidebar'] });
  assert.equal(applied.output, current.replace('CH="Open "', 'CH="Community "'));
  assert.deepEqual(applied.receipt.frames.map(f => f.status), ['applied', 'excluded', 'unchanged']);
});

test('approval and exclusion lists reject unknown, duplicate, intersecting, and malformed selections', async () => {
  const { packet, result } = await correction();
  const options = [
    {}, { approvedNames: [] }, { approvedNames: ['missing'] }, { excludeNames: ['missing'] },
    { approvedNames: ['headline', 'headline'] }, { excludeNames: ['headline', 'headline'] },
    { approvedNames: ['headline'], excludeNames: ['headline'] }, { approvedNames: 'headline' },
    { excludeNames: {} },
  ];
  for (const value of options) await assert.rejects(applyReturn(sampleSla(true), result, { originalPacket: packet, ...value }), coded('selection', 'approval'));
});

test('receipt hashes bind original, current, packet, and exact output, with native-layout caveat', async () => {
  const { packet, result } = await correction();
  const current = sampleSla(true);
  const applied = await applyReturn(current, result, { originalPacket: packet, approvedNames: ['headline'] });
  assert.equal(applied.receipt.packetId, packet.id);
  assert.equal(applied.receipt.originalSha256, await sha256(sampleSla()));
  assert.equal(applied.receipt.currentSha256, await sha256(current));
  assert.equal(applied.receipt.outputSha256, await sha256(applied.output));
  assert.match(applied.receipt.layoutValidation, /Required in Scribus/);
  assert.match(applied.receipt.assets, /Not packaged/);
  assert.match(applied.receipt.repeatPolicy, /Stale rejection/);
  assert.deepEqual(applied.corrections, result);
  assert.notEqual(applied.corrections, result);
});

test('literal XML-looking replacement text is safely escaped inside CH without creating nodes', async () => {
  const source = minimal();
  const maliciousLooking = '\"/><EXTRA PTYPE="4"> & text';
  const { packet, result } = await correction(['headline'], { headline: [maliciousLooking, 'studio'] }, source);
  const applied = await applyReturn(source, result, { originalPacket: packet, approvedNames: ['headline'] });
  assert.equal(parseXml(applied.output).nodes.length, parseXml(source).nodes.length);
  assert.equal(onlyFrame(applied.output).runs[0].text, maliciousLooking);
  assert.equal(applied.output, source.replace('CH="Open "', 'CH="&quot;/&gt;&lt;EXTRA PTYPE=&quot;4&quot;&gt; &amp; text"'));
  assert.equal(escapeAttr('A & <B> "C" \'D\'', '"'), 'A &amp; &lt;B&gt; &quot;C&quot; \'D\'');
});
