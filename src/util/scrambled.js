// Reads the published photographs. They are stored tile-shuffled with a masked JPEG header
// (see write_scrambled in tools/build_assets.py) so there is no viewable image file to download;
// this reassembles them in memory onto a canvas.

function mulberry32(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1) >>> 0;
    t = (t ^ ((t + (Math.imul(t ^ (t >>> 7), t | 61) >>> 0)) >>> 0)) >>> 0;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export async function loadScrambled(url) {
  const buf = await (await fetch(url)).arrayBuffer();
  const dv = new DataView(buf);
  const magic = String.fromCharCode(dv.getUint8(0), dv.getUint8(1), dv.getUint8(2), dv.getUint8(3));
  if (magic !== 'TPS1') throw new Error('not a tapestry image: ' + url);
  const W = dv.getUint16(4, true), H = dv.getUint16(6, true), tile = dv.getUint16(8, true);
  const cols = dv.getUint16(10, true), rows = dv.getUint16(12, true), seed = dv.getUint32(14, true);
  let o = 18;
  const nlen = dv.getUint16(o, true); o += 2 + nlen;
  const jlen = dv.getUint32(o, true); o += 4;
  const jpg = new Uint8Array(buf.slice(o, o + jlen));
  const k = mulberry32((seed ^ 0x5a5a5a5a) >>> 0);
  for (let i = 0; i < Math.min(2048, jpg.length); i++) jpg[i] ^= Math.floor(k() * 256);
  const shuffled = await createImageBitmap(new Blob([jpg], { type: 'image/jpeg' }));
  const rnd = mulberry32(seed);
  const n = cols * rows;
  const perm = Array.from({ length: n }, (_, i) => i);
  for (let i = n - 1; i > 0; i--) {
    const j = Math.floor(rnd() * (i + 1));
    const t = perm[i]; perm[i] = perm[j]; perm[j] = t;
  }
  const c = document.createElement('canvas');
  c.width = W; c.height = H;
  const g = c.getContext('2d');
  for (let i = 0; i < n; i++) {
    const src = perm[i];
    g.drawImage(shuffled, (i % cols) * tile, Math.floor(i / cols) * tile, tile, tile, (src % cols) * tile, Math.floor(src / cols) * tile, tile, tile);
  }
  shuffled.close?.();
  return c;
}
