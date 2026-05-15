import { createViewer } from './src/viewer.js';
import { attachGestures } from './src/gestures.js';
import { createViewTransform } from './src/view.js';
import { createUndoStack } from './src/undo.js';
import { readFovFromFile } from './src/exif.js';
import * as i18n from './src/i18n.js';

const welcomeEl = document.getElementById('welcome');
const editorEl  = document.getElementById('editor');
const photoImg  = document.getElementById('photo-img');
const canvasEl  = document.getElementById('three-canvas');
const stageEl   = document.getElementById('stage');
const frameEl   = document.getElementById('photo-frame');
const sampleSel = document.getElementById('sample-select');

const secondaryBarEl = document.getElementById('secondary-bar');
const opacitySlider  = document.getElementById('opacity-slider');
const opacityReadout = document.getElementById('opacity-readout');

const focaleChip    = document.getElementById('focale-chip');
const focaleValueEl = document.getElementById('focale-value');
const focalePopover = document.getElementById('focale-popover');
const focaleSlider  = document.getElementById('focale-slider');
const focaleReadout = document.getElementById('focale-readout');

const btnSettings   = document.getElementById('btn-settings');
const settingsSheet = document.getElementById('settings-sheet');
const settingsClose = document.getElementById('settings-close');
const mirrorRadiusSlider  = document.getElementById('mirror-radius-slider');
const mirrorRadiusReadout = document.getElementById('mirror-radius-readout');

const btnUndo = document.getElementById('btn-undo');

// 35 mm-equivalent focal length ↔ vertical FOV (degrees).
// 35 mm frame is 24 mm tall → half-height 12 mm.
function focaleToFov(mm)   { return 2 * Math.atan(12 / mm) * 180 / Math.PI; }
function fovToFocale(deg)  { return 12 / Math.tan(deg / 2 * Math.PI / 180); }

let samples = [];
let viewer = null;
let viewTransform = null;
let undoStack = null;
let activeMode = 'reference'; // 'reference' | 'mirror' | 'view'

async function init() {
  await i18n.init();

  samples = await fetch('samples/manifest.json').then(r => r.json());

  document.getElementById('btn-example').onclick =
    () => openEditorWithSample(samples[0]);
  document.getElementById('btn-own').onclick = pickOwnPhoto;
  document.getElementById('btn-back').onclick = backToWelcome;
  document.getElementById('lang-toggle').onclick = () => {
    i18n.toggleLocale();
    refreshSampleSelect();
  };

  // Focale chip → toggle popover. Slider inside updates camera FOV with
  // apparent-size compensation so only perspective changes.
  focaleChip.addEventListener('click', (e) => {
    e.stopPropagation();
    focalePopover.classList.toggle('hidden');
  });
  focalePopover.addEventListener('click', (e) => e.stopPropagation());
  focaleSlider.addEventListener('input', () => {
    const mm = parseInt(focaleSlider.value, 10);
    setFocaleDisplay(mm);
    if (viewer) viewer.setFov(focaleToFov(mm), { compensate: true });
  });
  // Click anywhere outside the popover dismisses it.
  document.addEventListener('click', () => {
    focalePopover.classList.add('hidden');
  });

  // Opacity slider — controls the ACTIVE MODE's object opacity.
  opacitySlider.addEventListener('input', () => {
    const pct = parseInt(opacitySlider.value, 10);
    opacityReadout.textContent = `${pct} %`;
    if (!viewer) return;
    const o = pct / 100;
    if (activeMode === 'mirror')         viewer.mirror.setOpacity(o);
    else if (activeMode === 'reference') viewer.setReferenceOpacity(o);
  });
  opacitySlider.addEventListener('change', () => takeSnapshot());
  focaleSlider.addEventListener('change', () => takeSnapshot());
  mirrorRadiusSlider.addEventListener('change', () => takeSnapshot());

  // Undo button.
  btnUndo.addEventListener('click', () => {
    if (!undoStack?.undo()) return;
    refreshUiFromState();
    updateUndoButton();
  });

  // Settings sheet (gear icon) — currently holds the mirror-radius slider.
  btnSettings.addEventListener('click', () => openSettingsSheet());
  settingsClose.addEventListener('click', () => closeSettingsSheet());
  settingsSheet.addEventListener('click', (e) => {
    if (e.target === settingsSheet) closeSettingsSheet();
  });
  mirrorRadiusSlider.addEventListener('input', () => {
    const mm = parseInt(mirrorRadiusSlider.value, 10);
    mirrorRadiusReadout.textContent = `${mm} mm`;
    if (viewer) viewer.mirror.setRadius(mm);
  });

  // Mode segmented control.
  // "Référence" = gestures move the 3D reference.
  // "Miroir"    = gestures move the virtual mirror disc; first tap also
  //              lazily enables the mirror so it appears in the scene.
  // "Vue"       = pinch-zoom the whole composite (not yet wired).
  document.querySelectorAll('.seg').forEach(btn => {
    btn.addEventListener('click', () => {
      if (btn.disabled) return;
      const mode = btn.dataset.mode;
      let stateChanged = false;
      if (mode === 'mirror' && viewer && !viewer.mirror.isEnabled()) {
        viewer.mirror.setEnabled(true);
        stateChanged = true;
      }
      activeMode = mode;
      document.querySelectorAll('.seg').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      syncSecondaryBarToMode();
      if (stateChanged) takeSnapshot();
    });
  });

  // Auto-hide chrome after inactivity. Tap anywhere to bring it back.
  let chromeTimer;
  const chromeEls = document.querySelectorAll('.chrome');
  function bumpChrome() {
    chromeEls.forEach(c => c.classList.remove('hidden'));
    clearTimeout(chromeTimer);
    chromeTimer = setTimeout(
      () => chromeEls.forEach(c => c.classList.add('hidden')),
      2500,
    );
  }
  ['pointerdown', 'pointermove', 'wheel'].forEach(ev =>
    window.addEventListener(ev, bumpChrome, { passive: true }));
  bumpChrome();
}

