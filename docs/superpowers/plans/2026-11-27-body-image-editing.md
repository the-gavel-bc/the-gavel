# Plan: body image editing and presentation

Status: approved 2026-11-27 (owner answers below); built on `feat/body-image-editing`.

## Root cause: no typing after an image

The editor builds its own Tiptap extension list instead of StarterKit, so ProseMirror's gap cursor is never loaded (its CSS was present, the plugin was not). A body image is a block atom. Inserting it into the empty last paragraph replaces that paragraph, so the body ends with the image and the selection sits on the image node. With no gap cursor there is no position after the image to place a text cursor, and typing while the image is selected would replace it. Confirmed with a unit probe: after insertion the document is `[paragraph, image]`, no gap-cursor plugin, `NodeSelection`.

## Research summary

- News sites and publishing platforms show body photos at the full width of the text column, never wider on mobile, with the caption under the photo and the credit after it, smaller and muted ("Photo: Name"). Directional words in captions ("left", "above") break when layouts stack on phones.
- Alt text and caption serve different readers: short alt text for screen readers, an optional visible caption for context. WordPress keeps them as separate fields in the image settings.
- Editors (WordPress, Ghost, Substack) keep a gap cursor or trailing paragraph after block images so writing continues below them; settings open from the image itself, not a distant panel.
- ProseMirror's own guidance for block atoms: load the gap cursor and keep an editable line after the block.

## Owner decisions (2026-11-27)

1. Body images get an optional **credit**.
2. Body images keep **alt text and caption as separate fields** (the main photo keeps its combined field).
3. The editor placeholder shows the **uploaded file name**, `[campus-rally.jpg]`; older images without a stored name show their alt text.

## Changes

- **Stored format:** image attrs gain optional `credit` (1–240 characters) and `name` (1–200), both nullable and both optional keys, so every existing article stays valid unchanged. TypeScript validator, SQL validator (new migration), and shared cases updated together. Null values are dropped on save so older documents round-trip byte for byte.
- **Editing:** gap cursor and drop cursor plugins (from the already installed `@tiptap/pm`); after inserting an image the cursor lands in the paragraph below it (one is added when needed); typing while an image is selected starts a new paragraph after it instead of replacing the image; images can be dragged, and moved up or down from their settings.
- **Placeholder:** a one-line chip `[file-name]` with an image icon. Hover or keyboard selection shows a small preview. Clicking opens a settings popover beside it: alt text, caption, credit, replace image, move up, move down, remove.
- **Published:** column-width figure with consistent spacing, caption then a muted "Photo: credit", no upscaling, height cap on tall photos; the same rendering serves preview and the public article.

## Acceptance criteria

- After inserting an image anywhere, including at the end, typing continues in a paragraph below it.
- Arrow keys move the cursor past images in both directions; Enter on a selected image adds a paragraph after it; Backspace/Delete on a selected image removes it.
- Older articles load and save without changes or "unsaved" warnings.
- Credit and name pass both validators; unknown image keys are still rejected.
- Settings popover is keyboard reachable, closes with Escape and returns focus to the editor.
- Preview and published pages show caption and credit; no layout shift or horizontal scroll at 390px.

## Verification

- Unit: `draft-image-node.test.ts` (cursor after insert, typing on a selected image, gap/drop cursor plugins, move, label, save shape), the body image control tests (insert with separate fields, settings edit/move/remove, Escape), the article body renderer (caption then credit, no file name), and the shared contract cases.
- pgTAP: `093_body_image_credit_name` covers both validators. The other validator-related files pass locally except four that assume an empty articles table (the local database holds demo articles); CI runs them on a fresh database.
- Browser: 74 specs across body images, preview, editing, publishing, roles, recovery and media pass; `body-images.spec.ts` now types after an inserted image and checks the hover preview and settings.
- Screenshots at desktop and phone sizes: placeholder, hover preview, settings popover (bottom sheet on phones), published figure.

Second validator found during testing: lifecycle steps re-check stored content with `private.is_valid_draft_document`, so the migration updates it too.
