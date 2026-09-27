'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),vm=require('node:vm'),fs=require('node:fs/promises'),syncfs=require('node:fs'),os=require('node:os'),path=require('node:path'),C=require('../cs50/obsidian/src/core.cjs');
const uid='11111111-1111-4111-8111-111111111111';
function yamlParse(s){return Object.fromEntries(s.split('\n').filter(Boolean).map(l=>{const i=l.indexOf(':');return[l.slice(0,i),JSON.parse(l.slice(i+1))];}));}
function yamlStringify(o){return Object.entries(o).map(([k,v])=>k+': '+JSON.stringify(v)).join('\n')+'\n';}
async function host(){
 const root=await fs.mkdtemp(path.join(os.tmpdir(),'t08-obsidian-'));const files=new Map(),remote=[],requests=[],intervals=[],notices=[];let persisted=null;
 class TFile{constructor(p){this.path=p;this.extension=p.split('.').pop();this.basename=path.basename(p,'.md');}}
 class Adapter{getBasePath(){return root;}}
 const app={vault:{adapter:new Adapter(),getAbstractFileByPath:p=>files.get(p)||null,getMarkdownFiles:()=>[...files.values()].filter(f=>f instanceof TFile&&f.extension==='md'),async createFolder(p){await fs.mkdir(path.join(root,p),{recursive:true});files.set(p,{path:p});},async create(p,s){await fs.writeFile(path.join(root,p),s,{flag:'wx'});const file=new TFile(p);files.set(p,file);return file;},async read(f){return fs.readFile(path.join(root,f.path),'utf8');},async process(f,fn){const s=await this.read(f);const result=fn(s);await fs.writeFile(path.join(root,f.path),result);return result;}},workspace:{getLeavesOfType:()=>[],getLeaf:()=>({openFile:async()=>{}}),getActiveFile:()=>null}};
 class Plugin{constructor(){this.app=app;this.commands=[];}addStatusBarItem(){return {setText:()=>{}};}addCommand(c){this.commands.push(c);}addSettingTab(){}addRibbonIcon(){}registerInterval(i){intervals.push(i);}registerObsidianProtocolHandler(n,f){this.protocol=f;}async loadData(){return persisted;}async saveData(s){persisted=JSON.parse(JSON.stringify(s));}}
 class Empty{};const requestUrl=async opts=>{requests.push(opts);const u=new URL(opts.url);if(u.pathname==='/auth/v1/user')return {status:200,json:{id:uid}};if(u.pathname==='/rest/v1/rpc/security_access_status')return {status:200,json:{allowed:true,user_id:uid}};
 if(u.pathname==='/rest/v1/cs50_project_events'){
  if(opts.method==='POST'){const row=JSON.parse(opts.body);if(remote.some(x=>x.id===row.id))return{status:409,json:{code:'23505'}};remote.push({...row,recorded_at:new Date().toISOString()});return{status:201,json:null};}
  let rows=remote.filter(r=>r.user_id===uid);const id=u.searchParams.get('id');if(id)rows=rows.filter(x=>'eq.'+x.id===id);return{status:200,json:rows.slice(Number(u.searchParams.get('offset')||0),Number(u.searchParams.get('offset')||0)+Number(u.searchParams.get('limit')||200))};
 }
 throw new Error('Unexpected network endpoint '+u.pathname);
 };
 const obsidian={Plugin,PluginSettingTab:Empty,Setting:Empty,Modal:Empty,Notice:class{constructor(m){notices.push(m);}},TFile,FileSystemAdapter:Adapter,requestUrl,parseYaml:yamlParse,stringifyYaml:yamlStringify};
 const sandbox={module:{exports:{}},exports:{},require:n=>n==='obsidian'?obsidian:require(n),console,setTimeout,clearTimeout,URL,URLSearchParams,window:{setInterval:()=>123},globalThis};
 vm.runInNewContext(syncfs.readFileSync(path.join(__dirname,'../cs50/obsidian/main.js'),'utf8'),sandbox);
 const plugin=new sandbox.module.exports();await plugin.onload();plugin.cloud.setSession({access_token:'test-access-secret',refresh_token:'test-refresh-secret',user:{id:uid},expires_in:3600});await plugin.engine.bind({id:uid});
 return{plugin,root,remote,requests,files,app,notices,get persisted(){return persisted;},async close(){plugin.onunload();await fs.rm(root,{recursive:true,force:true});}};
}
test('built plugin loads and exchanges actual Markdown files through mocked native APIs',async()=>{const h=await host();try{
 const e=C.newEvent({release_id:'notebook-'+require('node:crypto').randomUUID(),title:'Host test',text:'From website',topics:[],aliases:[],archived:false},{},[]);h.remote.push({...e,user_id:uid});
 await h.plugin.engine.sync();const en=h.plugin.state.entries[e.payload.release_id];let raw=await fs.readFile(path.join(h.root,en.path),'utf8');assert(raw.includes('From website'));
 raw=raw.replace('From website','From Obsidian');await fs.writeFile(path.join(h.root,en.path),raw);await h.plugin.engine.sync();assert.equal(h.remote.length,2);assert.equal(h.remote[1].payload.text,'From Obsidian');
 assert.equal(h.plugin.commands.length,6);assert(!JSON.stringify(h.persisted).includes('test-access-secret'));assert(!JSON.stringify(h.persisted).includes('test-refresh-secret'));
 assert(h.requests.every(r=>r.url.startsWith('https://semtnzdzpluhnkzxkquk.supabase.co/')));
 }finally{await h.close();}});
test('native vault adapter refuses symlink destinations and traversal',async()=>{const h=await host();try{await fs.symlink(os.tmpdir(),path.join(h.root,'Tomato08'));await assert.rejects(h.plugin.safe('Tomato08/Notes/test.md'),/Symlink/);await assert.rejects(h.plugin.safe('../outside.md'),/Unsafe/);}finally{await h.close();}});
test('guarded native write defers unsaved editor changes and preserves file',async()=>{const h=await host();try{await h.plugin.ensureFolders('Tomato08/Notes');const f=await h.app.vault.create('Tomato08/Notes/test.md','old');h.app.workspace.getLeavesOfType=()=>[{view:{file:f,editor:{getValue:()=> 'unsaved change'}}}];assert.equal(await h.plugin.port().replace(f.path,'old','remote'),false);assert.equal(await h.app.vault.read(f),'old');}finally{await h.close();}});
test('native file creation never overwrites a name collision',async()=>{const h=await host();try{await h.plugin.ensureFolders('Tomato08/Notes');await h.app.vault.create('Tomato08/Notes/test.md','existing');await assert.rejects(h.plugin.port().create('Tomato08/Notes/test.md','new'),/exists/);assert.equal(await fs.readFile(path.join(h.root,'Tomato08/Notes/test.md'),'utf8'),'existing');}finally{await h.close();}});
