# DESIGN_NOTES.md

This is a list of decisions we made building V1 of **Le Calque de Taille**.
Each one is a call, not a truth. We are handing this project to a team of
dental students who will spend a summer using it, finding the rough edges,
and improving it. **You are encouraged to argue with anything below.**

If you disagree, change the code *and* update this file with the new call
and the reason. The doc gets better every time it gets edited.

---

## Decisions inviting pushback

### 1. The app does not score or evaluate a prep.

We deliberately kept this app non-quantitative. The scanner-based sibling
app produces measurements; this one produces a visual overlay.

There will be a temptation to add an "alignment score" or "75% match"
indicator. **Resist it.** There is no objective ground truth for "correct
alignment" of a 2D photo to a 3D mesh — a fake number is worse than no
number. If you find a *real* signal worth surfacing, document it here
before shipping it.

### 2. Camera is fixed; only objects move.

See `AGENTS.md` § Architecture invariant. The desktop prototype tried
camera-orbit controls first and switched away. If you propose to revisit
this, write down what changed in your understanding.

### 3. No framing guide / no photo-quality tips in V1.

You — the dental students — will know more about what makes a good
intraoral photo than we do, once you've used the app on real dentoformes
and felt the rough edges. The slot is intentionally empty. Fill it with
what you learn.

### 4. One sample to start.

We bundled one photo + STL pair: `samples/front-anterior.jpeg` (an
iPhone 14 file with full EXIF) and `samples/maxilla_lps.stl`. This is
enough to verify the app works. Add more samples as you discover what
each one would teach (a clean front view, a mirror view, a tricky one,
etc.). The format is `samples/manifest.json`; each entry can declare a
`fovHint` (a number, or `"from-exif"`, or `null`).

### 5. No "gold pose" yet.

We didn't pre-author "this is what a good alignment looks like" poses.
Once you've tried aligning the bundled sample many times, decide whether
saving and replaying a reference pose helps learning or short-circuits
it. Both positions are defensible.

### 6. Vue is still disabled in the bottom-bar segmented control.

Miroir is now wired (V1.1). Vue — pinch-zoom on the whole composite
(photo + canvas + mirror) — remains disabled and is the next obvious
piece. It's a CSS-transform on `#stage` plus minor gesture routing,
much smaller in scope than Miroir was.

Miroir's V1.1 ships with hardcoded defaults (radius 8 mm, opacity 1.0,
position from align.html). Console helpers `lct.setMirrorRadius()` and
`lct.setMirrorOpacity()` let you dial values from a phone for testing
before committing to a UI control. Per-sample mirror config can be
declared in `samples/manifest.json` as `"mirror": { enabled, radius,
opacity, position, rotation_deg }`. Capture a good mirror pose with
`lct.dumpMirrorPose()` after dragging it into place.

### 7. Welcome screen shown every launch (V1).

It auto-routes back to welcome on every launch right now. A "remember my
last sample and skip welcome" toggle is reasonable; we didn't add it
because we wanted to be sure students see the framing every time until
the framing is settled.

### 8. HEIC = error / silent ignore (V1).

The file picker filters to JPEG/PNG. If a user picks a HEIC file from an
iPhone (the default capture format), nothing happens. This is unhelpful
but cheap to ship.

Options if you want to fix this:
- **Cheap:** show a one-screen modal explaining how to switch iPhone
  capture to JPEG (Réglages → Appareil photo → Formats → Le plus
  compatible).
- **Expensive:** ship `heic2any` (~1 MB WASM) for client-side decoding.

We'd lean toward the cheap option until you have real data on how often
HEIC comes up.

### 9. The 3D reference's default rotation is `(-π/2, 0, 0)`.

Inherited from `align.html`. Works for the maxilla LPS mesh we ship.
If you swap the reference STL for one in a different coordinate frame
(e.g. a mandible, or a single-tooth model), update `viewer.js
loadReferenceSTL` accordingly — or, better, encode the per-STL
orientation in the sample manifest.

### 10. 16 MB STL is okay for V1.

The `maxilla_lps.stl` we ship is 16 MB. That's large but it's a one-time
cached download. If you find it slow on mobile, look at:
- Compressing to DRACO-encoded glTF (~10× smaller).
- Reducing the mesh density (the original is at scanner resolution; we
  don't need that for visualization).
- Splitting into per-quadrant meshes.

---

## V1 → V2 path

The team has talked about these as obvious extensions. Order is just
suggestion; pick what you want to ship.

- **Miroir mode** — port the `Reflector` disc + ring from `align.html`,
  hook the segmented control to it.
- **Vue mode** — CSS-transform pan/zoom on `#stage`, so pinch zooms the
  whole composite (photo + canvas + mirror together).
- **PWA** — manifest + service worker. Should make the app installable
  on iOS via Share → Add to Home Screen, and work offline after first
  load.
- **Pose round-trip** — extend the pose-dump JSON from `align.html` into
  a "session" format (inputs, alignment, locale, notes) that can be
  saved, shared, and reopened.
- **Drag-based FOV widget** — replace the read-only readout in the top
  bar with a draggable thumb.
- **More samples** — see §4 above.
- **Faculty-authored "ideal alignment" poses** — see §5. Open question.

## Where this came from

The desktop prototype is `../prep-grade/scripts/align.html` (a sibling
project). It implements the same core idea (Architecture A,
mouse-driven, optional mirror disc) for desktop. When in doubt about
*why* something is the way it is here, that file is the source of
historical truth.
