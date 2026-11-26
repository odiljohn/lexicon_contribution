# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Overview

Lexicon is a personal vocabulary notebook: account-scoped folders holding words/phrases with optional descriptions. A Go standard-library HTTP API (`backend/`) serves a React + Vite SPA (`frontend/`). There is no framework beyond those — routing is `http.ServeMux` on the server and a URL-hash router in `main.jsx`.

## Commands

Requires Node.js 20.19+/22.12+ and **Go 1.24+** (the API uses the stdlib `crypto/pbkdf2` added in 1.24).

Run both halves in separate terminals during development:

```sh
cd backend && go run .          # API on 127.0.0.1:8080
cd frontend && npm ci && npm run dev   # Vite dev server, proxies /api -> 8080
```

Checks:

```sh
cd backend && go test -race ./... && go vet ./...
cd frontend && node --test tests/document-format.test.js && npm run build
```

Run a single Go test: `cd backend && go test -race -run TestName ./...`

There is no linter or frontend test runner beyond `node --test`; the frontend has no component tests, only `tests/document-format.test.js` for the pure document parser.

## Architecture

### Backend — two-layer storage, atomic JSON files

- **`main.go`** owns the vocabulary model (`Folder`, `Note`, `data`) and the per-workspace `store`. All reads/writes go through `store.save`, which writes to a temp file and `os.Rename`s it into place (atomic replacement). Handlers copy the slice before mutating so a failed save never corrupts in-memory state.
- **`accounts.go`** owns authentication and wraps the stores. `application` holds the accounts file, the `legacy` store, and a `workspaces` map from user ID to `*store`.

Key invariant — **the legacy library**: the *first* account registered gets `OwnsLegacy=true` and its workspace *is* the base data file (`backend/data/lexicon.json`, overridable via `LEXICON_DATA_FILE`). Every later account gets a fresh empty store written to `<base>.workspaces/<userID>.json`. Accounts/sessions live in `<base>.accounts.json`. These three paths must be kept together when moving data.

**News (`news.go`)** is a single global announcements feed stored in `<base>.news.json` (keep it with the other data files). Only the `OwnsLegacy` owner may create/edit/delete posts — enforced by `application.owner`, which wraps a `protect`ed handler and 403s non-owners. Any signed-in user can read. The `GET`/mutation responses return `{announcements, canPost}` where `canPost` tells the frontend whether to show the compose/edit UI; bodies use the same Markdown subset as word documents.

Request flow: `application.routes()` wraps the mux with origin/`Sec-Fetch-Site` checks and a JSON `Content-Type` requirement on mutating methods. Authenticated routes go through `application.protect`, which resolves the session cookie to an `(account, *store)` pair and hands the caller the user's own workspace — so the `store.folders`/`store.notes` handlers never deal with account scoping themselves.

Security specifics worth preserving: passwords are PBKDF2-HMAC-SHA-256 at 600k iterations (`passwordHash`/`passwordMatches`, constant-time compare); session tokens are stored only as SHA-256 hashes; `allowAttempt` rate-limits by client IP; avatars are re-encoded to JPEG server-side in `normalizeAvatar`. Set `LEXICON_COOKIE_SECURE=true` behind a TLS-terminating proxy.

### Frontend — hash routing, workspace-as-source-of-truth

- **`main.jsx`** is the whole app shell: sidebar, list/grid, search, and the add/edit/delete `Editor` dialog. Mutations call `api()` (a thin wrapper over `request` that asserts the response contains a `notes` array), and every successful mutation returns the *full* workspace, which replaces `workspace` state — the UI never patches individual notes locally.
- **`account.jsx`** — `AccountGate` gates the entire app on `GET /api/session`; it renders `AuthForm` when signed out and the `App` (via render-prop) when signed in. `ProfileEditor` and `Avatar` live here too. Avatars are cropped/resized to 256×256 client-side (`prepareAvatar`) before upload.
- **`word-detail.jsx`** / **`word-document.jsx`** / **`document-format.js`** — a word's title+description are joined into one Markdown-ish document (`# title` + body). `document-format.js` is the pure, tested round-trip parser; `word-document.jsx` renders a safe subset (headings, paragraphs, code fences) by building React elements — never `dangerouslySetInnerHTML`. Edits persist as drafts in `sessionStorage` under `lexicon-word-draft-<userID>-<noteId>`.
- **`api.js`** — all requests are same-origin to `/api/*`. A 401 on anything other than login/register/session dispatches a `lexicon:session-expired` window event that `AccountGate` listens for to drop the user back to sign-in.

Routing is `window.location.hash`, parsed by `currentRoute()`: `#/words/<id>` opens a word, `#/news` opens the announcements feed (`news.jsx`), empty hash is the list. No router library.

### Notable conventions

- User-facing error strings are returned by the server (`fail(w, code, "...")`) and surfaced verbatim in the UI; keep them full sentences.
- The CSS is one hand-written file (`frontend/src/style.css`) with heavy mobile/`visualViewport` handling (safe-area insets, `--viewport-height`); there is no CSS framework or preprocessor.
- `frontend/dist/` is committed but git-ignored output of `npm run build`; don't hand-edit it.
