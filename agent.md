# PaperKit — Agent Context

Persistent context from prior Cursor sessions. Use this file to onboard quickly when resuming work on this project.

## Project identity

| Item | Value |
|------|-------|
| **Display name** | PaperKit (capital K) |
| **Folder** | `/Users/jayprakash/Desktop/Project/paper-kit` |
| **npm package** | `paper-kit` |
| **Tagline** | Edit, compress, and combine PDFs in your browser. |

**Naming rules**

- Use **PaperKit** in UI copy, titles, and docs.
- Use **paper-kit** for the folder and `package.json` name.
- Do **not** use competitor brand names (e.g. Sejda) anywhere in code, copy, comments, or docs.

**Workspace history**

- Built originally in `PDF-EDITOR` workspace (Aug 13–14, 2026).
- Renamed: `PDF-EDITOR` → `paper` → `paper-kit`.
- Always open **`paper-kit`** as the Cursor workspace (not `PDF-EDITOR`).

## What PaperKit is

Client-side PDF toolkit. All processing happens in the browser — files are never uploaded.

### Tools (routes)

| Route | Page | Purpose |
|-------|------|---------|
| `/` | `Home.tsx` | Tool grid + privacy note |
| `/edit` | `EditPdf.tsx` | In-browser PDF text editor |
| `/compress` | `CompressPdf.tsx` | Recompress embedded images |
| `/merge` | `MergePdf.tsx` | Combine multiple PDFs |
| `/delete-pages` | `DeletePages.tsx` | Remove selected pages |

## Tech stack

- **Vite** + **React 19** + **TypeScript**
- **Tailwind CSS v4** (`@tailwindcss/vite`)
- **React Router v7**
- **pdfjs-dist** — render pages, extract text (`getTextContent`)
- **pdf-lib** + **@pdf-lib/fontkit** — write/export PDFs
- **oxlint** for linting

## Run

```bash
cd /Users/jayprakash/Desktop/Project/paper-kit
npm install
npm run dev
```

- Home: http://localhost:5173/
- Edit: http://localhost:5173/edit

If `/edit` returns 404, the dev server is likely running from an old/empty folder. Kill port 5173 and restart from `paper-kit`.

## Project structure

```
src/
  App.tsx                    # Routes
  main.tsx                   # Entry + polyfills
  components/
    AppShell.tsx             # Nav + PaperKit logo
    PaperKitLogo.tsx         # SVG logo component
    Dropzone.tsx             # Shared PDF upload
    PageFilmstrip.tsx        # Page thumbnails
  pages/
    Home.tsx
    EditPdf.tsx              # Main editor (largest file)
    CompressPdf.tsx
    MergePdf.tsx
    DeletePages.tsx
  lib/pdf/
    load.ts                  # pdf.js worker, read bytes, preview URL
    textItems.ts             # Extract text runs from pages
    runBounds.ts             # Text width estimation
    render.ts                # Canvas render, overlay boxes, backdrop sampling
    fonts.ts                 # Font families, Noto embedding via fontkit
    applyTextEdits.ts        # Orchestrates export (composite per edited page)
    compositePage.ts         # Canvas compositing for export/preview
    merge.ts
    deletePages.ts
    compress.ts
public/
  favicon.svg, logo.svg      # Teal gradient document + check badge
  fonts/                     # Noto Sans/Serif/Mono TTF files (unicode)
```

## Edit PDF — architecture

### Edit mode (on-screen)

1. Render page to `<canvas>` via pdf.js.
2. Overlay interactive boxes from `extractPageTextRuns()` (`textItems.ts`).
3. Tools: **Edit/move**, **Add text**, **Whiteout**, **Image**.
4. User can edit existing runs, move boxes, change font family, toggle bold, delete runs, add new text/images/whiteouts.
5. Overlay positioning uses `textOverlayBoxFromPdf()` and `TEXT_ASCENT_EM` / `TEXT_DESCENT_EM` constants in `render.ts`.

### Export / preview mode

1. User clicks **Preview** → `applyEdits()` in `applyTextEdits.ts`.
2. For each edited page, `compositePageToPng()` (`compositePage.ts`):
   - Renders original page to canvas at `COMPOSITE_SCALE = 2`.
   - Erases edited regions (whiteout + backdrop sampling for shadow/colored backgrounds).
   - Draws replacement text with matching fonts (Noto for unicode e.g. ₹).
   - Composites added text, whiteouts, and images.
3. Patched pages are embedded back into pdf-lib document.
4. Preview opens in iframe; user can **Re-edit** or **Download**.

### Font support

