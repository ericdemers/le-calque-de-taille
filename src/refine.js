// refine.js — auto-fit the 3D reference's pose to the photo.
//
// Strategy: silhouette + chamfer distance.
//   1. Once per photo: Sobel → binary edge map → distance transform (DT).
//      DT[p] = pixel-distance from p to the nearest photo edge.
//   2. For any candidate pose: render the reference's silhouette into
//      an offscreen target at the same resolution. Extract boundary
//      pixels (silhouette where any 4-neighbour is outside).
//   3. Cost = sum of DT values at those boundary pixels. The pose that
//      drives the cost down is the one whose silhouette lies on photo
//      edges.
//
// This scaffolding ships steps 1+2 plus a debug dump that renders the
// DT image with the current silhouette overlaid. Optimiser (step 3
// minimisation) lands in a follow-up commit.
//
// Working resolution is fixed to WORK_W; aspect matches the photo.
// At 256-wide that's ~50k pixels per evaluation — cheap enough for
// hundreds of optimiser iterations.

import * as THREE from 'three';

const WORK_W = 256;
const SOBEL_THRESHOLD_FRAC = 0.20;  // edges = pixels above 20% of max gradient

export function createRefiner({ viewer, photoImg }) {
  let dt = null;            // Float32Array, L2 pixel distance to nearest edge
  let dtW = 0, dtH = 0;

  let renderTarget = null;
  let silhouetteMat = null;

  function invalidate() { dt = null; }

  // ---- step 1: photo → DT image -----------------------------------------

  function ensureDT() {
    if (dt) return true;
    if (!photoImg?.naturalWidth) return false;

    const ar = photoImg.naturalWidth / photoImg.naturalHeight;
    dtW = WORK_W;
    dtH = Math.max(8, Math.round(WORK_W / ar));

    // Draw the photo at working resolution to read pixels.
    const cv = document.createElement('canvas');
    cv.width = dtW; cv.height = dtH;
    const ctx = cv.getContext('2d');
    ctx.drawImage(photoImg, 0, 0, dtW, dtH);
    const img = ctx.getImageData(0, 0, dtW, dtH).data;

    // Grayscale (Rec. 601 luma).
    const gray = new Float32Array(dtW * dtH);
    for (let i = 0; i < gray.length; i++) {
      gray[i] = 0.299 * img[4*i] + 0.587 * img[4*i+1] + 0.114 * img[4*i+2];
    }

    // Sobel gradient magnitude.
    const mag = new Float32Array(gray.length);
    let maxMag = 0;
    for (let y = 1; y < dtH - 1; y++) {
      for (let x = 1; x < dtW - 1; x++) {
        const i = y * dtW + x;
        const gx = -gray[i-dtW-1] - 2*gray[i-1] - gray[i+dtW-1]
                  +  gray[i-dtW+1] + 2*gray[i+1] +  gray[i+dtW+1];
        const gy = -gray[i-dtW-1] - 2*gray[i-dtW] - gray[i-dtW+1]
                  +  gray[i+dtW-1] + 2*gray[i+dtW] +  gray[i+dtW+1];
        const m = Math.sqrt(gx*gx + gy*gy);
        mag[i] = m;
        if (m > maxMag) maxMag = m;
      }
    }

    // Threshold to a binary edge map. Heuristic — will likely need tuning
    // or hysteresis (Canny-style) once we see how it behaves on real
    // intraoral photos.
    const threshold = maxMag * SOBEL_THRESHOLD_FRAC;
    const edges = new Uint8Array(gray.length);
    for (let i = 0; i < edges.length; i++) edges[i] = mag[i] > threshold ? 1 : 0;

    dt = distanceTransform(edges, dtW, dtH);
    return true;
  }

  // ---- step 2: pose → silhouette ----------------------------------------

  function ensureRenderTarget() {
    if (!renderTarget) {
      renderTarget = new THREE.WebGLRenderTarget(dtW || WORK_W, dtH || WORK_W, {
        minFilter: THREE.NearestFilter,
        magFilter: THREE.NearestFilter,
        format: THREE.RGBAFormat,
      });
      silhouetteMat = new THREE.MeshBasicMaterial({ color: 0xffffff });
    }
    if (renderTarget.width !== dtW || renderTarget.height !== dtH) {
      renderTarget.setSize(dtW, dtH);
    }
  }

  // Render the reference's silhouette at the current pose. Returns a
  // { data: Uint8Array, width, height } with 1 inside, 0 outside, oriented
  // top-row-first to match the DT image.
  function renderSilhouette() {
    if (!ensureDT()) return null;
    ensureRenderTarget();

    // The reference group may contain a single Mesh (set up in viewer.js).
    let mesh = null;
    viewer.referenceGroup.traverse(o => { if (o.isMesh) mesh = o; });
    if (!mesh) return null;

    // Swap material so the silhouette is unlit pure white regardless of
    // current opacity / lighting state.
    const origMat = mesh.material;
    mesh.material = silhouetteMat;

    // Hide everything in the scene except the reference. Lights stay (no
    // effect on MeshBasicMaterial).
    const wasVisible = [];
    viewer.scene.traverse(o => {
      if (o.isMesh && o !== mesh && o.visible) {
        wasVisible.push(o);
        o.visible = false;
      }
    });

    // Save + override renderer state, render, read pixels.
    const prevTarget = viewer.renderer.getRenderTarget();
    const prevColor  = viewer.renderer.getClearColor(new THREE.Color()).clone();
    const prevAlpha  = viewer.renderer.getClearAlpha();
    const prevAspect = viewer.camera.aspect;

    viewer.camera.aspect = dtW / dtH;
    viewer.camera.updateProjectionMatrix();

    viewer.renderer.setRenderTarget(renderTarget);
    viewer.renderer.setClearColor(0x000000, 0);
    viewer.renderer.clear();
    viewer.renderer.render(viewer.scene, viewer.camera);

    const rgba = new Uint8Array(dtW * dtH * 4);
    viewer.renderer.readRenderTargetPixels(renderTarget, 0, 0, dtW, dtH, rgba);

    // Restore.
    viewer.renderer.setRenderTarget(prevTarget);
    viewer.renderer.setClearColor(prevColor, prevAlpha);
    viewer.camera.aspect = prevAspect;
    viewer.camera.updateProjectionMatrix();
    mesh.material = origMat;
    for (const o of wasVisible) o.visible = true;

    // WebGL pixel order is bottom-up; flip into a top-down 1-channel array.
    const silh = new Uint8Array(dtW * dtH);
    for (let y = 0; y < dtH; y++) {
      const src = (dtH - 1 - y) * dtW * 4;
      const dst = y * dtW;
      for (let x = 0; x < dtW; x++) {
        silh[dst + x] = rgba[src + x*4] > 127 ? 1 : 0;
      }
    }
    return { data: silh, width: dtW, height: dtH };
  }

  // ---- debug -----------------------------------------------------------

  // Render a side-by-side debug canvas:
  //   left  = DT image (white = far from any edge, black = on an edge)
  //   right = DT with the current silhouette boundary overlaid in red
  // Used during the scaffolding phase to confirm both halves of the
  // pipeline look sensible before we wire the optimiser.
  function debugDump() {
    if (!ensureDT()) return null;
    const silh = renderSilhouette();
    if (!silh) return null;

    let dtMax = 0;
    for (let i = 0; i < dt.length; i++) if (dt[i] > dtMax) dtMax = dt[i];
    if (dtMax === 0) dtMax = 1;

    const cv = document.createElement('canvas');
    cv.width = dtW * 2;
    cv.height = dtH;
    const ctx = cv.getContext('2d');

    const left = ctx.createImageData(dtW, dtH);
    for (let i = 0; i < dt.length; i++) {
      const v = Math.min(255, Math.round((dt[i] / dtMax) * 255));
      left.data[4*i] = v; left.data[4*i+1] = v; left.data[4*i+2] = v;
      left.data[4*i+3] = 255;
    }
    ctx.putImageData(left, 0, 0);

    const right = ctx.createImageData(dtW, dtH);
    for (let i = 0; i < dt.length; i++) {
      const v = Math.min(255, Math.round((dt[i] / dtMax) * 255));
      right.data[4*i] = v; right.data[4*i+1] = v; right.data[4*i+2] = v;
      right.data[4*i+3] = 255;
    }
    // Silhouette boundary = inside-pixel with at least one outside 4-neighbour.
    const s = silh.data;
    for (let y = 1; y < dtH - 1; y++) {
      for (let x = 1; x < dtW - 1; x++) {
        const i = y * dtW + x;
        if (s[i] && (!s[i-1] || !s[i+1] || !s[i-dtW] || !s[i+dtW])) {
          right.data[4*i]   = 255;
          right.data[4*i+1] = 64;
          right.data[4*i+2] = 64;
        }
      }
    }
    ctx.putImageData(right, dtW, 0);

    return cv;
  }

  return { invalidate, ensureDT, renderSilhouette, debugDump };
}

