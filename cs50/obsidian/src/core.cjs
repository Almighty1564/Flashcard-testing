'use strict';
// Shared note contract and deterministic sync decisions. No network or filesystem access here.
const crypto = require('node:crypto');
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const NOTE = /^notebook-[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const ROOT = 'Tomato08';
const clone = x => JSON.parse(JSON.stringify(x));
function canonical(x) { return JSON.stringify(x, (_,v) => v && typeof v === 'object' && !Array.isArray(v) ? Object.keys(v).sort().reduce((a,k)=>(a[k]=v[k],a),{}) : v); }
function hash(s) { return crypto.createHash('sha256').update(s).digest('hex'); }
function validPayload(p) {
  return p && p.schema===2 && p.type==='draft' && p.kind==='course-note' && p.note_schema===1 && NOTE.test(p.release_id) &&
    typeof p.title==='string' && p.title.trim().length>0 && p.title.length<=140 && typeof p.text==='string' && p.text.length<=50000 &&
    Array.isArray(p.parents) && p.parents.length<=100 && p.parents.every(x=>UUID.test(x)) && new Set(p.parents).size===p.parents.length &&
    Array.isArray(p.topics) && p.topics.length<=50 && p.topics.every(x=>typeof x==='string' && /^[-a-z0-9]+$/.test(x)) &&
    Array.isArray(p.aliases) && p.aliases.length<=30 && p.aliases.every(x=>typeof x==='string' && x.length<=140) && typeof p.archived==='boolean';
}
function validEvent(e) { return e && UUID.test(e.id) && typeof e.client_at==='string' && Number.isFinite(Date.parse(e.client_at)) && validPayload(e.payload) && !e.payload.parents.includes(e.id); }
function mergeEvents(a,b) {
  const events=new Map();
  for(const e of [...a,...b]) {
    if(!validEvent(e)) throw new Error('Malformed notebook revision. Sync stopped without overwriting notes.');
    const old=events.get(e.id);
    if(old && (canonical(old.payload)!==canonical(e.payload)||Date.parse(old.client_at)!==Date.parse(e.client_at)))throw new Error('Immutable revision collision. Sync stopped.');
    events.set(e.id, clone(e));
  }
  if(events.size>15000)throw new Error('Notebook exceeds the 15,000-revision safety limit. Export a backup.');
  return [...events.values()];
}
function groups(events) {
  const byNote=new Map(), byId=new Map(events.map(e=>[e.id,e]));
  for(const e of events) {
    for(const p of e.payload.parents) if(!byId.has(p)||byId.get(p).payload.release_id!==e.payload.release_id)throw new Error('Incomplete or cross-note revision ancestry. Retry sync; no local files changed.');
    const id=e.payload.release_id;if(!byNote.has(id))byNote.set(id,[]);byNote.get(id).push(e);
  }
  const color=new Map();
  function visit(id,depth=0){if(depth>1500)throw new Error('Revision ancestry is too deep. Export a backup.');if(color.get(id)===1)throw new Error('Cyclic revision history.');if(color.get(id)===2)return;color.set(id,1);for(const p of byId.get(id).payload.parents)visit(p,depth+1);color.set(id,2);}
  for(const id of byId.keys())visit(id);
  return new Map([...byNote].map(([id,rs])=>{const replaced=new Set(rs.flatMap(e=>e.payload.parents));const heads=rs.filter(e=>!replaced.has(e.id)).sort((a,b)=>Date.parse(a.client_at)-Date.parse(b.client_at)||a.id.localeCompare(b.id));if(!heads.length)throw new Error('No valid revision head.');return [id,heads];}));
}
function logical(p) { return {title:p.title,text:p.text,topics:p.topics,aliases:p.aliases,archived:p.archived}; }
function same(a,b){return canonical(logical(a))===canonical(logical(b));}
function newEvent(base,patch,parents) {
  const title=(patch.title??base.title).trim();
  const aliases=[...new Set([...(patch.aliases??base.aliases??[]),...(title!==base.title?[base.title]:[])])].slice(-30);
  const payload={schema:2,type:'draft',kind:'course-note',note_schema:1,release_id:base.release_id||base.id,
    title,text:patch.text??base.text,topics:patch.topics??base.topics??[],aliases,archived:patch.archived??base.archived??false,
    parents:[...parents],repo:'',origin:'obsidian-bridge'};
  if(!validPayload(payload))throw new Error('Note exceeds supported limits or has invalid metadata. Existing files were preserved.');
  return {id:crypto.randomUUID(),client_at:new Date().toISOString(),payload};
}
function basename(title,id){let s=title.normalize('NFC').replace(/[<>:"/\\|?*\x00-\x1f\[\]#^]/g,' ').replace(/\s+/g,' ').replace(/[ .]+$/,'').trim().slice(0,65)||'Note';if(/^(con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i.test(s))s='Note '+s;return `${s}--${id.slice(9)}.md`;}
function managedPath(path){return typeof path==='string' && path.startsWith(ROOT+'/Notes/') && !/[\\\x00-\x1f:]/.test(path) && path.split('/').every(s=>s && s!=='.' && s!=='..' && !s.startsWith('.')) && path.endsWith('.md');}
function defaultPath(p){return ROOT+'/Notes/'+basename(p.title,p.release_id);}
function split(text,parseYaml){
  if(text.length>180000)throw new Error('Note file exceeds safe size.');
  const m=text.match(/^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/);
  if(!m)return {meta:{},body:text};
  let meta;try{meta=parseYaml(m[1]);}catch(_){throw new Error('Malformed YAML properties. File was not changed.');}
  if(!meta||typeof meta!=='object'||Array.isArray(meta))throw new Error('Properties must be a YAML object.');
  return {meta,body:text.slice(m[0].length)};
}
function rewriteLinks(text,resolve){
  let fence=null;
  return text.split('\n').map(line=>{
    const f=line.match(/^\s*(`{3,}|~{3,})/);
    if(f){if(!fence)fence=f[1][0];else if(fence===f[1][0])fence=null;return line;}
    if(fence)return line;
    return line.split(/(`+[^`]*`+)/g).map((part,i)=>i%2?part:part.replace(/(?<!!)\[\[([^\]\n]+)\]\]/g,(all,inside)=>{
      const [target,...rest]=inside.split('|');if(target.includes('#')||target.includes('^'))return all;
      const result=resolve(target.trim(),rest.join('|')||null);return result||all;
    })).join('');
  }).join('\n');
}
function linkIndex(heads,entries){
 const byName=new Map(),byId=new Map(),byPath=new Map();
 for(const [id,hs] of heads){const p=hs.at(-1).payload;byId.set(id,p);for(const name of [p.title,...p.aliases]){const k=name.trim().toLowerCase();const set=byName.get(k)||new Set();set.add(id);byName.set(k,set);}const path=entries[id]?.path||defaultPath(p);byPath.set(path.replace(/\.md$/,''),id);byPath.set(path.split('/').at(-1).replace(/\.md$/,''),id);}
 return {byName,byId,byPath};
}
function toVault(text,index,entries){return rewriteLinks(text,(target,label)=>{let id=NOTE.test(target)?target:null;if(!id){const ids=index.byName.get(target.toLowerCase());if(ids?.size===1)id=[...ids][0];}const p=id&&index.byId.get(id);if(!p)return null;return `[[${(entries[id]?.path||defaultPath(p)).replace(/\.md$/,'')}|${label||p.title}]]`;});}
function toWeb(text,index){return rewriteLinks(text,(target,label)=>{const id=index.byPath.get(target.replace(/\.md$/,''));if(!id)return null;return `[[${id}|${label||index.byId.get(id).title}]]`;});}
function parseManaged(raw,account,parseYaml,index){const {meta,body}=split(raw,parseYaml);if(!NOTE.test(meta.tomato08_id)||meta.tomato08_account!==account)throw new Error('Missing note ID or wrong Tomato08 account. File was not changed.');const p={schema:2,type:'draft',kind:'course-note',note_schema:1,release_id:meta.tomato08_id,title:meta.tomato08_title,text:toWeb(body,index),topics:meta.tomato08_topics,aliases:meta.aliases,archived:meta.tomato08_archived,parents:meta.tomato08_heads,repo:''};if(!validPayload(p))throw new Error('Invalid Tomato08 note properties. Restore them before syncing.');return {payload:p,meta,body};}
function render(p,heads,account,index,entries,stringifyYaml,extra={}){
 const meta={...extra,tomato08_id:p.release_id,tomato08_account:account,tomato08_title:p.title,tomato08_topics:p.topics,tomato08_archived:p.archived,tomato08_heads:[...heads],aliases:p.aliases};
 return '---\n'+stringifyYaml(meta).trimEnd()+'\n---\n'+toVault(p.text,index,entries);
}
module.exports={UUID,NOTE,ROOT,clone,canonical,hash,validPayload,validEvent,mergeEvents,groups,logical,same,newEvent,basename,managedPath,defaultPath,split,toVault,toWeb,linkIndex,parseManaged,render};
