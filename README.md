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