// ---- Felzenszwalb–Huttenlocher exact L2 distance transform ----------------
// "Distance Transforms of Sampled Functions" (Felzenszwalb & Huttenlocher,
// 2004). O(wh) — separable into row + column 1D passes on squared distances.

function distanceTransform(edges, w, h) {
  const INF = 1e10;
  const d2 = new Float32Array(w * h);
  for (let i = 0; i < d2.length; i++) d2[i] = edges[i] ? 0 : INF;

  // Column pass.
  const fCol = new Float32Array(h);
  for (let x = 0; x < w; x++) {
    for (let y = 0; y < h; y++) fCol[y] = d2[y * w + x];
    const r = dt1d(fCol, h);
    for (let y = 0; y < h; y++) d2[y * w + x] = r[y];
  }
  // Row pass.
  const fRow = new Float32Array(w);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) fRow[x] = d2[y * w + x];
    const r = dt1d(fRow, w);
    for (let x = 0; x < w; x++) d2[y * w + x] = r[x];
  }

  // sqrt to get pixel distance.
  const out = new Float32Array(d2.length);
  for (let i = 0; i < d2.length; i++) out[i] = Math.sqrt(d2[i]);
  return out;
}

// 1D DT on squared distances. Computes the lower envelope of the family
// of parabolas { y = (x - q)² + f[q] } over q = 0..n-1.
function dt1d(f, n) {
  const d = new Float32Array(n);
  const v = new Int32Array(n);
  const z = new Float32Array(n + 1);
  let k = 0;
  v[0] = 0;
  z[0] = -Infinity;
  z[1] = +Infinity;
  for (let q = 1; q < n; q++) {
    let s;
    while (true) {
      const vk = v[k];
      s = ((f[q] + q*q) - (f[vk] + vk*vk)) / (2*q - 2*vk);
      if (s <= z[k] && k > 0) k--;
      else break;
    }
    k++;
    v[k] = q;
    z[k] = s;
    z[k + 1] = +Infinity;
  }
  k = 0;
  for (let q = 0; q < n; q++) {
    while (z[k + 1] < q) k++;
    const dq = q - v[k];
    d[q] = dq * dq + f[v[k]];
  }
  return d;
}
