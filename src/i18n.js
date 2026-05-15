// i18n.js — minimal locale switcher. No framework, two languages, JSON files.
//
// Add a new language by dropping `i18n/<code>.json` into the folder and
// adding the code to LOADED below. UX strings live in those JSON files,
// not in code.

const LOADED = ['fr', 'en'];
const DEFAULT = 'fr';

const dict = Object.fromEntries(LOADED.map(k => [k, {}]));
let locale = DEFAULT;

export async function init() {
  await Promise.all(LOADED.map(async code => {
    dict[code] = await fetch(`i18n/${code}.json`).then(r => r.json());
  }));
  const stored = localStorage.getItem('locale');
  if (stored && dict[stored]) locale = stored;
  else if (navigator.language?.startsWith('en')) locale = 'en';
  apply();
}

export function t(key) {
  return dict[locale][key] ?? dict[DEFAULT][key] ?? key;
}

export function setLocale(next) {
  if (!dict[next]) return;
  locale = next;
  localStorage.setItem('locale', next);
  apply();
}

export function toggleLocale() {
  const i = LOADED.indexOf(locale);
  setLocale(LOADED[(i + 1) % LOADED.length]);
}

export function getLocale() { return locale; }

function apply() {
  document.documentElement.lang = locale;
  document.querySelectorAll('[data-i18n]').forEach(el => {
    const key = el.getAttribute('data-i18n');
    el.textContent = t(key);
  });
}
