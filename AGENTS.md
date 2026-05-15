# AGENTS.md

Project-wide instructions for any AI coding assistant working on
**Le Calque de Taille** (Claude Code, Cursor, GitHub Copilot, Aider, …).

## What this app is

A mobile-first, GitHub-Pages-hosted, open-source web app that lets dental
students **overlay a 3D reference mesh onto a dental photo** they took
with a phone. It is the *no-scanner-needed* sibling of a separate
scanner-based STL-comparison tool that the team already maintains.

**Audience:** dental students without scanner access.
**Pedagogical framing:** *« comparer, améliorer »* — compare what you did
with a 3D reference, see where you can improve, iterate. **The app does
not produce a numerical score or grade.** It supports visual, qualitative
comparison; for quantitative evaluation, use the scanner app.

## Architecture invariant — read this before changing anything

The 3D scene uses **Architecture A: object-centric**. The camera is fixed
at `(0, 0, CAMERA_DIST)` looking at the origin. The 3D reference (and
later the mirror disc) are independent `THREE.Group`s with their own
transforms. Gestures manipulate **the active object**, never the camera.

Why: simple to reason about, stable pose JSON across sessions, no orbit
controls drift. The desktop prototype at
`../prep-grade/scripts/align.html` is the reference implementation.

**Do not** introduce `OrbitControls`, `TrackballControls`, or anything
that moves the camera. If a feature seems to need a camera move, talk to
the team first.

## Tech stack and dev workflow

- Vanilla HTML + CSS + ES modules. **No build step.** No bundler. No
  TypeScript. No npm install required to run.
- Three.js + `exifr` loaded via CDN through an `importmap` in
  `index.html`.
- Dev workflow: **open `index.html` in a browser.** That's it.
  - Some browsers refuse to `fetch()` local files via `file://` —
    serve over a local HTTP server if needed:
    `python3 -m http.server` from the project root, then visit
    http://localhost:8000.
- Deploy: push to `main`, GitHub Pages serves the repo root.

## File map

```
index.html               Welcome screen + editor (single page, two sections)
app.js                   Entry point — wires routes, samples, gestures, SW
styles.css               All styles (mobile-first, dark)
manifest.webmanifest     PWA manifest (icons, theme, display: standalone)
sw.js                    Service worker (cache-first; offline app shell)
src/
  viewer.js              Three.js scene, fixed camera, reference mesh
  mirror.js              Virtual dental mirror disc (Reflector + ring)
  view.js                Vue-mode CSS transform (pan + pinch-zoom)
  gestures.js            PointerEvents → 3D ops or CSS transform per mode
  undo.js                Snapshot-based undo stack (no redo in V1)
  exif.js                FocalLengthIn35mmFilm → vertical FOV
  i18n.js                Minimal locale switcher (FR default, EN toggle)
i18n/
  fr.json                French UX strings (canonical — default locale)
  en.json                English UX strings
icons/
  icon.png               768×768 app icon used by manifest + apple-touch-icon
samples/
  manifest.json          List of bundled examples
  front-anterior.jpeg    iPhone 14 photo with full EXIF (demo for auto-FOV)
  maxilla_lps.stl        Maxilla reference mesh in LPS frame (~730 KB)
  mandible_lps.stl       Mandible reference mesh in same LPS frame (~730 KB)
DESIGN_NOTES.md          Decisions made in V1, flagged as arguable
README.md                Public-facing introduction
CLAUDE.md                One-line pointer to this file
```

## Conventions

- **Identifiers & comments in English.** UX strings in `i18n/*.json`.
- **French is the default locale.** New strings go into `fr.json` first,
  then `en.json`. Untranslated keys fall back to French automatically.
- **Use "reference" / « Référence 3D », never "mesh", in UX text.**
  In code, identifiers like `referenceGroup` are fine.
- **Comments document the *why*, not the *what*.** A two-line comment
  explaining *why* a magic number was chosen is more useful than a
  paragraph describing what the code does.
- **No new dependencies without a discussion.** The "open `index.html`"
  workflow is a feature. A build step is the kind of decision that
  needs justification, not a default.

## Known gotchas

- **HEIC.** iPhone-default HEIC is not browser-decodable. V1 simply
  filters to JPEG/PNG in the file picker. If users hit this in the wild,
  decide whether to ship `heic2any` (~1 MB WASM) before writing a
  conversion modal.
- **iOS Safari `clientWidth` while hidden.** Resizing the canvas while
  `#editor` is `display:none` reads 0. `app.js` defers the first resize
  to the next `requestAnimationFrame` for this reason.
- **EXIF orientation.** Portrait photos (Orientation 6 or 8) need the
  vertical-FOV calculation to use the 36 mm dimension instead of 24 mm.
  `src/exif.js` handles this.
- **Service worker caches aggressively.** During development, edits to
  any precached file may not appear after reload because the SW serves
  the old version from cache. Two fixes: (a) bump `CACHE_VERSION` in
  `sw.js` whenever you change a precached file, or (b) in DevTools →
  Application → Service Workers, tick "Update on reload" while iterating.
  The `file://` protocol can't register service workers, so opening
  `index.html` directly avoids the issue entirely — but you also lose
  any feature that requires `fetch()` of local files.

## Console helpers for development

When the editor is open, `window.lct` exposes a small dev surface used
to calibrate samples and debug poses. Open Safari Web Inspector (Mac:
Develop → [iPhone] → page, or Develop → Show JavaScript Console for the
local browser) and run:

```js
lct.dumpPose()              // current reference pose as JSON
lct.dumpMirrorPose()        // current mirror pose + radius + opacity
lct.setMirrorRadius(8)      // change radius (mm) without UI
lct.setMirrorOpacity(0.5)   // fade reflection without UI
lct.resetView()             // restore Vue-mode pan/zoom to identity
lct.viewer                  // raw three.js viewer (camera, scene, mirror, ...)
```

**Workflow for capturing a default pose for a new sample:**

1. Open the sample in the editor.
2. Drag the reference (and mirror, if relevant) to a good initial pose.
3. In the console, run `lct.dumpPose()` and/or `lct.dumpMirrorPose()`.
4. Copy the JSON output into `samples/manifest.json` under the sample's
   `startPose` / `mirror` field.

Per-sample mirror config also supports `radius`, `opacity`, and
`enabled` (defaults to `false` — only set `true` for samples specifically
about the mirror feature).

## When extending the app

`DESIGN_NOTES.md` is the authoritative reference for the open questions,
the rationale behind every non-obvious decision, and the V1 → V2 path.
**Read it before making any non-trivial change** — it explains *why*
things are the way they are. If you disagree with a decision, update
the doc when you update the code.

This file (`AGENTS.md`) is the entry point for any new contributor or
AI assistant. Keep it up to date when you change anything load-bearing:

- Architecture invariants (camera-fixed, object-centric, …)
- File structure (added, removed, or moved files)
- Tech stack (new dependency, build step, target platform)
- Known gotchas (new browser quirk, new SW caveat)
- Console helper surface (new `lct.*` methods)

Doc rot is the single most likely cause of a future contributor making
the wrong call. Resist it.
