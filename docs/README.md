# GitHub Pages entry point

This folder is the GitHub Pages deployment root and contains a publish copy of the event manager (`index.html`, `app.js`, `styles.css`, `reports/`).

After changing anything under `doc-reader/`, re-sync it here before pushing:
`Copy-Item "doc-reader\\*" "docs\\" -Force -Recurse -Exclude README.md`
then commit + push. (Note: editing/saving timelines only works on the local server, not on the published read-only site.)