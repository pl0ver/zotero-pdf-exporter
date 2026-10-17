/* Zotero 10 bootstrap plugin. macOS symlinks use the native, no-replace symlink syscall. */
var windows = new Set();
function install() {}
function uninstall() {}
async function startup({rootURI}) {
  await Zotero.initializationPromise;
  await Zotero.PreferencePanes.register({
    pluginID:'pdf-link-copy-exporter@local.invalid',
    id:'pdf-exporter-preferences',label:'PDF Exporter',
    src:rootURI+'preferences.xhtml',image:rootURI+'icon.svg'
  });
  for (let win of Zotero.getMainWindows()) onMainWindowLoad({window:win});
}
function shutdown() {
  for (let win of windows) onMainWindowUnload({window:win});
}
function onMainWindowLoad({window}) {
  const doc=window.document;
  const popup=doc.getElementById('zotero-itemmenu');
  if (!popup || doc.getElementById('pdf-exporter-links')) return;
  windows.add(window);
  for (let [id,label,mode] of [
    ['pdf-exporter-links','Export PDFs as Symlinks…','symlink'],
    ['pdf-exporter-copies','Export PDFs as Copies…','copy']
  ]) {
    let menu=doc.createXULElement('menuitem');
    menu.id=id;menu.setAttribute('label',label);
    menu.addEventListener('command',()=>exportSelection(window,mode).catch(e=>{
      Zotero.logError(e);Services.prompt.alert(window,'PDF Export','Export failed: '+e.message);
    }));
    popup.appendChild(menu);
  }
}
function onMainWindowUnload({window}) {
  for (let id of ['pdf-exporter-links','pdf-exporter-copies']) window.document.getElementById(id)?.remove();
  windows.delete(window);
}
function clean(s) {s=String(s||'').normalize('NFC').replace(/[\\/:*?"<>|\x00-\x1f]/g,'_').replace(/\s+/g,' ').trim(); let out=''; for (const c of s) {if (new TextEncoder().encode(out+c).length>180) break;out+=c;} return out||'Untitled';}
// Full keys match the native preference bindings in preferences.xhtml.
function setting(name,fallback) {
  const value=Zotero.Prefs.get('extensions.pdf-link-copy-exporter.'+name,true);
  return value===undefined ? fallback : value;
}
function filenameFor(item,attachment) {
  const mode=setting('naming','author');
  let stem;
  if (mode==='original') {
    stem=String(attachment.attachmentFilename||'').replace(/\.pdf$/i,'');
  } else if (mode==='citation') {
    stem=(item.getField('extra')||'').match(/^Citation Key:\s*(.+)$/im)?.[1]?.trim();
  }
  if (!stem) {
    const creator=item.getCreators?.()[0];
    const author=creator ? (creator.lastName||creator.name||'Unknown') : 'Unknown';
    const year=(item.getField('date')||'').match(/\b(?:18|19|20|21)\d{2}\b/)?.[0]||'n.d.';
    stem=`${author} - ${year} - ${item.getField('title')||'Untitled'}`;
  }
  return clean(stem)+(setting('appendKey',false)?' - '+attachment.key:'')+'.pdf';
}
async function chooseFolder(win) {
  let picker=Cc['@mozilla.org/filepicker;1'].createInstance(Ci.nsIFilePicker);
  picker.init(win.browsingContext,'Choose PDF export folder',Ci.nsIFilePicker.modeGetFolder);
  const result=await new Promise(resolve=>picker.open(resolve));
  return result===Ci.nsIFilePicker.returnOK ? picker.file : null;
}
async function exportSelection(win,mode) {
  if (exportBusy) {win.alert('An export is already in progress.');return;}
  exportBusy=true;
  try {
  const pane=win.ZoteroPane||Zotero.getActiveZoteroPane();
  const selected=pane.getSelectedItems();
  const entries=[];const seen=new Set();
  for (let item of selected) {
    let attachments=item.isAttachment()?[item]:item.isRegularItem()?item.getAttachments().map(id=>Zotero.Items.get(id)):[];
    for (let a of attachments) {
      if (!a || seen.has(a.id) || a.attachmentContentType!=='application/pdf') continue;
      seen.add(a.id);
      let path=await a.getFilePathAsync();
      if (!path) continue;
      let file=Components.classes['@mozilla.org/file/local;1'].createInstance(Ci.nsIFile);
      try {file.initWithPath(path);}catch(e){continue;}
      if (!file.exists()||!file.isFile()) continue;
      let parent=item.isRegularItem()?item:Zotero.Items.get(a.parentItemID)||item;
      entries.push({source:file,name:filenameFor(parent,a)});
    }
  }
  if (!entries.length) {win.alert('No locally available PDF attachments in selection.');return;}
  const folder=await chooseFolder(win);if (!folder)return;
  const planned=[];const reserved=new Set();
  // Directory enumeration catches dangling symlinks, for which exists() can be false.
  const dirEntries=folder.directoryEntries;
  while(dirEntries.hasMoreElements()) {
    const child=dirEntries.getNext().QueryInterface(Ci.nsIFile);
    reserved.add(child.leafName.toLowerCase());
  }
  for (let entry of entries) {
    const stem=entry.name.slice(0,-4);let n=1,name=entry.name,target;
    while (true) {
      target=folder.clone();target.append(name);
      if (!target.exists()&&!reserved.has(name.toLowerCase()))break;
      name=`${stem} (${++n}).pdf`;
    }
    reserved.add(name.toLowerCase());planned.push({...entry,target,name});
  }
  let preview=planned.slice(0,15).map(x=>x.name).join('\n');
  let extra=planned.length>15?`\n… and ${planned.length-15} more`:'';
  let confirmed=!setting('showPreview',true)||Services.prompt.confirm(win,'PDF Export Preview',
    `${mode==='copy'?'Copy':'Create symlinks for'} ${planned.length} PDF(s) to:\n${folder.path}\n\n${preview}${extra}\n\nNo existing files will be replaced. Continue?`);
  if (!confirmed)return;
  let success=0,errors=[];
  for (let p of planned) {
    try {
      // Recheck immediately before writing; never overwrite an existing path.
      if (p.target.exists())throw Error('Destination already exists');
      if (mode==='copy') {
        await IOUtils.copy(p.source.path,p.target.path,{noOverwrite:true});
      } else {
        createMacSymlink(p.source.path,p.target.path);
      }
      success++;
    } catch(e) {errors.push(p.name+': '+e.message);Zotero.logError(e);}
  }
  // Successful exports finish silently; failures remain visible and actionable.
  if (errors.length) {
    Services.prompt.alert(win,'PDF Export — Some files could not be exported',
      `Exported ${success}/${planned.length} PDFs.\n\n${errors.slice(0,10).join('\n')}`
      +(errors.length>10?`\n… and ${errors.length-10} more errors. See Zotero Error Console.`:''));
  }
  if (!errors.length && setting('showSuccess',false)) {
    Services.prompt.alert(win,'PDF Exporter',`Exported ${success} PDF(s).`);
  }
  } finally {exportBusy=false;}
}

var exportBusy=false;
// No shell, no overwrite, and an existing directory is an error, not a target folder.
// Opening/closing per call keeps native resources out of plugin shutdown handling.
function createMacSymlink(source,target) {
  if (!Zotero.isMac) throw Error('This build supports symlink export on macOS only. Use Copy on other systems.');
  const {ctypes}=ChromeUtils.importESModule('resource://gre/modules/ctypes.sys.mjs');
  const libc=ctypes.open('/usr/lib/libSystem.B.dylib');
  try {
    const symlink=libc.declare('symlink',ctypes.default_abi,ctypes.int,ctypes.char.ptr,ctypes.char.ptr);
    if (symlink(source,target)!==0) {
      const errno=ctypes.errno;
      throw Error('Cannot create symbolic link (errno '+errno+'); destination may exist or permission was denied.');
    }
  } finally {libc.close();}
}
