import { writeFile, mkdir } from 'node:fs/promises';
const OUT = 'D:/jobhunting-live/jobhunting/public/assets/icons';

// 24x24 grid, 1.75 stroke, round caps/joins — matches the logo's line weight when scaled.
const ICONS = {
  'resume-upload': `<path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z"/><path d="M14 3v4a1 1 0 0 0 1 1h4"/><path d="M12 17v-6"/><path d="m9.5 13.5 2.5-2.5 2.5 2.5"/>`,
  'resume-scan': `<path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z"/><path d="M14 3v4a1 1 0 0 0 1 1h4"/><path d="M3 12h18"/><path d="M8.5 8.5h3"/><path d="M8.5 15.5h5"/>`,
  'globe-crawl': `<circle cx="12" cy="12" r="9"/><path d="M3 12h18"/><path d="M12 3a14 14 0 0 1 0 18a14 14 0 0 1 0-18"/><circle cx="12" cy="3" r="1.6" fill="currentColor" stroke="none"/><circle cx="19.8" cy="16.5" r="1.6" fill="currentColor" stroke="none"/><circle cx="4.2" cy="16.5" r="1.6" fill="currentColor" stroke="none"/>`,
  'company': `<path d="M3 21h18"/><path d="M5 21V6a2 2 0 0 1 2-2h6a2 2 0 0 1 2 2v15"/><path d="M15 21V11h3a2 2 0 0 1 2 2v8"/><path d="M8.5 8h3"/><path d="M8.5 12h3"/><path d="M8.5 16h3"/>`,
  'mail-search': `<path d="M20 11V7a2 2 0 0 0-2-2H4a2 2 0 0 0-2 2v10a2 2 0 0 0 2 2h7"/><path d="m2.5 7.5 8.4 5.6a2 2 0 0 0 2.2 0L21.5 7.5"/><circle cx="17.5" cy="17.5" r="3.5"/><path d="m20.2 20.2 1.8 1.8"/>`,
  'draft-ai': `<path d="M20 12v7a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h7"/><path d="M8 13h6"/><path d="M8 17h4"/><path d="M17.5 2.5 18.8 5.7 22 7l-3.2 1.3-1.3 3.2-1.3-3.2L13 7l3.2-1.3z"/>`,
  'send': `<path d="M21.5 2.5 11 13"/><path d="M21.5 2.5 15 21.5l-4-8.5-8.5-4z"/>`,
  'pipeline': `<rect x="2.5" y="5" width="5.5" height="14" rx="1.5"/><rect x="9.25" y="5" width="5.5" height="14" rx="1.5"/><rect x="16" y="5" width="5.5" height="14" rx="1.5"/><path d="M5.25 9h0"/><path d="M12 9h0"/><path d="M18.75 9h0"/><path d="M4 9.5h2.5"/><path d="M10.75 9.5h2.5"/><path d="M17.5 9.5h2.5"/>`,
  'shield-lock': `<path d="M12 2.5 4.5 5.6V11c0 4.6 3.1 8.7 7.5 10.5 4.4-1.8 7.5-5.9 7.5-10.5V5.6z"/><rect x="9.25" y="11" width="5.5" height="5" rx="1.2"/><path d="M10.5 11V9.75a1.5 1.5 0 0 1 3 0V11"/>`,
  'chart-up': `<path d="M3 3v16a2 2 0 0 0 2 2h16"/><path d="m7 15 3.5-4 3 2.5L20 6.5"/><path d="M20 11V6.5h-4.5"/>`,
  'bot-crawler': `<rect x="4" y="8.5" width="16" height="11" rx="3"/><path d="M12 8.5V5"/><circle cx="12" cy="3.6" r="1.4"/><path d="M9 13v1.5"/><path d="M15 13v1.5"/><path d="M1.5 13.5h2.5"/><path d="M20 13.5h2.5"/>`,
  'target-link': `<circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="4.75"/><circle cx="12" cy="12" r="1.5" fill="currentColor" stroke="none"/>`,
};

await mkdir(OUT, { recursive: true });
for (const [name, body] of Object.entries(ICONS)) {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" role="img" aria-label="${name}">${body}</svg>\n`;
  await writeFile(`${OUT}/${name}.svg`, svg);
  console.log('OK  ', name + '.svg');
}
