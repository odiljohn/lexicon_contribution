# Lexicon UX improvements

Keep the Montserrat typography, reference-inspired sidebar, and smooth collapse.

- [x] Replace the large welcome banner with a compact page title and word count.
- [x] Use the Add word modal with the selected folder as the default, optional description, and saving/error feedback. Keep entered values when saving fails. Inline entry was removed following user feedback.
- [x] Restore folder colors and show initials in the collapsed rail, with full names available on hover and to screen readers.
- [x] Make word titles open editing. Move edit/delete controls into a secondary actions disclosure, retaining deletion confirmation and keyboard access.
- [x] Label search as covering all folders, explain results and the return to the selected folder, and provide a clear empty-results action.
- [x] Verify production build and desktop/mobile flows, including failures, keyboard use, filtering, and repeated quick entry.

No changes to the Go API or existing saved data are needed.

## Earlier UX validation

- Vite production build and `git diff --check` passed.
- Isolated Chrome checks passed at 1440px and 375px: folder navigation, animated collapse, colored initials, Enter-to-save, optional descriptions, repeated entry, duplicate-submit prevention, failed-save draft recovery, global search and return, empty results, edit/move, deletion cancellation and confirmation, actions dismissal by Escape and outside pointer, and reduced motion.
- Empty-library checks passed: create the first folder, reject a blank title, and save the first word.
- Desktop and phone screenshots were inspected. Browser checks used a mocked API and temporary workspace; existing user data was untouched. The Go API was not changed or re-tested in this pass.

## Word-entry update

The user prefers a modal for creating words. The large inline form and its styles have been removed; Add word opens the existing editor with the current folder preselected. Empty-state guidance now points to Add word. The muted red accent and paper palette are retained.

Modal validation: production build and isolated desktop/phone browser checks passed for opening, folder preselection, title focus, title-only saves, optional descriptions, failed-save draft recovery, Cancel/Escape, mobile sizing, and the no-folder fallback. API responses were mocked.

## Custom folder chooser

Replaced the native folder select in create/edit modals with a styled chooser using colored folder icons, a selected checkmark, and a scrollable list. Supports arrow keys, Home/End, Enter/Space, typing folder names, Escape, Tab, and outside dismissal. The selected folder remains part of form submission and survives a failed save.

Production build and isolated desktop/phone checks passed for preselection, keyboard navigation and dismissal, pointer/touch selection, correct saved folder IDs, retry retention, edit preselection, and mobile sizing. The phone screenshot was inspected. API responses were mocked.

The folder chooser now floats above the modal in a top-layer popover instead of expanding the form. It aligns to the field and flips upward when needed. Browser checks confirmed unchanged modal height/position, keyboard and touch selection, and mobile sizing; the production build passed.

## Word detail document

- Word titles open a dedicated reading page at `#/words/:id`; direct links and reload are supported. Returning to the list preserves the current folder, search, sort, scroll position, and card focus within the session.
- The top-right Edit/Read mode button toggles between reading and a single source textarea. The first line becomes the title; the remaining text becomes the optional description. Switching to reading saves edits through the existing PATCH endpoint; validation and network failures keep the draft open.
- Reading supports Markdown headings from `#` through `######`, paragraphs, and fenced code blocks. HTML remains literal text.
- Drafts are retained in tab session storage across navigation and reload, then cleared on successful save. Creation remains in the Add word modal, including its floating folder chooser.
- Four parser tests passed with `node --test tests/document-format.test.js`; the production build and diff checks passed. Isolated Chrome checks with mocked API data passed for rendering, safe text handling, mode changes, saving/retry, duplicate-submit prevention, validation limits, navigation/history, draft recovery, direct-link reload, title-only notes, creation-modal regression, missing words, and phone layouts. Desktop and phone screenshots were inspected. No Go API or data-format changes were needed.
