import { test } from "node:test";
import assert from "node:assert/strict";
import { ORBS, SECONDS, SIZE, orbPositions, generateSvg } from "./orbs-glow-svg.ts";

const close = (a: number, b: number) => Math.abs(a - b) < 1e-6;

test("the loop is seamless: positions at 0 s and 60 s match", () => {
  for (const t of [0, 7.3, 31]) {
    orbPositions(t).forEach((p, i) => {
      const q = orbPositions(t + SECONDS)[i];
      assert.ok(close(p.x, q.x) && close(p.y, q.y), `orb ${i} at ${t}s`);
    });
  }
});

test("all seven orbs merge at 12 o'clock at :00", () => {
  const orbs = orbPositions(0);
  assert.equal(orbs.length, ORBS);
  for (const p of orbs) assert.ok(close(p.x, SIZE / 2) && p.y < SIZE / 2);
});

test("the ring stays a fixed size (no breathing) and inside the canvas", () => {
  for (let t = 0; t < SECONDS; t += 0.25)
    for (const p of orbPositions(t)) assert.ok(p.x > 0 && p.x < SIZE && p.y > 0 && p.y < SIZE);
  // Orb 0 rides 21 turns/min, so it is back at 12 o'clock after every 60/21 s.
  const top = orbPositions(0)[0].y;
  for (const turns of [5, 10, 20]) assert.ok(close(orbPositions((turns * 60) / 21)[0].y, top), `after ${turns} turns`);
});

test("one keyframe track per orb, blurred, with a reduced-motion pause", () => {
  const svg = generateSvg();
  for (let i = 0; i < ORBS; i++) assert.ok(svg.includes(`@keyframes o${i}{`));
  assert.ok(svg.includes("<feGaussianBlur"));
  assert.ok(svg.includes("prefers-reduced-motion:reduce"));
});
