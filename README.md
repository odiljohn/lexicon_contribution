# Lexicon

Lexicon is a personal vocabulary notebook. Create folders and save words or phrases with optional meanings, translations, or examples. Search matches titles and descriptions across your own folders. Word details combine the title and description into one document, with a reading/editing toggle and Markdown headings.

## Local development

Use Node.js 20.19+ or 22.12+ and **Go 1.24+**. The Go API uses the standard-library PBKDF2 implementation introduced in Go 1.24.

In one terminal:

```sh
cd backend
go run .
```

In another:

```sh
cd frontend
npm ci
npm run dev
```

Open the address printed by Vite. Vite forwards `/api` to the Go server on port 8080. Restart the Go server after updating from the version without accounts.

## Accounts and existing words

Create an account with a full name, unique username, email, and password. Sign in with either your email or username. Passwords require 12–128 characters. The profile at the bottom of the sidebar lets you edit your details, add an optional bio (up to 160 characters), upload/remove an avatar, or sign out. Changing an email requires the current password. Avatar uploads accept JPEG/PNG up to 5 MB; the frontend crops and resizes them to 256 × 256 pixels before saving.

**The first account created owns the existing library.** Its folders and words remain in the original data file; they are not copied to other accounts. Later accounts start with an empty library. On a fresh installation the initial sample library belongs to the first account. Document drafts are scoped to the signed-in account; legacy tab drafts follow the first imported library.

Email verification, password reset, and password changes are not implemented. Accounts work against this API instance; hosting/synchronizing the same API and its data is required for access from other devices.

## Persistence and deployment

The default base file is `backend/data/lexicon.json`. Set `LEXICON_DATA_FILE` to choose another path. Keep these files together when backing up or moving the app:

- The base file: the first account's existing vocabulary.
- `<base file>.accounts.json`: profiles, password hashes, and session records.
- `<base file>.workspaces/`: separate vocabulary files for subsequent accounts.

New files are written with owner-only permissions. Passwords are salted and hashed using PBKDF2-HMAC-SHA-256 with 600,000 iterations; random session tokens are stored as hashes. Session cookies are HttpOnly and SameSite=Lax, last up to 30 days, and are invalidated on sign-out. Authentication attempts are rate limited. Mutating API requests require JSON and reject cross-origin requests. See [Go's PBKDF2 documentation](https://pkg.go.dev/crypto/pbkdf2) and [OWASP password-storage guidance](https://cheatsheetseries.owasp.org/cheatsheets/Password_Storage_Cheat_Sheet.html).

Serve the frontend and API from the same origin over HTTPS in production, preserve the original Host header in a reverse proxy, and set `LEXICON_COOKIE_SECURE=true` when TLS terminates at the proxy. Keep account/data files outside public web directories.

`LEXICON_ADDR` changes the API bind address (default `127.0.0.1:8080`). `LEXICON_API_TARGET` changes Vite's development proxy target; normally neither is needed.

## Checks

```sh
cd backend
go test -race ./...
go vet ./...
```

```sh
cd frontend
node --test tests/document-format.test.js
npm run build
```

The phone layout has larger touch targets, 16px inputs, a full-width search row, a sticky word-detail toolbar, and modal footers that remain reachable while fields scroll. Modal and chooser positioning responds to the visible viewport and safe-area insets. Browser checks simulate reduced keyboard viewports; physical iOS/Android testing is still useful.
