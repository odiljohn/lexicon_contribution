# Lexicon

Lexicon is a personal vocabulary notebook. Create folders and save words or phrases with optional meanings, translations, or examples. Search matches titles and descriptions across folders.

## Local development

Use Node.js 20.19+ or 22.12+ and Go 1.23+.

In one terminal, start the Go API.

```sh
cd backend
go run .
```

In another, install the frontend dependencies and start React.

```sh
cd frontend
npm ci
npm run dev
```

Open the address printed by Vite. Vite forwards API requests to the Go server on port 8080. Run `npm run build` in `frontend` to compile the web app.

The API starts with sample folders and words and persists changes to `backend/data/lexicon.json`. Set `LEXICON_DATA_FILE` to use a different file. This first version is a single local workspace with no sign-in.
