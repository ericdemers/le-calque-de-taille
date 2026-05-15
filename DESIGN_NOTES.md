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

### 6. All three segmented-control modes are now wired.

Référence (V1.0), Miroir (V1.1), and Vue (V1.4) are all functional.

Miroir's defaults (radius 11 mm, opacity 0.7) come from `src/mirror.js`;
the per-sample manifest can override via `"mirror": { enabled, radius,
opacity, position, rotation_deg }`. Capture a good mirror pose with
`lct.dumpMirrorPose()` after dragging it into place. By convention,
samples ship with `enabled: false` (progressive disclosure — see §14)
unless the sample is specifically *about* the mirror feature.

Vue is a CSS transform on `#photo-frame` (`src/view.js`). Pan via
1-finger drag, pinch-zoom around the touch midpoint, wheel-zoom
around the cursor. Scale is clamped to 1.0–8.0. Console helper
`lct.resetView()` restores the identity transform. The Vue transform
auto-resets on every new sample load — it would almost never be the
right thing to keep a deep zoom-into-detail across samples.

### 12. The iOS "Add to Home Screen" toast is wired but not shown.

The `maybeShowIosInstallHint()` function exists in `app.js` and the
French/English strings are in `i18n/*.json`, but the call site is
commented out. We did not want to push installation on users before
the V1 experience is settled. A user who already knows about PWAs can
install via the platform's own mechanism (see §11 below). To re-enable
the toast: uncomment the call in `app.js`.

### 17. Undo via snapshot stack — gesture-granular, no redo.

V1.7 adds an Undo button in the top bar between the sample selector and
the focale chip (↶ icon, disabled when there's nothing to undo).

Implementation (`src/undo.js`): on each completed user gesture, capture
a full state snapshot — reference pose + opacity, mirror pose + opacity
+ radius + enabled, focale, view transform. Pressing Undo pops the
current snapshot and re-applies the previous one. Snapshots are
JSON-deduplicated so no-op events don't fill the stack. Max depth 50.

"Completed gesture" means:
- pointerup at the end of a drag on the canvas
- 300 ms wheel idle (one scroll burst = one undo step)
- 'change' event on a slider (release after drag)
- explicit state changes (e.g. tapping Miroir to enable the mirror)

Stack resets on every sample load — undo does not cross sample
boundaries. No redo in V1; the stack is a simple array. Add a cursor
if/when redo is requested.

### 16. Pattern B controls layout — chip + contextual slider + sheet.

After V1.5's full-width focale slider felt too visually loud at startup,
V1.6 reorganises tunable controls along three surfaces:

- **Top-bar chip** for Focale (and future "always visible but rarely
  changed" values). Compact « FOCALE 26 mm » pill — tap to open a small
  floating popover with the slider. Visible value reassures the user
  what the camera is set to; popover hides the slider until requested.
- **Secondary bar** above the mode-segmented control hosts the
  *contextual opacity slider* — its meaning tracks the active mode:
  Référence → reference opacity, Miroir → mirror opacity, Vue → bar
  hidden entirely (no slider needed in view mode).
- **Settings sheet** behind a gear icon for less-frequent controls
  (currently just mirror radius; later: reset, debug grid, etc.).
  Bottom-up modal sheet with a backdrop, dismissable by tap-outside or
  close button.

The principle (progressive disclosure with the right defaults): everyday
adjustments are one drag away (opacity, while you're aligning). Occasional
adjustments are one tap away (focale, when perspective looks off). Rare
ones are two taps away (gear → sheet).

### 15. Focale (focal-length) slider with apparent-size compensation.

V1.5 adds a horizontal slider in a secondary bar between the photo and
the mode controls. Range: 15–120 mm 35mm-equivalent. The slider value is
shown in millimetres because dental students have done elementary
physics — focal length is a familiar concept, more so than "vertical FOV
in degrees."

When the slider is dragged, the camera FOV updates **with apparent-size
compensation**: the reference and mirror distances along the camera ray
are scaled so their visual size stays constant. Only perspective
foreshortening changes. This lets a student vary focale to find what
matches the photo's perspective without size confusing them.

Initial focale order: `sample.focale` (manifest, mm) → EXIF
`FocalLengthIn35mmFilm` → fallback 26 mm (iPhone wide). On *initial
load*, compensation is OFF, because the calibrated `startPose` was
captured at the resolved focale already — we just set the camera.
Compensation is ON only for user-driven slider changes.

The previous `fovHint` manifest field is gone; samples either declare
`focale` (a number, mm) or omit the field to use EXIF.

### 13. Canvas tracks photo aspect ratio, not viewport.

Before V1.3, the Three.js canvas filled the viewport while the photo was
letterboxed inside it via CSS `max-width / max-height`. This meant a
captured mesh or mirror pose was tied to a specific viewport aspect
ratio — alignments tuned on a Mac browser window appeared at a different
scale on iPhone portrait, and vice versa.

Fix: `index.html` now wraps the photo + canvas in a `#photo-frame` div
sized by JS to the photo's intrinsic aspect ratio. The canvas fills the
frame exactly, so the Three.js camera's aspect ratio is the photo's
aspect ratio. Poses captured on any device project the same way on every
device. Letterbox bars (dark, matches the theme background) fill the
leftover viewport space.

Existing captured poses (the front-anterior sample's `startPose` for
the reference, plus any mirror pose) were captured under the old math.
They now project slightly differently and may benefit from a one-time
recapture via `lct.dumpPose()` and `lct.dumpMirrorPose()`. From this
fix onward, recapture is a one-time, device-independent operation.

### 11. PWA installs from Safari → Share → Sur l'écran d'accueil.

V1.2 makes the app installable as a Progressive Web App: `manifest.web
manifest` declares the icon and standalone display mode; `sw.js`
precaches the app shell and samples, and caches CDN imports of
three.js + exifr at runtime, so subsequent launches work offline.

On iOS there is no install-prompt API, so we show a one-time toast
(« Installer l'appli : Partager → Sur l'écran d'accueil ») when the
user lands on the welcome screen via mobile Safari. Dismiss
once, never shown again (stored in `localStorage`).

The icon is `icons/icon.png` at 768×768. It already has rounded
corners in the artwork, so iOS will apply its own rounding on top —
fine for V1 but a vector source without built-in rounding would be
cleaner at higher sizes. A second-pass redesign is in scope for
the student team.

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
