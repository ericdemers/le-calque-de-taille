// view.js — viewport transform for "Vue" mode.
//
// Owns the CSS transform applied to #photo-frame. In Vue mode, gestures
// translate (pan) and scale (zoom) the entire composite — photo + canvas
// + mirror move together as one image. The 3D camera and mesh poses are
// unaffected; this is a pure CSS visual zoom for inspecting details.
//
// transform-origin is `center center`, so scale happens around the
// element's visual center. To make pinch feel native (the point under
// your fingers stays under your fingers as you scale), `scaleBy` takes
// a pivot in client coordinates and adjusts translate accordingly.

const MIN_SCALE = 1.0;
const MAX_SCALE = 8.0;

export function createViewTransform(frameEl) {
  let scale = 1.0;
  let tx = 0;
  let ty = 0;

  function apply() {
    frameEl.style.transform = `translate(${tx}px, ${ty}px) scale(${scale})`;
  }

  function panBy(dx, dy) {
    tx += dx;
    ty += dy;
    apply();
  }

  function scaleBy(ratio, pivotClientX, pivotClientY) {
    const s0 = scale;
    const s1 = Math.min(MAX_SCALE, Math.max(MIN_SCALE, s0 * ratio));
    if (s1 === s0) return;
    // Zoom around the pivot. getBoundingClientRect reflects the current
    // transform, so its center is the visually-rendered centre. Offsets
    // from that center scale by (s1 / s0); to keep the pivot fixed in
    // client space we counter-translate by dx * (1 - s1/s0).
    const rect = frameEl.getBoundingClientRect();
    const visualCx = rect.left + rect.width  / 2;
    const visualCy = rect.top  + rect.height / 2;
    const dx = pivotClientX - visualCx;
    const dy = pivotClientY - visualCy;
    const k = s1 / s0;
    tx += dx * (1 - k);
    ty += dy * (1 - k);
    scale = s1;
    apply();
  }

  function reset() {
    scale = 1.0;
    tx = 0;
    ty = 0;
    apply();
  }

  function getState() {
    return { scale, tx, ty };
  }

  apply();
  return { panBy, scaleBy, reset, getState };
}
