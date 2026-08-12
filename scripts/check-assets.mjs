import sharp from 'sharp';
import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';

const KEY = process.env.GEMINI_API_KEY;
const DIR = 'D:/jobhunting-live/jobhunting/public/assets';

/**
 * Image models happily render garbled pseudo-text onto anything paper-shaped.
 * This pass sends every still back through Gemini vision to catch it, and reports
 * true dimensions so the manifest stays honest after resizing.
 */
async function inspect(file) {
  const buf = await readFile(path.join(DIR, file));
  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-3-pro-preview:generateContent?key=${KEY}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{
          parts: [
            { inlineData: { mimeType: 'image/webp', data: buf.toString('base64') } },
            { text: `Answer with STRICT JSON only, no markdown fence:
{"hasText": bool, "textSeen": "...", "hasColor": bool}
hasText is true if ANY letters, words, numerals, handwriting, glyphs, or squiggles that
imitate writing appear anywhere in the image, even small, blurred or in the background.
Abstract dots, dashes and plain horizontal bars that do NOT imitate letterforms are not text.
hasColor is true if any pixel is not black, white or grey.` },
          ],
        }],
      }),
    }
  );
  const j = await res.json();
  const txt = j.candidates?.[0]?.content?.parts?.map(p => p.text).join('') ?? '';
  try { return JSON.parse(txt.replace(/```json|```/g, '').trim()); }
  catch { return { hasText: null, raw: txt.slice(0, 120) }; }
}

const files = (await readdir(DIR)).filter(f => f.endsWith('.webp'));
const flagged = [];

await Promise.all(files.map(async file => {
  const { width, height } = await sharp(path.join(DIR, file)).metadata();
  const v = await inspect(file);
  const bad = v.hasText === true || v.hasColor === true;
  if (bad) flagged.push({ file, ...v });
  console.log(
    `${bad ? 'FLAG' : 'ok  '} ${file.padEnd(32)} ${String(width).padStart(4)}x${String(height).padEnd(4)}` +
    (v.textSeen ? `  text="${v.textSeen}"` : '') + (v.hasColor ? '  COLOR' : '')
  );
}));

console.log(`\n${flagged.length} of ${files.length} flagged`);
if (flagged.length) console.log(flagged.map(f => f.file).join('\n'));
