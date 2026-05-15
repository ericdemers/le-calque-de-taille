# AGENTS.md

Project-wide instructions for any AI coding assistant working on
**Le Calque de Taille** (Claude Code, Cursor, GitHub Copilot, Aider, …).

## What this app is

A mobile-first, GitHub-Pages-hosted, open-source web app that lets dental
students **overlay a 3D reference mesh onto an intraoral photo** they took
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
app.js                   Entry point — wires routes, samples, gestures
styles.css               All styles (mobile-first, dark)
src/
  viewer.js              Three.js scene, fixed camera, reference mesh
  gestures.js            PointerEvents → rotate / pan / push on active object
  exif.js                FocalLengthIn35mmFilm → vertical FOV
  i18n.js                Minimal locale switcher (FR default, EN toggle)
i18n/
  fr.json                French UX strings (canonical — default locale)
  en.json                English UX strings
samples/
  manifest.json          List of bundled examples
  front-anterior.jpeg    iPhone 14 photo with full EXIF (demo for auto-FOV)
  maxilla_lps.stl        Maxilla reference mesh in LPS frame
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

## When extending the app

See `DESIGN_NOTES.md` for the open decisions and the V1 → V2 roadmap.
Short version:

1. **Miroir mode** — port the `Reflector`-based virtual mirror disc from
   `../prep-grade/scripts/align.html`. The disabled segmented button in
   the bottom bar is the slot to fill.
2. **Vue mode** — viewport pan + pinch-zoom of the whole composite
   (photo + canvas) as a CSS transform on `#stage`.
3. **PWA** — manifest + service worker so the app installs and works
   offline. Trivial in scope, high in user value.
4. **Pose export / import** — round-trip the alignment as JSON so
   sessions can be saved, shared, and reopened.
5. **Drag-based FOV widget** — replace the read-only FOV display with a
   draggable thumb.

Always update this file when you change anything load-bearing.
