// exif.js — read FocalLengthIn35mmFilm and convert to Three.js vertical FOV.
//
// 35 mm film frame = 36 mm wide × 24 mm tall. Three.js PerspectiveCamera
// uses VERTICAL FOV. For a landscape photo, the long side is horizontal,
// so vertical = 24 mm → half = 12 mm. For a portrait photo (EXIF
// Orientation 6 or 8), the long side is vertical, so vertical = 36 mm →
// half = 18 mm.

import exifr from 'exifr';

const HALF_LANDSCAPE_MM = 12;
const HALF_PORTRAIT_MM  = 18;

export async function readFovFromFile(fileOrUrl) {
  try {
    const meta = await exifr.parse(fileOrUrl, {
      pick: [
        'FocalLengthIn35mmFilm',
        'FocalLength',
        'Orientation',
        'Make', 'Model', 'LensModel',
      ],
    });
    if (!meta?.FocalLengthIn35mmFilm) return null;
    const f35 = meta.FocalLengthIn35mmFilm;
    const isPortrait = meta.Orientation === 6 || meta.Orientation === 8;
    const halfMm = isPortrait ? HALF_PORTRAIT_MM : HALF_LANDSCAPE_MM;
    const fovDeg = 2 * Math.atan(halfMm / f35) * 180 / Math.PI;
    return {
      fovDeg: Math.round(fovDeg * 10) / 10,
      source: {
        f35,
        make:  meta.Make,
        model: meta.Model,
        lens:  meta.LensModel,
        orientation: meta.Orientation ?? 1,
      },
    };
  } catch {
    return null;
  }
}
