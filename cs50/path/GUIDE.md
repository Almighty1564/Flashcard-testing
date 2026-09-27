# Connected course map and notebook

## Where to start

Open `/cs50/` or `/cs50/path.html`. The old default entrance now opens the map. Existing direct lesson, Python drill, and project links remain valid.

The highlighted **Your next step** card recommends the first unfinished objective and activity. Select **Continue learning** to open it. Use **Locate on map** to return to that objective after browsing ahead.

## Read the connections

Each box is a complete objective, not just a video. It summarizes four stages:

1. **Foundation:** review the material and associated understanding checks.
2. **Practice:** build, vary, and repair the relevant code.
3. **Apply:** complete fresh coding checks or the assigned project.
4. **Review & evidence:** revisit the work and write a short reflection.

Incoming arrows identify recommended prerequisites. Multiple arrows mean the next objective combines several earlier capabilities. Outgoing arrows show what the objective enables. Click any box to inspect its stages. A prerequisite warning does not block navigation or falsely mark earlier work complete.

**View whole course** displays the entire dependency graph. **Focus on selected** reduces it to the selected objective's immediate inputs and outputs. Zoom and fit controls change only the view. The searchable, numbered **Course outline** provides the same navigation without relying on the diagram. On smaller screens the graph scrolls inside its own panel.

There are 39 objectives mapped from the existing 12 Foundation sections, 12 Python packs, and 15 project releases. The five broader phases organize those objectives; this update does not add a new vendor-automation curriculum.

## Stay oriented inside an activity

Lessons, Python practice, and projects share **Course map / Progress / Tools** navigation and a **Notes** button. The current objective and stage appear above the work. **Review this stage's checklist** returns to the appropriate objective on the map.

The older topic browsers are hidden by default. **Show topic browser** restores them for browsing, mixed sessions, and detailed reports. Nothing was deleted from the coursework.

## Take notes beside the lesson

Press **Notes**. The notebook is docked beside the course on wide screens and opens as a panel on smaller screens.

- Create a note, give it a title, and type. Changes save after a short pause; **Save now** saves immediately.
- A new note attaches to the current objective. **Attach current topic** associates an existing note with additional objectives.
- Use `[[Note title]]` to link notes. The linked-notes section can create a missing note. **Backlinks** shows notes that link to the current note.
- Search searches titles and text. **This objective** narrows the list to the current objective.
- Markdown preview supports headings, code fences, inline code, bold text, and note links. It does not execute HTML, Python, or embedded scripts.
- Renamed note titles remain aliases. Duplicate titles are treated as ambiguous rather than silently selecting one.
- **Archive** hides a note from the normal list without deleting history. Archived notes can be restored.
- Revision history keeps earlier text. Conflicting revisions from different tabs/devices require an explicit merge.

This is a lightweight linked notebook, not an Obsidian integration or a full Markdown/Obsidian implementation. It does not access a local Obsidian vault, install plugins, or change your filesystem.

## Storage and backups

Notes, path reflections, Python practice, and Project Studio reuse the existing approved-account, append-only ledger. Optional cloud sync is controlled through Account. Cloud sync includes saved source and notes and is **not end-to-end encrypted**. Use only non-sensitive training material.

Foundation results remain under their existing browser-local storage keys. The map reads them without overwriting or migrating them. A different browser will not have Foundation history unless you restore it using the Foundation tools.

Use **Export complete recovery backup** for both the original Foundation bytes and ledger events. Recovery merges immutable ledger events and exports Foundation bytes separately rather than overwriting them. The notebook also has JSON export/import and single-note Markdown export. Existing Studio backups continue to include ledger note revisions.

Reading, note writing, and reflection do not manufacture a quiz or implementation pass. A failed latest attempt remains visible. Local checker reports and self-reviews are practice evidence, not verified examinations.

## References

Design references: Obsidian's documented internal links/backlinks and MDN's IndexedDB transaction documentation. Implementation uses existing vanilla JavaScript, SVG, and the course ledger rather than adding an external notes service.

- https://obsidian.md/help/links
- https://obsidian.md/help/plugins/backlinks
- https://developer.mozilla.org/en-US/docs/Web/API/IndexedDB_API/Using_IndexedDB
