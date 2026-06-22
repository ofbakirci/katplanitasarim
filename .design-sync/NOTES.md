# design-sync notes

- **2026-06-22 — first-time sync attempt.** Repo is a standalone vanilla-JS app, **not** a JS
  component-library design system: no Storybook, no `*.stories.*`, no React/JSX/TSX, no component
  `dist/`, empty `deps`+`devDeps`. `tools/bundle.js` only inlines the app into one HTML file.
  ⇒ the converter (`package-build.mjs`; storybook/package shapes) does **not** apply.
- **Path chosen** (user: "just sync now, build the design system later"): hand-authored CSS design
  system at `design-system/` — `@dsCard` preview cards + the real `styles.css` + a conventions
  `README.md` naming the class vocabulary. Real CSS shipped; no reimplementation.
- `styles.css` shipped **verbatim**; still contains app-shell layout (`body`/`header`/`aside`/`main`/
  `#canvasWrap` + media-queries) to scope out when the DS is built out.
- **2026-06-22 — UPLOADED.** `/design-login` granted design-system scope. Created project
  **mesken-ds** (`de6a9656-8014-41ce-875c-7dadc0d7bb28`, pinned in `config.json`) and uploaded all
  18 files from `design-system/` verbatim (16 `@dsCard` cards + `styles.css` + `README.md`).
  Verified via `list_files` — remote matches local exactly. Hand-authored ⇒ no `_ds_bundle.js` /
  `.d.ts` / `_ds_sync.json` (no JS components to compile). No anchor ⇒ next sync re-verifies all.
  URL: https://claude.ai/design/p/de6a9656-8014-41ce-875c-7dadc0d7bb28
- **Re-sync:** project is pinned, so a future run takes the atomic path. Re-upload `design-system/`
  and reconcile (delete remote paths not in the local bundle). The `README.md` doubles as the
  conventions header (class vocabulary + tokens + setup + example) — keep it true, don't rewrite.
