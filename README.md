# Zotero PDF Exporter

Export selected Zotero PDFs as independent copies or macOS symbolic links.

## Install

Download the XPI from [Releases](https://github.com/pl0ver/zotero-pdf-exporter/releases/latest).
In Zotero, open Tools → Plugins → gear menu → Install Add-on From File… and select the XPI.

Requires Zotero 10.0.x. Symlink export requires macOS. Copy export is designed to use Zotero file APIs; other platforms have not been tested.

## Use

Select items or PDF attachments and right-click:
- Export PDFs as Copies… creates independent files for sharing.
- Export PDFs as Symlinks… points to the original PDF. Finder may show these as Alias.

Open Zotero Settings → PDF Exporter to configure filename format, optional attachment keys,
export preview, and completion messages. Settings save automatically.
Default filenames use Author - Year - Title.pdf. Duplicate names receive (2), (3), etc.; existing files are never overwritten.
The Citation Key option reads Citation Key: from Extra; it does not query live Better BibTeX keys.
Copy does not embed annotations stored only in the Zotero database. Missing local PDFs are skipped.

## Automatic updates

Install v0.2.1 manually once to switch from earlier placeholder update addresses.
Subsequent published versions can update through Zotero when automatic updates are enabled.
The update feed is the latest Release's updates.json asset.

## Development and publishing

Run python3 build.py, node --check bootstrap.js, and node test.cjs.
Build outputs are written to dist/. The update manifest includes the XPI SHA-256.
To publish, increment manifest.json version, commit to the default branch, then run
Actions → Publish Zotero plugin → Run workflow. The workflow builds and uploads a draft
Release, then publishes it with the update feed and marks it Latest.
Do not mark a Release without updates.json as Latest.

## Validation

Users have tested single-item Copy, Symlink, and the settings page in Zotero 10.0.6 on macOS.
The regression suite uses real temporary files with mocked Zotero/Gecko APIs.
The English settings text and versioned update path have been checked locally.
Multi-platform behavior and the full automatic-update cycle still require real Zotero testing.
