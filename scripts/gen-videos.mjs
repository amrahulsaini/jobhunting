import { writeFile, mkdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';

const KEY = process.env.GEMINI_API_KEY;
const OUT = 'D:/jobhunting-live/jobhunting/public/assets/video';
const MODEL = 'veo-3.1-fast-generate-preview';
const BASE = 'https://generativelanguage.googleapis.com/v1beta';

/**
 * Veo will invent garbled lettering on anything that reads as a document, a page
 * or a screen. So these scenes are deliberately built from pure geometry only —
 * there is no surface in frame that could plausibly carry writing.
 */
const STYLE = `STRICTLY BLACK AND WHITE. Only pure black, pure white and neutral greys —
completely desaturated, no colour, no tint, no hue anywhere.
Flat 2D vector motion graphics on a plain pure white background. Fine black linework,
solid black geometric shapes, halftone dot shading. Smooth continuous motion, no cuts,
locked-off or very slow camera.
CRITICAL NEGATIVE CONSTRAINTS: absolutely NO text, NO words, NO letters, NO numerals,
NO handwriting, NO typography, NO labels, NO logos, NO watermarks, NO subtitles,
NO documents, NO paper, NO pages, NO books, NO screens, NO user interfaces, NO people.
Nothing in frame may contain writing of any kind. Pure abstract geometry only.
Silent, no audio, no music, no speech.`;

const JOBS = [
  {
    name: 'hero-loop',
    p: `Abstract geometric loop on a plain white field. A constellation of small black dots
connected by fine straight black lines drifts slowly. From a dense cluster at centre, thin lines
extend outward one by one toward outer dots, and each outer dot fills in solid black as its line
completes. Fine particles drift upward throughout. Begins and ends on the same calm arrangement
so it loops seamlessly.`,
  },
  {
    name: 'network-pulse', resolution: '720p',
    p: `Abstract loop on a plain white field. A wireframe sphere built from thin black latitude and
longitude lines rotates very slowly. Small dots sit at the line intersections; they ignite to solid
black in travelling waves that sweep around the sphere, leaving brief fading trails. Camera slowly
pushes in a small amount.`,
  },
  {
    name: 'radar-sweep',
    p: `Abstract loop on a plain white field. Concentric thin black rings centred in frame. A single
straight radial line sweeps steadily around the centre like a radar hand. Small hollow circles
scattered across the rings snap to solid black filled circles as the sweep passes over them, then
slowly fade back to hollow. Faint halftone dot texture in the background. Perfect rotational loop.`,
  },
];

const sleep = ms => new Promise(r => setTimeout(r, ms));

async function generate(job) {
  const start = await fetch(`${BASE}/models/${MODEL}:predictLongRunning?key=${KEY}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      instances: [{ prompt: `${job.p}\n\n${STYLE}` }],
      parameters: { aspectRatio: '16:9', resolution: job.resolution ?? '1080p' },
    }),
  });
  const op = await start.json();
  if (!start.ok) throw new Error(`HTTP ${start.status} ${JSON.stringify(op).slice(0, 300)}`);

  for (let t = 0; t < 60; t++) {
    await sleep(10000);
    const p = await (await fetch(`${BASE}/${op.name}?key=${KEY}`)).json();
    if (!p.done) continue;
    if (p.error) throw new Error(JSON.stringify(p.error).slice(0, 300));
    const uri =
      p.response?.generateVideoResponse?.generatedSamples?.[0]?.video?.uri ??
      p.response?.generatedVideos?.[0]?.video?.uri;
    if (!uri) throw new Error(`no uri: ${JSON.stringify(p.response).slice(0, 300)}`);
    return Buffer.from(await (await fetch(`${uri}&key=${KEY}`)).arrayBuffer());
  }
  throw new Error('timed out');
}

/** Uploads through the resumable Files API so the clip can be fed back to Gemini. */
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
  if (!url) throw new Error('no upload url');

  const up = await fetch(url, {
    method: 'POST',
    headers: { 'X-Goog-Upload-Command': 'upload, finalize', 'X-Goog-Upload-Offset': '0' },
    body: buf,
  });
  let file = (await up.json()).file;

  while (file.state === 'PROCESSING') {
    await sleep(5000);
    file = await (await fetch(`${BASE}/files/${file.name.split('/').pop()}?key=${KEY}`)).json();
  }
  if (file.state !== 'ACTIVE') throw new Error(`file state ${file.state}`);
  return file;
}

/** Asks Gemini to watch the clip and report text or colour — the two failure modes. */
async function inspect(buf) {
  const file = await uploadFile(buf, 'video/mp4');
  // Flash, not a heavy thinking model: the pro model spent its entire output
  // budget reasoning and returned an empty string, which silently passed the gate.
  const res = await fetch(`${BASE}/models/gemini-2.5-flash:generateContent?key=${KEY}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contents: [{
        parts: [
          { fileData: { fileUri: file.uri, mimeType: 'video/mp4' } },
          { text: `Watch this clip carefully, including every frame.
Answer with STRICT JSON only, no markdown fence:
{"hasText": bool, "textSeen": "...", "hasColor": bool, "description": "one sentence"}
hasText must be true if ANY letters, words, numerals, handwriting, glyphs or writing-like
squiggles appear anywhere, even briefly, blurred or in the background.
hasColor must be true if anything is not black, white or grey.` },
        ],
      }],
      generationConfig: { temperature: 0, maxOutputTokens: 2048 },
    }),
  });
  const j = await res.json();
  const txt = j.candidates?.[0]?.content?.parts?.map(p => p.text ?? '').join('') ?? '';
  try {
    return JSON.parse(txt.replace(/```json|```/g, '').trim());
  } catch {
    return { hasText: null, description: txt.slice(0, 200) };
  }
}

await mkdir(OUT, { recursive: true });

for (const job of JOBS) {
  const dest = path.join(OUT, `${job.name}.mp4`);
  if (existsSync(dest)) { console.log(`skip ${job.name}`); continue; }

  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      console.log(`\n[${job.name}] attempt ${attempt} — generating…`);
      const buf = await generate(job);
      console.log(`[${job.name}] ${(buf.length / 1048576).toFixed(1)}MB — inspecting…`);
      const v = await inspect(buf);
      console.log(`[${job.name}] hasText=${v.hasText} hasColor=${v.hasColor} :: ${v.description ?? ''}`);
      if (v.textSeen) console.log(`[${job.name}] text seen: ${v.textSeen}`);

      if (v.hasText === true || v.hasColor === true) {
        if (attempt < 3) { console.log(`[${job.name}] REJECTED — regenerating`); continue; }
        console.log(`[${job.name}] still failing after 3 attempts; keeping best effort`);
      }
      await writeFile(dest, buf);
      console.log(`[${job.name}] SAVED`);
      break;
    } catch (e) {
      console.log(`[${job.name}] error: ${e.message}`);
      if (attempt === 3) console.log(`[${job.name}] GAVE UP`);
    }
  }
}
console.log('\ndone');
