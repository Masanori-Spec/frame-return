import { parseXml, utf8, fail, LIMITS, escapeAttr, xmlChar } from './xml.mjs';
export { LIMITS, FrameError } from './xml.mjs';
const enc = new TextEncoder();
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
// Detach caller-owned JSON/arrays before any asynchronous digest can yield.
function snapshot(value, label) { try { return structuredClone(value); } catch { fail('packet', `Invalid ${label}: expected cloneable data`); } }
const exactKeys = (value, keys, label) => { if (!value || typeof value !== 'object' || Array.isArray(value) || !same(Object.keys(value).sort(), [...keys].sort())) fail('packet', `Invalid ${label} fields`); };
export function canonical(value) { if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`; if (value && typeof value === 'object') return `{${Object.keys(value).sort().map(k => `${JSON.stringify(k)}:${canonical(value[k])}`).join(',')}}`; return JSON.stringify(value); }
export async function sha256(value) { const bytes = typeof value === 'string' ? enc.encode(value) : value; const hash = await crypto.subtle.digest('SHA-256', bytes); return [...new Uint8Array(hash)].map(n => n.toString(16).padStart(2, '0')).join(''); }
export function safeText(text, { empty = true } = {}) {
  if (typeof text !== 'string' || (!empty && !text.length)) fail('text', 'Text must be a string');
  for (const c of text) { const cp = c.codePointAt(0); if (!xmlChar(cp) || cp === 9 || cp === 10 || cp === 13 || cp === 0xAD || cp === 0x2028 || cp === 0x2029 || cp === 0xFFFC || cp === 0xFFFD || cp >= 0xE000 && cp <= 0xF8FF || cp >= 0xF0000 && cp <= 0xFFFFD || cp >= 0x100000 && cp <= 0x10FFFD) fail('text', 'Tabs, breaks, soft hyphens, objects and private-use controls are unsupported'); }
  return text;
}
function describe(node, duplicates) {
  const name = node.attrs.ANNAME || ''; const reasons = [];
  if (!name || name.trim() !== name || name.length > 200 || /[\x00-\x1f]/.test(name)) reasons.push('A stable, nonempty frame name is required');
  if (duplicates.has(name)) reasons.push('Frame name is not unique');
  if (node.tag !== 'PAGEOBJECT' || node.parent?.tag !== 'DOCUMENT') reasons.push('Only top-level page frames are supported');
  if (node.attrs.PTYPE !== '4') reasons.push('Only ordinary text frames are supported');
  if (node.attrs.NEXTITEM !== '-1' || node.attrs.BACKITEM !== '-1') reasons.push('Linked or unproven-unlinked frames are unsupported');
  if (!/^(0|[1-9][0-9]*)$/.test(node.attrs.OwnPage ?? '') || !Number.isSafeInteger(Number(node.attrs.OwnPage) + 1) || (node.attrs.OnMasterPage ?? '') !== '') reasons.push('Master or off-page frames are unsupported');
  for (const key of ['isNoteFrame', 'isTableItem', 'isGroupControl', 'isInline', 'AUTOTEXT', 'groups', 'GROUPS', 'NUMGROUP', 'isAutoText']) if (node.attrs[key] && !['0', '-1'].includes(node.attrs[key])) reasons.push(`Unsupported frame flag: ${key}`);
  let content = node.children, wrapper = 'direct';
  const stories = node.children.filter(n => n.tag === 'StoryText');
  if (stories.length) {
    if (stories.length !== 1 || node.children.length !== 1) reasons.push('Unsupported story wrapper');
    content = stories[0].children; wrapper = 'StoryText';
    if (content[0]?.tag === 'DefaultStyle' && !content[0].children.length) content = content.slice(1);
    else reasons.push('StoryText requires one leading childless DefaultStyle');
  }
  if (content.length > 256) reasons.push('More than 256 story elements');
  const trails = content.filter(n => n.tag === 'trail');
  if (trails.length !== 1 || content.at(-1)?.tag !== 'trail') reasons.push('One final trail element is required');
  const runs = [], skeleton = []; let paragraph = 0, inParagraph = 0;
  for (const child of content) {
    skeleton.push(child.tag);
    if (child.children.length) reasons.push(`Nested ${child.tag} is unsupported`);
    if (child.tag === 'ITEXT') {
      if (!Object.hasOwn(child.attrs, 'CH') || Object.hasOwn(child.attrs, 'Unicode') || Object.hasOwn(child.attrs, 'COBJ')) reasons.push('Only ordinary CH text runs are supported');
      const text = child.attrs.CH ?? '';
      try { safeText(text); } catch (e) { reasons.push(e.message); }
      runs.push({ paragraph, run: inParagraph++, text, node: child });
    } else if (child.tag === 'para') { paragraph++; inParagraph = 0; }
    else if (child.tag !== 'trail') reasons.push(`Unsupported text construct: ${child.tag}`);
  }
  if (!runs.length) reasons.push('At least one ordinary text run is required');
  if (runs.length > LIMITS.runs) reasons.push('More than 128 text runs');
  if ([...runs.map(r => r.text).join('')].length + content.filter(n => n.tag === 'para').length > LIMITS.chars) reasons.push('More than 3,000 characters');
  return { name, eligible: !reasons.length, reasons: [...new Set(reasons)], runs, skeleton, wrapper, text: content.map(n => n.tag === 'ITEXT' ? n.attrs.CH ?? '' : n.tag === 'para' ? '\n' : '').join(''), page: Number(node.attrs.OwnPage) + 1, node };
}
export function inspectSla(input) {
  const doc = parseXml(input);
  if (doc.root.tag !== 'SCRIBUSUTF8NEW' || !/^1\.6\.\d+$/.test(doc.root.attrs.Version ?? '')) fail('version', 'Only uncompressed Scribus 1.6.x SLA is supported');
  if (doc.root.children.length !== 1 || doc.root.children[0].tag !== 'DOCUMENT') fail('document', 'Expected one Scribus DOCUMENT');
  const objects = doc.nodes.filter(n => ['PAGEOBJECT', 'MASTEROBJECT', 'FRAMEOBJECT'].includes(n.tag));
  const names = new Map(); for (const n of objects) { const name = n.attrs.ANNAME ?? ''; names.set(name, (names.get(name) ?? 0) + 1); }
  const duplicates = new Set([...names].filter(([,count]) => count > 1).map(([name]) => name));
  const frames = objects.filter(n => n.attrs.PTYPE === '4').map(n => describe(n, duplicates));
  return { ...doc, frames, version: doc.root.attrs.Version };
}
function publicFrame(frame) { return { name: frame.name, page: frame.page, wrapper: frame.wrapper, skeleton: frame.skeleton, runs: frame.runs.map(({paragraph, run, text}) => ({paragraph, run, text})), text: frame.text }; }
export async function createPacket(input, names, filename = 'source.sla') {
  const doc = inspectSla(input);
  if (!Array.isArray(names) || !names.length || names.length > LIMITS.selected || new Set(names).size !== names.length) fail('selection', 'Select 1–32 distinct frames');
  const frames = names.map(name => { const found = doc.frames.filter(f => f.name === name); if (found.length !== 1 || !found[0].eligible) fail('selection', `Unsupported frame: ${name}`); return publicFrame(found[0]); });
  const payload = { format: 'frame-return/review', version: 1, source: { name: String(filename).slice(0, 200), sha256: await sha256(doc.raw), scribusVersion: doc.version }, frames };
  return validatePacket({ ...payload, id: await sha256(canonical(payload)) });
}
export function parseJson(input) {
  if (typeof input !== 'string' || enc.encode(input).length > LIMITS.packetBytes) fail('packet', 'Packet must be at most 2 MiB');
  try { return JSON.parse(input); } catch { fail('packet', 'Invalid JSON packet'); }
}
export async function validatePacket(packet) {
  packet = snapshot(packet, 'review packet');
  exactKeys(packet, ['format', 'version', 'source', 'frames', 'id'], 'packet');
  if (packet.format !== 'frame-return/review' || packet.version !== 1 || !/^[a-f0-9]{64}$/.test(packet.id)) fail('packet', 'Unsupported review packet');
  exactKeys(packet.source, ['name', 'sha256', 'scribusVersion'], 'source');
  if (typeof packet.source.name !== 'string' || packet.source.name.length > 200 || !/^[a-f0-9]{64}$/.test(packet.source.sha256) || !/^1\.6\.\d+$/.test(packet.source.scribusVersion)) fail('packet', 'Invalid source identity');
  if (!Array.isArray(packet.frames) || !packet.frames.length || packet.frames.length > LIMITS.selected) fail('packet', 'Invalid frame count');
  const names = new Set();
  for (const frame of packet.frames) {
    exactKeys(frame, ['name', 'page', 'wrapper', 'skeleton', 'runs', 'text'], 'frame');
    if (typeof frame.name !== 'string' || !frame.name.trim() || frame.name.trim() !== frame.name || frame.name.length > 200 || names.has(frame.name) || !Number.isSafeInteger(frame.page) || frame.page < 1 || !['direct', 'StoryText'].includes(frame.wrapper)) fail('packet', 'Invalid frame identity');
    names.add(frame.name);
    if (!Array.isArray(frame.runs) || !frame.runs.length || frame.runs.length > LIMITS.runs || !Array.isArray(frame.skeleton) || frame.skeleton.length > 256) fail('packet', 'Invalid runs');
    if (frame.skeleton.filter(t => t === 'trail').length !== 1 || frame.skeleton.at(-1) !== 'trail') fail('packet', 'One final trail is required');
    let paragraph = 0, run = 0, index = 0, text = '';
    for (const tag of frame.skeleton) {
      if (tag === 'para') { paragraph++; run = 0; text += '\n'; }
      else if (tag === 'ITEXT') { const r = frame.runs[index++]; exactKeys(r, ['paragraph', 'run', 'text'], 'run'); if (r.paragraph !== paragraph || r.run !== run++) fail('packet', 'Changed run boundaries'); text += safeText(r.text); }
      else if (tag !== 'trail') fail('packet', 'Unsupported packet structure');
    }
    if (index !== frame.runs.length || frame.text !== text || [...frame.text].length > LIMITS.chars) fail('packet', 'Invalid baseline text');
  }
  const { id, ...payload } = packet; if (id !== await sha256(canonical(payload))) fail('packet', 'Review packet checksum mismatch');
  return packet;
}
export async function createReturn(packet, edits = {}) {
  packet = snapshot(packet, 'review packet'); edits = snapshot(edits, 'edits');
  packet = await validatePacket(packet);
  const known = new Set(packet.frames.map(f => f.name));
  for (const key of Object.keys(edits)) if (!known.has(key)) fail('packet', 'Unknown edited frame');
  const result = { format: 'frame-return/corrections', version: 1, packet, returns: packet.frames.map(frame => ({ name: frame.name, values: Object.hasOwn(edits, frame.name) ? edits[frame.name] : frame.runs.map(r => r.text) })) };
  return validateReturn(result);
}
export async function validateReturn(result) {
  result = snapshot(result, 'corrections');
  exactKeys(result, ['format', 'version', 'packet', 'returns'], 'corrections');
  if (result.format !== 'frame-return/corrections' || result.version !== 1) fail('packet', 'Unsupported corrections format');
  result.packet = await validatePacket(result.packet);
  if (!Array.isArray(result.returns) || result.returns.length !== result.packet.frames.length) fail('packet', 'Missing returned frames');
  result.returns.forEach((returned, i) => {
    exactKeys(returned, ['name', 'values'], 'returned frame'); const frame = result.packet.frames[i];
    if (returned.name !== frame.name || !Array.isArray(returned.values) || returned.values.length !== frame.runs.length) fail('packet', 'Changed return run boundaries');
    returned.values.forEach(v => safeText(v)); if ([...returned.values.join('')].length + frame.skeleton.filter(t => t === 'para').length > LIMITS.chars) fail('text', 'Replacement exceeds 3,000 characters');
  });
  return result;
}
export async function analyzeReturn(input, result, originalPacket) {
  input = utf8(input); result = snapshot(result, 'corrections'); originalPacket = snapshot(originalPacket, 'original review packet');
  if (!originalPacket) fail('packet', 'Import the original review packet to bind this return');
  originalPacket = await validatePacket(originalPacket); result = await validateReturn(result);
  if (canonical(originalPacket) !== canonical(result.packet)) fail('packet', 'Corrections do not match the original review packet'); const doc = inspectSla(input);
  const frames = result.packet.frames.map((baseline, i) => {
    const values = result.returns[i].values; const candidates = doc.frames.filter(f => f.name === baseline.name); const current = candidates[0];
    let status, reason = '';
    if (candidates.length !== 1 || !current?.eligible) { status = 'conflict'; reason = candidates.length === 0 ? 'Frame is missing or renamed' : candidates.length > 1 ? 'Frame name is duplicated' : current.reasons.join('; '); }
    else if (!same(baseline.skeleton, current.skeleton) || baseline.wrapper !== current.wrapper || !same(baseline.runs.map(r => [r.paragraph, r.run]), current.runs.map(r => [r.paragraph, r.run]))) { status = 'conflict'; reason = 'Run or paragraph boundaries changed'; }
    else if (!same(baseline.runs.map(r => r.text), current.runs.map(r => r.text))) { status = 'conflict'; reason = same(values, current.runs.map(r => r.text)) ? 'Already applied or current text equals this return; prepare a fresh packet' : 'Current wording differs from the complete baseline'; }
    else { status = same(values, baseline.runs.map(r => r.text)) ? 'unchanged' : 'ready'; }
    return { name: baseline.name, baseline: baseline.runs.map(r => r.text), values, current: current?.runs.map(r => r.text) ?? [], status, reason, frame: current };
  });
  return { doc, frames, sourceSha256: result.packet.source.sha256, currentSha256: await sha256(doc.raw), packetId: result.packet.id };
}
export async function applyReturn(input, result, options = {}) {
  input = utf8(input); result = snapshot(result, 'corrections'); options = snapshot(options, 'application options');
  const analysis = await analyzeReturn(input, result, options.originalPacket);
  const exclude = options.excludeNames ?? [], approved = options.approvedNames ?? [];
  if (!Array.isArray(exclude) || !Array.isArray(approved) || new Set(exclude).size !== exclude.length || new Set(approved).size !== approved.length) fail('selection', 'Invalid approval/exclusion list');
  const all = new Set(analysis.frames.map(f => f.name));
  if ([...exclude, ...approved].some(n => !all.has(n)) || approved.some(n => exclude.includes(n))) fail('selection', 'Unknown or conflicting selection');
  const conflicts = analysis.frames.filter(f => f.status === 'conflict' && !exclude.includes(f.name));
  if (conflicts.length) fail('conflict', `Exclude conflicts explicitly before output: ${conflicts.map(f => f.name).join(', ')}`);
  const unapproved = analysis.frames.filter(f => f.status === 'ready' && !approved.includes(f.name) && !exclude.includes(f.name));
  if (unapproved.length) fail('approval', 'Approve or explicitly exclude every changed frame');
  const patches = [];
  for (const f of analysis.frames) if (f.status === 'ready' && approved.includes(f.name)) f.frame.runs.forEach((r, i) => { if (r.text !== f.values[i]) patches.push({ ...r.node.attrRanges.CH, text: escapeAttr(f.values[i], r.node.attrRanges.CH.quote), name: f.name, run: i }); });
  let output = analysis.doc.raw;
  for (const patch of [...patches].sort((a,b) => b.start-a.start)) output = output.slice(0, patch.start) + patch.text + output.slice(patch.end);
  // Parse patched output again before releasing bytes. No serialization or native fit changes occur.
  const checkedOutput = inspectSla(output);
  for (const f of analysis.frames) if (f.status === 'ready' && approved.includes(f.name)) {
    const found = checkedOutput.frames.filter(frame => frame.name === f.name);
    if (found.length !== 1 || !found[0].eligible || !same(found[0].runs.map(run => run.text), f.values) || !same(found[0].skeleton, f.frame.skeleton)) fail('output', 'Patched wording or frame eligibility differs from the approved correction');
  }
  const receipt = { format: 'frame-return/receipt', version: 1, packetId: analysis.packetId, originalSha256: analysis.sourceSha256, currentSha256: analysis.currentSha256, outputSha256: await sha256(output), bytePolicy: 'Only approved ITEXT CH attribute value ranges were replaced', repeatPolicy: 'Stale rejection, including already-applied wording', layoutValidation: 'Required in Scribus; no browser layout or overflow guarantee', assets: 'Not packaged. Save revised SLA beside current SLA.', frames: analysis.frames.map(f => ({ name: f.name, status: exclude.includes(f.name) ? 'excluded' : f.status === 'ready' ? 'applied' : f.status, reason: f.reason })), changedRuns: patches.map(({name,run}) => ({name,run})) };
  return { output, receipt, corrections: result };
}
export function serialize(value) { return JSON.stringify(value, null, 2) + '\n'; }