- Standard: Helvetica, Times, Courier (pdf-lib standard fonts).
- Unicode: Noto Sans, Noto Serif, Noto Sans Mono (TTF in `public/fonts/`, embedded via `@pdf-lib/fontkit`).
- `fonts.ts` registers fontkit on PDFDocument, caches embeds, infers family from PDF font names.
- Canvas preview loads same TTFs via `FontFace` API in `compositePage.ts`.

### Key state in `EditPdf.tsx`

- `runs` — extracted PDF text runs
- `edits` — modified text per run id
- `runPos` — moved positions
- `runLooks` — font family, bold, size per run
- `backdrops` — sampled background colors (for text on colored/shadow backgrounds)
- `addedTexts`, `whiteouts`, `images` — user-added elements
- `deletedRuns` — runs removed from PDF on export
- `touchedRuns` — runs that were edited (only these get composited)
- `preview` — blob URL + bytes for preview/download flow

## Session history (bugs fixed)

Prior session built the full app and iteratively fixed:

1. **Text editing** — click-to-edit existing runs, delete added text blocks (Delete key / chip).
2. **Move text boxes** — drag grip handle; fixed clipping when text overlaps.
3. **Deselect UX** — show text only (no edit box border) when not editing.
4. **Bold preservation** — bold styling kept after edit and in export.
5. **Font picker** — per-run font family change.
6. **Unicode (₹)** — Noto fonts + fontkit embedding; fixed `fontkit.create is not a function`.
7. **UI visibility** — improved contrast/layout when editor chrome was hard to see.
8. **Shadow/colored backgrounds** — `sampleTextBackdrop()` preserves background on edited text.
9. **Preview before download** — preview modal with re-edit option.
10. **Remove existing PDF text** — `deletedRuns` + whiteout on export.
11. **Edit vs preview alignment** — tuned baseline via `previewBaselineY()` (may still need fine-tuning per PDF).
12. **Rebrand** — PaperKit name, `paper-kit` folder, custom logo (`PaperKitLogo.tsx`).

## Known limitations

- **Not a full Acrobat clone** — best-effort in-browser text replacement.
- Scanned/image-only PDFs have no selectable text.
- Complex ligatures, RTL, and custom embedded fonts may not match perfectly.
- Edit-mode overlay alignment vs preview export can drift slightly on some PDFs (baseline tuning ongoing).
- OCR, forms/signatures, Word/JPG conversion, server upload, accounts — **out of scope for v1**.

## Out of v1 (do not build unless asked)

Sign/forms, Word/JPG convert, OCR, server backend, user accounts, watermark/page numbers.

## Branding / logo

- Teal gradient (`#0f766e` → `#14b8a6`).
- Logo: stacked pages + document with text lines + check badge.
- Files: `public/favicon.svg`, `public/logo.svg`, `src/components/PaperKitLogo.tsx`.

## Deployment (GitHub Pages)

- **URL:** https://iamjp7.github.io/paper-kit/
- **Base path:** `/paper-kit/` via `.env.production` and `VITE_BASE_PATH` repo variable
- **Public assets:** always use `assetUrl()` from `src/lib/assetUrl.ts` — never hardcode `/fonts/...` or other `/public` paths
- **React Router:** `BrowserRouter` uses `import.meta.env.BASE_URL` as `basename`; route paths like `/edit` are correct (relative to basename)
- **Build checks:** `scripts/validate-build-paths.mjs` runs after build to catch root-relative asset paths
- **SPA fallback:** `scripts/postbuild-gh-pages.mjs` copies `index.html` → `404.html` for direct URLs like `/paper-kit/edit`
- **Custom domain:** set repo variable `VITE_BASE_PATH=/` and add `public/CNAME`


1. **Minimize scope** — match existing patterns; don't refactor unrelated code.
2. **Keep processing client-side** — no uploads, no backend unless explicitly requested.
3. **Edit alignment bugs** — check both `render.ts` (overlay) and `compositePage.ts` (export); they must stay in sync.
4. **Font issues** — check `fonts.ts`, `public/fonts/`, and fontkit registration before adding new families.
5. **Test with real PDFs** — especially bold text, ₹/unicode, overlapping text, and colored backgrounds.
6. **Dev server** — always run from `/Users/jayprakash/Desktop/Project/paper-kit`.

## Reference

- Original plan: `~/.cursor/plans/paper-kit_pdf_editor_c0c53dc5.plan.md`
- Prior chat transcript: `~/.cursor/projects/Users-jayprakash-Desktop-Project-PDF-EDITOR/agent-transcripts/3eeba16c-325c-42fb-9e96-ce19bccec0b7/`
