# Le Calque de Taille

> *Comparer, améliorer.*

A mobile-first, open-source web app for dental students. Overlay a 3D
reference mesh onto an intraoral photo you took with a phone, manipulate
the reference with touch gestures until it matches what you see, and
build the spatial reasoning that clinical work demands.

**This app does not evaluate your preparation.** It is a perceptual
training tool — a way to see in 2D and think in 3D, without needing a
scanner. For quantitative evaluation, use the team's scanner-based
companion app.

## Run it

No build step. Open `index.html` in a browser:

```sh
python3 -m http.server
# then visit http://localhost:8000
```

Some browsers (Chrome, in particular) refuse to `fetch()` local files
when you double-click `index.html` — use the local server above.

## What's in V1

- Welcome screen, French default, English toggle.
- One bundled sample: an iPhone 14 intraoral photo + maxilla STL.
- Drag, pan, pinch (touch) and click-drag, right-click-drag, scroll
  (mouse) to manipulate the 3D reference.
- Auto field-of-view from EXIF when the photo has it.

## What's not in V1 (yet)

The bottom bar shows three modes — **Référence / Miroir / Vue**. Only
**Référence** is wired in V1. Miroir (virtual dental mirror disc) and
Vue (pinch-zoom the whole composite) are next.

See [`DESIGN_NOTES.md`](./DESIGN_NOTES.md) for the full list of open
decisions and the path from V1 to V2.

## Contributing

This codebase is designed to be argued with. Decisions live in
`DESIGN_NOTES.md`, agent instructions in `AGENTS.md` (read by Claude
Code, Cursor, Copilot, and others). Open an issue, open a PR, change
the doc when you change the code.

## License

MIT.