function refreshSampleSelect() {
  const loc = i18n.getLocale();
  sampleSel.innerHTML = '';
  for (const s of samples) {
    const opt = document.createElement('option');
    opt.value = s.id;
    opt.textContent = s.title[loc] || s.title.fr;
    sampleSel.appendChild(opt);
  }
}

async function openEditorWithSample(sample) {
  // Lazy-init the viewer + gestures the first time we enter the editor.
  if (!viewer) {
    viewer = createViewer(canvasEl);
    viewTransform = createViewTransform(frameEl);
    undoStack = createUndoStack({
      getState: captureState,
      applyState: applyState,
    });
    attachGestures({
      canvas: canvasEl,
      camera: viewer.camera,
      getActiveObject: () => {
        if (activeMode === 'mirror')    return viewer.mirror.group;
        if (activeMode === 'reference') return viewer.referenceGroup;
        return null; // view mode — viewTransform takes over
      },
      getMode: () => activeMode,
      viewTransform,
      onGestureEnd: () => takeSnapshot(),
    });
    window.addEventListener('resize', fitFrameToPhoto);
    photoImg.addEventListener('load', fitFrameToPhoto);

    // Dev hooks for the JS console. Used to capture good defaults for the
    // sample manifest and to dial radius/opacity on a phone before we
    // build proper UI sliders.
    //   lct.dumpPose()         → reference pose JSON
    //   lct.dumpMirrorPose()   → mirror pose + radius + opacity JSON
    //   lct.setMirrorRadius(8) → change radius (mm)
    //   lct.setMirrorOpacity(0.6)  → change reflection opacity
    window.lct = {
      viewer,
      dumpPose() {
        const p = viewer.referenceGroup.position;
        const r = viewer.referenceGroup.rotation;
        return {
          position: [p.x, p.y, p.z].map(v => +v.toFixed(2)),
          rotation_deg: [r.x, r.y, r.z]
            .map(v => +(v * 180 / Math.PI).toFixed(1)),
        };
      },
      dumpMirrorPose: () => viewer.mirror.dumpPose(),
      setMirrorRadius:  (mm)  => viewer.mirror.setRadius(mm),
      setMirrorOpacity: (v01) => viewer.mirror.setOpacity(v01),
      viewTransform,
      resetView: () => viewTransform.reset(),
    };
  }

  refreshSampleSelect();
  sampleSel.value = sample.id ?? '';
  sampleSel.onchange = () => {
    const next = samples.find(s => s.id === sampleSel.value);
    if (next) openEditorWithSample(next);
  };

  // Fresh sample → fresh viewport zoom/pan. Otherwise the previous sample's
  // zoom-into-detail would persist, which is almost never what the user wants.
  viewTransform?.reset();

  photoImg.src = sample.photo;
  await viewer.loadReferenceSTL(sample.reference, { startPose: sample.startPose });

  // Per-sample mirror config. Absent → mirror stays off until the user taps
  // Miroir in the segmented control.
  if (sample.mirror) {
    if (typeof sample.mirror.radius === 'number') {
      viewer.mirror.setRadius(sample.mirror.radius);
    }
    viewer.mirror.applyPose(sample.mirror);
    if (typeof sample.mirror.opacity === 'number') {
      viewer.mirror.setOpacity(sample.mirror.opacity);
    }
    viewer.mirror.setEnabled(sample.mirror.enabled !== false);
  } else {
    viewer.mirror.setEnabled(false);
  }

  // Focale resolution order: manifest.focale > EXIF > 26 mm (iPhone wide).
  // setFov runs with compensate: false because the calibrated startPose
  // was captured at this focale — we just need to set the camera, not
  // shift the mesh.
  const exif = await readFovFromFile(sample.photo);
  let focaleMm = 26;
  if (typeof sample.focale === 'number') focaleMm = sample.focale;
  else if (exif?.focaleMm)               focaleMm = exif.focaleMm;
  focaleMm = Math.round(focaleMm);
  viewer.setFov(focaleToFov(focaleMm), { compensate: false });
  setFocaleDisplay(focaleMm);
  syncSecondaryBarToMode();

  // Fresh undo history per sample — undo doesn't cross sample boundaries.
  undoStack.reset();
  takeSnapshot();

  welcomeEl.classList.add('hidden');
  editorEl.classList.remove('hidden');
  // clientWidth is 0 while #editor is hidden; size after the next frame.
  requestAnimationFrame(fitFrameToPhoto);
}

