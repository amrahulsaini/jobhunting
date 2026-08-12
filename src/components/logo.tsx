/**
 * Inlined rather than loaded from /public: an <img> pointing at an SVG renders in
 * an isolated document, so `currentColor` inside it never sees our text colour and
 * the mark would stay black in dark mode. Inline JSX keeps it theme-aware.
 */

function MarkPaths({ idPrefix }: { idPrefix: string }) {
  const maskId = `${idPrefix}-cut`;
  return (
    <>
      <mask id={maskId} maskUnits="userSpaceOnUse" x="0" y="0" width="64" height="64">
        <rect width="64" height="64" fill="#fff" />
        <circle cx="43" cy="43" r="14.5" fill="#000" />
        <path d="M48.6 48.6 58 58" stroke="#000" strokeWidth="10" strokeLinecap="round" />
      </mask>
      <g stroke="currentColor" strokeWidth="3.5" strokeLinejoin="round" strokeLinecap="round">
        <g mask={`url(#${maskId})`}>
          <path d="M17 6h16l13 13v27a6 6 0 0 1-6 6H17a6 6 0 0 1-6-6V12a6 6 0 0 1 6-6Z" />
          <path d="M33 6v9a4 4 0 0 0 4 4h9" />
          <g strokeWidth="3">
            <path d="M19.5 27h13" />
            <path d="M19.5 35h18" />
            <path d="M19.5 43h9" />
          </g>
        </g>
        <circle cx="43" cy="43" r="10" />
        <path d="M50.5 50.5 58 58" strokeWidth="4.5" />
      </g>
    </>
  );
}

export function LogoMark({ className = "h-8 w-8" }: { className?: string }) {
  return (
    <svg viewBox="0 0 64 64" fill="none" className={className} aria-hidden="true">
      <MarkPaths idPrefix="mark" />
    </svg>
  );
}

export function Logo({ className = "h-8 w-auto" }: { className?: string }) {
  return (
    <svg viewBox="0 0 280 64" fill="none" className={className} role="img" aria-label="JobHunting">
      <MarkPaths idPrefix="logo" />
      <text
        x="78"
        y="43"
        fontSize="31"
        letterSpacing="-1.1"
        fill="currentColor"
        fontFamily="var(--font-geist-sans), ui-sans-serif, system-ui, sans-serif"
      >
        <tspan fontWeight="700">Job</tspan>
        <tspan fontWeight="300">Hunting</tspan>
      </text>
    </svg>
  );
}
