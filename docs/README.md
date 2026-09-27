# Published app (GitHub Pages)

This folder is the live site: https://erikfol.github.io/simply-beeutiful-events/

It is a publish copy of `../doc-reader/` (`index.html`, `app.js`, `styles.css`, `reports/`, `sbe-logo.png`).

After changing anything under `doc-reader/`, re-sync it here before pushing:
`Copy-Item "doc-reader\\*" "docs\\" -Force -Recurse -Exclude README.md`
then commit + push. (Note: on the published site, edits save in the browser only — use Export JSON to share them.)
