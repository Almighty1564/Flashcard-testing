# Study presentation repair

The original shared study renderer appended an inline image immediately after the final text character. The browser aligned that image with the last text baseline, making the last line drop by the height of the diagram. The answer also lacked a separate media layout.

This display-only enhancement separates the existing escaped answer nodes from images. Portrait answer diagrams appear alongside the complete text when the card has enough room; phone/portrait layouts stack text before the diagram. Landscape diagrams keep a full row. Question diagrams have a separate figure, and answer-choice/matching images are block elements. Question typography and padding are more compact. Question/answer figures open in a keyboard-accessible enlarged dialog, with Escape/Close and focus restoration.

The new styles are scoped to #studyView. The code does not write to Supabase, alter card data, interpret answer text as HTML, or replace scoring, randomization, progress, or authorization. Diagram-entry overlays retain their original positioning. A small shared-shell loader loads only on the study page. Existing module links are unchanged. Old separately downloaded standalone exports and the separate legacy-study page are not rewritten by this release.

## Verification

`tests/study-presentation-browser.py` exercises the actual mod1 study renderer and loaded style cascade against synthetic account, API and card fixtures. Checks cover answer reveal, text preservation, responsive layout, aspect ratios, modal focus, unchanged grading for flashcards/choices/numeric/diagram-entry/matching, repeated renders, escaped text, unavailable images, and absence of page-wide overflow at 390/768/1024/1440 px. No production account credentials or question records are used. See the Study presentation checks workflow for its result and screenshots. Native Chromium checks are not a claim of testing the user's iPad or Safari installation.

To undo this visual change, remove the study-presentation loader block from atelier-shell.js. No data migration or database rollback is needed.
