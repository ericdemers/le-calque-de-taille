// viewer.js — Three.js scene wrapper.
//
// Architecture A (from ../prep-grade/scripts/align.html, preserved here):
// the camera is FIXED at (0,0,CAMERA_DIST) looking at the origin.
// Everything the user manipulates is an OBJECT in the scene (the 3D
// reference, eventually the mirror disc). This makes gestures simple to
// reason about — "rotate the active object around its centre" — and keeps
// the pose JSON stable across sessions.
//
// Do not move the camera. If you think you need to, talk to the team first.

import * as THREE from 'three';
import { STLLoader } from 'three/addons/loaders/STLLoader.js';
import { createMirror } from './mirror.js';

const CAMERA_DIST = 150;   // mm — fixed camera-to-origin distance

export function createViewer(canvas) {
  const renderer = new THREE.WebGLRenderer({
    canvas, antialias: true, alpha: true,
  });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.setClearColor(0x000000, 0);

  const scene = new THREE.Scene();
  scene.add(new THREE.AmbientLight(0xffffff, 0.55));
  const d1 = new THREE.DirectionalLight(0xffffff, 0.6);
  d1.position.set(50, -100, 50); scene.add(d1);
  const d2 = new THREE.DirectionalLight(0xffffff, 0.25);
  d2.position.set(-30, 80, 30); scene.add(d2);

  const camera = new THREE.PerspectiveCamera(50, 1, 0.1, 2000);
  camera.position.set(0, 0, CAMERA_DIST);
  camera.up.set(0, 1, 0);
  camera.lookAt(0, 0, 0);

  const referenceGroup = new THREE.Group();
  scene.add(referenceGroup);

  const mirror = createMirror(scene);

  const refMaterial = new THREE.MeshStandardMaterial({
    color: 0xddddee, metalness: 0, roughness: 0.85,
    transparent: true, opacity: 0.6, side: THREE.DoubleSide,
  });
  let reference = null;
  const referenceInitial = {
    pos: new THREE.Vector3(),
    rot: new THREE.Euler(),
  };

  function loadReferenceSTL(url, { startPose } = {}) {
    return new Promise((resolve, reject) => {
      new STLLoader().load(url, (geom) => {
        if (reference) {
          referenceGroup.remove(reference);
          reference.geometry.dispose();
        }
        geom.computeVertexNormals();
        geom.computeBoundingBox();
        reference = new THREE.Mesh(geom, refMaterial);

        // Pre-translate the mesh inside its group so the anterior tooth area
        // sits near the group's local origin — then the GROUP transform alone
        // describes the user-visible pose.
        const bb = geom.boundingBox;
        const c = new THREE.Vector3(); bb.getCenter(c);
        reference.position.set(-c.x, -bb.min.y - 5, -(bb.min.z + 8));
        referenceGroup.add(reference);

        // Generic default: LPS occlusal plane points up. Overridden when the
        // sample declares a `startPose` — captured via `lct.dumpPose()`.
        if (startPose) {
          applyPose(startPose);
        } else {
          referenceGroup.rotation.set(-Math.PI / 2, 0, 0);
          referenceGroup.position.set(0, 0, 0);
        }
        referenceInitial.pos.copy(referenceGroup.position);
        referenceInitial.rot.copy(referenceGroup.rotation);
        resolve();
      }, undefined, reject);
    });
  }

  function applyPose(pose) {
    if (Array.isArray(pose.position)) {
      referenceGroup.position.fromArray(pose.position);
    }
    if (Array.isArray(pose.rotation_deg)) {
      const [rx, ry, rz] = pose.rotation_deg;
      const d2r = Math.PI / 180;
      referenceGroup.rotation.set(rx * d2r, ry * d2r, rz * d2r);
    }
  }

  // setFov(deg, { compensate })
  //   compensate: false (default) — just set FOV. Used on initial sample
  //     load when the calibrated startPose was captured AT this FOV.
  //   compensate: true — also scale the reference + mirror distances along
  //     the camera ray so their apparent size stays constant. Used when
  //     the user drags the focale slider: only perspective foreshortening
  //     changes, not scale, so they can tune perspective without depth
  //     compensating against size.
  function setFov(deg, { compensate = false } = {}) {
    const oldFov = camera.fov;
    if (compensate && oldFov && deg !== oldFov) {
      const ratio = Math.tan(THREE.MathUtils.degToRad(oldFov) / 2) /
                    Math.tan(THREE.MathUtils.degToRad(deg) / 2);
      compensateDistanceFromCamera(referenceGroup, ratio);
      if (mirror.isEnabled()) compensateDistanceFromCamera(mirror.group, ratio);
    }
    camera.fov = deg;
    camera.updateProjectionMatrix();
  }

  // Scale obj's distance along the camera forward direction by `ratio`,
  // leaving its perpendicular offset alone. This is exactly what keeps
  // apparent size constant under a FOV change.
  function compensateDistanceFromCamera(obj, ratio) {
    const camFwd = new THREE.Vector3();
    camera.getWorldDirection(camFwd);
    const fromCam = new THREE.Vector3().subVectors(obj.position, camera.position);
    const along   = fromCam.dot(camFwd);
    obj.position.addScaledVector(camFwd, along * (ratio - 1));
  }

  function setReferenceOpacity(value01) {
    refMaterial.opacity = value01;
    refMaterial.transparent = value01 < 1.0;
  }

  function resetReference() {
    referenceGroup.position.copy(referenceInitial.pos);
    referenceGroup.rotation.copy(referenceInitial.rot);
  }

  function resize(w, h) {
    renderer.setSize(w, h, false);
    canvas.style.width  = w + 'px';
    canvas.style.height = h + 'px';
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
  }

  (function animate() {
    renderer.render(scene, camera);
    requestAnimationFrame(animate);
  })();

  return {
    camera, scene, referenceGroup, mirror,
    loadReferenceSTL, setFov, setReferenceOpacity, resetReference, resize,
  };
}
