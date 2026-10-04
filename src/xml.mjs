import sax from 'sax';
export class FrameError extends Error { constructor(code, message) { super(message); this.name = 'FrameError'; this.code = code; } }
export const fail = (code, message) => { throw new FrameError(code, message); };
export const LIMITS = Object.freeze({ bytes: 16 * 1024 * 1024, elements: 200000, depth: 64, selected: 32, chars: 3000, runs: 128, packetBytes: 2 * 1024 * 1024 });
const enc = new TextEncoder();
export function utf8(input) {
  if (typeof input === 'string') {
    if (input.length > LIMITS.bytes || enc.encode(input).length > LIMITS.bytes) fail('size', 'SLA exceeds 16 MiB');
    if (/[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/u.test(input)) fail('encoding', 'Unpaired Unicode surrogate');
    return input;
  }
  const bytes = input instanceof Uint8Array ? input : new Uint8Array(input);
  if (bytes.byteLength > LIMITS.bytes) fail('size', 'SLA exceeds 16 MiB');
  try { return new TextDecoder('utf-8', { fatal: true, ignoreBOM: true }).decode(bytes); } catch { fail('encoding', 'SLA must be uncompressed UTF-8'); }
}
export function xmlChar(cp) { return cp === 9 || cp === 10 || cp === 13 || (cp >= 32 && cp <= 0xD7FF) || (cp >= 0xE000 && cp <= 0xFFFD) || (cp >= 0x10000 && cp <= 0x10FFFF); }
export function decodeAttr(raw) {
  if (raw.includes('<')) fail('xml', 'Literal < in XML attribute');
  let text = raw.replace(/\r\n/g, '\n').replace(/[\t\r\n]/g, ' ');
  text = text.replace(/&([^;]*);|&/g, (all, entity) => {
    const fixed = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'" };
    if (Object.hasOwn(fixed, entity)) return fixed[entity];
    if (!/^#(?:[0-9]+|x[0-9a-fA-F]+)$/.test(entity ?? '')) fail('xml', 'Unsupported or malformed entity');
    const cp = entity[1] === 'x' ? parseInt(entity.slice(2), 16) : parseInt(entity.slice(1), 10);
    if (!xmlChar(cp)) fail('xml', 'Illegal XML character');
    return String.fromCodePoint(cp);
  });
  for (const c of text) if (!xmlChar(c.codePointAt(0))) fail('xml', 'Illegal XML character');
  return text;
}
export function escapeAttr(text, quote) {
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(quote === "'" ? /'/g : /"/g, quote === "'" ? '&apos;' : '&quot;');
}
export function parseXml(input) {
  const raw = utf8(input);
  if (/<!DOCTYPE|<!ENTITY|<!\[CDATA\[/i.test(raw)) fail('xml', 'DTD, entities and CDATA are outside this profile');
  for (const c of raw) if (!xmlChar(c.codePointAt(0))) fail('xml', 'Illegal XML character');
  const declaration = raw.match(/^\uFEFF?<\?xml[ \t\r\n]+[^?]*\?>/);
  if (declaration) {
    const decl = declaration[0].replace(/^\uFEFF/, '');
    const grammar = /^<\?xml[ \t\r\n]+version[ \t\r\n]*=[ \t\r\n]*(?:"1\.0"|'1\.0')(?:[ \t\r\n]+encoding[ \t\r\n]*=[ \t\r\n]*(?:"[Uu][Tt][Ff]-8"|'[Uu][Tt][Ff]-8'))?(?:[ \t\r\n]+standalone[ \t\r\n]*=[ \t\r\n]*(?:"(?:yes|no)"|'(?:yes|no)'))?[ \t\r\n]*\?>$/;
    if (!grammar.test(decl)) fail('encoding', 'Only an XML 1.0 UTF-8 declaration is supported');
  }
  // Independent standards parser validates entities, well-formedness and nesting before our byte-addressable scanner.
  try { const parser = sax.parser(true, { strictEntities: true, xmlns: false, trim: false, normalize: false }); let depth = 0, count = 0; parser.onopentag = () => { if (++depth > LIMITS.depth || ++count > LIMITS.elements) fail('size', 'XML resource limit exceeded'); }; parser.onclosetag = () => { depth--; }; parser.write(raw).close(); }
  catch { fail('xml', 'Malformed XML'); }
  const roots = [], nodes = [], stack = []; let pos = raw.charCodeAt(0) === 0xFEFF ? 1 : 0;
  while (pos < raw.length) {
    if (raw[pos] !== '<') {
      const end = raw.indexOf('<', pos), stop = end < 0 ? raw.length : end;
      if (/[^ \t\r\n]/.test(raw.slice(pos, stop))) fail('xml', 'Element text is outside the SLA profile');
      pos = stop; continue;
    }
    if (raw.startsWith('<!--', pos)) { const end = raw.indexOf('-->', pos + 4); if (end < 0) fail('xml', 'Unclosed comment'); pos = end + 3; continue; }
    if (raw.startsWith('<?', pos)) { const end = raw.indexOf('?>', pos + 2); if (pos !== (raw.charCodeAt(0) === 0xFEFF ? 1 : 0) || !declaration || end < 0) fail('xml', 'Only the initial XML declaration is allowed'); pos = end + 2; continue; }
    if (raw.startsWith('</', pos)) {
      const match = /^<\/([A-Za-z_][A-Za-z0-9_.-]*)[ \t\r\n]*>/.exec(raw.slice(pos));
      if (!match || !stack.length || stack.at(-1).tag !== match[1]) fail('xml', 'Invalid end tag');
      stack.pop().end = pos + match[0].length; pos += match[0].length; continue;
    }
    const start = pos, name = /^<([A-Za-z_][A-Za-z0-9_.-]*)/.exec(raw.slice(pos));
    if (!name) fail('xml', 'Unsupported XML element name');
    pos += name[0].length;
    const node = { tag: name[1], attrs: Object.create(null), attrRanges: Object.create(null), children: [], parent: stack.at(-1) ?? null, start };
    while (true) {
      const ws = /^[ \t\r\n]*/.exec(raw.slice(pos))[0]; pos += ws.length;
      if (raw.startsWith('/>', pos) || raw[pos] === '>') break;
      if (!ws.length) fail('xml', 'Attributes require whitespace');
      const attr = /^([A-Za-z_][A-Za-z0-9_.-]*)[ \t\r\n]*=[ \t\r\n]*(['"])/.exec(raw.slice(pos));
      if (!attr || attr[1] === 'xmlns' || Object.hasOwn(node.attrs, attr[1])) fail('xml', 'Unsupported, duplicate or namespace attribute');
      pos += attr[0].length; const valueStart = pos, valueEnd = raw.indexOf(attr[2], pos);
      if (valueEnd < 0) fail('xml', 'Unclosed attribute');
      node.attrs[attr[1]] = decodeAttr(raw.slice(valueStart, valueEnd));
      node.attrRanges[attr[1]] = { start: valueStart, end: valueEnd, quote: attr[2] }; pos = valueEnd + 1;
    }
    const selfClosing = raw.startsWith('/>', pos); pos += selfClosing ? 2 : 1; node.openEnd = pos;
    nodes.push(node); if (nodes.length > LIMITS.elements) fail('size', 'Too many XML elements');
    if (node.parent) node.parent.children.push(node); else roots.push(node);
    if (!selfClosing) { stack.push(node); if (stack.length > LIMITS.depth) fail('size', 'XML nesting too deep'); }
    else node.end = pos;
  }
  if (stack.length || roots.length !== 1) fail('xml', 'Expected one XML root');
  return { raw, root: roots[0], nodes };
}
