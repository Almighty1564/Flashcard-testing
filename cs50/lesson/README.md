# Version 4 lesson workspace

The Foundation lesson now has Lecture, Scratch, Notes and Files tabs. This is a presentation adapter, not a second course or notebook engine. The existing quiz, rubric, course drafts, backups, grading and notebook ledger remain authoritative.

## Behavior

- Theory uses the tabbed workspace and a compact lesson-content sidebar. Actual quiz and assignment screens remain above the same tools when selected.
- The media/editor elements remain mounted while switching tabs, minimizing/restoring, maximizing/restoring and changing same-page lesson routes. A new lesson resets its lecture to that lesson's video, not the Scratch project.
- The notebook uses the original IDs, stable topic identities, IndexedDB ledger, revisions, conflicts, exports and optional cloud/Obsidian sync. Its existing opener moves beside the tool area, not into a new global header.
- Tabs do not grant completion. Review & start quiz invokes the existing reviewed-state action. Assignments keep their original evidence requirements.
- Media is requested only after an approved account explicitly loads it. A signout clears the third-party frames. No account tokens, question data or notebook content are sent to a media provider.
- Scratch projects are **not** autosaved to Tomato08. Use the editor's File menu to save/load `.sb3` locally. Page refresh/exit triggers an unsaved-project reminder once the editor is loaded. This reminder cannot inspect whether the cross-origin editor is dirty.
- Minimize/maximize change the existing window's presentation, not its URL or iframe identity. On small screens the full editor scrolls within its tool window; maximizing provides more working space.

## Providers

Official English lecture IDs are verified against the corresponding CS50x 2026 week pages (0–10 and AI): https://cs50.harvard.edu/x/2026/ . The privacy-enhanced YouTube player is embedded with the current origin and a referrer; it does not autoplay. The official CS50 player remains available as an external fallback. Provider/network/browser restrictions can still prevent playback.

The editor iframe uses the Scratch Foundation's standalone GUI, documented at https://github.com/scratchfoundation/scratch-editor/tree/develop/packages/scratch-gui and hosted at https://scratchfoundation.github.io/scratch-gui/ . It is an editor, not a shared-project player. The full Scratch community website remains an explicit external link for account saving/sharing. This site does not rehost or modify the Scratch editor.

## Verification

`node --test tests/lesson-workspace.test.cjs`

`python tests/lesson-workspace-browser.py` exercises actual course/notebook code with synthetic authentication and synthetic third-party iframe transports. `python tests/lesson-provider-browser.py` separately verifies the real cross-origin editor and records the real video provider's result. No production accounts or database writes are used.

## Direct video stream
The default player uses Harvard's published English SDR 720p MP4 in a native HTML5 video element. YouTube remains a selectable embedded alternative. Both are click-to-load, pause when hidden, and award no course credit. Official English SRT captions convert to an in-memory VTT track; they are not rehosted or persisted. All 12 URLs were resolved from official CS50x week pages on 2026-10-05. Real playback, captions, and actual .sb3 download are checked independently of fixture tests.
