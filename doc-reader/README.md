# SBE Doc Reader (prototype v0.1)

Frontend-only tool to read notes/contracts and produce summaries + visual timeline.

## Run
- Option 1: double-click `index.html` to open in browser (samples load via `Load sample files` — needs local server for fetch? If fetch fails, use Choose files and pick from `sample_files/`).
- Option 2 (recommended): `npx serve doc-reader` or `python -m http.server` inside `doc-reader/`, then open http://localhost:8000

## Features
- Accepts `.txt` `.md` `.pdf` `.docx` (PDF via pdf.js, DOCX via mammoth, all local)
- Per-file: word count, auto-summary (first key sentences), dates, $ amounts, keywords
- Combined timeline: vis-timeline visual + chronological list
- Export: Markdown + JSON

## Next steps (when ready)
1. Add real files — drag your notes/contracts in.
2. Improve date parsing for your formats.
3. Optional AI summaries: add backend endpoint (`/api/summarize`) for OpenAI/Anthropic/Ollama, keep local fallback.
4. Save reports per client/event.

All parsing is local — no files leave the browser in v0.1.
