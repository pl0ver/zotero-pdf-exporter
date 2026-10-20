// Node regression harness. Mocks Gecko and Zotero; not a Zotero integration test.
const fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const vm=require('node:vm'),assert=require('node:assert/strict');
const root=fs.mkdtempSync(path.join(os.tmpdir(),'pdf-exporter-test-'));
const source=path.join(root,'中文 source.pdf');fs.writeFileSync(source,'%PDF-1.4\nfixture');
const dest=path.join(root,'out');fs.mkdirSync(dest);
let selected=[],confirmed=true,alerts=[],calls=0,closed=0,previews=[],choice=1,conflicts=[];
class File {
 initWithPath(p){this.path=p;} constructor(p){this.path=p;}
 exists(){return fs.existsSync(this.path);} isFile(){return fs.statSync(this.path).isFile();}
 clone(){return new File(this.path);} append(n){this.path=path.join(this.path,n);}
 get parent(){return new File(path.dirname(this.path));}
 isDirectory(){return fs.statSync(this.path).isDirectory();}
 isSymlink(){try{return fs.lstatSync(this.path).isSymbolicLink();}catch{return false;}}
 createUnique(){this.path=fs.mkdtempSync(this.path);}
 remove(){fs.rmSync(this.path,{recursive:true});}
 get leafName(){return path.basename(this.path);} QueryInterface(){return this;}
 get directoryEntries(){let a=fs.readdirSync(this.path),i=0;return {hasMoreElements:()=>i<a.length,getNext:()=>new File(path.join(this.path,a[i++]))};}
}
const picker={init(parent){assert.equal(parent,'browsing-context');calls++;},open(cb){cb(0);},file:new File(dest)};
const ctypes={default_abi:0,int:0,char:{ptr:0},errno:17,open(lib){assert.equal(lib,'/usr/lib/libSystem.B.dylib');return {declare(name){assert.ok(['symlink','rename'].includes(name));return (s,t)=>{try{if(name==='rename')fs.renameSync(s,t);else fs.symlinkSync(s,t);return 0;}catch{return -1;}};},close(){closed++;}};}};
const preferences=new Map();let registeredPane;
const Z={CreatorTypes:{getID:role=>{assert.equal(role,'author');return 1;}},Prefs:{get:(key)=>preferences.get(key)},PreferencePanes:{register:async options=>{new URL(options.src,'jar:file:///tmp/exporter.xpi!/');new URL(options.image,'jar:file:///tmp/exporter.xpi!/');registeredPane=options;}},initializationPromise:Promise.resolve(),getMainWindows:()=>[],isMac:true,logError(){},Items:{get:id=>id===1?attachment:parent}};
const ctx=vm.createContext({Zotero:Z,TextEncoder,Set,ChromeUtils:{importESModule:()=>({ctypes})},
 Cc:{'@mozilla.org/filepicker;1':{createInstance:()=>picker}},Ci:{nsIFilePicker:{modeGetFolder:2,returnOK:0},nsIFile:{DIRECTORY_TYPE:1}},
 Components:{classes:{'@mozilla.org/file/local;1':{createInstance:()=>new File()}}},
 IOUtils:{copy:async(s,t,o)=>{assert.equal(o.noOverwrite,true);fs.copyFileSync(s,t,fs.constants.COPYFILE_EXCL);}},
 Services:{prompt:{BUTTON_POS_0:1,BUTTON_POS_1:256,BUTTON_POS_2:65536,BUTTON_TITLE_IS_STRING:127,BUTTON_POS_1_DEFAULT:16777216,confirmEx:(w,t,message)=>{conflicts.push(message);return choice;},confirm:(w,title,message)=>{previews.push(message);return confirmed;},alert:(w,title,message)=>alerts.push({title,message})}}});
