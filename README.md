# Zotero PDF Exporter

Export selected Zotero PDFs as independent copies or macOS symbolic links.

## Install

Download the XPI from [Releases](https://github.com/pl0ver/zotero-pdf-exporter/releases/latest).
In Zotero, open Tools → Plugins → gear menu → Install Add-on From File… and select the XPI.

Compatible with Zotero 10.0.x. Symlink export is available on macOS only. Copy export is designed to use Zotero file APIs; other platforms have not been tested.

## Use

Select items or PDF attachments and right-click:

- Export PDFs as Copies… creates independent files for sharing.
- Export PDFs as Symlinks… points to the original PDF. Finder may show these as Alias.

### Collections

Right-click a collection and choose **Export Collection as PDF Copies…** or **Export Collection as PDF Symlinks…**.
Choose the destination parent folder. The exporter creates a folder named after the collection and preserves its subcollections as subfolders, including empty collections.

Existing collection folders are reused, with a Replace or Keep Existing prompt for each conflicting PDF. Folder names that collide with files or symbolic links are numbered instead. Items belonging to multiple collections are exported into each corresponding folder. Selecting both a parent and its subcollection exports the tree once.

### Settings

Open **Zotero Settings → PDF Exporter** to configure:

- Filename format
- Optional attachment keys
- Export preview
- Completion messages

Changes are saved automatically.

### File naming

- **Default format:** `Author - Year - Title.pdf`, using the first creator whose role is Author. Editors are ignored; items without an Author use `Unknown`.
- **Existing files:** Choose **Replace**, **Keep Existing** (skip), or **Cancel Export** when a filename already exists. Different PDFs sharing a filename in the same export receive `(2)`, `(3)`, and so on.
- **Citation Key:** Reads `Citation Key:` from the item's **Extra** field. Live Better BibTeX keys are not queried.

### Notes

- **Annotations:** Copy does not embed annotations stored only in the Zotero database.
- **Missing files:** PDFs that are not available locally are skipped.
