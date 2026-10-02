import { test } from "node:test";
import assert from "node:assert/strict";
import { FPS, SECONDS, WIDTH, HEIGHT, ORBS, orbPositions, renderFrame, generateSvg } from "./orbs-svg.ts";

const difference = (a: Uint8Array, b: Uint8Array) => a.reduce((sum, pixel, i) => sum + Number(pixel !== b[i]), 0);
const groups = (seconds: number) =>
  new Set(orbPositions(seconds).map(p => `${p.x.toFixed(6)},${p.y.toFixed(6)}`)).size;

test("the loop is exactly one minute", () => {
  assert.equal(SECONDS, 60);
  for (const t of [0, 0.5, 12, 29.95, 45, 59.95]) {
    assert.deepEqual(renderFrame(t), renderFrame(t + SECONDS));
    assert.deepEqual(renderFrame(t), renderFrame(t - SECONDS));
  }
});

test("all seven orbs start and end merged at 12 o'clock", () => {
  const top = orbPositions(0);
  assert.equal(top.length, ORBS);
  for (const p of [...top, ...orbPositions(SECONDS)]) {
    assert.ok(Math.abs(p.x - WIDTH / 2) < 1e-9, "centered horizontally");
    assert.ok(p.y < HEIGHT / 2, "above the center");
    assert.ok(Math.abs(p.y - top[0].y) < 1e-9, "on the same spot");
  }
  assert.equal(groups(0), 1);
});

test("orbs group like the PS2 clock: 60 / gcd(seconds, 60), else seven", () => {
  const expected: Record<number, number> = { 0: 1, 30: 2, 20: 3, 40: 3, 15: 4, 45: 4, 12: 5, 24: 5, 36: 5, 48: 5, 10: 6, 50: 6 };
  for (let s = 0; s < SECONDS; s++) assert.equal(groups(s), expected[s] ?? 7, `second :${s}`);
});

test("the seam is an ordinary step, not a reset", () => {
  const before = renderFrame(SECONDS - 1 / FPS), start = renderFrame(0), after = renderFrame(1 / FPS);
  assert.ok(difference(before, start) > 0, "orbs keep moving across the seam");
  assert.ok(Math.abs(difference(before, start) - difference(start, after)) < 40, "seam matches an adjacent step");
});

test("every frame is a valid, non-empty framebuffer with smooth motion", () => {
  let prev = renderFrame((FPS * SECONDS - 1) / FPS), maxDifference = 0;
  for (let i = 0; i < FPS * SECONDS; i++) {
    const fb = renderFrame(i / FPS);
    assert.equal(fb.length, WIDTH * HEIGHT);
    assert.ok(fb.reduce((sum, pixel) => sum + pixel, 0) > 40, `empty frame ${i}`);
    maxDifference = Math.max(maxDifference, difference(prev, fb));
    prev = fb;
  }
  assert.ok(maxDifference < 120, `unexpected frame discontinuity: ${maxDifference} pixels`);
});

test("SVG plays 1200 discrete frames forever and starts on the merged orb", () => {
  const svg = generateSvg("#fbcb97");
  assert.match(svg, /dur="60s" repeatCount="indefinite" calcMode="discrete"/);
  const values = svg.match(/values="([^"]+)"/)![1].split(";");
  assert.equal(values.length, FPS * SECONDS);
  assert.match(svg, new RegExp(`class="still" d="${values[0]}"`));
  assert.match(svg, /prefers-reduced-motion:reduce/);
  assert.equal(svg, generateSvg("#fbcb97"), "generation is deterministic");
});
