function mulberry32(seed: number): () => number {
  return () => {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const ICONS: Array<() => preact.JSX.Element> = [
  // Cheese wedge
  () => (
    <g stroke-width="1.5">
      <path d="M2 20L12 3l10 17H2z" />
      <circle cx="8" cy="15" r="1.5" />
      <circle cx="14" cy="12" r="1" />
      <circle cx="10" cy="17" r="1" />
    </g>
  ),
  // Mouse face
  () => (
    <g stroke-width="1.5">
      <circle cx="12" cy="14" r="7" />
      <circle cx="6" cy="6" r="3.5" />
      <circle cx="18" cy="6" r="3.5" />
      <circle cx="10" cy="13" r="0.8" fill="currentColor" />
      <circle cx="14" cy="13" r="0.8" fill="currentColor" />
      <ellipse cx="12" cy="16" rx="1.5" ry="1" />
    </g>
  ),
  // Crosshair / sniper scope
  () => (
    <g stroke-width="1.5">
      <circle cx="12" cy="12" r="8" />
      <circle cx="12" cy="12" r="2.5" />
      <line x1="12" y1="1" x2="12" y2="7" />
      <line x1="12" y1="17" x2="12" y2="23" />
      <line x1="1" y1="12" x2="7" y2="12" />
      <line x1="17" y1="12" x2="23" y2="12" />
    </g>
  ),
  // Treasure chest
  () => (
    <g stroke-width="1.5">
      <rect x="3" y="11" width="18" height="10" rx="1" />
      <path d="M3 11c0-4.5 4-7 9-7s9 2.5 9 7" />
      <line x1="12" y1="11" x2="12" y2="21" />
      <rect x="10" y="14" width="4" height="3" rx="0.5" />
    </g>
  ),
  // Coins / SB stack
  () => (
    <g stroke-width="1.5">
      <circle cx="9" cy="10" r="6.5" />
      <path d="M16.5 9a6.5 6.5 0 1 1-4 9.5" />
      <path d="M8 7.5v5M6 10h4" />
    </g>
  ),
  // Chart trending up
  () => (
    <g stroke-width="1.5">
      <polyline points="2 19 7 13 12 16 22 5" />
      <polyline points="16 5 22 5 22 11" />
    </g>
  ),
  // Shield with check
  () => (
    <g stroke-width="1.5">
      <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
      <polyline points="9 12 11 14 15 10" />
    </g>
  ),
  // Map / scroll
  () => (
    <g stroke-width="1.5">
      <path d="M3 7l6-3 6 3 6-3v14l-6 3-6-3-6 3V7z" />
      <line x1="9" y1="4" x2="9" y2="18" />
      <line x1="15" y1="7" x2="15" y2="21" />
    </g>
  ),
  // Handshake
  () => (
    <g stroke-width="1.5">
      <path d="M2 14l4-4 3 1 2-2" />
      <path d="M22 14l-4-4-3 1-2-2" />
      <path d="M8 11l4 4 4-4" />
      <line x1="2" y1="10" x2="6" y2="10" />
      <line x1="18" y1="10" x2="22" y2="10" />
    </g>
  ),
  // Star
  () => (
    <g stroke-width="1.5">
      <polygon points="12 2 15 9 22 9 17 14 19 21 12 17 5 21 7 14 2 9 9 9" />
    </g>
  ),
  // Bell
  () => (
    <g stroke-width="1.5">
      <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
      <path d="M13.7 21a2 2 0 0 1-3.4 0" />
    </g>
  ),
  // Gift box
  () => (
    <g stroke-width="1.5">
      <rect x="3" y="10" width="18" height="11" rx="1" />
      <rect x="3" y="6" width="18" height="4" rx="1" />
      <line x1="12" y1="6" x2="12" y2="21" />
      <path d="M12 6C11 3 7 2 6 4s2 4 6 2" />
      <path d="M12 6c1-3 5-4 6-2s-2 4-6 2" />
    </g>
  ),
  // Magnifying glass
  () => (
    <g stroke-width="1.5">
      <circle cx="10" cy="10" r="7" />
      <line x1="15.5" y1="15.5" x2="22" y2="22" stroke-width="2" />
    </g>
  ),
  // Lightning bolt
  () => (
    <g stroke-width="1.5">
      <polygon points="13 2 4 14 12 14 11 22 20 10 12 10" />
    </g>
  ),
  // Mouse trap
  () => (
    <g stroke-width="1.5">
      <rect x="2" y="15" width="20" height="6" rx="1" />
      <path d="M6 15V9a6 6 0 1 1 12 0v6" />
      <circle cx="12" cy="12" r="1.5" fill="currentColor" />
    </g>
  ),
  // Price tag
  () => (
    <g stroke-width="1.5">
      <path d="M20.6 13.4l-7.2 7.2a2 2 0 0 1-2.8 0L2 12V2h10l8.6 8.6a2 2 0 0 1 0 2.8z" />
      <circle cx="7" cy="7" r="1.5" fill="currentColor" />
    </g>
  ),
];

const FILLERS: Array<() => preact.JSX.Element> = [
  // Plus
  () => (
    <g stroke-width="1.5">
      <line x1="0" y1="-3.5" x2="0" y2="3.5" />
      <line x1="-3.5" y1="0" x2="3.5" y2="0" />
    </g>
  ),
  // Dot
  () => <circle r="1.8" fill="currentColor" />,
  // Ring
  () => <circle r="3" stroke-width="1.5" />,
  // Diamond
  () => (
    <g stroke-width="1.5">
      <polygon points="0,-4 3,0 0,4 -3,0" />
    </g>
  ),
  // Squiggle
  () => (
    <g stroke-width="1.5">
      <path d="M-6 0c2-3 4 3 6 0s4 3 6 0" />
    </g>
  ),
  // Asterisk (6-pointed)
  () => (
    <g stroke-width="1.2">
      <line x1="0" y1="-3.5" x2="0" y2="3.5" />
      <line x1="-3" y1="-1.8" x2="3" y2="1.8" />
      <line x1="-3" y1="1.8" x2="3" y2="-1.8" />
    </g>
  ),
  // Three dots
  () => (
    <g>
      <circle cx="-4" cy="0" r="1" fill="currentColor" />
      <circle cx="0" cy="0" r="1" fill="currentColor" />
      <circle cx="4" cy="0" r="1" fill="currentColor" />
    </g>
  ),
];

const TILE = 300;
const ICON_COUNT = 40;
const FILLER_COUNT = 50;
const SEED = 7742;

/** Pre-compute the pattern tile elements (deterministic from seed) */
function buildPatternElements(): preact.JSX.Element[] {
  const rand = mulberry32(SEED);
  const els: preact.JSX.Element[] = [];

  // Scatter main icons
  for (let i = 0; i < ICON_COUNT; i++) {
    const icon = ICONS[Math.floor(rand() * ICONS.length)];
    const x = rand() * TILE;
    const y = rand() * TILE;
    const rot = (rand() - 0.5) * 50; // -25° to +25°
    const scale = 0.7 + rand() * 0.6; // 0.7× to 1.3×
    els.push(
      <g key={`i${i}`} transform={`translate(${x.toFixed(1)} ${y.toFixed(1)}) rotate(${rot.toFixed(1)}) scale(${scale.toFixed(2)})`}>
        <g transform="translate(-12 -12)">
          {icon()}
        </g>
      </g>
    );
  }

  // Scatter filler elements (already centered at origin)
  for (let i = 0; i < FILLER_COUNT; i++) {
    const filler = FILLERS[Math.floor(rand() * FILLERS.length)];
    const x = rand() * TILE;
    const y = rand() * TILE;
    const rot = rand() * 360;
    const scale = 0.6 + rand() * 0.8; // 0.6× to 1.4×
    els.push(
      <g key={`f${i}`} transform={`translate(${x.toFixed(1)} ${y.toFixed(1)}) rotate(${rot.toFixed(1)}) scale(${scale.toFixed(2)})`}>
        {filler()}
      </g>
    );
  }

  return els;
}

const patternElements = buildPatternElements();

export function DoodleBackground() {
  return (
    <svg class="doodle-bg" aria-hidden="true">
      <defs>
        <pattern id="onboardingDoodle" x="0" y="0" width={TILE} height={TILE} patternUnits="userSpaceOnUse">
          <g fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round">
            {patternElements}
          </g>
        </pattern>
      </defs>
      <rect width="100%" height="100%" fill="url(#onboardingDoodle)" />
    </svg>
  );
}
