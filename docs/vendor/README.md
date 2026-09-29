# Third-party libraries (copied in, loaded only when reading documents)

Served from this site so document reading doesn't depend on outside servers at run time. They run entirely in the browser; no document content is sent anywhere. Each folder is named after its version, so an upgrade never collides with a cached copy.

| Folder | Library | Used for | License | Source |
|---|---|---|---|---|
| `pdfjs-6.3.289/` | pdf.js 6.3.289 (Mozilla) | Text from PDFs | Apache-2.0 | https://cdnjs.cloudflare.com/ajax/libs/pdf.js/6.3.289/ |
| `mammoth-1.13.0/` | mammoth 1.13.0 | Text from Word (.docx) | BSD-2-Clause | https://cdnjs.cloudflare.com/ajax/libs/mammoth/1.13.0/ |
| `sheetjs-0.20.3/` | SheetJS Community Edition 0.20.3 | Rows from Excel and Google Sheets | Apache-2.0 | https://cdn.sheetjs.com/xlsx-0.20.3/ |

SheetJS comes from its official CDN because the older 0.18.5 build on cdnjs has a known security issue.
