import { createViewer } from './src/viewer.js';
import { attachGestures } from './src/gestures.js';
import { readFovFromFile } from './src/exif.js';
import * as i18n from './src/i18n.js';

const welcomeEl = document.getElementById('welcome');
const editorEl  = document.getElementById('editor');
const photoImg  = document.getElementById('photo-img');
const canvasEl  = document.getElementById('three-canvas');
const stageEl   = document.getElementById('stage');
const sampleSel = document.getElementById('sample-select');
const fovReadout = document.getElementById('fov-readout');

let samples = [];
let viewer = null;

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

  // Mode segmented control — only "reference" is wired in v0.1.
  document.querySelectorAll('.seg').forEach(btn => {
    btn.addEventListener('click', () => {
      if (btn.disabled) return;
      document.querySelectorAll('.seg').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
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
    attachGestures({
      canvas: canvasEl,
      camera: viewer.camera,
      getActiveObject: () => viewer.referenceGroup,
    });
    window.addEventListener('resize',
      () => viewer.resize(stageEl.clientWidth, stageEl.clientHeight));

    // Dev hook: from the JS console, `lct.dumpPose()` returns the current
    // alignment as a JSON-ready object. Used to capture good default
    // poses for entries in samples/manifest.json (the `startPose` field).
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
    };
  }

  refreshSampleSelect();
  sampleSel.value = sample.id ?? '';
  sampleSel.onchange = () => {
    const next = samples.find(s => s.id === sampleSel.value);
    if (next) openEditorWithSample(next);
  };

  photoImg.src = sample.photo;
  await viewer.loadReferenceSTL(sample.reference, { startPose: sample.startPose });

  // FOV resolution order: EXIF > manifest.fovHint > 50°.
  let fov = 50;
  let fovSource = 'default';
  const exif = await readFovFromFile(sample.photo);
  if (exif?.fovDeg) { fov = exif.fovDeg; fovSource = 'exif'; }
  else if (typeof sample.fovHint === 'number') {
    fov = sample.fovHint; fovSource = 'manifest';
  }
  viewer.setFov(fov);
  fovReadout.textContent = `FOV ${fov.toFixed(1)}° (${fovSource})`;

  welcomeEl.classList.add('hidden');
  editorEl.classList.remove('hidden');
  // clientWidth is 0 while #editor is hidden; size after the next frame.
  requestAnimationFrame(
    () => viewer.resize(stageEl.clientWidth, stageEl.clientHeight));
}

function pickOwnPhoto() {
  const photoInput = document.createElement('input');
  photoInput.type = 'file';
  photoInput.accept = 'image/jpeg,image/png';
  photoInput.onchange = async () => {
    const photoFile = photoInput.files?.[0];
    if (!photoFile) return;
    const exif = await readFovFromFile(photoFile);
    const photoUrl = URL.createObjectURL(photoFile);

    const stlInput = document.createElement('input');
    stlInput.type = 'file';
    stlInput.accept = '.stl';
    stlInput.onchange = async () => {
      const stlFile = stlInput.files?.[0];
      if (!stlFile) return;
      const stlUrl = URL.createObjectURL(stlFile);
      openEditorWithSample({
        id: 'custom',
        title: { fr: 'Ma photo', en: 'My photo' },
        photo: photoUrl,
        reference: stlUrl,
        fovHint: exif?.fovDeg ?? null,
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

init();