// Size #photo-frame to match the photo's aspect ratio, centered inside
// #stage with letterbox bars in the leftover space. The 3D canvas fills
// the frame, so the camera's aspect ratio is the PHOTO's aspect ratio —
// not the viewport's. This makes captured poses device-invariant.
function fitFrameToPhoto() {
  if (!viewer || !photoImg.naturalWidth) return;
  const photoAr  = photoImg.naturalWidth / photoImg.naturalHeight;
  const stageW   = stageEl.clientWidth;
  const stageH   = stageEl.clientHeight;
  if (!stageW || !stageH) return;
  const stageAr  = stageW / stageH;

  let frameW, frameH;
  if (photoAr > stageAr) {
    // Photo is wider than the viewport — fit to width.
    frameW = stageW;
    frameH = stageW / photoAr;
  } else {
    // Photo is taller — fit to height.
    frameH = stageH;
    frameW = stageH * photoAr;
  }
  frameEl.style.width  = frameW + 'px';
  frameEl.style.height = frameH + 'px';
  viewer.resize(frameW, frameH);
}

function pickOwnPhoto() {
  // openEditorWithSample re-reads EXIF from the photo URL, so we don't need
  // to read it here too. Just collect the two file URLs and hand off.
  const photoInput = document.createElement('input');
  photoInput.type = 'file';
  photoInput.accept = 'image/jpeg,image/png';
  photoInput.onchange = () => {
    const photoFile = photoInput.files?.[0];
    if (!photoFile) return;
    const photoUrl = URL.createObjectURL(photoFile);

    const stlInput = document.createElement('input');
    stlInput.type = 'file';
    stlInput.accept = '.stl';
    stlInput.onchange = () => {
      const stlFile = stlInput.files?.[0];
      if (!stlFile) return;
      const stlUrl = URL.createObjectURL(stlFile);
      openEditorWithSample({
        id: 'custom',
        title: { fr: 'Ma photo', en: 'My photo' },
        photo: photoUrl,
        reference: stlUrl,
      });
    };
    stlInput.click();
  };
  photoInput.click();
}

function backToWelcome() {
  editorEl.classList.add('hidden');
  welcomeEl.classList.remove('hidden');
}

// Show the right slider in the secondary bar for the active mode.
// View mode → hide the bar entirely (gestures handle zoom; no slider needed).
function syncSecondaryBarToMode() {
  if (!viewer) return;
  if (activeMode === 'view') {
    secondaryBarEl.classList.add('mode-hidden');
    return;
  }
  secondaryBarEl.classList.remove('mode-hidden');
  const o = (activeMode === 'mirror')
    ? viewer.mirror.getOpacity()
    : viewer.getReferenceOpacity();
  const pct = Math.round(o * 100);
  opacitySlider.value = pct;
  opacityReadout.textContent = `${pct} %`;
}

function setFocaleDisplay(mm) {
  focaleSlider.value = mm;
  focaleReadout.textContent = `${mm} mm`;
  focaleValueEl.textContent = `${mm} mm`;
}

