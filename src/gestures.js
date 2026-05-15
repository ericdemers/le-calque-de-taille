// gestures.js — PointerEvents-based gesture grammar.
//
// One grammar, mouse + touch + stylus all routed through PointerEvents.
//
// In 3D modes (Référence, Miroir):
//   1 pointer   → rotate the active object around its centre
//   2 pointers  → pan the object (midpoint translation) + push along view
//                 ray (pinch distance)
//   wheel       → push along the view ray
//   right-click → pan (mouse only)
//
// In view mode (Vue): same pointer counts, different applications.
//   1 pointer   → translate the viewport (CSS pan)
//   2 pointers  → translate + pinch-zoom around the midpoint
//   wheel       → zoom around the cursor
//
// "Active object" is whatever getActiveObject() returns. In view mode it
// returns null and viewTransform takes over.

import * as THREE from 'three';

const ROTATE_SENS              = 0.006;
const PAN_SENS_MM_PER_PX       = 0.10;
const PUSH_SENS_MM_PER_PINCH   = 0.30;
const PUSH_SENS_MM_PER_WHEEL   = 0.10;
const WHEEL_ZOOM_EXP_BASE      = 0.998;  // ratio = base^deltaY

export function attachGestures({
  canvas, camera, getActiveObject, getMode, viewTransform, onGestureEnd,
}) {
  const pointers = new Map();   // pointerId → {x,y}
  let lastSingle = null;        // {x,y}
  let lastTwoMid = null;        // {x,y}
  let lastTwoDist = null;       // number
  let mouseRightDrag = false;
  let wheelIdleTimer = null;

  canvas.addEventListener('pointerdown',  onDown);
  canvas.addEventListener('pointermove',  onMove);
  canvas.addEventListener('pointerup',    onUp);
  canvas.addEventListener('pointercancel', onUp);
  canvas.addEventListener('lostpointercapture', onUp);
  canvas.addEventListener('wheel', onWheel, { passive: false });
  canvas.addEventListener('contextmenu', e => e.preventDefault());

  function onDown(e) {
    canvas.setPointerCapture(e.pointerId);
    pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (e.pointerType === 'mouse' && e.button === 2) mouseRightDrag = true;
    snapshotState();
    e.preventDefault();
  }

  function onMove(e) {
    if (!pointers.has(e.pointerId)) return;
    pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });

    const mode = getMode?.() ?? '3d';
    if (mode === 'view') {
      moveView();
    } else {
      moveObject();
    }
    e.preventDefault();
  }

  function moveView() {
    if (!viewTransform) return;
    if (pointers.size === 1) {
      const p = pointers.values().next().value;
      if (lastSingle) {
        viewTransform.panBy(p.x - lastSingle.x, p.y - lastSingle.y);
      }
      lastSingle = { x: p.x, y: p.y };
    } else if (pointers.size === 2) {
      const [a, b] = [...pointers.values()];
      const mid  = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
      const dist = Math.hypot(a.x - b.x, a.y - b.y);
      if (lastTwoMid) {
        viewTransform.panBy(mid.x - lastTwoMid.x, mid.y - lastTwoMid.y);
      }
      if (lastTwoDist != null && lastTwoDist > 0) {
        viewTransform.scaleBy(dist / lastTwoDist, mid.x, mid.y);
      }
      lastTwoMid  = mid;
      lastTwoDist = dist;
    }
  }

  function moveObject() {
    const obj = getActiveObject();
    if (!obj) return;

    const camRight = new THREE.Vector3()
      .setFromMatrixColumn(camera.matrixWorld, 0).normalize();
    const camUp = new THREE.Vector3()
      .setFromMatrixColumn(camera.matrixWorld, 1).normalize();
    const camFwd = new THREE.Vector3();
    camera.getWorldDirection(camFwd);

    if (pointers.size === 1) {
      const p = pointers.values().next().value;
      if (lastSingle) {
        const dx = p.x - lastSingle.x;
        const dy = p.y - lastSingle.y;
        if (mouseRightDrag) {
          obj.position.addScaledVector(camRight,  dx * PAN_SENS_MM_PER_PX);
          obj.position.addScaledVector(camUp,    -dy * PAN_SENS_MM_PER_PX);
        } else {
          // Match the camera-orbit feel: dragging right rotates the object so
          // its visible side moves left, as if the camera had orbited right
          // around it.
          obj.rotateOnWorldAxis(camUp,    dx * ROTATE_SENS);
          obj.rotateOnWorldAxis(camRight, dy * ROTATE_SENS);
        }
      }
      lastSingle = { x: p.x, y: p.y };
    } else if (pointers.size === 2) {
      const [a, b] = [...pointers.values()];
      const mid  = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
      const dist = Math.hypot(a.x - b.x, a.y - b.y);
      if (lastTwoMid) {
        obj.position.addScaledVector(camRight, (mid.x - lastTwoMid.x) * PAN_SENS_MM_PER_PX);
        obj.position.addScaledVector(camUp,   -(mid.y - lastTwoMid.y) * PAN_SENS_MM_PER_PX);
      }
      if (lastTwoDist != null) {
        // Pinch out (distance grows) → push the object FURTHER from camera
        // (camForward points away from camera, so negative deltaY style).
        const dd = dist - lastTwoDist;
        obj.position.addScaledVector(camFwd, -dd * PUSH_SENS_MM_PER_PINCH);
      }
      lastTwoMid  = mid;
      lastTwoDist = dist;
    }
  }

  function onUp(e) {
    pointers.delete(e.pointerId);
    if (e.pointerType === 'mouse' && e.button === 2) mouseRightDrag = false;
    // Gesture ends when all pointers lifted. Tell the host to take a
    // snapshot (undo dedupes if nothing actually changed).
    if (pointers.size === 0) onGestureEnd?.();
    snapshotState();
  }

  function onWheel(e) {
    const mode = getMode?.() ?? '3d';
    if (mode === 'view') {
      if (!viewTransform) return;
      // Exponential ratio gives smooth zoom regardless of wheel delta granularity.
      const ratio = Math.pow(WHEEL_ZOOM_EXP_BASE, e.deltaY);
      viewTransform.scaleBy(ratio, e.clientX, e.clientY);
    } else {
      const obj = getActiveObject();
      if (!obj) return;
      const camFwd = new THREE.Vector3();
      camera.getWorldDirection(camFwd);
      obj.position.addScaledVector(camFwd, -e.deltaY * PUSH_SENS_MM_PER_WHEEL);
    }
    // Wheel events stream continuously — debounce the snapshot so one
    // "session" of scrolling becomes one undo step.
    clearTimeout(wheelIdleTimer);
    wheelIdleTimer = setTimeout(() => onGestureEnd?.(), 300);
    e.preventDefault();
  }

  // Re-anchor "last" reference points whenever the pointer count changes —
  // prevents a jump when a finger lifts mid-gesture.
  function snapshotState() {
    if (pointers.size === 1) {
      lastSingle = { ...pointers.values().next().value };
      lastTwoMid = null;
      lastTwoDist = null;
    } else if (pointers.size === 2) {
      const [a, b] = [...pointers.values()];
      lastSingle = null;
      lastTwoMid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
      lastTwoDist = Math.hypot(a.x - b.x, a.y - b.y);
    } else {
      lastSingle = null;
      lastTwoMid = null;
      lastTwoDist = null;
    }
  }
}
