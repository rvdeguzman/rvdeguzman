// The PS2 clock orbs as drawn on rvdeguzman.com/now: smooth white cores in a
// blue glow, faint comet trails and a soft blur, as a seamless 60 s SVG loop.
//
// Motion is the footage-measured model (see ~/repos/orb-previews/NOTES.md),
// with the hour hand pinned to 12 and the ring at a fixed full size (the site
// breathes it; this does not):
//  - orb i rides the ring at 21 + i turns/min from 12 o'clock, so all seven
//    merge at :00 and bunch into 60 / gcd(s, 60) groups
//  - the ring coin-spins about the 12–6 axis; 17 turns/min (the PS2's ~17.33
//    rounded) keeps the loop seamless
//
// Look matches the site's ClockOrbs.tsx in a 17rem (272px) box, scaled to SIZE.
// Motion is CSS keyframes (one per orb); trail ghosts reuse their orb's
// keyframes with a lagging animation-delay, so the file stays small. Glow and
// cores add light (plus-lighter, screen as fallback) like the site's canvas.
import { writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

export const SIZE = 320, ORBS = 7, SECONDS = 60, RIDE = 21, SPIN = 17;
/** Keyframes per second; motion is linear between them (≤0.5px off the true curve). */
export const KPS = 15;
const TAU = Math.PI * 2;
const SITE_BOX = 272;                // .orbs is 17rem on the site
const PX = SIZE / SITE_BOX;          // site px → SVG units
const R = SIZE * 0.37;               // ring radius (site SCALE)
const BLUR = 4 * PX;                 // site: filter: blur(4px)
const TRAIL_SECONDS = 0.6, TRAIL_PEAK = 0.32, GHOSTS = 40;
// The site strokes each trail as a line; here it is a run of ghost dots. Give
// each dot the light of the line segment it stands in for, so the blurred
// trail is as bright: alpha × width × spacing / dot area.
const SPEED = 0.4 * TAU * R * 0.8;   // typical on-screen orb speed (units/s)
const SPACING = (SPEED * TRAIL_SECONDS) / GHOSTS;
const DOT = 0.65 * SPACING;          // dots overlap their neighbours
/** Shown first and when motion is reduced: :05 spreads the orbs evenly. */
const START = 5;

const mod = (n: number, d: number) => ((n % d) + d) % d;
const num = (n: number) => String(Math.round(n * 10) / 10);

/** Orb positions in SVG units (y down) at second `s` of the loop. */
export function orbPositions(s: number): { x: number; y: number }[] {
  const psi = (TAU * SPIN * s) / SECONDS;
  return Array.from({ length: ORBS }, (_, i) => {
    const th = (TAU * (RIDE + i) * s) / SECONDS;
    return { x: SIZE / 2 + R * Math.sin(th) * Math.cos(psi), y: SIZE / 2 - R * Math.cos(th) };
  });
}

function keyframes(i: number): string {
  const n = KPS * SECONDS;
  const stops = Array.from({ length: n + 1 }, (_, k) => {
    const { x, y } = orbPositions((k / n) * SECONDS)[i];
    return `${Math.round((k / n) * 1e5) / 1e3}%{transform:translate(${num(x)}px,${num(y)}px)}`;
  });
  return `@keyframes o${i}{${stops.join("")}}`;
}

/** Negative delay that shows the orb `lag` seconds behind the loop clock. */
const delay = (lag: number) => `animation-delay:-${num(mod(START - lag, SECONDS) * 100) / 100}s`;

export function generateSvg(): string {
  const label = "the PS2 clock orbs: seven glowing orbs swirl around a spinning ring and merge at 12 o'clock";
  const trails: string[] = [], halos: string[] = [], cores: string[] = [];
  for (let i = 0; i < ORBS; i++) {
    for (let j = GHOSTS; j >= 1; j--) {
      const f = 1 - j / GHOSTS;
      const width = (0.6 + 2.2 * f) * PX, alpha = TRAIL_PEAK * f ** 1.5;
      const r = Math.max(width / 2, DOT);
      const opacity = Math.min(1, (alpha * width * SPACING) / (Math.PI * r * r));
      trails.push(`<circle class="o${i}" r="${num(r)}" fill="#6ea5ff" opacity="${opacity.toFixed(3)}" style="${delay((TRAIL_SECONDS * j) / GHOSTS)}"/>`);
    }
    halos.push(`<circle class="o${i} add" r="${num(R * 0.24)}" fill="url(#halo)" style="${delay(0)}"/>`);
    cores.push(`<circle class="o${i} add" r="${num(R * 0.09)}" fill="url(#core)" style="${delay(0)}"/>`);
  }
  const classes = Array.from({ length: ORBS }, (_, i) => `.o${i}{animation-name:o${i}}`).join("");
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${SIZE}" height="${SIZE}" viewBox="0 0 ${SIZE} ${SIZE}" role="img" aria-label="${label}">
<title>${label}</title>
<style>circle{animation-duration:${SECONDS}s;animation-timing-function:linear;animation-iteration-count:infinite}${classes}.add{mix-blend-mode:screen;mix-blend-mode:plus-lighter}@media(prefers-reduced-motion:reduce){circle{animation-play-state:paused}}
${Array.from({ length: ORBS }, (_, i) => keyframes(i)).join("\n")}</style>
<defs>
<radialGradient id="halo"><stop offset="0" stop-color="rgb(130,180,255)" stop-opacity=".7"/><stop offset=".3" stop-color="rgb(60,115,240)" stop-opacity=".3"/><stop offset="1" stop-color="rgb(20,40,140)" stop-opacity="0"/></radialGradient>
<radialGradient id="core"><stop offset="0" stop-color="#fff"/><stop offset=".6" stop-color="rgb(240,246,255)"/><stop offset="1" stop-color="rgb(160,200,255)" stop-opacity="0"/></radialGradient>
<filter id="blur" x="-10%" y="-10%" width="120%" height="120%"><feGaussianBlur stdDeviation="${num(BLUR)}"/></filter>
</defs>
<g filter="url(#blur)">
${[...trails, ...halos, ...cores].join("\n")}
</g>
</svg>
`;
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const out = resolve(process.argv[2] ?? ".", "orbs-glow.svg");
  const svg = generateSvg();
  writeFileSync(out, svg);
  console.log(`${KPS * SECONDS} keyframes × ${ORBS} orbs, seamless ${SECONDS}s loop → ${out} (${Math.round(svg.length / 1024)} KB)`);
}
