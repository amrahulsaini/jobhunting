import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';

const KEY = process.env.GEMINI_API_KEY;
const DIR = 'D:/jobhunting-live/jobhunting/public/assets/video';
const BASE = 'https://generativelanguage.googleapis.com/v1beta';

const sleep = ms => new Promise(r => setTimeout(r, ms));

async function uploadFile(buf, mime) {
  const init = await fetch(`https://generativelanguage.googleapis.com/upload/v1beta/files?key=${KEY}`, {
    method: 'POST',
    headers: {
      'X-Goog-Upload-Protocol': 'resumable',
      'X-Goog-Upload-Command': 'start',
      'X-Goog-Upload-Header-Content-Length': String(buf.length),
      'X-Goog-Upload-Header-Content-Type': mime,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ file: { display_name: 'check' } }),
  });
  const url = init.headers.get('x-goog-upload-url');
  if (!url) throw new Error(`no upload url: ${await init.text()}`);

  const up = await fetch(url, {
    method: 'POST',
    headers: { 'X-Goog-Upload-Command': 'upload, finalize', 'X-Goog-Upload-Offset': '0' },
    body: buf,
  });
  let file = (await up.json()).file;
  while (file.state === 'PROCESSING') {
    await sleep(4000);
    file = await (await fetch(`${BASE}/files/${file.name.split('/').pop()}?key=${KEY}`)).json();
  }
  if (file.state !== 'ACTIVE') throw new Error(`file state ${file.state}`);
  return file;
}

// Flash rather than a heavy thinking model: the earlier pass burned its whole
// output budget on reasoning and returned an empty string.
async function inspect(file) {
  const res = await fetch(`${BASE}/models/gemini-2.5-flash:generateContent?key=${KEY}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contents: [{
        parts: [
          { fileData: { fileUri: file.uri, mimeType: 'video/mp4' } },
          { text: `Watch every frame. Reply with STRICT JSON only, no markdown:
{"hasText":bool,"textSeen":"","hasColor":bool,"description":"one sentence"}
hasText = true if ANY letters, words, numerals, handwriting or writing-like squiggles appear.
hasColor = true if anything is not black, white or grey.` },
        ],
      }],
      generationConfig: { temperature: 0, maxOutputTokens: 2048 },
    }),
  });
  const j = await res.json();
  const txt = j.candidates?.[0]?.content?.parts?.map(p => p.text ?? '').join('') ?? '';
  if (!txt) return { hasText: null, raw: JSON.stringify(j).slice(0, 300) };
  try { return JSON.parse(txt.replace(/```json|```/g, '').trim()); }
  catch { return { hasText: null, raw: txt.slice(0, 200) }; }
}

const files = (await readdir(DIR)).filter(f => f.endsWith('.mp4'));
for (const f of files) {
  const buf = await readFile(path.join(DIR, f));
  try {
    const v = await inspect(await uploadFile(buf, 'video/mp4'));
    const bad = v.hasText === true || v.hasColor === true;
    console.log(
      `${bad ? 'FLAG' : v.hasText === null ? '????' : 'ok  '} ${f.padEnd(22)} ` +
      `${(buf.length / 1048576).toFixed(1)}MB  hasText=${v.hasText} hasColor=${v.hasColor}` +
      (v.textSeen ? ` text="${v.textSeen}"` : '') + (v.description ? `\n     ${v.description}` : '') +
      (v.raw ? `\n     raw: ${v.raw}` : '')
    );
  } catch (e) {
    console.log(`ERR  ${f}: ${e.message}`);
  }
}
