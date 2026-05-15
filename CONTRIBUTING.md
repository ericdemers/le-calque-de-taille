# Contributing

Welcome. Before opening a PR or making non-trivial changes:

## Read these first

1. **[`AGENTS.md`](./AGENTS.md)** — architecture invariants, file map,
   conventions, dev-console helpers.
2. **[`DESIGN_NOTES.md`](./DESIGN_NOTES.md)** — every non-obvious
   decision and the reasoning behind it.

If you're changing something that contradicts a decision in
`DESIGN_NOTES.md`, update the doc *in the same PR* with the new call
and the reason.

## Local setup

Open `index.html` in a browser. That's it.

```sh
python3 -m http.server
```

Then visit <http://localhost:8000>. For iPhone testing over the LAN
or for using Safari's Web Inspector, see the dev-workflow section in
`AGENTS.md`.

## Branch and PR conventions

- Branch from `main`. Name it descriptively:
  `add-mandible-sample`, `fix-undo-mode-bug`, `improve-iphone-layout`.
- One PR = one logical change. If your description starts with
  "and also…", split it.
- PR description answers three questions:
  1. **What** does this change?
  2. **Why?** (the motivation, not the diff)
  3. **How can a reviewer test it?**

## Commit messages

- Title under 70 characters, imperative mood ("Add X", "Fix Y").
- Body explains *why*, not *what* — the diff already shows *what*.
- Wrap body lines at ~80 characters.
- Group related small changes into one commit; split unrelated ones.

## Testing your changes

The app has no automated test suite — V1 is small enough that visual
testing is the primary check. Before opening a PR:

- Reload on **macOS Safari** (or Chrome / Firefox).
- Reload on **iOS Safari** over your LAN (see `AGENTS.md`).
- If you changed anything in `sw.js`'s precache list or a precached
  file, **bump `CACHE_VERSION`** so existing PWA installs pick up the
  change.
- Exercise the path you touched: load the sample, manipulate in all
  three modes, hit undo, change focale, etc.

## Discussion

Design questions belong on the PR (so they stay attached to the
change). For broader topics, open an issue.

## License

By contributing, you agree your contributions are licensed under MIT
(see [`LICENSE`](./LICENSE)).
