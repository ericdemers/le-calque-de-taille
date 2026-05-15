// mirror.js — virtual dental mirror disc.
//
// A dentist constantly views lingual and occlusal surfaces *through* a hand
// mirror. Aligning a virtual disc with the real mirror in the photo lets the
// student verify their mental model of "what is reflected here corresponds
// to *that* surface of the 3D anatomy" — a core perceptual skill.
//
// Implementation note (the shader-uniform hack):
//   three.js's stock Reflector outputs alpha = 1.0 even when its material is
//   set transparent, so you can't fade the reflection by simply lowering the
//   material's opacity. We patch the fragment shader to multiply gl_FragColor
//   by an `opacity` uniform we inject. This lets the student see the photo's
//   real mirror reflection THROUGH the virtual one, for side-by-side
//   comparison. Inherited from ../prep-grade/scripts/align.html.

import * as THREE from 'three';
import { Reflector } from 'three/addons/objects/Reflector.js';

const DEFAULT_RADIUS_MM      = 11.0;
const DEFAULT_OPACITY        = 1.0;
const DEFAULT_POSITION       = [0, -15, -5];
const DEFAULT_ROTATION_DEG   = [-45, 0, 0];
const REFLECTOR_TEX_SIZE     = 1024;
const RING_COLOR             = 0xffd84d;
const RING_THICKNESS_MM      = 0.25;

export function createMirror(scene) {
  const group = new THREE.Group();
  group.visible = false;
  scene.add(group);

  const state = {
    enabled: false,
    radius:  DEFAULT_RADIUS_MM,
    opacity: DEFAULT_OPACITY,
  };
  let reflector = null;
  let ring = null;

  const d2r = Math.PI / 180;
  group.position.fromArray(DEFAULT_POSITION);
  group.rotation.set(
    DEFAULT_ROTATION_DEG[0] * d2r,
    DEFAULT_ROTATION_DEG[1] * d2r,
    DEFAULT_ROTATION_DEG[2] * d2r,
  );

  function build() {
    teardown();
    const refGeom = new THREE.CircleGeometry(state.radius, 64);
    reflector = new Reflector(refGeom, {
      textureWidth:  REFLECTOR_TEX_SIZE,
      textureHeight: REFLECTOR_TEX_SIZE,
      color: 0xc0c0c8,
    });

    const m = reflector.material;
    m.uniforms.opacity = { value: state.opacity };
    m.transparent = true;
    m.depthWrite  = false;
    m.fragmentShader = 'uniform float opacity;\n' + m.fragmentShader.replace(
      /gl_FragColor\s*=\s*vec4\s*\(\s*blendOverlay\(\s*base\.rgb\s*,\s*color\s*\)\s*,\s*1\.0\s*\)\s*;/,
      'gl_FragColor = vec4( blendOverlay( base.rgb, color ), opacity );',
    );
    m.needsUpdate = true;
    group.add(reflector);

    const ringGeom = new THREE.TorusGeometry(state.radius, RING_THICKNESS_MM, 8, 64);
    const ringMat  = new THREE.MeshBasicMaterial({ color: RING_COLOR });
    ring = new THREE.Mesh(ringGeom, ringMat);
    group.add(ring);
  }

  function teardown() {
    if (reflector) {
      group.remove(reflector);
      reflector.geometry.dispose();
      reflector = null;
    }
    if (ring) {
      group.remove(ring);
      ring.geometry.dispose();
      ring.material.dispose();
      ring = null;
    }
  }

  function setEnabled(on) {
    state.enabled = !!on;
    group.visible = state.enabled;
    if (state.enabled && !reflector) build();
  }

  // Radius change → rebuild geometry (circle + torus).
  function setRadius(mm) {
    state.radius = mm;
    if (state.enabled) build();
  }

  function setOpacity(v01) {
    state.opacity = v01;
    if (reflector?.material.uniforms.opacity) {
      reflector.material.uniforms.opacity.value = v01;
    }
  }

  function applyPose(pose) {
    if (Array.isArray(pose?.position)) group.position.fromArray(pose.position);
    if (Array.isArray(pose?.rotation_deg)) {
      const [rx, ry, rz] = pose.rotation_deg;
      group.rotation.set(rx * d2r, ry * d2r, rz * d2r);
    }
  }

  function dumpPose() {
    return {
      position: group.position.toArray().map(v => +v.toFixed(2)),
      rotation_deg: [group.rotation.x, group.rotation.y, group.rotation.z]
        .map(v => +(v * 180 / Math.PI).toFixed(1)),
      radius:  state.radius,
      opacity: state.opacity,
    };
  }

  return {
    group,
    setEnabled, setRadius, setOpacity,
    applyPose,  dumpPose,
    isEnabled: () => state.enabled,
  };
}
