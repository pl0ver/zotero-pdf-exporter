"""Build deterministic XPI and Zotero update manifest using Python standard library."""
import hashlib, json, pathlib, re, zipfile
root = pathlib.Path(__file__).resolve().parent
manifest = json.loads((root / 'manifest.json').read_text())
config = manifest['applications']['zotero']
repo = 'pl0ver/zotero-pdf-exporter'
version = manifest['version']
assert re.fullmatch(r'\d+\.\d+\.\d+', version), 'Use a stable x.y.z version'
assert config['id'] == 'pdf-link-copy-exporter@local.invalid'
assert config['update_url'] == f'https://github.com/{repo}/releases/latest/download/updates.json'
assert config['strict_min_version'] == '10.0'
assert config['strict_max_version'] == '10.0.*'
dist = root / 'dist'
dist.mkdir(exist_ok=True)
name = f'zotero-pdf-exporter-{version}.xpi'
xpi = dist / name
with zipfile.ZipFile(xpi, 'w', zipfile.ZIP_DEFLATED) as archive:
    for name_in_zip in ('manifest.json', 'bootstrap.js', 'prefs.js', 'preferences.xhtml', 'icon.svg'):
        info = zipfile.ZipInfo(name_in_zip, (2026, 1, 1, 0, 0, 0))
        info.compress_type = zipfile.ZIP_DEFLATED
        info.external_attr = 0o100644 << 16
        archive.writestr(info, (root / name_in_zip).read_bytes())
with zipfile.ZipFile(xpi) as archive:
    assert archive.testzip() is None
    assert set(archive.namelist()) == {'manifest.json', 'bootstrap.js', 'prefs.js', 'preferences.xhtml', 'icon.svg'}
digest = hashlib.sha256(xpi.read_bytes()).hexdigest()
updates = {'addons': {config['id']: {'updates': [{
    'version': version,
    'update_link': f'https://github.com/{repo}/releases/download/v{version}/{name}',
    'update_hash': f'sha256:{digest}',
    'applications': {'zotero': {k: config[k] for k in ('strict_min_version', 'strict_max_version')}}
}]}}}
(dist / 'updates.json').write_text(json.dumps(updates, indent=2) + '\n')
(dist / 'SHA256SUMS.txt').write_text(f'{digest}  {name}\n')
print(xpi)
