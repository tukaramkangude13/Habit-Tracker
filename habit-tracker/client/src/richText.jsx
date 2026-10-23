import { Extension } from '@tiptap/core';

// Custom font-size extension
export const FontSize = Extension.create({
  name: 'fontSize',

  addOptions() {
    return { types: ['textStyle'] };
  },

  addGlobalAttributes() {
    return [
      {
        types: this.options.types,
        attributes: {
          fontSize: {
            default: null,
            parseHTML: (el) => el.style.fontSize || null,
            renderHTML: (attrs) =>
              attrs.fontSize
                ? { style: `font-size: ${attrs.fontSize}` }
                : {},
          },
        },
      },
    ];
  },

  addCommands() {
    return {
      setFontSize:
        (size) =>
        ({ chain }) =>
          chain().setMark('textStyle', { fontSize: size }).run(),

      unsetFontSize:
        () =>
        ({ chain }) =>
          chain()
            .setMark('textStyle', { fontSize: null })
            .removeEmptyTextStyle()
            .run(),
    };
  },
});

// Compress images before inserting them into notes
export async function compressImage(file, max = 1000) {
  const url = URL.createObjectURL(file);

  try {
    const img = await new Promise((resolve, reject) => {
      const image = new Image();
      image.onload = () => resolve(image);
      image.onerror = reject;
      image.src = url;
    });

    const scale = Math.min(
      1,
      max / Math.max(img.width, img.height)
    );

    const canvas = document.createElement('canvas');
    canvas.width = Math.round(img.width * scale);
    canvas.height = Math.round(img.height * scale);

    const ctx = canvas.getContext('2d');

    if (!ctx) {
      throw new Error('Could not create image canvas.');
    }

    ctx.fillStyle = '#fff';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    ctx.drawImage(
      img,
      0,
      0,
      canvas.width,
      canvas.height
    );

    return canvas.toDataURL('image/jpeg', 0.72);
  } finally {
    URL.revokeObjectURL(url);
  }
}

// Escape text before inserting it into SVG
const esc = (value) =>
  String(value).replace(/[&<>"]/g, (char) => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
  })[char]);

// Calculate a readable chart-axis maximum
const nice = (value) => {
  const power = 10 ** Math.floor(Math.log10(value));
  const normalized = value / power;

  return (
    normalized <= 1 ? 1 :
    normalized <= 2 ? 2 :
    normalized <= 5 ? 5 : 10
  ) * power;
};

// Convert SVG markup into a data URL
export const svgToDataUrl = (svg) =>
  'data:image/svg+xml;base64,' +
  btoa(unescape(encodeURIComponent(svg)));

// Create a bar or line chart
// rows: [[label, number], ...]
export function chartSvg({ type, title, rows }) {
  if (!rows.length) {
    throw new Error('At least one chart data row is required.');
  }

  const W = 640;
  const H = 380;
  const L = 56;
  const R = 24;
  const T = 56;
  const B = 80;

  const iw = W - L - R;
  const ih = H - T - B;

  const top = nice(Math.max(...rows.map((row) => row[1]), 1));

  const y = (value) => T + ih - (value / top) * ih;
  const cx = (index) => L + ((index + 0.5) * iw) / rows.length;

  let body = '';

  for (let i = 0; i <= 4; i++) {
    const value = (top * i) / 4;

    body += `
      <line x1="${L}" x2="${W - R}"
        y1="${y(value)}" y2="${y(value)}"
        stroke="#e4e4e7"/>
      <text x="${L - 8}" y="${y(value) + 4}"
        text-anchor="end" font-size="11" fill="#71717a">
        ${Number(value.toFixed(2))}
      </text>
    `;
  }

  if (type === 'bar') {
    const barWidth = Math.min(
      60,
      (iw / rows.length) * 0.6
    );

    rows.forEach(([, value], index) => {
      body += `
        <rect
          x="${cx(index) - barWidth / 2}"
          y="${y(value)}"
          width="${barWidth}"
          height="${T + ih - y(value)}"
          rx="3"
          fill="#4f46e5"
        />
        <text x="${cx(index)}" y="${y(value) - 6}"
          text-anchor="middle" font-size="11" fill="#3f3f46">
          ${value}
        </text>
      `;
    });
  } else if (type === 'line') {
    body += `
      <polyline
        points="${rows.map(([, value], index) =>
          `${cx(index)},${y(value)}`
        ).join(' ')}"
        fill="none"
        stroke="#4f46e5"
        stroke-width="3"
      />
    `;

    rows.forEach(([, value], index) => {
      body += `
        <circle cx="${cx(index)}" cy="${y(value)}"
          r="4" fill="#4f46e5"/>
        <text x="${cx(index)}" y="${y(value) - 10}"
          text-anchor="middle" font-size="11" fill="#3f3f46">
          ${value}
        </text>
      `;
    });
  } else {
    throw new Error('Unsupported chart type.');
  }

  rows.forEach(([label], index) => {
    const text = label.length > 14
      ? label.slice(0, 13) + '…'
      : label;

    const x = cx(index);
    const yy = T + ih + 18;

    body += rows.length > 8
      ? `
        <text x="${x}" y="${yy}"
          text-anchor="end" font-size="11" fill="#52525b"
          transform="rotate(-35 ${x} ${yy})">
          ${esc(text)}
        </text>
      `
      : `
        <text x="${x}" y="${yy}"
          text-anchor="middle" font-size="11" fill="#52525b">
          ${esc(text)}
        </text>
      `;
  });

  return `
    <svg xmlns="http://www.w3.org/2000/svg"
      width="${W}" height="${H}"
      viewBox="0 0 ${W} ${H}"
      font-family="Arial, sans-serif">
      <rect width="${W}" height="${H}" fill="#fff"/>
      <text x="${W / 2}" y="30"
        text-anchor="middle" font-size="18"
        font-weight="bold" fill="#18181b">
        ${esc(title)}
      </text>
      ${body}
    </svg>
  `;
}
