import { inspectSla, createPacket, createReturn, validatePacket, validateReturn, analyzeReturn, applyReturn, parseJson, serialize, LIMITS } from '../src/core.mjs';
import { sampleSla } from '../src/fixture.mjs';
const $ = id => document.getElementById(id);
const en = {
 assignmentLabel:'Original review packet saved when assigning',assignmentHint:'Verified separately from the copy embedded in corrections',skip:'Skip to workspace',language:'Language',local:'Local processing · no upload',title:'Return the words.<br>Keep the current layout.',intro:'Assign selected wording for review, then return it to a newer SLA. When the designer has also changed the assigned words, stop before applying.',contract:'SUPPORTED HANDOFF',scope:'Scribus 1.6.x · uncompressed UTF-8 SLA<br>Uniquely named, unlinked text frames',limits:'Up to 32 frames / 3,000 characters · 128 runs each',prepare:'Prepare',review:'Review copy',apply:'Return to layout',reset:'Reset all',designer:'DESIGNER / ASSIGN & RETURN',copyeditor:'COPYEDITOR / REVIEW',prepareHeading:'Choose the frames to send for review',sampleSource:'Try sample',prepareHelp:'Give frames unique names in Scribus and save. Select only the wording you want reviewed. The sample is a synthetic interface/parser fixture.',sourceLabel:'Original SLA for the assignment',sourceHint:'Choose an uncompressed .sla · up to 16 MiB',choose:'ASSIGNED WORDING',sourceEmpty:'Import an SLA to see which text frames can be assigned.',packetHint:'The review packet contains selected wording. Share it only with a trusted copyeditor.',createPacket:'Save review packet →',reviewHeading:'Edit wording within its existing style runs',packetLabel:'Review packet JSON',packetFileHint:'Choose frame-return-review.json',reviewHelp:'Each field is a style run. Run and paragraph boundaries stay fixed. Edit only the words inside each field; do not add line breaks or tabs.',reviewEmpty:'Import a review packet to begin.',reviewHint:'This is a copyediting view. Check the real layout, styles and fit in Scribus.',saveReturn:'Save corrections packet →',applyHeading:'Compare the return with your current layout',sampleCurrent:'Load sample current',returnLabel:'Returned corrections JSON',returnHint:'frame-return-corrections.json',currentLabel:'Current SLA',currentHint:'Choose your latest working .sla',compareHelp:'Match the unique name, complete baseline wording, and run/paragraph boundaries. Keep current placement, styling, and other text.',analyze:'Check corrections',applyEmpty:'Import both files, then check the corrections.',applyHint:'Approve each change. Every conflict must be explicitly excluded before output.',applyReturn:'Apply approved corrections',ready:'OUTPUT CREATED',saveBeside:'Save beside the current SLA',assetWarning:'Images are not packaged. Keep relative paths intact, reopen in Scribus, and check overflow, styles, and the exported PDF. Text is never automatically shrunk.',downloadSla:'Save revised SLA',downloadReceipt:'Save receipt JSON',boundsHeading:'A deliberately bounded return',bounds:'Linked, grouped, master, table, inline, and special break/tab constructs are excluded. Renamed or recreated frames with reused names cannot be tracked. Reapplying a return is rejected as stale.',privacy:'Files stay in this browser. No upload, server processing, or saved history. Download what you need before closing.',footer:'Scribus is the final authority for layout.'
};
const ja = Object.fromEntries([...document.querySelectorAll('[data-i18n]')].map(el => [el.dataset.i18n, el.innerHTML]));
let lang = 'ja', seq = 0;
const fresh = () => ({ source:null, sourceName:'', selected:new Set(), packet:null, assignment:null, edits:Object.create(null), corrections:null, current:null, currentName:'', analysis:null, approved:new Set(), excluded:new Set(), output:null, step:'prepare' });
let state = fresh();
const tr = (j,e) => lang === 'ja' ? j : e;
function node(tag, attrs={}, children=[]) { const n=document.createElement(tag); for (const [k,v] of Object.entries(attrs)) { if (k==='class') n.className=v; else if (k==='text') n.textContent=v; else n.setAttribute(k,v); } for (const child of children) n.append(child); return n; }
function message(text, error=false) { $('notice').textContent=text; $('notice').hidden=!text; $('notice').classList.toggle('error',error); }
function showError(e) { const lead = tr('処理できませんでした。','Unable to continue. '); message(`${lead} ${e.message || String(e)}`, true); }
function invalidate() { state.analysis=null; state.approved.clear(); state.excluded.clear(); state.output=null; }
function outputOff() { state.output=null; $('downloads').hidden=true; }
function switchStep(step) { state.step=step; for(const name of ['prepare','review','apply']) { $(name+'-panel').hidden=name!==step; $('tab-'+name).classList.toggle('active',name===step); if(name===step)$('tab-'+name).setAttribute('aria-current','step');else $('tab-'+name).removeAttribute('aria-current'); } }
function download(name, data, type) { const url=URL.createObjectURL(new Blob([data],{type})); const a=node('a',{href:url,download:name}); document.body.append(a); a.click(); a.remove(); setTimeout(()=>URL.revokeObjectURL(url),30000); }
async function task(work) { const id=++seq; try { await work(()=>id===seq); } catch(e) { if(id===seq){showError(e);render();} } }
async function readFile(input, kind) { const file=input.files[0]; if(!file) return null; const max=kind==='sla'?LIMITS.bytes:LIMITS.packetBytes; if(file.size>max) throw Error(tr('ファイルのサイズ上限を超えています。','File exceeds the size limit.')); const bytes=new Uint8Array(await file.arrayBuffer()); const raw=new TextDecoder('utf-8',{fatal:true,ignoreBOM:true}).decode(bytes); return {raw,name:file.name}; }
function renderSource() {
 $('source-name').textContent=state.sourceName || (lang==='ja'?ja.sourceHint:en.sourceHint);
 const list=$('frame-list'); list.replaceChildren();
 if(!state.source){list.append(node('div',{class:'empty',text:lang==='ja'?ja.sourceEmpty:en.sourceEmpty}));}
 else state.source.frames.forEach((f,i)=>{
   const check=node('input',{type:'checkbox','aria-label':tr(`${f.name || '無名'} を依頼`, `Assign ${f.name || 'unnamed'}`),'data-frame':f.name}); check.checked=state.selected.has(f.name); check.disabled=!f.eligible;
   check.addEventListener('change',()=>{if(check.checked){if(state.selected.size>=LIMITS.selected){check.checked=false;message(tr('選べるのは32フレームまでです。','Select at most 32 frames.'),true);return;}state.selected.add(f.name);}else state.selected.delete(f.name);seq++;state.packet=null;state.assignment=null;state.corrections=null;state.edits=Object.create(null);invalidate();renderControls();renderReview();renderReturns();});
   const head=node('div',{class:'frame-head'},[node('span',{class:'frame-name',text:f.name||tr('名前なし','Unnamed')}),node('span',{class:'frame-meta',text:tr(`P${f.page} · ${f.runs.length} ラン`, `P${f.page} · ${f.runs.length} runs`)})]);
   const body=node('div',{class:'frame-body'},[head,node('p',{class:'frame-copy',text:f.text.slice(0,240)+(f.text.length>240?'…':'')})]);
   if(!f.eligible)body.append(node('p',{class:'unsupported',text:f.reasons.join(' / ')}));
   list.append(node('label',{class:'frame'},[check,body]));
 });
 if(state.source && !state.source.frames.length)list.append(node('div',{class:'empty',text:tr('テキストフレームがありません。','No text frames found.')}));
}
function renderReview() {
 $('review-name').textContent=state.packet?`${state.packet.source.name} · ${state.packet.id.slice(0,12)}`:(lang==='ja'?ja.packetFileHint:en.packetFileHint);
 const list=$('review-list');list.replaceChildren();
 if(!state.packet){list.append(node('div',{class:'empty',text:lang==='ja'?ja.reviewEmpty:en.reviewEmpty}));return;}
 for(const [fi,f]of state.packet.frames.entries()){
   const card=node('article',{class:'review-frame'},[node('div',{class:'card-heading'},[node('h3',{text:f.name}),node('small',{text:tr(`P${f.page} / ${f.runs.length} ラン`,`P${f.page} / ${f.runs.length} runs`)})])]);
   f.runs.forEach((r,ri)=>{
     const id=`run-${fi}-${ri}`, area=node('textarea',{id,'data-frame':f.name,'data-run':String(ri),rows:'2',spellcheck:'true','aria-describedby':`${id}-base`});area.value=state.edits[f.name][ri];
     area.addEventListener('input',()=>{seq++;state.edits[f.name][ri]=area.value;state.corrections=null;invalidate();renderControls();renderReturns();});
     card.append(node('div',{class:'run-editor'},[node('label',{for:id,class:'run-label'},[node('span',{text:tr(`段落 ${r.paragraph+1} / ラン ${r.run+1}`,`Paragraph ${r.paragraph+1} / run ${r.run+1}`)}),node('span',{text:tr('区切りは固定','Fixed boundary')})]),node('p',{id:`${id}-base`,class:'baseline',text:tr('元の文章: ','Original: ')+r.text}),area]));
   });list.append(card);
 }
}
function renderReturns() {
 const focusLabel=document.activeElement?.closest('#return-list')?document.activeElement.getAttribute('aria-label'):null;
 $('assignment-name').textContent=state.assignment?`${state.assignment.source.name} · ${state.assignment.id.slice(0,12)}`:(lang==='ja'?ja.assignmentHint:en.assignmentHint);
 $('return-name').textContent=state.corrections?`${state.corrections.packet.source.name} · ${state.corrections.returns.length} ${tr('フレーム','frames')}`:(lang==='ja'?ja.returnHint:en.returnHint);
 $('current-name').textContent=state.currentName||(lang==='ja'?ja.currentHint:en.currentHint);
 const list=$('return-list');list.replaceChildren();
 if(!state.analysis){list.append(node('div',{class:'empty',text:lang==='ja'?ja.applyEmpty:en.applyEmpty}));return;}
 for(const f of state.analysis.frames){
   const statusText=f.status==='ready'?tr('適用可能','READY'):f.status==='conflict'?tr('競合','CONFLICT'):tr('変更なし','UNCHANGED');
   const card=node('article',{class:'return-frame','data-return-frame':f.name},[node('div',{class:'card-heading'},[node('h3',{text:f.name}),node('span',{class:`status ${f.status}`,text:statusText})])]);
   card.append(node('div',{class:'comparison'},[[tr('依頼時','BASELINE'),f.baseline],[tr('校正後','RETURNED'),f.values],[tr('最新版','CURRENT'),f.current]].map(([label,texts])=>node('div',{},[node('small',{text:label}),node('p',{text:texts.join('')||tr('（空欄）','(empty)')})]))));
   if(f.reason)card.append(node('p',{class:'conflict-reason',text:f.reason}));
   const choices=node('div',{class:'decision'});
   if(f.status==='ready'){
     const approve=node('input',{type:'checkbox','aria-label':tr(`${f.name} の修正を承認`,`Approve ${f.name}`)});approve.checked=state.approved.has(f.name);approve.addEventListener('change',()=>{seq++;if(approve.checked){state.approved.add(f.name);state.excluded.delete(f.name);}else state.approved.delete(f.name);outputOff();renderControls();renderReturns();});
     choices.append(node('label',{},[approve,node('span',{text:tr('この修正を承認','Approve this correction')})]));
   }
   if(f.status!=='unchanged'){
     const exclude=node('input',{type:'checkbox','aria-label':tr(`${f.name} を今回の適用から除外`,`Exclude ${f.name}`)});exclude.checked=state.excluded.has(f.name);exclude.addEventListener('change',()=>{seq++;if(exclude.checked){state.excluded.add(f.name);state.approved.delete(f.name);}else state.excluded.delete(f.name);outputOff();renderControls();renderReturns();});
     choices.append(node('label',{},[exclude,node('span',{text:tr('今回は明示的に除外','Explicitly exclude this frame')})]));
   }
   if(choices.children.length)card.append(choices);list.append(card);
 }
 if(focusLabel)[...list.querySelectorAll('input')].find(el=>el.getAttribute('aria-label')===focusLabel)?.focus();
}
function renderControls() {
 $('selection-count').textContent=`${state.selected.size} / 32`;
 $('create-packet').disabled=!state.source||!state.selected.size;
 $('save-return').disabled=!state.packet;
 $('analyze').disabled=!state.corrections||!state.current||!state.assignment;
 $('apply-return').disabled=!state.analysis||state.analysis.frames.some(f=>(f.status==='conflict'&&!state.excluded.has(f.name))||(f.status==='ready'&&!state.excluded.has(f.name)&&!state.approved.has(f.name)));
 $('downloads').hidden=!state.output;
}
function render() { renderSource();renderReview();renderReturns();renderControls();switchStep(state.step); }
function setPacket(packet) { state.packet=packet;state.assignment=packet;state.edits=Object.fromEntries(packet.frames.map(f=>[f.name,f.runs.map(r=>r.text)]));state.corrections=null;state.current=null;state.currentName='';invalidate(); }
function setSource(raw,name) { const doc=inspectSla(raw);state=fresh();state.source=doc;state.sourceName=name; }
$('source-input').addEventListener('change',()=>task(async valid=>{state=fresh();render();const f=await readFile($('source-input'),'sla');if(f&&valid()){setSource(f.raw,f.name);message(tr('依頼するフレームを選んでください。','Choose the frames to assign.'));render();}}));
$('sample-source').addEventListener('click',()=>{seq++;setSource(sampleSla(false),'sample-original.sla');message(tr('構文テスト用サンプルを読み込みました。headline を選ぶと配置変更の保持を試せます。','Synthetic sample loaded. Select headline to try a wording return that preserves newer geometry.'));render();});
$('create-packet').addEventListener('click',()=>task(async valid=>{const packet=await createPacket(state.source.raw,[...state.selected],state.sourceName);if(!valid())return;setPacket(packet);download('frame-return-review.json',serialize(packet),'application/json');switchStep('review');message(tr('依頼パケットを作成しました。校正担当者にはこの JSON を渡します。','Review packet created. Share this JSON with the copyeditor.'));render();}));
$('review-input').addEventListener('change',()=>task(async valid=>{state.packet=null;state.assignment=null;state.edits=Object.create(null);state.corrections=null;state.current=null;state.currentName='';invalidate();render();const f=await readFile($('review-input'),'json');if(!f)return;const packet=await validatePacket(parseJson(f.raw));if(!valid())return;setPacket(packet);message(tr('パケットを照合しました。文章を編集できます。','Packet checksum checked. Edit the wording below.'));render();}));
$('save-return').addEventListener('click',()=>task(async valid=>{state.corrections=null;invalidate();renderControls();renderReturns();const corrections=await createReturn(state.packet,state.edits);if(!valid())return;state.corrections=corrections;download('frame-return-corrections.json',serialize(corrections),'application/json');switchStep('apply');message(tr('修正パケットを作成しました。依頼側で最新版 SLA と照合してください。','Corrections created. The designer should check them against the current SLA.'));render();}));
$('assignment-input').addEventListener('change',()=>task(async valid=>{state.assignment=null;invalidate();render();const f=await readFile($('assignment-input'),'json');if(!f)return;const packet=await validatePacket(parseJson(f.raw));if(!valid())return;state.assignment=packet;message(tr('元の依頼パケットを読み込みました。','Original review packet loaded.'));render();}));
$('return-input').addEventListener('change',()=>task(async valid=>{state.corrections=null;invalidate();render();const f=await readFile($('return-input'),'json');if(!f)return;const corrections=await validateReturn(parseJson(f.raw));if(!valid())return;state.corrections=corrections;message(tr('修正パケットを読み込みました。','Corrections packet loaded.'));render();}));
$('current-input').addEventListener('change',()=>task(async valid=>{state.current=null;state.currentName='';invalidate();render();const f=await readFile($('current-input'),'sla');if(!f)return;inspectSla(f.raw);if(!valid())return;state.current=f.raw;state.currentName=f.name;message(tr('最新版を読み込みました。照合を実行してください。','Current SLA loaded. Check the corrections next.'));render();}));
$('sample-current').addEventListener('click',()=>{seq++;state.current=sampleSla(true);state.currentName='sample-current.sla';invalidate();message(tr('サンプル最新版: headline は x=80・幅260、sidebar は18:30です。','Sample current: headline is x=80 / width=260; sidebar is 18:30.'));render();});
$('analyze').addEventListener('click',()=>task(async valid=>{invalidate();renderControls();renderReturns();const analysis=await analyzeReturn(state.current,state.corrections,state.assignment);if(!valid())return;state.analysis=analysis;const n=analysis.frames.filter(f=>f.status==='conflict').length;message(n?tr(`${n} 件の競合があります。除外するか、最新版から依頼し直してください。`,`${n} conflict(s). Explicitly exclude them or prepare a fresh packet from the current SLA.`):tr('照合しました。適用する修正をそれぞれ承認してください。','Checked. Approve each correction you want to apply.'),!!n);render();}));
$('apply-return').addEventListener('click',()=>task(async valid=>{outputOff();const result=await applyReturn(state.current,state.corrections,{originalPacket:state.assignment,approvedNames:[...state.approved],excludeNames:[...state.excluded]});if(!valid())return;state.output=result;message(tr('修正版を作成しました。最新版と同じフォルダに保存し、Scribus で収まりを確認してください。','Revised SLA created. Save it beside the current SLA and check fit in Scribus.'));renderControls();}));
$('download-sla').addEventListener('click',()=>{if(state.output)download('frame-return-revised.sla',state.output.output,'application/xml');});
$('download-receipt').addEventListener('click',()=>{if(state.output)download('frame-return-receipt.json',serialize(state.output.receipt),'application/json');});
$('reset').addEventListener('click',()=>{seq++;state=fresh();for(const input of document.querySelectorAll('input[type=file]'))input.value='';message(tr('ファイルと編集内容を消去しました。','Files and edits cleared.'));render();});
$('language').addEventListener('change',()=>{lang=$('language').value;document.documentElement.lang=lang;for(const el of document.querySelectorAll('[data-i18n]'))el.innerHTML=(lang==='ja'?ja:en)[el.dataset.i18n];render();});
for(const step of ['prepare','review','apply'])$('tab-'+step).addEventListener('click',()=>switchStep(step));
render();
