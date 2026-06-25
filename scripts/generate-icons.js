// Genera los iconos de la app recortando el isotipo del logo (sin texto)
const { Jimp } = require('jimp');
const fs = require('fs');
const path = require('path');

const LOGO_PATH = 'c:/Users/yohanna/Downloads/logo 3 1.jpg.jpeg';
const ASSETS   = path.join(__dirname, '../assets/images');

async function detectOrangeBounds(img) {
  const w = img.width;
  const h = img.height;
  let top = h, bottom = 0, left = w, right = 0;

  img.scan((x, y, idx) => {
    const r = img.bitmap.data[idx];
    const g = img.bitmap.data[idx + 1];
    const b = img.bitmap.data[idx + 2];
    // naranja: R alto, G medio, B bajo
    if (r > 180 && g > 100 && g < 200 && b < 80) {
      if (y < top)    top    = y;
      if (y > bottom) bottom = y;
      if (x < left)   left   = x;
      if (x > right)  right  = x;
    }
  });

  return { top, bottom, left, right };
}

async function main() {
  const buf = fs.readFileSync(LOGO_PATH);
  const img = await Jimp.fromBuffer(buf);

  console.log(`Logo original: ${img.width}x${img.height}`);

  const { top, bottom, left, right } = await detectOrangeBounds(img);
  console.log(`Bounds naranja: top=${top} bottom=${bottom} left=${left} right=${right}`);

  // Recorte cuadrado centrado sobre el isotipo (padding pequeño)
  const pad    = 10;
  const cx     = Math.round((left + right) / 2);
  const cy     = Math.round((top + bottom) / 2);
  const half   = Math.round(Math.max(right - left, bottom - top) / 2) + pad;
  const x0     = Math.max(0, cx - half);
  const y0     = Math.max(0, cy - half);
  const size   = Math.min(half * 2, img.width - x0, img.height - y0);

  console.log(`Recorte: x=${x0} y=${y0} size=${size}`);

  const cropped = img.clone().crop({ x: x0, y: y0, w: size, h: size });

  // ── icon.png (1024x1024) ──────────────────────────────────────────────────
  const icon = cropped.clone().resize({ w: 1024, h: 1024 });
  await icon.write(path.join(ASSETS, 'icon.png'));
  console.log('✓ icon.png');

  // ── splash-icon.png (1024x1024) ───────────────────────────────────────────
  const splash = cropped.clone().resize({ w: 1024, h: 1024 });
  await splash.write(path.join(ASSETS, 'splash-icon.png'));
  console.log('✓ splash-icon.png');

  // ── icon-web.png (512x512) ────────────────────────────────────────────────
  const web = cropped.clone().resize({ w: 512, h: 512 });
  await web.write(path.join(ASSETS, 'icon-web.png'));
  console.log('✓ icon-web.png');

  // ── android-icon-foreground.png (1024x1024, con margen 15% para adaptive) ─
  // El adaptive icon muestra solo el 66% central; damos 18% de margen cada lado
  const margin = Math.round(1024 * 0.18);
  const innerSize = 1024 - margin * 2;
  const foreground = new Jimp({ width: 1024, height: 1024, color: 0x00000000 });
  const inner = cropped.clone().resize({ w: innerSize, h: innerSize });
  foreground.composite(inner, margin, margin);
  await foreground.write(path.join(ASSETS, 'android-icon-foreground.png'));
  console.log('✓ android-icon-foreground.png');

  console.log('\nTodos los iconos generados correctamente.');
}

main().catch(err => { console.error(err); process.exit(1); });
