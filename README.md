# Le Calque de Taille

> *Comparer, améliorer.*

A mobile-first, open-source web app for dental students. Overlay a 3D
reference mesh onto a dental photo you took with a phone, manipulate
the reference with touch gestures until it matches what you see, and
build the spatial reasoning that clinical work demands.

**This app does not evaluate your preparation.** It is a perceptual
training tool — a way to see in 2D and think in 3D, without needing a
scanner. For quantitative evaluation, use the team's scanner-based
companion app.

## Run it locally

No build step. Open `index.html` in a browser:

```sh
python3 -m http.server
# then visit http://localhost:8000
```

Some browsers (Chrome in particular) refuse to `fetch()` local files
when you double-click `index.html` — use the local server above.

To test on a real iPhone over your LAN, see `AGENTS.md`.

## What it does

- **Photo + 3D reference overlay.** One-finger drag rotates, two-finger
  drag pans, pinch pushes along the view ray (mouse: click-drag,
  right-click-drag, scroll). Per-sample initial pose is loaded from
  `samples/manifest.json`.
- **Virtual mirror disc (Miroir).** A 3D reflective disc you position
  to match the real dental mirror in the photo — for practising how a
  mirror view corresponds to a particular anatomical surface.
- **Composite zoom (Vue).** Pinch / scroll-wheel zooms the whole image
  (photo + 3D + mirror together) for detail work, with the camera and
  poses untouched.
- **Focal length adjustment.** Auto-read from EXIF
  (`FocalLengthIn35mmFilm`), tunable via a slider in millimetres.
  Compensated so the mesh doesn't visibly grow or shrink — only
  perspective foreshortening changes.
- **Contextual opacity slider** for the reference (in Référence mode) or
  the mirror (in Miroir mode).
- **Undo** for every gesture (drag, pinch, wheel, slider release, mode
  changes that toggle state). No redo in V1.
- **PWA.** Installable on iPhone via Safari → Share → *Sur l'écran
  d'accueil*; works offline after the first online load.
- **French + English UI** — French default, English toggle on the
  welcome screen.

## Deploying to GitHub Pages

1. Push this repo to GitHub.
2. **Settings → Pages** → Source: "Deploy from a branch", branch `main`,
   folder `/ (root)`.
3. After ~1 minute the site is live at
   `https://<your-user>.github.io/<repo-name>/`.

The service worker uses relative paths and a relative scope, so the app
works at any subpath. No GitHub Actions or extra config needed.

**Pushing updates:** when you change a precached file (HTML, JS, CSS,
samples), bump `CACHE_VERSION` in `sw.js` so existing PWA installs pick
up the new version on the next launch. Otherwise the worker serves the
old cached copy until eviction.

## Contributing

This codebase is designed to be argued with.

- **`AGENTS.md`** — entry point for any contributor or AI assistant
  (Claude Code, Cursor, GitHub Copilot, …). Architecture invariants,
  file map, conventions, console helpers. **Read this first.**
- **`DESIGN_NOTES.md`** — every non-obvious decision and the
  reasoning, with each entry flagged as "you can argue with this."
- **`CONTRIBUTING.md`** — short PR + commit conventions.

When you change code, update the doc in the same PR.

## License

MIT — see [`LICENSE`](./LICENSE).
