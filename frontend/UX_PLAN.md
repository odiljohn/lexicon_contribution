# Lexicon UX improvements

Keep the Montserrat typography, reference-inspired sidebar, and smooth collapse.

- [x] Replace the large welcome banner with a compact page title and word count.
- [x] Add inline word entry: Enter to save, selected folder as the default, optional description, and clear saving/error feedback. Keep drafts when saving fails.
- [x] Restore folder colors and show initials in the collapsed rail, with full names available on hover and to screen readers.
- [x] Make word titles open editing. Move edit/delete controls into a secondary actions disclosure, retaining deletion confirmation and keyboard access.
- [x] Label search as covering all folders, explain results and the return to the selected folder, and provide a clear empty-results action.
- [x] Verify production build and desktop/mobile flows, including failures, keyboard use, filtering, and repeated quick entry.

No changes to the Go API or existing saved data are needed.

## Validation

- Vite production build and `git diff --check` passed.
- Isolated Chrome checks passed at 1440px and 375px: folder navigation, animated collapse, colored initials, Enter-to-save, optional descriptions, repeated entry, duplicate-submit prevention, failed-save draft recovery, global search and return, empty results, edit/move, deletion cancellation and confirmation, actions dismissal by Escape and outside pointer, and reduced motion.
- Empty-library checks passed: create the first folder, reject a blank title, and save the first word.
- Desktop and phone screenshots were inspected. Browser checks used a mocked API and temporary workspace; existing user data was untouched. The Go API was not changed or re-tested in this pass.
