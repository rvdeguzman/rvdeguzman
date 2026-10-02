// Record the braille-koi pond into animated SVGs for the profile README.
// GitHub can't run the live component, so this replays the same simulation
// offline and stores each frame as one path; SMIL swaps them in a loop.
//
// usage: node --experimental-strip-types scripts/koi-svg.ts <braille-koi dir> <out dir>

import { writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

const [src = "../braille-koi", out = "."] = process.argv.slice(2);
const { Pond } = await import(pathToFileURL(resolve(src, "src/pond.ts")).href);

const W = 160, H = 40, FISH = 4, SEED = 0x6b6f69;
const FPS = 20, SECONDS = 12, WARMUP_MS = 4000;
const SCALE = 5; // screen px per pond pixel: braille dots sit on an even grid
const FADE = 0.5; // seconds to fade out/in around the loop seam

const pond = new Pond({ width: W, height: H, fish: FISH, seed: SEED });
const step = 1000 / FPS;
let t = 0;
let nextDrop = 1500;
let rng = SEED;
const rand = () => ((rng = (Math.imul(rng, 1664525) + 1013904223) >>> 0) / 2 ** 32);
const tick = () => {
  if (t >= nextDrop) {
    pond.dropRandom(t);
    nextDrop = t + 1800 + rand() * 2200;
  }
  pond.render(t, 40);
  t += step;
};
for (; t < WARMUP_MS; ) tick();

const frames: string[] = [];
for (let i = 0; i < FPS * SECONDS; i++) {
  tick();
  // relative moves between dots keep each frame short
  let d = "", px = 0, py = 0;
  for (let y = 0; y < H; y++)
    for (let x = 0; x < W; x++)
      if (pond.fb[y * W + x]) {
        d += d ? `m${x - px} ${y - py}h0` : `M${x} ${y}h0`;
        px = x;
        py = y;
      }
  frames.push(d || "M0 0");
}

const dur = `${SECONDS}s`;
const fadeIn = (FADE / SECONDS).toFixed(4), fadeOut = (1 - FADE / SECONDS).toFixed(4);

const svg = (color: string) => `<svg xmlns="http://www.w3.org/2000/svg" width="${W * SCALE}" height="${H * SCALE}" viewBox="-0.5 -0.5 ${W} ${H}" role="img" aria-label="a braille koi pond">
<title>a braille koi pond</title>
<defs>
<linearGradient id="fx"><stop offset="0" stop-color="#000"/><stop offset=".08" stop-color="#fff"/><stop offset=".92" stop-color="#fff"/><stop offset="1" stop-color="#000"/></linearGradient>
<linearGradient id="fy" x2="0" y2="1"><stop offset="0" stop-color="#000"/><stop offset=".15" stop-color="#fff"/><stop offset=".85" stop-color="#fff"/><stop offset="1" stop-color="#000"/></linearGradient>
<mask id="m" maskContentUnits="userSpaceOnUse"><rect x="-0.5" y="-0.5" width="${W}" height="${H}" fill="url(#fx)"/></mask>
<mask id="n" maskContentUnits="userSpaceOnUse"><rect x="-0.5" y="-0.5" width="${W}" height="${H}" fill="url(#fy)"/></mask>
</defs>
<g mask="url(#n)"><g mask="url(#m)">
<path fill="none" stroke="${color}" stroke-width=".62" stroke-linecap="round" d="${frames[0]}">
<animate attributeName="d" dur="${dur}" repeatCount="indefinite" calcMode="discrete" values="${frames.join(";")}"/>
<animate attributeName="opacity" dur="${dur}" repeatCount="indefinite" values="0;1;1;0" keyTimes="0;${fadeIn};${fadeOut};1"/>
</path>
</g></g>
</svg>
`;

writeFileSync(resolve(out, "koi-dark.svg"), svg("#fbcb97"));
writeFileSync(resolve(out, "koi-light.svg"), svg("#b5562a"));
console.log(`${frames.length} frames → koi-dark.svg, koi-light.svg`);
