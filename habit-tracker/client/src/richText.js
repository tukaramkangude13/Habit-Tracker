import { Extension } from '@tiptap/core';

// Adds a font-size option to the editor.
export const FontSize = Extension.create({
  name: 'fontSize',
  addOptions() { return { types: ['textStyle'] }; },
  addGlobalAttributes() {
    return [{
      types: this.options.types,
      attributes: {
        fontSize: {
          default: null,
          parseHTML: (el) => el.style.fontSize || null,
          renderHTML: (a) => (a.fontSize ? { style: `font-size: ${a.fontSize}` } : {}),
        },
      },
    }];
  },
  addCommands() {
    return {
      setFontSize: (size) => ({ chain }) => chain().setMark('textStyle', { fontSize: size }).run(),
      unsetFontSize: () => ({ chain }) => chain().setMark('textStyle', { fontSize: null }).removeEmptyTextStyle().run(),
    };
  },
});

// Shrinks a picture so notes stay small: max 1000px, JPEG.
export async function compressImage(file, max = 1000) {
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = rej; i.src = url; });
    const s = Math.min(1, max / Math.max(img.width, img.height));
    const c = document.createElement('canvas');
    c.width = Math.round(img.width * s); c.height = Math.round(img.height * s);
    const ctx = c.getContext('2d');
    ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, c.width, c.height);
    ctx.drawImage(img, 0, 0, c.width, c.height);
    return c.toDataURL('image/jpeg', 0.72);
  } finally { URL.revokeObjectURL(url); }
}

const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const nice = (v) => { const p = 10 ** Math.floor(Math.log10(v)); const n = v / p; return (n <= 1 ? 1 : n <= 2 ? 2 : n <= 5 ? 5 : 10) * p; };
export const svgToDataUrl = (svg) => 'data:image/svg+xml;base64,' + btoa(unescape(encodeURIComponent(svg)));

// rows: [[label, number], ...]; type: 'bar' | 'line'
export function chartSvg({ type, title, rows }) {
  const W = 640, H = 380, L = 56, R = 24, T = 56, B = 80, iw = W - L - R, ih = H - T - B;
  const top = nice(Math.max(...rows.map((r) => r[1]), 1));
  const y = (v) => T + ih - (v / top) * ih;
  const cx = (i) => L + ((i + 0.5) * iw) / rows.length;
  let body = '';
  for (let i = 0; i <= 4; i++) {
    const v = (top * i) / 4;
    body += `<line x1="${L}" x2="${W - R}" y1="${y(v)}" y2="${y(v)}" stroke="#e4e4e7"/><text x="${L - 8}" y="${y(v) + 4}" text-anchor="end" font-size="11" fill="#71717a">${+v.toFixed(2)}</text>`;
  }
  if (type === 'bar') {
    const bw = Math.min(60, (iw / rows.length) * 0.6);
    rows.forEach(([, v], i) => {
      body += `<rect x="${cx(i) - bw / 2}" y="${y(v)}" width="${bw}" height="${T + ih - y(v)}" rx="3" fill="#4f46e5"/><text x="${cx(i)}" y="${y(v) - 6}" text-anchor="middle" font-size="11" fill="#3f3f46">${v}</text>`;
    });
  } else {
    body += `<polyline points="${rows.map(([, v], i) => `${cx(i)},${y(v)}`).join(' ')}" fill="none" stroke="#4f46e5" stroke-width="3"/>`;
    rows.forEach(([, v], i) => { body += `<circle cx="${cx(i)}" cy="${y(v)}" r="4" fill="#4f46e5"/><text x="${cx(i)}" y="${y(v) - 10}" text-anchor="middle" font-size="11" fill="#3f3f46">${v}</text>`; });
  }
  rows.forEach(([l], i) => {
    const t = l.length > 14 ? l.slice(0, 13) + '…' : l, x = cx(i), yy = T + ih + 18;
    body += rows.length > 8
      ? `<text x="${x}" y="${yy}" text-anchor="end" font-size="11" fill="#52525b" transform="rotate(-35 ${x} ${yy})">${esc(t)}</text>`
      : `<text x="${x}" y="${yy}" text-anchor="middle" font-size="11" fill="#52525b">${esc(t)}</text>`;
  });
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" font-family="Arial, sans-serif"><rect width="${W}" height="${H}" fill="#fff"/><text x="${W / 2}" y="30" text-anchor="middle" font-size="18" font-weight="bold" fill="#18181b">${esc(title)}</text>${body}</svg>`;
}
