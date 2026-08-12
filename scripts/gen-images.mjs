import { writeFile, mkdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';

const KEY = process.env.GEMINI_API_KEY;
const OUT = 'D:/jobhunting-live/jobhunting/public/assets';
const MODEL = 'gemini-3-pro-image';

// Strict black & white system — assets are designed to be CSS-invertible for dark mode.
const STYLE = `STRICTLY BLACK AND WHITE. Use only pure black #000000, pure white #FFFFFF and neutral greys.
Absolutely no colour, no hue, no tint, no saturation anywhere — completely desaturated monochrome.
High-contrast editorial vector illustration: precise fine ink linework, flat black fills,
halftone dot and hatch shading for midtones, Swiss / Bauhaus geometric clarity, generous negative space.
Pure white background. Crisp edges, no gradients except subtle grain.
Absolutely no text, no words, no letters, no numbers, no UI labels, no logos, no watermarks.
People shown only as simple abstract black silhouettes, no facial detail.`;

const JOBS = [
  // --- Hero / marketing ---
  { name: 'hero-main', ar: '16:9', size: '2K', p: `Wide hero illustration for an AI job-hunting product. Centre: a single resume document sheet floating, emitting fine ink data lines that fan outward into a constellation of small abstract company building cards and envelope shapes across a stylised globe grid. Sense of one document becoming many opportunities. Cinematic, spacious, left third kept visually calm and empty for headline placement.` },
  { name: 'og-image', ar: '16:9', size: '2K', p: `Social share card artwork. A resume sheet on the left connected by sweeping ink arcs to a cluster of envelope shapes and building silhouettes on the right. Bold, very high contrast, simple enough to read as a small thumbnail. Composition centred with wide margins.` },
  { name: 'hero-secondary', ar: '16:9', size: '2K', p: `Abstract wide banner: layered translucent panels arranged like a search pipeline, with small solid black markers travelling left to right along thin connector lines. Calm, technical, premium. Suitable as a section background.` },

  // --- The six product steps ---
  { name: 'step-1-upload-resume', ar: '4:3', size: '1K', p: `Step illustration: an abstract black silhouette figure dropping a resume document sheet into an intake portal shaped like a rounded rectangle. Upward motion arrows. Simple, friendly, single focal point.` },
  { name: 'step-2-parse-resume', ar: '4:3', size: '1K', p: `Step illustration: a resume document being decomposed by a scanning beam into neat floating chips representing skills and experience — abstract rounded pills and small geometric badges, no readable text. A magnifier lens over the sheet.` },
  { name: 'step-3-crawl-web', ar: '4:3', size: '1K', p: `Step illustration: a stylised wireframe globe wrapped in a spider-web network of nodes, with a small robot crawler travelling along the strands, discovering building-shaped nodes. Sense of wide automated search.` },
  { name: 'step-4-find-contacts', ar: '4:3', size: '1K', p: `Step illustration: a magnifier hovering over a stack of abstract company building cards, pulling out a solid black envelope and an abstract looping at-symbol shape. Sense of extracting a hidden contact detail.` },
  { name: 'step-5-draft-emails', ar: '4:3', size: '1K', p: `Step illustration: a four-pointed sparkle hovering over an open envelope, writing fine ink lines onto a letter that is composing itself. Several finished envelopes queue behind it, ready to send.` },
  { name: 'step-6-track-replies', ar: '4:3', size: '1K', p: `Step illustration: an abstract pipeline board with three columns of rounded cards moving left to right, some cards marked with a solid check-mark shape and a small reply arrow. Progress and momentum.` },

  // --- Feature / section art ---
  { name: 'feature-ai-matching', ar: '1:1', size: '1K', p: `Square feature graphic: a resume sheet at the centre of a radar sweep, with matching company nodes rendered as solid filled circles where the sweep passes and unmatched nodes left as thin empty outlines. Precision and relevance.` },
  { name: 'feature-inbox-automation', ar: '1:1', size: '1K', p: `Square feature graphic: a fan of envelopes launching upward out of an outbox tray along arcing trajectory lines, each with a small sparkle. Automated but crafted.` },
  { name: 'feature-privacy', ar: '1:1', size: '1K', p: `Square feature graphic: a resume document sheet held inside a translucent shield with a keyhole, hatch-shaded protective aura, small lock element. Trust and data safety.` },
  { name: 'feature-analytics', ar: '1:1', size: '1K', p: `Square feature graphic: abstract floating dashboard panels with simple bar and line shapes rising, a bold upward arrow, orbiting small envelope shapes. Insight and results, no readable numbers.` },

  // --- Empty / system states ---
  { name: 'state-empty-no-resume', ar: '4:3', size: '1K', p: `Friendly empty-state illustration: an empty dashed-outline document tray with a single faint resume outline hovering above it, gentle floating dots. Inviting, low-key, mostly white space, very light linework.` },
  { name: 'state-empty-no-matches', ar: '4:3', size: '1K', p: `Friendly empty-state illustration: a magnifier over an empty wireframe globe with only faint unfilled outline nodes, one small solid black dot far away suggesting hope. Calm, not sad. Mostly white space.` },
  { name: 'state-scanning', ar: '4:3', size: '1K', p: `Loading-state illustration: a resume sheet under a horizontal scanning beam with concentric ripple rings expanding outward and small data particles rising. Sense of active work in progress.` },
  { name: 'state-success-sent', ar: '4:3', size: '1K', p: `Success illustration: an envelope taking flight on an arcing trail with a bold check-mark burst and confetti-like geometric shards. Celebratory but restrained.` },
  { name: 'state-error-404', ar: '4:3', size: '1K', p: `Error-state illustration: a small abstract crawler robot standing at a broken, disconnected node in a network web, one strand dangling loose, a faint question-mark-like curved shape in the air. Charming, apologetic. No text.` },

  // --- Texture / background ---
  { name: 'bg-grain-field', ar: '16:9', size: '2K', p: `Abstract full-bleed background: a smooth grey-to-white tonal field with heavy fine film grain and a soft vignette, no objects, no shapes, no subject. Pure atmospheric monochrome texture.` },
  { name: 'bg-network-grid', ar: '16:9', size: '2K', p: `Abstract full-bleed background: a faint thin network lattice of connected dots over a near-white surface, density fading toward the edges, a few nodes rendered as small solid black dots. Very low contrast, designed to sit behind text.` },
  { name: 'app-icon', ar: '1:1', size: '1K', p: `App icon artwork on a solid pure black rounded-square tile: a single bold white resume sheet glyph with a white magnifier outline overlapping its lower right corner. Centred, thick strokes, maximum contrast, iconic and simple, readable at small size. Flat, no text.` },
];

const sleep = ms => new Promise(r => setTimeout(r, ms));

async function gen(job) {
  const body = {
    contents: [{ parts: [{ text: `${job.p}\n\nSTYLE GUIDE:\n${STYLE}` }] }],
    generationConfig: {
      responseModalities: ['IMAGE'],
      imageConfig: { aspectRatio: job.ar, imageSize: job.size },
    },
  };
  for (let attempt = 1; attempt <= 4; attempt++) {
    try {
      const res = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent?key=${KEY}`,
        { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }
      );
      const j = await res.json();
      if (!res.ok) throw new Error(`HTTP ${res.status}: ${JSON.stringify(j).slice(0, 300)}`);
      const part = (j.candidates?.[0]?.content?.parts ?? []).find(p => p.inlineData);
      if (!part) throw new Error(`no image: ${JSON.stringify(j).slice(0, 300)}`);
      const ext = part.inlineData.mimeType.includes('png') ? 'png' : 'jpg';
      const buf = Buffer.from(part.inlineData.data, 'base64');
      await writeFile(path.join(OUT, `${job.name}.${ext}`), buf);
      return `OK   ${job.name}.${ext}  ${(buf.length / 1024).toFixed(0)}KB  ${job.ar} ${job.size}`;
    } catch (e) {
      if (attempt === 4) return `FAIL ${job.name}: ${e.message}`;
      await sleep(3000 * attempt);
    }
  }
}

await mkdir(OUT, { recursive: true });
const queue = JOBS.filter(j => !['jpg', 'png'].some(e => existsSync(path.join(OUT, `${j.name}.${e}`))));
console.log(`generating ${queue.length} of ${JOBS.length} assets\n`);

const CONCURRENCY = 3;
let i = 0;
await Promise.all(
  Array.from({ length: CONCURRENCY }, async () => {
    while (i < queue.length) console.log(await gen(queue[i++]));
  })
);
console.log('\ndone');
