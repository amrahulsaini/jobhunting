/**
 * Central manifest for the JobHunting asset system.
 *
 * Every raster asset is pure monochrome on white, which means dark mode needs no
 * second export — `invertOnDark` flips it with a CSS filter instead. SVG assets
 * paint with `currentColor` and inherit the surrounding text colour directly.
 */

export type AssetGroup =
  | 'brand'
  | 'hero'
  | 'step'
  | 'feature'
  | 'state'
  | 'background'
  | 'pattern'
  | 'icon'
  | 'video';

export interface Asset {
  /** Stable key used in code. */
  id: string;
  /** Public URL, served straight from /public. */
  src: string;
  group: AssetGroup;
  label: string;
  /** Meaningful alt text; empty string marks the asset as decorative. */
  alt: string;
  width?: number;
  height?: number;
  /** Raster monochrome art that should be filter-inverted on dark surfaces. */
  invertOnDark?: boolean;
}

// Intrinsic sizes after the optimise pass, so Next/Image reserves the right box.
const HERO = { width: 2400, height: 1340 } as const;
const STEP = { width: 1200, height: 896 } as const;
const SQUARE = { width: 1024, height: 1024 } as const;

export const assets = {
  // ---------------------------------------------------------------- brand
  logoMark: {
    id: 'logoMark', src: '/assets/brand/logo-mark.svg', group: 'brand',
    label: 'Logo mark', alt: 'JobHunting', width: 64, height: 64,
  },
  logoMarkTile: {
    id: 'logoMarkTile', src: '/assets/brand/logo-mark-tile.svg', group: 'brand',
    label: 'Logo mark on tile', alt: 'JobHunting', width: 80, height: 80,
  },
  logoFull: {
    id: 'logoFull', src: '/assets/brand/logo-full.svg', group: 'brand',
    label: 'Full logo', alt: 'JobHunting', width: 280, height: 64,
  },
  favicon: {
    id: 'favicon', src: '/assets/brand/favicon.svg', group: 'brand',
    label: 'Favicon', alt: '', width: 64, height: 64,
  },
  appIcon: {
    id: 'appIcon', src: '/assets/app-icon.webp', group: 'brand',
    label: 'App icon', alt: '', ...SQUARE,
  },

  // ----------------------------------------------------------------- hero
  heroMain: {
    id: 'heroMain', src: '/assets/hero-main.webp', group: 'hero', invertOnDark: true,
    label: 'Primary hero', alt: 'A resume fanning out into companies and emails across a globe', ...HERO,
  },
  heroSecondary: {
    id: 'heroSecondary', src: '/assets/hero-secondary.webp', group: 'hero', invertOnDark: true,
    label: 'Secondary banner', alt: '', ...HERO,
  },
  ogImage: {
    id: 'ogImage', src: '/assets/og-image.webp', group: 'hero',
    label: 'Open Graph card', alt: 'JobHunting', ...HERO,
  },

  // ---------------------------------------------------------------- steps
  step1Upload: {
    id: 'step1Upload', src: '/assets/step-1-upload-resume.webp', group: 'step', invertOnDark: true,
    label: '1 · Upload resume', alt: 'Dropping a resume into an intake portal', ...STEP,
  },
  step2Parse: {
    id: 'step2Parse', src: '/assets/step-2-parse-resume.webp', group: 'step', invertOnDark: true,
    label: '2 · Parse resume', alt: 'A resume being scanned into skill and experience chips', ...STEP,
  },
  step3Crawl: {
    id: 'step3Crawl', src: '/assets/step-3-crawl-web.webp', group: 'step', invertOnDark: true,
    label: '3 · Crawl the web', alt: 'A crawler traversing a network wrapped around a globe', ...STEP,
  },
  step4Contacts: {
    id: 'step4Contacts', src: '/assets/step-4-find-contacts.webp', group: 'step', invertOnDark: true,
    label: '4 · Find careers contacts', alt: 'A magnifier pulling a contact address out of company cards', ...STEP,
  },
  step5Draft: {
    id: 'step5Draft', src: '/assets/step-5-draft-emails.webp', group: 'step', invertOnDark: true,
    label: '5 · Draft outreach', alt: 'An AI spark composing a letter inside an envelope', ...STEP,
  },
  step6Track: {
    id: 'step6Track', src: '/assets/step-6-track-replies.webp', group: 'step', invertOnDark: true,
    label: '6 · Track replies', alt: 'Application cards advancing across a pipeline board', ...STEP,
  },

  // ------------------------------------------------------------- features
  featureMatching: {
    id: 'featureMatching', src: '/assets/feature-ai-matching.webp', group: 'feature', invertOnDark: true,
    label: 'AI role matching', alt: 'A radar sweep lighting up matching companies', ...SQUARE,
  },
  featureAutomation: {
    id: 'featureAutomation', src: '/assets/feature-inbox-automation.webp', group: 'feature', invertOnDark: true,
    label: 'Outreach automation', alt: 'Envelopes launching from an outbox along arcing paths', ...SQUARE,
  },
  featurePrivacy: {
    id: 'featurePrivacy', src: '/assets/feature-privacy.webp', group: 'feature', invertOnDark: true,
    label: 'Privacy', alt: 'A resume protected inside a shield', ...SQUARE,
  },
  featureAnalytics: {
    id: 'featureAnalytics', src: '/assets/feature-analytics.webp', group: 'feature', invertOnDark: true,
    label: 'Analytics', alt: 'Dashboard panels with rising charts', ...SQUARE,
  },

  // --------------------------------------------------------------- states
  emptyNoResume: {
    id: 'emptyNoResume', src: '/assets/state-empty-no-resume.webp', group: 'state', invertOnDark: true,
    label: 'Empty · no resume', alt: 'An empty document tray awaiting a resume', ...STEP,
  },
  emptyNoMatches: {
    id: 'emptyNoMatches', src: '/assets/state-empty-no-matches.webp', group: 'state', invertOnDark: true,
    label: 'Empty · no matches', alt: 'A magnifier over a globe with no results yet', ...STEP,
  },
  scanning: {
    id: 'scanning', src: '/assets/state-scanning.webp', group: 'state', invertOnDark: true,
    label: 'Loading · scanning', alt: 'A resume being scanned, work in progress', ...STEP,
  },
  successSent: {
    id: 'successSent', src: '/assets/state-success-sent.webp', group: 'state', invertOnDark: true,
    label: 'Success · sent', alt: 'An envelope taking flight with a check mark', ...STEP,
  },
  error404: {
    id: 'error404', src: '/assets/state-error-404.webp', group: 'state', invertOnDark: true,
    label: 'Error · 404', alt: 'A crawler at a broken link in the network', ...STEP,
  },

  // ---------------------------------------------------------- backgrounds
  bgGrain: {
    id: 'bgGrain', src: '/assets/bg-grain-field.webp', group: 'background', invertOnDark: true,
    label: 'Grain field', alt: '', ...HERO,
  },
  bgNetwork: {
    id: 'bgNetwork', src: '/assets/bg-network-grid.webp', group: 'background', invertOnDark: true,
    label: 'Network grid', alt: '', ...HERO,
  },

  // ------------------------------------------------------------- patterns
  patternGrid: {
    id: 'patternGrid', src: '/assets/patterns/grid.svg', group: 'pattern', label: 'Grid', alt: '',
  },
  patternDots: {
    id: 'patternDots', src: '/assets/patterns/dots.svg', group: 'pattern', label: 'Dots', alt: '',
  },
  patternHatch: {
    id: 'patternHatch', src: '/assets/patterns/diagonal-hatch.svg', group: 'pattern', label: 'Diagonal hatch', alt: '',
  },

  // --------------------------------------------------------------- videos
  videoHeroLoop: {
    id: 'videoHeroLoop', src: '/assets/video/hero-loop.mp4', group: 'video',
    label: 'Hero loop', alt: '', width: 1920, height: 1080,
  },
  videoNetworkPulse: {
    id: 'videoNetworkPulse', src: '/assets/video/network-pulse.mp4', group: 'video',
    label: 'Network pulse', alt: '', width: 1920, height: 1080,
  },
  videoRadarSweep: {
    id: 'videoRadarSweep', src: '/assets/video/radar-sweep.mp4', group: 'video',
    label: 'Radar sweep', alt: '', width: 1920, height: 1080,
  },
} as const satisfies Record<string, Asset>;

export type AssetId = keyof typeof assets;

/** Icon set — 24px line icons that inherit `currentColor`. */
export const icons = [
  'resume-upload', 'resume-scan', 'globe-crawl', 'company',
  'mail-search', 'draft-ai', 'send', 'pipeline',
  'shield-lock', 'chart-up', 'bot-crawler', 'target-link', 'hunter', 'trash',
] as const;

export type IconName = (typeof icons)[number];

export const iconSrc = (name: IconName) => `/assets/icons/${name}.svg`;

export const assetList = Object.values(assets) as Asset[];

export const byGroup = (group: AssetGroup) => assetList.filter(a => a.group === group);
