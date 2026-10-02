// One minute of the PS2 System Configuration clock, in braille-style dots.
// Seven orbs swirl around the clock face and merge into a single orb at the
// 12 o'clock rod on :00, so the 60-second loop starts and ends on the same spot.
//
// Orb k turns k + 1 times per minute, all starting at 12. At second s they sit
// at angles 2π(k + 1)s/60, which lands them in exactly 60/gcd(s, 60) groups
// whenever that is ≤ 7 — the same grouping the PS2 shows (:30 → 2, :20 → 3,
// :15 → 4, :12 → 5, :10 → 6, :00 → 1).
import { writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

export const WIDTH = 64, HEIGHT = 48, FPS = 20, SECONDS = 60, ORBS = 7;
const TAU = Math.PI * 2;
const SCALE = 5;
const CX = WIDTH / 2, CY = HEIGHT / 2;
const ORBIT = 12;            // orb swirl radius
const ROD_IN = 16, ROD_OUT = 20; // crystal rods of the clock face
const TRAIL = 0.45;          // seconds of motion trail behind each orb
const mod = (n: number, d: number) => ((n % d) + d) % d;

type Point = { x: number; y: number; z: number };

// The whole clock turns about the vertical axis through the 12 o'clock rod,
// one full turn per minute (face-on at :00 and :30, edge-on at :15 and :45).
// Points on that axis — 12 and 6 o'clock — never move.
const faceTurn = (t: number) => TAU * t / SECONDS;
// The orbs' swirl wobbles about the same axis so it reads as a sphere but
// never collapses into a line; it is face-on at every quarter minute.
const orbTurn = (t: number) => 0.85 * Math.sin(TAU * t / 15);

// Clock angle θ (0 = 12 o'clock, clockwise) on a circle of radius r whose
// plane is turned by φ about the vertical axis.
function project(theta: number, r: number, phi: number): Point {
  const across = r * Math.sin(theta);
  return { x: CX + across * Math.cos(phi), y: CY - r * Math.cos(theta), z: across * Math.sin(phi) };
}

export function orbPositions(seconds: number): Point[] {
  const t = mod(seconds, SECONDS);
  return Array.from({ length: ORBS }, (_, k) => project(TAU * (k + 1) * t / SECONDS, ORBIT, orbTurn(t)));
}

export function renderFrame(seconds: number): Uint8Array {
  const t = mod(seconds, SECONDS);
  const fb = new Uint8Array(WIDTH * HEIGHT);
  const pixel = (x: number, y: number) => {
    x = Math.round(x); y = Math.round(y);
    if (x >= 0 && x < WIDTH && y >= 0 && y < HEIGHT) fb[y * WIDTH + x] = 1;
  };
  const disc = (p: { x: number; y: number }, r: number) => {
    for (let y = -r; y <= r; y++)
      for (let x = -r; x <= r; x++)
        if (x * x + y * y <= r * r + Math.trunc(r / 2)) pixel(p.x + x, p.y + y);
  };

  // Twelve crystal rods. The 12 o'clock rod is the lit "hour" rod.
  const phi = faceTurn(t);
  for (let h = 0; h < 12; h++) {
    const theta = TAU * h / 12;
    for (let r = ROD_IN; r <= ROD_OUT; r += 0.5) {
      const p = project(theta, r, phi);
      if (h === 0) disc(p, 1);
      else pixel(p.x, p.y);
    }
  }

  // Orbs with tapering trails; nearer orbs (z < 0 faces the viewer) are larger.
  for (let k = 0; k < ORBS; k++) {
    const speed = TAU * (k + 1) / SECONDS;
    for (let step = 9; step >= 0; step--) {
      const at = t - TRAIL * step / 9;
      const p = project(speed * at, ORBIT, orbTurn(at));
      disc(p, step === 0 ? (p.z > ORBIT / 3 ? 1 : 2) : step < 5 ? 1 : 0);
    }
  }
  return fb;
}

function path(fb: Uint8Array): string {
  let d = "", px = 0, py = 0;
  for (let y = 0; y < HEIGHT; y++)
    for (let x = 0; x < WIDTH; x++)
      if (fb[y * WIDTH + x]) {
        d += d ? `m${x - px} ${y - py}h0` : `M${x} ${y}h0`;
        px = x; py = y;
      }
  return d || "M0 0";
}

export function generateSvg(color: string): string {
  // Exclude the duplicated endpoint: every frame gets exactly 1/FPS seconds,
  // and frame 0 (all orbs merged at 12) follows the last frame seamlessly.
  const frames = Array.from({ length: FPS * SECONDS }, (_, i) => path(renderFrame(i / FPS)));
  const label = "one minute of the PS2 clock: seven orbs swirl and merge at 12 o'clock";
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${WIDTH * SCALE}" height="${HEIGHT * SCALE}" viewBox="-0.5 -0.5 ${WIDTH} ${HEIGHT}" role="img" aria-label="${label}">
<title>${label}</title>
<style>.still{display:none}@media(prefers-reduced-motion:reduce){.moving{display:none}.still{display:inline}}</style>
<g fill="none" stroke="${color}" stroke-width=".62" stroke-linecap="round">
<path class="still" d="${frames[0]}"/>
<path class="moving" d="${frames[0]}">
<animate attributeName="d" dur="${SECONDS}s" repeatCount="indefinite" calcMode="discrete" values="${frames.join(";")}"/>
</path>
</g>
</svg>
`;
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const out = process.argv[2] ?? ".";
  writeFileSync(resolve(out, "orbs-dark.svg"), generateSvg("#fbcb97"));
  writeFileSync(resolve(out, "orbs-light.svg"), generateSvg("#b5562a"));
  console.log(`${FPS * SECONDS} frames, seamless ${SECONDS}s loop → orbs-dark.svg, orbs-light.svg`);
}