const parent={isAttachment:()=>false,isRegularItem:()=>true,getAttachments:()=>[1],getCreators:()=>[{creatorTypeID:3,lastName:'Editor'},{creatorTypeID:1,lastName:'王'},{creatorTypeID:1,lastName:'SecondAuthor'}],getField:n=>({title:'Test',date:'2026',extra:'Citation Key: Wang2026'}[n]||'')};
const attachment={id:1,key:'ABCD1234',parentItemID:2,isAttachment:()=>true,isRegularItem:()=>false,attachmentContentType:'application/pdf',getFilePathAsync:async()=>source};
const win={browsingContext:'browsing-context',ZoteroPane:{getSelectedItems:()=>selected},alert:m=>alerts.push(m)};
vm.runInContext(fs.readFileSync(path.join(__dirname,'bootstrap.js'),'utf8'),ctx);
(async()=>{try {
 selected=[parent,attachment]; await ctx.exportSelection(win,'copy');
 assert.equal(alerts.length,0);assert.equal(fs.readdirSync(dest).length,1);
 const first=fs.readdirSync(dest)[0];assert.equal(first,'王 - 2026 - Test.pdf');assert.equal(fs.readFileSync(path.join(dest,first),'utf8'),fs.readFileSync(source,'utf8'));
 await ctx.exportSelection(win,'copy');assert.equal(fs.readdirSync(dest).length,1);assert.equal(conflicts.length,1);choice=0;
 await ctx.exportSelection(win,'symlink');assert.equal(alerts.length,0);
 const link=fs.readdirSync(dest).find(n=>fs.lstatSync(path.join(dest,n)).isSymbolicLink());assert.equal(fs.readlinkSync(path.join(dest,link)),source);
 confirmed=false;await ctx.exportSelection(win,'copy');assert.equal(fs.readdirSync(dest).length,1);confirmed=true;
 const dangling=path.join(dest,'dangling.pdf');fs.symlinkSync('/missing',dangling);
 assert.throws(()=>ctx.createMacSymlink(source,dangling));assert.equal(fs.readlinkSync(dangling),'/missing');
 assert.throws(()=>ctx.createMacSymlink(source,dest));assert.equal(fs.readdirSync(dest).length,2);
 assert.throws(()=>ctx.createMacSymlink(source,path.join(dest,first)));assert.equal(fs.readFileSync(source,'utf8'),'%PDF-1.4\nfixture');
 assert.ok(Buffer.byteLength(ctx.clean('文'.repeat(200)))<=180);
 preferences.set('extensions.pdf-link-copy-exporter.naming','citation');assert.equal(ctx.filenameFor(parent,attachment),'Wang2026.pdf');
 selected=[];await ctx.exportSelection(win,'copy');assert.match(alerts.pop(),/No locally available/);assert.equal(ctx.exportBusy,false);
 preferences.delete('extensions.pdf-link-copy-exporter.naming');
 selected=[parent];ctx.IOUtils.copy=async()=>{throw Error('Permission denied');};
 await ctx.exportSelection(win,'copy');const failure=alerts.pop();assert.match(failure.title,/could not/);assert.match(failure.message,/Permission denied/);assert.equal(ctx.exportBusy,false);

 await ctx.startup({rootURI:'jar:file:///tmp/exporter.xpi!/'});assert.equal(registeredPane.src,'jar:file:///tmp/exporter.xpi!/preferences.xhtml');assert.equal(registeredPane.label,'PDF Exporter');
 preferences.set('extensions.pdf-link-copy-exporter.naming','original');attachment.attachmentFilename='Original.pdf';
 assert.equal(ctx.filenameFor(parent,attachment),'Original.pdf');
 preferences.set('extensions.pdf-link-copy-exporter.appendKey',true);assert.equal(ctx.filenameFor(parent,attachment),'Original - ABCD1234.pdf');
 preferences.set('extensions.pdf-link-copy-exporter.appendKey',false);
 preferences.set('extensions.pdf-link-copy-exporter.showPreview',false);confirmed=false;
 preferences.set('extensions.pdf-link-copy-exporter.showSuccess',true);
 ctx.IOUtils.copy=async(s,t)=>fs.copyFileSync(s,t,fs.constants.COPYFILE_EXCL);
 await ctx.exportSelection(win,'copy');assert.match(alerts.pop().message,/Exported 1 PDF/);
 preferences.set('extensions.pdf-link-copy-exporter.showSuccess',false);
 await ctx.exportSelection(win,'copy');assert.equal(alerts.length,0);
 // Collection export exercises actual nested directories and membership semantics.
 ctx.IOUtils.makeDirectory=async(dir,options)=>{assert.equal(options.ignoreExisting,false);fs.mkdirSync(dir);};
 const collections=new Map();
 function collection(id,name,parentID,items,children=[]) {
   const loaded=new Set();const c={id,name,parentID,loadDataType:async type=>loaded.add(type),
     getChildItems:()=>{assert.ok(loaded.has('childItems'));return items;},
     getChildCollections:()=>{assert.ok(loaded.has('childCollections'));return children;}};
   collections.set(id,c);return c;
 }
 const grandchild=collection(13,'Nested',11,[parent]);
 const child=collection(11,'A/B',10,[parent,attachment],[grandchild]);
 const sameNameChild=collection(12,'A:B',10,[parent]);
 const empty=collection(14,'Empty',10,[]);
 const research=collection(10,'Research',null,[parent],[child,sameNameChild,empty]);
 const dots=collection(15,'..',null,[]);
 Z.Collections={get:id=>collections.get(id)};
 let selectedCollections=[research,child,research];
 win.ZoteroPane.getSelectedCollections=()=>selectedCollections;
 preferences.delete('extensions.pdf-link-copy-exporter.naming');
 preferences.set('extensions.pdf-link-copy-exporter.showPreview',true);confirmed=true;
 fs.mkdirSync(path.join(dest,'Research'));
 await ctx.exportSelection(win,'copy',true);
 const exported=path.join(dest,'Research');
 for(const rel of ['王 - 2026 - Test.pdf','A_B/王 - 2026 - Test.pdf','A_B/Nested/王 - 2026 - Test.pdf','A_B (2)/王 - 2026 - Test.pdf']) {
   assert.equal(fs.readFileSync(path.join(exported,rel),'utf8'),fs.readFileSync(source,'utf8'));
 }
 assert.ok(fs.statSync(path.join(exported,'Empty')).isDirectory());
 assert.equal(fs.readdirSync(path.join(exported,'A_B')).length,2); // one PDF plus Nested
 assert.match(previews.at(-1),/Research\/A_B\/Nested/);
 assert.equal(fs.readdirSync(dest).filter(n=>n.startsWith('Research')).length,1);
 await ctx.exportSelection(win,'symlink',true);
 assert.equal(fs.readlinkSync(path.join(dest,'Research','A_B','王 - 2026 - Test.pdf')),source);
 const before=fs.readdirSync(dest);confirmed=false;
 await ctx.exportSelection(win,'copy',true);assert.deepEqual(fs.readdirSync(dest),before);
 confirmed=true;selectedCollections=[dots];await ctx.exportSelection(win,'copy',true);
 assert.ok(fs.statSync(path.join(dest,'Untitled')).isDirectory());
 selectedCollections=[];await ctx.exportSelection(win,'copy',true);assert.match(alerts.pop(),/Select a collection/);
 // An exclusive-directory failure leaves the lock usable and does not write PDFs.
 selectedCollections=[collection(20,'New',null,[parent])];ctx.IOUtils.makeDirectory=async()=>{throw Error('Permission denied');};
 await assert.rejects(()=>ctx.exportSelection(win,'copy',true),/Permission denied/);assert.equal(ctx.exportBusy,false);
 // Explicit replacement safety: no writes through symlinks; staged failures preserve old data.
 preferences.set('extensions.pdf-link-copy-exporter.showPreview',false);
 selected=[parent];const target=path.join(dest,'王 - 2026 - Test.pdf');
 fs.unlinkSync(target);fs.writeFileSync(target,'old');choice=1;
 await ctx.exportSelection(win,'copy');assert.equal(fs.readFileSync(target,'utf8'),'old');
 choice=0;await ctx.exportSelection(win,'copy');assert.equal(fs.readFileSync(target,'utf8'),fs.readFileSync(source,'utf8'));
 fs.unlinkSync(target);fs.symlinkSync(source,target);await ctx.exportSelection(win,'copy');
 assert.equal(fs.lstatSync(target).isSymbolicLink(),false);assert.equal(fs.readFileSync(source,'utf8'),'%PDF-1.4\nfixture');
 fs.unlinkSync(target);fs.symlinkSync('/missing',target);await ctx.exportSelection(win,'symlink');assert.equal(fs.readlinkSync(target),source);
 const originalCopy=ctx.IOUtils.copy;ctx.IOUtils.copy=async()=>{throw Error('Disk full');};
 await ctx.exportSelection(win,'copy');assert.equal(fs.readlinkSync(target),source);assert.match(alerts.pop().message,/Disk full/);ctx.IOUtils.copy=originalCopy;
 choice=2;await ctx.exportSelection(win,'copy');assert.match(alerts.pop().message,/cancelled/);assert.equal(fs.readlinkSync(target),source);
 assert.ok(!fs.readdirSync(dest).some(n=>n.startsWith('.pdf-exporter')));
 const noAuthor={...parent,getCreators:()=>[{creatorTypeID:3,lastName:'Editor'}]};
 assert.match(ctx.filenameFor(noAuthor,attachment),/^Unknown/);
 assert.match(ctx.filenameFor(parent,attachment),/^王/);
 choice=1;selected=[attachment,{...attachment,id:2,parentItemID:3}];
 await ctx.exportSelection(win,'copy');assert.ok(fs.existsSync(path.join(dest,'王 - 2026 - Test (2).pdf')));
 // Exporting beside the original must never replace it with a self-referencing link.
 preferences.set('extensions.pdf-link-copy-exporter.naming','original');attachment.attachmentFilename=path.basename(source);
 picker.file=new File(root);selected=[attachment];choice=0;
 await ctx.exportSelection(win,'symlink');assert.match(alerts.pop().message,/original PDF/);
 assert.equal(fs.readFileSync(source,'utf8'),'%PDF-1.4\nfixture');picker.file=new File(dest);
 const menuElements=new Map(),appended=[];
 function element() {return {setAttribute(){},addEventListener(name,handler){this[name]=handler;},remove(){menuElements.delete(this.id);}};}
 const menuWindow={document:{getElementById:id=>id==='zotero-itemmenu'||id==='zotero-collectionmenu'
   ? {appendChild:node=>{appended.push(node);menuElements.set(node.id,node);}}
   :menuElements.get(id),createXULElement:element}};
 ctx.onMainWindowLoad({window:menuWindow});ctx.onMainWindowLoad({window:menuWindow});
 assert.equal(appended.length,4);assert.ok(menuElements.get('pdf-exporter-collection-copy').command);
 ctx.onMainWindowUnload({window:menuWindow});assert.equal(menuElements.size,0);
 console.log('PASS: first Author selection (editor-first and editor-only), Replace/Keep/Cancel, dangling-link replacement, original-PDF protection, staged failure recovery; recursive collections, shared membership, ancestor pruning, folder collisions, empty folders, traversal-safe names, cancellation, mkdir failure; settings register, live naming, optional keys, disabled preview, optional success prompt; copy integrity, duplicate selection, collision rename, symlink target, cancellation, dangling link / directory / file protection, UTF-8 name limit, Extra citation key, empty selection, lock cleanup. Gecko/Zotero APIs mocked.');
} finally {fs.rmSync(root,{recursive:true,force:true});}})().catch(e=>{console.error(e);process.exitCode=1;});