function openSettingsSheet() {
  if (!viewer) return;
  // Reflect current values when opening.
  const r = viewer.mirror.getRadius();
  mirrorRadiusSlider.value = r;
  mirrorRadiusReadout.textContent = `${r} mm`;
  settingsSheet.classList.remove('hidden');
}
function closeSettingsSheet() {
  settingsSheet.classList.add('hidden');
}

// --- Undo / snapshot plumbing ----------------------------------------------

function takeSnapshot() {
  undoStack?.snapshot();
  updateUndoButton();
}

function updateUndoButton() {
  btnUndo.disabled = !undoStack?.canUndo();
}

function captureState() {
  const r = viewer.referenceGroup;
  const m = viewer.mirror;
  return {
    mode: activeMode,
    reference: {
      pos: r.position.toArray().map(v => +v.toFixed(3)),
      rot: [r.rotation.x, r.rotation.y, r.rotation.z]
             .map(v => +v.toFixed(5)),
    },
    refOpacity: +viewer.getReferenceOpacity().toFixed(3),
    mirror: {
      enabled: m.isEnabled(),
      radius:  m.getRadius(),
      opacity: +m.getOpacity().toFixed(3),
      pos: m.group.position.toArray().map(v => +v.toFixed(3)),
      rot: [m.group.rotation.x, m.group.rotation.y, m.group.rotation.z]
             .map(v => +v.toFixed(5)),
    },
    focaleMm: parseInt(focaleSlider.value, 10),
    view: viewTransform.getState(),
  };
}

function applyState(s) {
  // Reference
  viewer.referenceGroup.position.fromArray(s.reference.pos);
  viewer.referenceGroup.rotation.set(...s.reference.rot);
  viewer.setReferenceOpacity(s.refOpacity);

  // Mirror — enabled first so subsequent setRadius / setOpacity see the right state
  viewer.mirror.setEnabled(s.mirror.enabled);
  viewer.mirror.setRadius(s.mirror.radius);
  viewer.mirror.setOpacity(s.mirror.opacity);
  viewer.mirror.group.position.fromArray(s.mirror.pos);
  viewer.mirror.group.rotation.set(...s.mirror.rot);

  // Camera (no compensation — we're applying a captured pose, not adjusting)
  viewer.setFov(focaleToFov(s.focaleMm), { compensate: false });
  setFocaleDisplay(s.focaleMm);

  // Viewport CSS transform
  viewTransform.setState(s.view);

  // Mode + segmented control. Without this, an undo that un-enables the
  // mirror would leave the Miroir button highlighted with no mirror visible
  // and gestures silently moving the hidden disc.
  if (s.mode && s.mode !== activeMode) {
    activeMode = s.mode;
    document.querySelectorAll('.seg').forEach(b => {
      b.classList.toggle('active', b.dataset.mode === s.mode);
    });
  }
}

function refreshUiFromState() {
  // Re-sync any UI surfaces that don't auto-derive from state changes
  // (focale chip + popover are handled by setFocaleDisplay inside applyState).
  syncSecondaryBarToMode();
}

init();
registerServiceWorker();
// maybeShowIosInstallHint();  // disabled in V1.2 — see DESIGN_NOTES.md §12

function registerServiceWorker() {
  if (!('serviceWorker' in navigator)) return;
  // file:// pages can't register service workers — skip silently so the
  // "open index.html directly" dev workflow still works.
  if (location.protocol !== 'http:' && location.protocol !== 'https:') return;
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('./sw.js').catch((err) => {
      console.warn('Service worker registration failed:', err);
    });
  });
}

function maybeShowIosInstallHint() {
  if (localStorage.getItem('lct.iosHintShown') === '1') return;
  const isIos = /iphone|ipad|ipod/i.test(navigator.userAgent);
  const alreadyInstalled = window.navigator.standalone === true;
  if (!isIos || alreadyInstalled) return;

  // Defer until i18n strings are loaded so we can localise.
  setTimeout(() => {
    const toast = document.createElement('div');
    toast.className = 'ios-install-hint';
    toast.textContent = i18n.t('ios.installHint');
    toast.addEventListener('click', dismiss);
    document.body.appendChild(toast);
    const t = setTimeout(dismiss, 12000);
    function dismiss() {
      clearTimeout(t);
      toast.remove();
      localStorage.setItem('lct.iosHintShown', '1');
    }
  }, 1200);
}
