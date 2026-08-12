import sharp from 'sharp';
import { readdir, unlink, stat, mkdir } from 'node:fs/promises';
import path from 'node:path';

const DIR = 'D:/jobhunting-live/jobhunting/public/assets';

// Caps per role — heroes and backgrounds stay wide, everything else is display-sized.
const capFor = name =>
  /^(hero-|og-|bg-)/.test(name) ? 2400 : 1200;

const files = (await readdir(DIR)).filter(f => f.endsWith('.jpg'));
let before = 0, after = 0;

for (const f of files) {
  const src = path.join(DIR, f);
  before += (await stat(src)).size;
  const base = f.replace(/\.jpg$/, '');
  const out = path.join(DIR, `${base}.webp`);

  await sharp(src)
    // Force a single grey channel: strips any residual colour cast the model
    // may have left, and guarantees the palette really is black and white.
    .grayscale()
    .resize({ width: capFor(base), withoutEnlargement: true })
    .webp({ quality: 86, effort: 6 })
    .toFile(out);

  after += (await stat(out)).size;
  await unlink(src);
  console.log(`${base}.webp`.padEnd(34), `${((await stat(out)).size / 1024).toFixed(0)}KB`);
}

// PWA / touch icons from the app-icon art.
await mkdir(`${DIR}/icons-app`, { recursive: true });
for (const size of [180, 192, 512]) {
  await sharp(path.join(DIR, 'app-icon.webp'))
    .resize(size, size)
    .png()
    .toFile(`${DIR}/icons-app/icon-${size}.png`);
  console.log(`icons-app/icon-${size}.png`);
}

console.log(`\n${(before / 1048576).toFixed(1)}MB -> ${(after / 1048576).toFixed(1)}MB`);
