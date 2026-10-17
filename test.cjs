// Node regression harness. Mocks Gecko and Zotero; not a Zotero integration test.
const fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const vm=require('node:vm'),assert=require('node:assert/strict');
const root=fs.mkdtempSync(path.join(os.tmpdir(),'pdf-exporter-test-'));
const source=path.join(root,'中文 source.pdf');fs.writeFileSync(source,'%PDF-1.4\nfixture');
const dest=path.join(root,'out');fs.mkdirSync(dest);
let selected=[],confirmed=true,alerts=[],calls=0,closed=0;
class File {
 initWithPath(p){this.path=p;} constructor(p){this.path=p;}
 exists(){return fs.existsSync(this.path);} isFile(){return fs.statSync(this.path).isFile();}
 clone(){return new File(this.path);} append(n){this.path=path.join(this.path,n);}
 get leafName(){return path.basename(this.path);} QueryInterface(){return this;}
 get directoryEntries(){let a=fs.readdirSync(this.path),i=0;return {hasMoreElements:()=>i<a.length,getNext:()=>new File(path.join(this.path,a[i++]))};}
}
const picker={init(parent){assert.equal(parent,'browsing-context');calls++;},open(cb){cb(0);},file:new File(dest)};
const ctypes={default_abi:0,int:0,char:{ptr:0},errno:17,open(lib){assert.equal(lib,'/usr/lib/libSystem.B.dylib');return {declare(name){assert.equal(name,'symlink');return (s,t)=>{try{fs.symlinkSync(s,t);return 0;}catch{return -1;}};},close(){closed++;}};}};
const preferences=new Map();let registeredPane;
const Z={Prefs:{get:(key)=>preferences.get(key)},PreferencePanes:{register:async options=>{registeredPane=options;}},initializationPromise:Promise.resolve(),getMainWindows:()=>[],isMac:true,logError(){},Items:{get:id=>id===1?attachment:parent}};
const ctx=vm.createContext({Zotero:Z,TextEncoder,Set,ChromeUtils:{importESModule:()=>({ctypes})},
 Cc:{'@mozilla.org/filepicker;1':{createInstance:()=>picker}},Ci:{nsIFilePicker:{modeGetFolder:2,returnOK:0},nsIFile:0},
 Components:{classes:{'@mozilla.org/file/local;1':{createInstance:()=>new File()}}},
 IOUtils:{copy:async(s,t,o)=>{assert.equal(o.noOverwrite,true);fs.copyFileSync(s,t,fs.constants.COPYFILE_EXCL);}},
 Services:{prompt:{confirm:()=>confirmed,alert:(w,title,message)=>alerts.push({title,message})}}});
const parent={isAttachment:()=>false,isRegularItem:()=>true,getAttachments:()=>[1],getCreators:()=>[{lastName:'王'}],getField:n=>({title:'Test',date:'2026',extra:'Citation Key: Wang2026'}[n]||'')};
const attachment={id:1,key:'ABCD1234',parentItemID:2,isAttachment:()=>true,isRegularItem:()=>false,attachmentContentType:'application/pdf',getFilePathAsync:async()=>source};
const win={browsingContext:'browsing-context',ZoteroPane:{getSelectedItems:()=>selected},alert:m=>alerts.push(m)};
vm.runInContext(fs.readFileSync(path.join(__dirname,'bootstrap.js'),'utf8'),ctx);
(async()=>{try {
 selected=[parent,attachment]; await ctx.exportSelection(win,'copy');
 assert.equal(alerts.length,0);assert.equal(fs.readdirSync(dest).length,1);
 const first=fs.readdirSync(dest)[0];assert.equal(first,'王 - 2026 - Test.pdf');assert.equal(fs.readFileSync(path.join(dest,first),'utf8'),fs.readFileSync(source,'utf8'));
 await ctx.exportSelection(win,'copy');assert.equal(fs.readdirSync(dest).length,2);assert.ok(fs.existsSync(path.join(dest,'王 - 2026 - Test (2).pdf')));
 await ctx.exportSelection(win,'symlink');assert.equal(alerts.length,0);
 const link=fs.readdirSync(dest).find(n=>fs.lstatSync(path.join(dest,n)).isSymbolicLink());assert.equal(fs.readlinkSync(path.join(dest,link)),source);
 confirmed=false;await ctx.exportSelection(win,'copy');assert.equal(fs.readdirSync(dest).length,3);confirmed=true;
 const dangling=path.join(dest,'dangling.pdf');fs.symlinkSync('/missing',dangling);
 assert.throws(()=>ctx.createMacSymlink(source,dangling));assert.equal(fs.readlinkSync(dangling),'/missing');
 assert.throws(()=>ctx.createMacSymlink(source,dest));assert.equal(fs.readdirSync(dest).length,4);
 assert.throws(()=>ctx.createMacSymlink(source,path.join(dest,first)));assert.equal(fs.readFileSync(source,'utf8'),'%PDF-1.4\nfixture');
 assert.ok(Buffer.byteLength(ctx.clean('文'.repeat(200)))<=180);
 preferences.set('extensions.pdf-link-copy-exporter.naming','citation');assert.equal(ctx.filenameFor(parent,attachment),'Wang2026.pdf');
 selected=[];await ctx.exportSelection(win,'copy');assert.match(alerts.pop(),/No locally available/);assert.equal(ctx.exportBusy,false);
 preferences.delete('extensions.pdf-link-copy-exporter.naming');
 selected=[parent];ctx.IOUtils.copy=async()=>{throw Error('Permission denied');};
 await ctx.exportSelection(win,'copy');const failure=alerts.pop();assert.match(failure.title,/could not/);assert.match(failure.message,/Permission denied/);assert.equal(ctx.exportBusy,false);
 assert.equal(calls,5);assert.equal(closed,4);
 await ctx.startup();assert.equal(registeredPane.src,'preferences.xhtml');assert.equal(registeredPane.label,'PDF Exporter');
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
 console.log('PASS: settings register, live naming, optional keys, disabled preview, optional success prompt; copy integrity, duplicate selection, collision rename, symlink target, cancellation, dangling link / directory / file protection, UTF-8 name limit, Extra citation key, empty selection, lock cleanup. Gecko/Zotero APIs mocked.');
} finally {fs.rmSync(root,{recursive:true,force:true});}})().catch(e=>{console.error(e);process.exitCode=1;});
