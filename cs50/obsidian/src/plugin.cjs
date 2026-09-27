'use strict';
const {Plugin,PluginSettingTab,Setting,Modal,Notice,TFile,FileSystemAdapter,requestUrl,parseYaml,stringifyYaml}=require('obsidian');
const fs=require('node:fs/promises'),pathUtil=require('node:path');
const C=require('./core.cjs'),{Cloud}=require('./transport.cjs'),{Engine,initial,validateState}=require('./engine.cjs');
class Confirm extends Modal {
 constructor(app,title,message){super(app);this.heading=title;this.message=message;this.answer=false;}
 ask(){return new Promise(resolve=>{this.resolve=resolve;this.open();});}
 onOpen(){this.contentEl.createEl('h2',{text:this.heading});this.contentEl.createEl('p',{text:this.message});new Setting(this.contentEl).addButton(b=>b.setButtonText('Cancel').onClick(()=>this.close())).addButton(b=>b.setButtonText('Confirm').setCta().onClick(()=>{this.answer=true;this.close();}));}
 onClose(){this.resolve?.(this.answer);this.contentEl.empty();}
}
class Login extends Modal {
 constructor(plugin){super(plugin.app);this.p=plugin;this.closed=false;this.busy=false;this.success=false;}
 onOpen(){
  this.contentEl.createEl('h2',{text:'Connect Tomato08'});this.contentEl.createEl('p',{text:'Use your Tomato08 account, not your Obsidian account. Credentials go only to your existing Supabase Auth service. Passwords and tokens are not saved to the vault.'});
  let username='',password='',code='',factorId='';
  new Setting(this.contentEl).setName('Tomato08 username').addText(t=>{t.inputEl.autocomplete='username';t.onChange(v=>username=v);});
  let passwordInput;new Setting(this.contentEl).setName('Password').addText(t=>{passwordInput=t.inputEl;t.inputEl.type='password';t.inputEl.autocomplete='current-password';t.onChange(v=>password=v);});
  this.status=this.contentEl.createEl('p',{attr:{role:'status'}});this.factors=this.contentEl.createDiv();
  const finish=async()=>{if(this.closed)return;const user=await this.p.cloud.requireAccess();await this.p.engine.bind(user);this.success=true;this.p.message('Connected. Choose Sync now to exchange notebook notes.');this.close();};
  const guarded=fn=>async()=>{if(this.busy)return;this.busy=true;this.status.setText('Checking…');try{await fn();}catch(e){if(!this.closed)this.status.setText(e.message);}finally{password='';passwordInput.value='';this.busy=false;}};
  new Setting(this.contentEl).addButton(b=>b.setButtonText('Sign in').setCta().onClick(guarded(async()=>{
    const result=await this.p.cloud.login(username,password);if(this.closed)return;if(result.allowed)return finish();
    const factors=(result.user.factors||[]).filter(f=>f.factor_type==='totp'&&f.status==='verified');
    if(!result.approved||!result.session_valid)throw new Error('This account or session is not approved. Review Security Activity on Tomato08.');
    if(!result.mfa_required||!factors.length)throw new Error('Complete authenticator enrollment on Tomato08 before connecting.');
    this.factors.empty();factorId=factors[0].id;
    new Setting(this.factors).setName('Authenticator').addDropdown(d=>{factors.forEach((f,i)=>d.addOption(f.id,f.friendly_name||'Authenticator '+(i+1)));d.setValue(factorId).onChange(v=>factorId=v);});
    new Setting(this.factors).setName('Six-digit code').addText(t=>{t.inputEl.inputMode='numeric';t.inputEl.autocomplete='one-time-code';t.onChange(v=>code=v.trim());});
    new Setting(this.factors).addButton(v=>v.setButtonText('Verify authenticator').setCta().onClick(guarded(async()=>{await this.p.cloud.verify(factorId,code);code='';await finish();})));
    this.status.setText('Enter the current authenticator code.');
  })));
 }
 onClose(){this.closed=true;if(!this.success)this.p.cloud.clear();this.contentEl.empty();}
}
class Settings extends PluginSettingTab {
 constructor(app,plugin){super(app,plugin);this.p=plugin;}
 display(){
  const el=this.containerEl;el.empty();el.createEl('h2',{text:'Tomato08 Notebook Sync'});
  el.createEl('p',{text:'Two-way Markdown note sync with the Tomato08 course notebook. Only managed notes under Tomato08/Notes are exchanged. Other vault files are not uploaded. No Obsidian Sync subscription is required.'});
  el.createEl('p',{text:'Back up your vault first. Cloud notes are not end-to-end encrypted. Use only non-sensitive training material. Deletions are not propagated. Conflicts require an explicit merge.'});
  if(this.p.error){el.createEl('p',{text:this.p.error});return;}
  el.createEl('p',{text:'Bound account: '+(this.p.state.account||'Not connected')+'. One Tomato08 account per vault. Login is session-only; sign in again after restarting Obsidian.'});
  new Setting(el).setName('Session').addButton(b=>b.setButtonText('Sign in').onClick(()=>new Login(this.p).open())).addButton(b=>b.setButtonText('Sign out').onClick(async()=>{await this.p.disconnect();this.display();}));
  new Setting(el).setName('Exchange notes').setDesc('First enable cloud sync on the website. Close or finish editing the selected note before syncing.').addButton(b=>b.setButtonText('Sync now').setCta().onClick(()=>this.p.runSync()));
  new Setting(el).setName('Automatic sync while Obsidian is open').setDesc('Checks every 60 seconds while signed in. Off by default. Website notes update on its next cloud sync.').addToggle(t=>t.setValue(this.p.state.autoSync).onChange(async v=>{this.p.state.autoSync=v;await this.p.persist(this.p.state);}));
  new Setting(el).setName('Publish an existing note').setDesc('Use the command palette: “Tomato08: Publish a copy of the active note”. You will be asked before it is copied and queued. The original is unchanged.');
  new Setting(el).setName('Conflicts').setDesc('Originals remain untouched; all competing heads are copied into Tomato08/Conflicts. Merge in the website, or edit the managed note and use “Resolve conflict using the active note”.');
  new Setting(el).setName('Archive and removal').setDesc('Use Archive in the website. Archiving updates a property; it never deletes your local file. Deleting or moving a managed file outside Tomato08/Notes pauses that file instead of deleting cloud history.');
  new Setting(el).setName('Restore a removed local note').setDesc('Recreates missing managed files from the last synchronized history without deleting or overwriting any existing file.').addButton(b=>b.setButtonText('Restore missing copies').onClick(()=>this.p.restoreMissing()));
  el.createEl('p',{text:'Markdown body, note title, ordinary wikilinks, aliases and course-topic IDs synchronize. Attachments, Canvas, plugins, embedded files, block/heading links, and arbitrary extra properties are not synchronized. Extra YAML properties on managed files remain local.'});
  el.createEl('p',{text:'Do not run another file-sync engine over this same managed folder or synchronize this plugin’s data.json between devices. Use one independent plugin state per device; let Tomato08 exchange note revisions.'});
 }
}
class Tomato08 extends Plugin {
 async onload(){
  this.status=this.addStatusBarItem();this.status.setText('Tomato08: not connected');this.saveChain=Promise.resolve();
  try{this.state=validateState(await this.loadData());}catch(e){this.error=e.message;new Notice(e.message,15000);this.addSettingTab(new Settings(this.app,this));return;}
  if(!(this.app.vault.adapter instanceof FileSystemAdapter)){this.error='This release requires desktop Obsidian with a local vault.';new Notice(this.error);this.addSettingTab(new Settings(this.app,this));return;}
  this.cloud=new Cloud(requestUrl,this.state.account);
  this.engine=new Engine(this.port(),this.cloud,this.state,s=>this.persist(s),s=>this.message(s));
  this.addSettingTab(new Settings(this.app,this));
  this.addCommand({id:'sign-in',name:'Sign in to Tomato08',callback:()=>new Login(this).open()});
  this.addCommand({id:'sync-now',name:'Sync notebook now',callback:()=>this.runSync()});
  this.addCommand({id:'publish-copy',name:'Publish a copy of the active note',callback:()=>this.publish()});
  this.addCommand({id:'new-note',name:'Create a synced course note',callback:()=>this.createNote()});
  this.addCommand({id:'resolve-conflict',name:'Resolve conflict using the active note',callback:()=>this.resolve()});
  this.addCommand({id:'sign-out',name:'Sign out of Tomato08',callback:()=>this.disconnect()});
  this.addRibbonIcon('refresh-cw','Sync Tomato08 notebook',()=>this.runSync());
  this.registerInterval(window.setInterval(()=>{if(this.state.autoSync&&this.cloud.session&&!this.engine.busy)this.runSync(false);},60000));
  this.registerObsidianProtocolHandler('tomato08',async params=>{try{
   if(!C.NOTE.test(params.note)||params.account!==this.state.account)throw new Error('This note link belongs to an unconnected account. Sign in and sync this vault first.');
   let entry=this.state.entries[params.note];if(!entry&&this.cloud.session){await this.runSync(false);entry=this.state.entries[params.note];}
   if(!entry)throw new Error('Sync notebook now, then open the link again.');await this.openPath(entry.path);
  }catch(e){this.message(e.message);}});
 }
 onunload(){if(this.engine)this.engine.cancelled=true;this.cloud?.clear();}
 persist(state){const copy=C.clone(state);this.saveChain=this.saveChain.catch(()=>{}).then(()=>this.saveData(copy));return this.saveChain;}
 message(text,notice=true){this.status?.setText('Tomato08: '+text);if(notice)new Notice(text,8000);}
 async disconnect(){if(this.engine?.busy){this.message('Wait for the current sync before signing out.');return;}try{await this.cloud?.logout();}catch(_){this.cloud?.clear();}this.message('Signed out. Local Markdown files remain in your vault.');}
 async safe(relative){
  if(!relative||relative.startsWith('/')||/[\\\x00-\x1f:]/.test(relative)||relative.split('/').some(p=>!p||p==='.'||p==='..'||p.startsWith('.')))throw new Error('Unsafe vault path.');
  const base=this.app.vault.adapter.getBasePath(),parts=relative.split('/');let p=base;
  for(const part of parts){p=pathUtil.join(p,part);try{const st=await fs.lstat(p);if(st.isSymbolicLink())throw new Error('Symlink paths are not supported for synced notes.');}catch(e){if(e.code!=='ENOENT')throw e;}}
 }
 async ensureFolders(relative){await this.safe(relative);const parts=relative.split('/');let p='';for(const part of parts){p=p?p+'/'+part:part;const old=this.app.vault.getAbstractFileByPath(p);if(old instanceof TFile)throw new Error('A file blocks the sync folder.');if(!old)await this.app.vault.createFolder(p);}}
 async read(path){await this.safe(path);const file=this.app.vault.getAbstractFileByPath(path);if(!(file instanceof TFile))throw new Error('Managed note is missing.');return this.app.vault.read(file);}
 port(){const p=this;return {
  parseYaml,stringifyYaml,
  async list(){return p.app.vault.getMarkdownFiles().map(f=>f.path).filter(C.managedPath);},
  async exists(path){await p.safe(path);return !!p.app.vault.getAbstractFileByPath(path);},
  read:path=>p.read(path),
  async create(path,text){await p.safe(path);await p.ensureFolders(path.split('/').slice(0,-1).join('/'));if(p.app.vault.getAbstractFileByPath(path))throw new Error('Destination already exists; no overwrite.');await p.app.vault.create(path,text);return true;},
  async replace(path,expected,next){await p.safe(path);const file=p.app.vault.getAbstractFileByPath(path);if(!(file instanceof TFile))return false;
   const views=p.app.workspace.getLeavesOfType('markdown');if(views.some(l=>l.view.file?.path===path&&l.view.editor&&l.view.editor.getValue()!==expected))return false;
   let written=false;await p.app.vault.process(file,current=>{if(current!==expected)return current;written=true;return next;});return written;},
  async conflict(id,event){const name=`${C.ROOT}/Conflicts/${id.slice(9)}--${event.id}.md`;await p.safe(name);if(p.app.vault.getAbstractFileByPath(name))return;await p.ensureFolders(C.ROOT+'/Conflicts');const text='# Preserved conflicting revision\n\nNote: '+event.payload.title+'\n\nRevision: '+event.id+'\n\nEdit the managed note or merge in Tomato08. This file is a non-syncing recovery copy.\n\n---\n\n'+event.payload.text;await p.app.vault.create(name,text);},
  confirmMerge:count=>new Confirm(p.app,'Merge '+count+' revisions?','The current managed note will become the merged version. Review the copies in Tomato08/Conflicts first. All original cloud revisions remain preserved.').ask()
 };}
 async runSync(show=true){if(!this.cloud.session){if(show)new Login(this).open();return;}if(this.engine.busy){if(show)this.message('Sync already running.');return;}this.message('Syncing…',false);try{const r=await this.engine.sync();this.message(`Synced ${r.pulled} notes; ${r.conflicts} conflicts; ${r.missing} missing local files; ${r.deferred} edits deferred.`,show||r.conflicts>0);return r;}catch(e){if(e.denied||e.status===401||e.status===403)this.cloud.clear();this.message(e.message,show);}}
 async openPath(path){await this.safe(path);const file=this.app.vault.getAbstractFileByPath(path);if(!(file instanceof TFile))throw new Error('Local note is missing. Restore it from backup or restore missing copies.');await this.app.workspace.getLeaf(false).openFile(file);}
 async createNote(){try{if(!this.state.account||!this.cloud.session){new Login(this).open();return;}const path=await this.engine.add('New course note','');await this.openPath(path);this.message('New managed note created. Edit its title property and body, then sync.');}catch(e){this.message(e.message);}}
 async publish(){try{
  if(!this.cloud.session){new Login(this).open();return;}const file=this.app.workspace.getActiveFile();if(!(file instanceof TFile)||file.extension!=='md')throw new Error('Open a Markdown note first.');if(C.managedPath(file.path))throw new Error('This note is already in the managed folder. Use Sync now.');
  await this.safe(file.path);const raw=await this.app.vault.read(file);if(raw.length>50000)throw new Error('The note exceeds the 50,000-character limit.');
  if(!await new Confirm(this.app,'Publish a copy to Tomato08?',`A copy of “${file.basename}” will be stored in Tomato08/Notes and queued for your course cloud notebook. The original is unchanged. No attachments are uploaded. Do not publish secrets or operational records.`).ask())return;
  const path=await this.engine.add(file.basename,raw);await this.openPath(path);this.message('Copy queued. Use Sync now to publish it.');
 }catch(e){this.message(e.message);}}
 async resolve(){try{const file=this.app.workspace.getActiveFile();if(!(file instanceof TFile)||!C.managedPath(file.path))throw new Error('Open the original managed note, not a conflict copy.');const {meta}=C.split(await this.read(file.path),parseYaml);if(await this.engine.resolve(meta.tomato08_id))await this.runSync();}catch(e){this.message(e.message);}}
 async restoreMissing(){try{
  if(this.engine.busy)throw new Error('Wait for the current sync.');if(!this.cloud.session){new Login(this).open();return;}await this.cloud.requireAccess();
  if(!await new Confirm(this.app,'Restore missing copies?','Missing managed Markdown files will be recreated from the last synced version. No existing files are overwritten.').ask())return;
  const groups=C.groups(this.state.events),index=this.engine.index();let count=0;
  for(const[id,e]of Object.entries(this.state.entries)){if(await this.engine.port.exists(e.path))continue;const heads=groups.get(id);if(heads?.length!==1)continue;const p=heads[0].payload,raw=C.render(p,[heads[0].id],this.state.account,index,this.state.entries,stringifyYaml);await this.engine.port.create(e.path,raw);e.heads=[heads[0].id];e.base=C.parseManaged(raw,this.state.account,parseYaml,index).payload;e.lastHash=C.hash(raw);count++;await this.persist(this.state);}
  this.message('Restored '+count+' missing notes.');
 }catch(e){this.message(e.message);}}
}
module.exports=Tomato08;
