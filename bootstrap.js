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
  windows.add(window);
  for (const collectionMode of [false,true]) {
    const popup=doc.getElementById(collectionMode?'zotero-collectionmenu':'zotero-itemmenu');
    if (!popup) continue;
    for (const mode of ['symlink','copy']) {
      const id='pdf-exporter-'+(collectionMode?'collection-':'')+mode;
      if (doc.getElementById(id)) continue;
      const menu=doc.createXULElement('menuitem');
      menu.id=id;
      menu.setAttribute('label',collectionMode
        ? `Export Collection as ${mode==='copy'?'PDF Copies':'PDF Symlinks'}…`
        : `Export PDFs as ${mode==='copy'?'Copies':'Symlinks'}…`);
      menu.addEventListener('command',()=>exportSelection(window,mode,collectionMode).catch(e=>{
        Zotero.logError(e);Services.prompt.alert(window,'PDF Export','Export failed: '+e.message);
      }));
      popup.appendChild(menu);
    }
  }
}
function onMainWindowUnload({window}) {
  // Include legacy IDs so hot upgrades remove menus from earlier builds.
  for (const id of ['pdf-exporter-links','pdf-exporter-copies','pdf-exporter-copy','pdf-exporter-symlink',
    'pdf-exporter-collection-copy','pdf-exporter-collection-symlink']) window.document.getElementById(id)?.remove();
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
    const creator=item.getCreators?.().find(c=>c.creatorTypeID===Zotero.CreatorTypes.getID('author'));
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
async function pdfEntries(selected) {
  const entries=[],seen=new Set();
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
  return entries;
}
function folderName(name) {
  const value=clean(name);
  return value==='.'||value==='..' ? 'Untitled' : value;
}
function reserveName(base,reserved,extension='') {
  let name=base+extension,n=1;
  while (reserved.has(name.toLowerCase())) name=base+' ('+(++n)+')'+extension;
  reserved.add(name.toLowerCase());
  return name;
}
function existingNames(folder) {
  const names=new Set();
  if (!folder.exists()) return names;
  const children=folder.directoryEntries;
  while(children.hasMoreElements()) names.add(children.getNext().QueryInterface(Ci.nsIFile).leafName.toLowerCase());
  return names;
}
async function collectionGroups(selected) {
  const selectedIDs=new Set(selected.map(c=>c.id)),seenRoots=new Set(),groups=[];
  for (const collection of selected) {
    if (seenRoots.has(collection.id)) continue;
    seenRoots.add(collection.id);
    let ancestorID=collection.parentID,covered=false;
    while(ancestorID) {
      if(selectedIDs.has(ancestorID)){covered=true;break;}
      ancestorID=Zotero.Collections.get(ancestorID)?.parentID;
    }
    if (covered) continue;
    // Names are reserved per parent so sanitized duplicate collection names stay separate.
    async function visit(c,parentGroup) {
      await c.loadDataType('childItems');
      await c.loadDataType('childCollections');
      const group={name:folderName(c.name),parentGroup,entries:await pdfEntries(c.getChildItems())};
      groups.push(group);
      for(const child of c.getChildCollections()) await visit(child,group);
    }
    await visit(collection,null);
  }
  return groups;
}
async function exportSelection(win,mode,collectionMode=false) {
  if (exportBusy) {win.alert('An export is already in progress.');return;}
  exportBusy=true;
  try {
  const pane=win.ZoteroPane||Zotero.getActiveZoteroPane();
  let groups;
  if (collectionMode) {
    const collections=pane.getSelectedCollections();
    if (!collections.length) {win.alert('Select a collection to export.');return;}
    groups=await collectionGroups(collections);
  } else {
    const entries=await pdfEntries(pane.getSelectedItems());
    if (!entries.length) {win.alert('No locally available PDF attachments in selection.');return;}
    groups=[{entries}];
  }
  const folder=await chooseFolder(win);if (!folder)return;
  const planned=[],directories=[],namesByPath=new Map();
  function namesFor(dir) {
    if (!namesByPath.has(dir.path)) namesByPath.set(dir.path,new Set());
    return namesByPath.get(dir.path);
  }
  for(const group of groups) {
    group.folder=folder;
    group.relative='';
    if (collectionMode) {
      const parentFolder=group.parentGroup?.folder||folder;
      const reserved=namesFor(parentFolder);
      // Reuse real collection folders, but never traverse a destination symlink.
      const blocked=existingNames(parentFolder);
      const siblings=parentFolder.exists()?parentFolder.directoryEntries:null;
      while(siblings?.hasMoreElements()) {
        const candidate=siblings.getNext().QueryInterface(Ci.nsIFile);
        try {if (candidate.isDirectory()&&!candidate.isSymlink()) blocked.delete(candidate.leafName.toLowerCase());} catch(e) {}
      }
      const unavailable=new Set([...blocked,...reserved]);
      const name=reserveName(group.name,unavailable);reserved.add(name.toLowerCase());
      group.folder=parentFolder.clone();group.folder.append(name);
      group.relative=(group.parentGroup?.relative||'')+name+'/';
      if (!group.folder.exists()) directories.push(group.folder);
    }
    for(const entry of group.entries) {
      const name=reserveName(entry.name.slice(0,-4),namesFor(group.folder),'.pdf');
      const target=group.folder.clone();target.append(name);
      planned.push({...entry,target,name:group.relative+name});
    }
  }
  let preview=planned.slice(0,15).map(x=>x.name).join('\n');
  if (!planned.length) preview=groups.map(g=>g.relative).slice(0,15).join('\n');
  let extra=planned.length>15?`\n… and ${planned.length-15} more`:'';
  let confirmed=!setting('showPreview',true)||Services.prompt.confirm(win,'PDF Export Preview',
    `${mode==='copy'?'Copy':'Create symlinks for'} ${planned.length} PDF(s) to:\n${folder.path}\n\n${preview}${extra}\n\nIf a file already exists, you will be asked whether to replace it or keep it. Continue?`);
  if (!confirmed)return;
  // Create only missing collection directories; reuse real folders, never destination links.
  for (const dir of directories) await IOUtils.makeDirectory(dir.path,{ignoreExisting:false});
  let success=0,skipped=0,cancelled=false,errors=[];
  for (let p of planned) {
    try {
      const existing=findExistingTarget(p.target);
      if (existing) {
        if (existing.path.normalize('NFC').toLowerCase()===p.source.path.normalize('NFC').toLowerCase()) {
          throw Error('Destination is the original PDF; choose another export folder.');
        }
        if (!existing.isSymlink() && existing.isDirectory()) throw Error('A folder has this filename; it cannot be replaced.');
        const prompt=Services.prompt;
        const choice=prompt.confirmEx(win,'PDF Exporter — File already exists',
          `${p.name}\n\nReplace the existing file or keep it?`,
          prompt.BUTTON_POS_0*prompt.BUTTON_TITLE_IS_STRING|
          prompt.BUTTON_POS_1*prompt.BUTTON_TITLE_IS_STRING|
          prompt.BUTTON_POS_2*prompt.BUTTON_TITLE_IS_STRING|prompt.BUTTON_POS_1_DEFAULT,
          'Replace','Keep Existing','Cancel Export',null,{});
        if(choice===2){cancelled=true;break;}
        if(choice!==0){skipped++;continue;}
        await replaceExport(p.source,existing,mode);
      } else if (mode==='copy') {
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
      `Exported ${success}/${planned.length} PDFs; kept ${skipped} existing file(s).\n\n${errors.slice(0,10).join('\n')}`
      +(errors.length>10?`\n… and ${errors.length-10} more errors. See Zotero Error Console.`:''));
  }
  if (cancelled) Services.prompt.alert(win,'PDF Exporter','Export cancelled. Files already exported have been retained.');
  if (!cancelled && !errors.length && setting('showSuccess',false)) {
    Services.prompt.alert(win,'PDF Exporter',`Exported ${success} PDF(s). Kept ${skipped} existing file(s).`);
  }
  } finally {exportBusy=false;}
}

// Enumerating also finds dangling links and case-only filename differences.
function findExistingTarget(target) {
  if (!target.parent.exists()) return null;
  const children=target.parent.directoryEntries;
  while(children.hasMoreElements()) {
    const file=children.getNext().QueryInterface(Ci.nsIFile);
    if(file.leafName.normalize('NFC').toLowerCase()===target.leafName.normalize('NFC').toLowerCase()) return file;
  }
  return null;
}
async function replaceExport(source,target,mode) {
  // Prepare the complete replacement before touching the destination. Renaming an
  // entry replaces a symlink itself, never writes through it to the original PDF.
  const temp=target.parent.clone();temp.append('.pdf-exporter');
  temp.createUnique(Ci.nsIFile.DIRECTORY_TYPE,0o700);
  try {
    const staged=temp.clone();staged.append('export.pdf');
    if(mode==='copy') await IOUtils.copy(source.path,staged.path,{noOverwrite:true});
    else createMacSymlink(source.path,staged.path);
    if(Zotero.isMac) {
      const {ctypes}=ChromeUtils.importESModule('resource://gre/modules/ctypes.sys.mjs');
      const libc=ctypes.open('/usr/lib/libSystem.B.dylib');
      try {
        const rename=libc.declare('rename',ctypes.default_abi,ctypes.int,ctypes.char.ptr,ctypes.char.ptr);
        if(rename(staged.path,target.path)!==0) throw Error('Cannot replace file (errno '+ctypes.errno+').');
      } finally {libc.close();}
    } else {
      await IOUtils.move(staged.path,target.path,{noOverwrite:false});
    }
  } finally {temp.remove(true);}
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
