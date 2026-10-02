// A README-only, periodic version of the braille-koi drawing style.
// Closed paths and whole-number tail beats make the loop seamless. This
// deliberately does not change or depend on the interactive pond simulation.
import { writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

export const WIDTH = 160, HEIGHT = 40, FPS = 20, SECONDS = 36;
const TAU = Math.PI * 2;
const TRAIL = 9;
const SCALE = 5;
const mod = (n: number, d: number) => ((n % d) + d) % d;

// Each fish takes a different closed route, with a gently varying pace.
const fish = [
  { cx: 67, cy: 20, rx: 52, ry: 10, phase: 0.06, direction: 1, laps: 1, beats: 54, kind: 0 },
  { cx: 96, cy: 19, rx: 48, ry: 9, phase: 0.44, direction: -1, laps: 1, beats: 57, kind: 1 },
  { cx: 80, cy: 20, rx: 63, ry: 12, phase: 0.72, direction: 1, laps: 1, beats: 51, kind: 1 },
  { cx: 85, cy: 20, rx: 50, ry: 8, phase: 0.29, direction: -1, laps: 2, beats: 66, kind: 2 },
];

type Fish = typeof fish[number];
type Point = { x: number; y: number };

function position(f: Fish, turn: number): Point {
  const a = TAU * (f.phase + f.direction * f.laps * turn);
  const angle = a + 0.16 * Math.sin(a * 2);
  return {
    x: f.cx + f.rx * Math.cos(angle),
    y: f.cy + f.ry * Math.sin(angle) + 1.2 * Math.sin(angle * 3),
  };
}

// Sample backwards along the route at equal distances, rather than equal
// times: the narrow end of an ellipse must not bunch the body into a blob.
function body(f: Fish, turn: number): Point[] {
  const points = [position(f, turn)];
  let prev = points[0], distance = 0, sample = turn;
  const step = 1 / (8192 * f.laps);
  while (points.length < TRAIL) {
    sample -= step;
    const next = position(f, sample);
    const segment = Math.hypot(next.x - prev.x, next.y - prev.y);
    if (distance + segment >= 2) {
      const ratio = (2 - distance) / segment;
      const point = { x: prev.x + (next.x - prev.x) * ratio, y: prev.y + (next.y - prev.y) * ratio };
      points.push(point);
      distance = Math.hypot(next.x - point.x, next.y - point.y);
    } else distance += segment;
    prev = next;
  }
  return points;
}

export function renderFrame(seconds: number): Uint8Array {
  const t = mod(seconds, SECONDS), turn = t / SECONDS;
  const fb = new Uint8Array(WIDTH * HEIGHT);
  const pixel = (x: number, y: number, on = 1) => {
    x = Math.round(x); y = Math.round(y);
    if (x >= 0 && x < WIDTH && y >= 0 && y < HEIGHT) fb[y * WIDTH + x] = on;
  };
  const disc = (p: Point, r: number, on = 1) => {
    for (let y = -r; y <= r; y++)
      for (let x = -r; x <= r; x++)
        if (x * x + y * y <= r * r + Math.trunc(r / 2)) pixel(p.x + x, p.y + y, on);
  };

  for (const f of fish) {
    const trail = body(f, turn);
    // Same taper, patches, pectoral fins and splayed tail as braille-koi.
    const radii = f.kind === 2 ? [1, 1, 1, 1, 1, 0, 0, 0, 0] : [2, 2, 2, 2, 1, 1, 1, 0, 0];
    const bent = trail.map((p, k) => {
      const a = trail[Math.max(0, k - 1)], b = trail[Math.min(TRAIL - 1, k + 1)];
      const angle = Math.atan2(a.y - b.y, a.x - b.x) + Math.PI / 2;
      const off = (1.75 * k / (TRAIL - 1)) * Math.sin(TAU * (f.beats * turn + f.phase) - k * 28 * TAU / 256);
      return { x: Math.round(p.x + off * Math.cos(angle)), y: Math.round(p.y + off * Math.sin(angle)) };
    });
    for (let k = TRAIL - 2; k >= 0; k--) disc(bent[k], radii[k]);
    const tail = bent[TRAIL - 1], before = bent[TRAIL - 3];
    const nx = -Math.sign(tail.y - before.y), ny = Math.sign(tail.x - before.x);
    pixel(tail.x + nx, tail.y + ny);
    pixel(tail.x - nx, tail.y - ny);
    if (f.kind !== 2) {
      pixel(tail.x + 2 * nx, tail.y + 2 * ny);
      pixel(tail.x - 2 * nx, tail.y - 2 * ny);
      const mx = -Math.sign(bent[0].y - bent[2].y), my = Math.sign(bent[0].x - bent[2].x);
      pixel(bent[2].x + 3 * mx, bent[2].y + 3 * my);
      pixel(bent[2].x - 3 * mx, bent[2].y - 3 * my);
    }
    if (f.kind === 1) {
      disc(bent[1], 1, 0);
      pixel(bent[4].x, bent[4].y, 0);
    } else if (f.kind === 0) pixel(bent[5].x, bent[5].y, 0);
  }

  // All ripples finish well before the seam. No global opacity fade.
  for (const ripple of [{ at: 4, x: 42, y: 17 }, { at: 13, x: 113, y: 23 }, { at: 22, x: 73, y: 15 }, { at: 31, x: 98, y: 26 }]) {
    const age = t - ripple.at;
    if (age < 0 || age > 1.1) continue;
    for (const r of [1 + Math.floor(age * 14), Math.floor(age * 14) - 2]) {
      if (r < 1) continue;
      let x = r, y = 0, err = 1 - r, n = 0;
      while (x >= y) {
        const points = [[x, y], [y, x], [-y, x], [-x, y], [-x, -y], [-y, -x], [y, -x], [x, -y]];
        points.forEach(([dx, dy], i) => { if (age < 0.55 || (n + i) % 2) pixel(ripple.x + dx, ripple.y + dy); });
        y++; n++;
        if (err < 0) err += 2 * y + 1;
        else { x--; err += 2 * (y - x) + 1; }
      }
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
  // Exclude the duplicated endpoint: every frame gets exactly 1/FPS seconds.
  const frames = Array.from({ length: FPS * SECONDS }, (_, i) => path(renderFrame(i / FPS)));
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${WIDTH * SCALE}" height="${HEIGHT * SCALE}" viewBox="-0.5 -0.5 ${WIDTH} ${HEIGHT}" role="img" aria-label="a seamless braille-style koi pond">
<title>a seamless braille-style koi pond</title>
<style>.still{display:none}@media(prefers-reduced-motion:reduce){.swimming{display:none}.still{display:inline}}</style>
<defs>
<linearGradient id="fx"><stop offset="0" stop-color="#000"/><stop offset=".08" stop-color="#fff"/><stop offset=".92" stop-color="#fff"/><stop offset="1" stop-color="#000"/></linearGradient>
<linearGradient id="fy" x2="0" y2="1"><stop offset="0" stop-color="#000"/><stop offset=".15" stop-color="#fff"/><stop offset=".85" stop-color="#fff"/><stop offset="1" stop-color="#000"/></linearGradient>
<mask id="m"><rect x="-0.5" y="-0.5" width="${WIDTH}" height="${HEIGHT}" fill="url(#fx)"/></mask>
<mask id="n"><rect x="-0.5" y="-0.5" width="${WIDTH}" height="${HEIGHT}" fill="url(#fy)"/></mask>
</defs>
<g mask="url(#n)"><g mask="url(#m)" fill="none" stroke="${color}" stroke-width=".62" stroke-linecap="round">
<path class="still" d="${frames[0]}"/>
<path class="swimming" d="${frames[0]}">
<animate attributeName="d" dur="${SECONDS}s" repeatCount="indefinite" calcMode="discrete" values="${frames.join(";")}"/>
</path>
</g></g>
</svg>
`;
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const out = process.argv[2] ?? ".";
  writeFileSync(resolve(out, "koi-dark.svg"), generateSvg("#fbcb97"));
  writeFileSync(resolve(out, "koi-light.svg"), generateSvg("#b5562a"));
  console.log(`${FPS * SECONDS} frames, seamless ${SECONDS}s loop → koi-dark.svg, koi-light.svg`);
}
