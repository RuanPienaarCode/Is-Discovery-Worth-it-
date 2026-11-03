'use strict';
/* Nunito, the page's typeface, from the base64 faces in src/fonts.js.
   Obsidian's community store installs only main.js, manifest.json and
   styles.css, so the faces travel inside main.js and are handed to the
   browser with the FontFace API from an ArrayBuffer (no data: URI, no
   network). A face that fails to load costs only that weight: the CSS
   falls back to the system font. unload() takes every face back off the
   page, so turning the plugin off leaves nothing behind.
   Nunito is under the SIL Open Font License 1.1 (assets/fonts/OFL.txt). */

const FAMILY = 'DW Nunito';

/* base64 → ArrayBuffer, with atob (there in every WebView this runs in) */
function toBuffer(b64) {
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out.buffer;
}

/* opts: { faces: { [weight]: base64 }, doc, FontFaceImpl, log } — the
   defaults are the real document and src/fonts.js; tests pass their own. */
function makeFontLoader(opts) {
  const o = opts || {};
  const doc = o.doc || (typeof document !== 'undefined' ? document : null);
  const Impl = o.FontFaceImpl || (typeof FontFace === 'function' ? FontFace : null);
  const log = o.log || console;
  let loading = null;
  let gen = 0;
  const added = [];

  function load() {
    if (loading) return loading;
    if (!doc || !doc.fonts || !Impl) return Promise.resolve(0);
    const g = gen;
    const faces = o.faces || require('./fonts').FONTS;
    loading = Promise.all(Object.keys(faces).map(async w => {
      try {
        const face = new Impl(FAMILY, toBuffer(faces[w]), { weight: String(w), style: 'normal', display: 'swap' });
        await face.load();
        /* unloaded while this face was still loading: do not add it */
        if (g !== gen) return 0;
        doc.fonts.add(face);
        added.push(face);
        return 1;
      } catch (e) {
        log.warn(`[discovery-worth-it] font ${w}: ${e && e.message ? e.message : e}`);
        return 0;
      }
    })).then(n => n.reduce((a, b) => a + b, 0));
    return loading;
  }

  function unload() {
    gen += 1;
    for (const face of added.splice(0)) { try { doc.fonts.delete(face); } catch (e) { /* already gone */ } }
    loading = null;
  }

  return { load, unload };
}

module.exports = { makeFontLoader, FAMILY };
