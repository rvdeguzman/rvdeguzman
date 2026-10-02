// One minute of the PS2 clock orbs, as a seamless one-minute SVG loop in
// braille-style dots, with the hour hand pinned to 12 o'clock.
//
// The motion is measured from footage of a real PS2 (see ~/repos/orb-previews,
// NOTES.md): predicted orb positions match the video to ~5% of the ring radius.
//  - The orbs ride one ring, seen flat-on (orthographic, no perspective).
//  - Orb i goes round the ring at 21 + i turns/min, starting from the hour
//    point, so all seven merge on the hour hand at :00 and bunch into
//    60 / gcd(s, 60) groups (2 at :30, 3 at :20, ...).
//  - The ring spins like a coin about the hour-hand axis (12–6 here). The PS2
//    spins ~17.33 turns/min; 17 keeps the 60 s loop seamless.
// Orb size, glow and trails follow the site's PS2Orbs.tsx look, halftoned into
// three dot sizes. SPEED > 1 would play the minute faster than real time.
import { writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

export const WIDTH = 64, HEIGHT = 64, FPS = 30, ORBS = 7;
export const MINUTE = 60;            // PS2 seconds shown
export const SPEED = 1;              // playback speed-up (1 = real time)
export const SECONDS = MINUTE / SPEED; // real loop length
export const RIDE = 21;              // orb 0's turns/min around the ring
export const SPIN = 17;              // coin-spin turns/min about the hour axis
const TAU = Math.PI * 2;
const SCALE = 5;
const CX = (WIDTH - 1) / 2, CY = (HEIGHT - 1) / 2;
const mod = (n: number, d: number) => ((n % d) + d) % d;

// PS2Orbs.tsx scene units: orbit radius 2.2, orbSize 1.6.
const ORBIT = 2.2;
const ORB_SIZE = 1.6;
const CORE = 0.16 * ORB_SIZE, SHELL = 0.23 * ORB_SIZE, HALO = 0.34 * ORB_SIZE;
const DOTS = 9.3;                    // dots per scene unit: ring radius ≈ 20 dots
const TRAIL = 0.5;                   // PS2 seconds of trail behind each orb

type Vec = [number, number, number];
export type Point = { x: number; y: number; z: number };

/** World position of every orb at PS2 second `s`: x right, y up, z toward the viewer. */
export function orbWorld(s: number): Vec[] {
  s = mod(s, MINUTE);
  const spin = TAU * SPIN * s / MINUTE;
  return Array.from({ length: ORBS }, (_, i) => {
    // Clock angle on the ring: 0 is the hour point (12 o'clock), clockwise.
    const theta = TAU * (RIDE + i) * s / MINUTE;
    const across = ORBIT * Math.sin(theta);
    // Coin spin about the vertical 12–6 axis.
    return [across * Math.cos(spin), ORBIT * Math.cos(theta), -across * Math.sin(spin)];
  });
}

/** Orthographic projection to dots (y down). */
function project([x, y, z]: Vec): Point {
  return { x: CX + x * DOTS, y: CY - y * DOTS, z };
}

export const orbPositions = (seconds: number): Point[] => orbWorld(seconds * SPEED).map(project);

/** Brightness 0–3 per dot (0 = off), like the site's ASCII density ramp. */
export function renderFrame(seconds: number): Uint8Array {
  const s = mod(seconds * SPEED, MINUTE);
  const light = new Float32Array(WIDTH * HEIGHT);
  const glow = (p: Point, radius: number, peak: number, falloff: number) => {
    const r = radius * DOTS, reach = Math.ceil(r * falloff);
    for (let y = Math.floor(p.y) - reach; y <= Math.ceil(p.y) + reach; y++)
      for (let x = Math.floor(p.x) - reach; x <= Math.ceil(p.x) + reach; x++) {
        if (x < 0 || x >= WIDTH || y < 0 || y >= HEIGHT) continue;
        const d = Math.hypot(x - p.x, y - p.y) / r;
        const v = d <= 1 ? peak : peak * Math.max(0, 1 - (d - 1) / (falloff - 1));
        light[y * WIDTH + x] = Math.max(light[y * WIDTH + x], v);
      }
  };

  // Trails: fading, thinning copies of each orb along its recent path.
  const steps = 12;
  for (let step = steps; step >= 1; step--) {
    const u = step / steps;
    for (const p of orbWorld(s - TRAIL * u).map(project)) glow(p, CORE * (1 - u * 0.8), 0.55 * (1 - u) ** 1.5, 1.6);
  }
  // Halo, shell and core.
  for (const p of orbWorld(s).map(project)) {
    glow(p, HALO, 0.3, 1.4);
    glow(p, SHELL, 0.55, 1.3);
    glow(p, CORE, 1, 1.25);
  }

  return Uint8Array.from(light, v => (v >= 0.8 ? 3 : v >= 0.45 ? 2 : v >= 0.18 ? 1 : 0));
}

function path(fb: Uint8Array, level: number): string {
  let d = "", px = 0, py = 0;
  for (let y = 0; y < HEIGHT; y++)
    for (let x = 0; x < WIDTH; x++)
      if (fb[y * WIDTH + x] === level) {
        d += d ? `m${x - px} ${y - py}h0` : `M${x} ${y}h0`;
        px = x; py = y;
      }
  return d || "M0 0";
}

const LEVELS = [
  { level: 1, width: ".3" },
  { level: 2, width: ".52" },
  { level: 3, width: ".78" },
];

/** Dot colour per brightness level: [faint glow/trail, shell, core]. */
export type Palette = readonly [string, string, string];

// The PS2's white cores in blue glow. On a white page a white core would
// vanish, so light mode inverts the ramp: navy core, lighter blue glow.
export const DARK: Palette = ["#3557d6", "#88a7ff", "#ffffff"];
export const LIGHT: Palette = ["#9db2f2", "#3a5bd9", "#0b1f6b"];

export function generateSvg(palette: Palette): string {
  // Exclude the duplicated endpoint: every frame gets exactly 1/FPS seconds,
  // and frame 0 (all orbs merged at 12) follows the last frame seamlessly.
  const frames = Array.from({ length: FPS * SECONDS }, (_, i) => renderFrame(i / FPS));
  const label = "one minute of the PS2 clock orbs: seven orbs swirl and merge at 12 o'clock";
  const layers = LEVELS.map(({ level, width }) => {
    const values = frames.map(fb => path(fb, level));
    const style = `stroke="${palette[level - 1]}" stroke-width="${width}"`;
    return `<path class="still" ${style} d="${values[0]}"/>
<path class="moving" ${style} d="${values[0]}">
<animate attributeName="d" dur="${SECONDS}s" repeatCount="indefinite" calcMode="discrete" values="${values.join(";")}"/>
</path>`;
  });
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${WIDTH * SCALE}" height="${HEIGHT * SCALE}" viewBox="-0.5 -0.5 ${WIDTH} ${HEIGHT}" role="img" aria-label="${label}">
<title>${label}</title>
<style>.still{display:none}@media(prefers-reduced-motion:reduce){.moving{display:none}.still{display:inline}}</style>
<g fill="none" stroke-linecap="round">
${layers.join("\n")}
</g>
</svg>
`;
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const out = process.argv[2] ?? ".";
  writeFileSync(resolve(out, "orbs-dark.svg"), generateSvg(DARK));
  writeFileSync(resolve(out, "orbs-light.svg"), generateSvg(LIGHT));
  console.log(`${FPS * SECONDS} frames, one PS2 minute at ${SPEED}× → seamless ${SECONDS}s loop → orbs-dark.svg, orbs-light.svg`);
}
