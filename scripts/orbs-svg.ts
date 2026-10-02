// One PS2 minute of the site's orbs (rvdeguzman.github.io PS2Orbs.tsx, in
// `faithful` mode), as a seamless SVG loop in braille-style dots.
//
// The motion is a port of `getClockPose` from ps2Clock.ts with the hour pinned
// to 12, so all seven orbs merge on the 12 o'clock hand at :00. Every rotation
// term is a whole number of turns per minute, so the loop starts and ends on
// that same merged orb. SPEED plays the minute faster than real time.
//
// Rendering mimics the site's ASCII renderer: each orb is a bright core, a
// shell and a faint halo, with a fading trail. That brightness is halftoned
// into three dot sizes instead of ASCII glyphs.
import { writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

export const WIDTH = 64, HEIGHT = 64, FPS = 30, ORBS = 7;
export const MINUTE = 60;            // PS2 seconds shown
export const SPEED = 2;              // playback speed-up
export const SECONDS = MINUTE / SPEED; // real loop length
const TAU = Math.PI * 2;
const SCALE = 5;
const CX = (WIDTH - 1) / 2, CY = (HEIGHT - 1) / 2;
const mod = (n: number, d: number) => ((n % d) + d) % d;

// ps2Clock.ts constants.
const X_SPEED = Math.PI / 3;
const Z_SPEED = (-Math.PI * 2) / 3;
const TILT = Math.PI / 2;            // X_ROTATION_ANGLES[minute % 3] for a :00 minute
const HOUR_ROTATION = Math.PI / 2;   // getHourHandAngle(12): 12 o'clock is +Y
const WOBBLE_X = 0.3, WOBBLE_Y = 0.45;

// PS2Orbs.tsx scene: orbit radius 2.2, orbSize 1.6, ascii camera distance.
const ORBIT = 2.2;
const ORB_SIZE = 1.6;
const CAMERA = 14 * Math.pow(0.16, 0.35);
const CORE = 0.16 * ORB_SIZE, SHELL = 0.23 * ORB_SIZE, HALO = 0.34 * ORB_SIZE;
// World units → dots, chosen so the nearest orb's halo stays inside the frame.
const PIXELS = (HEIGHT / 2 - 2) / ((ORBIT + HALO) * CAMERA / (CAMERA - ORBIT));
const TRAIL = 0.5;                   // PS2 seconds of trail behind each orb

type Vec = [number, number, number];
export type Point = { x: number; y: number; z: number };

const rx = (a: number, [x, y, z]: Vec): Vec => [x, y * Math.cos(a) - z * Math.sin(a), y * Math.sin(a) + z * Math.cos(a)];
const ry = (a: number, [x, y, z]: Vec): Vec => [x * Math.cos(a) + z * Math.sin(a), y, -x * Math.sin(a) + z * Math.cos(a)];
const rz = (a: number, [x, y, z]: Vec): Vec => [x * Math.cos(a) - y * Math.sin(a), x * Math.sin(a) + y * Math.cos(a), z];

/** World position of every orb at PS2 second `s` (getClockPose, faithful). */
export function orbWorld(s: number): Vec[] {
  s = mod(s, MINUTE);
  const progress = s / MINUTE;
  const wobble = Math.sin(TAU * progress);
  const xRotation = X_SPEED * s + TILT * Math.sin(Math.PI * progress);
  const zRotation = Z_SPEED * s;
  return Array.from({ length: ORBS }, (_, i) => {
    const angle = (TAU / 60) * s * i;
    // Orbit plane: Rz(z) · Rx(x) · Rz(hour); then the container's Euler XYZ.
    const local = rz(zRotation, rx(xRotation, rz(HOUR_ROTATION, [Math.cos(angle), Math.sin(angle), 0])));
    const scaled: Vec = [local[0] * ORBIT, local[1] * ORBIT, local[2] * ORBIT];
    return rx(WOBBLE_X * wobble, ry(WOBBLE_Y * wobble, scaled));
  });
}

/** Perspective-projected orb centres in dots (y down), plus the depth scale. */
function project([x, y, z]: Vec): Point {
  const k = CAMERA / (CAMERA - z);
  return { x: CX + x * k * PIXELS, y: CY - y * k * PIXELS, z: k };
}

export const orbPositions = (seconds: number): Point[] => orbWorld(seconds * SPEED).map(project);

/** Brightness 0–3 per dot (0 = off), like the site's ASCII density ramp. */
export function renderFrame(seconds: number): Uint8Array {
  const s = mod(seconds * SPEED, MINUTE);
  const light = new Float32Array(WIDTH * HEIGHT);
  const glow = (p: Point, radius: number, peak: number, falloff: number) => {
    const r = radius * p.z * PIXELS, reach = Math.ceil(r * falloff);
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
  // Halo, shell and core, nearest orbs drawn largest by perspective.
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

export function generateSvg(color: string): string {
  // Exclude the duplicated endpoint: every frame gets exactly 1/FPS seconds,
  // and frame 0 (all orbs merged at 12) follows the last frame seamlessly.
  const frames = Array.from({ length: FPS * SECONDS }, (_, i) => renderFrame(i / FPS));
  const label = "one minute of the PS2 clock orbs, sped up: seven orbs swirl and merge at 12 o'clock";
  const layers = LEVELS.map(({ level, width }) => {
    const values = frames.map(fb => path(fb, level));
    return `<path class="still" stroke-width="${width}" d="${values[0]}"/>
<path class="moving" stroke-width="${width}" d="${values[0]}">
<animate attributeName="d" dur="${SECONDS}s" repeatCount="indefinite" calcMode="discrete" values="${values.join(";")}"/>
</path>`;
  });
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${WIDTH * SCALE}" height="${HEIGHT * SCALE}" viewBox="-0.5 -0.5 ${WIDTH} ${HEIGHT}" role="img" aria-label="${label}">
<title>${label}</title>
<style>.still{display:none}@media(prefers-reduced-motion:reduce){.moving{display:none}.still{display:inline}}</style>
<g fill="none" stroke="${color}" stroke-linecap="round">
${layers.join("\n")}
</g>
</svg>
`;
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const out = process.argv[2] ?? ".";
  writeFileSync(resolve(out, "orbs-dark.svg"), generateSvg("#fbcb97"));
  writeFileSync(resolve(out, "orbs-light.svg"), generateSvg("#b5562a"));
  console.log(`${FPS * SECONDS} frames, one PS2 minute at ${SPEED}× → seamless ${SECONDS}s loop → orbs-dark.svg, orbs-light.svg`);
}
