// exif.js — read the 35 mm-equivalent focal length and convert to Three.js
// vertical FOV.
//
// 35 mm film frame = 36 mm wide × 24 mm tall. Three.js PerspectiveCamera
// uses VERTICAL FOV. For a landscape photo, the long side is horizontal,
// so vertical = 24 mm → half = 12 mm. For a portrait photo (EXIF
// Orientation 6 or 8), the long side is vertical, so vertical = 36 mm →
// half = 18 mm.
//
// Naming note: the EXIF spec / PIL / ExifTool call tag 0xA405
// `FocalLengthIn35mmFilm`, but exifr's tag dictionary spells it
// `FocalLengthIn35mmFormat`. We accept either.

import exifr from 'exifr';

const HALF_LANDSCAPE_MM = 12;
const HALF_PORTRAIT_MM  = 18;

export async function readFovFromFile(fileOrUrl) {
  try {
    const meta = await exifr.parse(fileOrUrl, {
      pick: [
        'FocalLengthIn35mmFilm',
        'FocalLengthIn35mmFormat',
        'FocalLength',
        'Orientation',
        'Make', 'Model', 'LensModel',
      ],
    });
    const f35 = meta?.FocalLengthIn35mmFilm ?? meta?.FocalLengthIn35mmFormat;
    if (!f35) return null;
    // exifr returns Orientation as a string ("Rotate 90 CW") or as the
    // numeric EXIF value; both forms appear in the wild.
    const o = meta.Orientation;
    const isPortrait =
      o === 6 || o === 8 ||
      o === 'Rotate 90 CW' || o === 'Rotate 270 CW';
    const halfMm = isPortrait ? HALF_PORTRAIT_MM : HALF_LANDSCAPE_MM;
    const fovDeg = 2 * Math.atan(halfMm / f35) * 180 / Math.PI;
    return {
      fovDeg:   Math.round(fovDeg * 10) / 10,
      focaleMm: f35,
      source: {
        f35,
        make:  meta.Make,
        model: meta.Model,
        lens:  meta.LensModel,
        orientation: o ?? 1,
      },
    };
  } catch {
    return null;
  }
}
