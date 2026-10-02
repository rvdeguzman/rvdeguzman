import { test } from "node:test";
import assert from "node:assert/strict";
import { FPS, SECONDS, MINUTE, SPEED, WIDTH, HEIGHT, ORBS, orbWorld, orbPositions, renderFrame, generateSvg } from "./orbs-svg.ts";

const difference = (a: Uint8Array, b: Uint8Array) => a.reduce((sum, pixel, i) => sum + Number(pixel !== b[i]), 0);
const groups = (ps2Second: number) =>
  new Set(orbWorld(ps2Second).map(p => p.map(v => v.toFixed(6)).join())).size;

test("one PS2 minute plays as a faster seamless loop", () => {
  assert.equal(MINUTE, 60);
  assert.ok(SPEED > 1, "faster than real time");
  assert.equal(SECONDS, MINUTE / SPEED);
  for (const t of [0, 0.5, 6, SECONDS / 2, SECONDS - 1 / FPS]) {
    assert.deepEqual(renderFrame(t), renderFrame(t + SECONDS));
    assert.deepEqual(renderFrame(t), renderFrame(t - SECONDS));
  }
});

test("all seven orbs start and end merged on the 12 o'clock hand", () => {
  for (const ps2Second of [0, MINUTE]) {
    const orbs = orbWorld(ps2Second);
    assert.equal(orbs.length, ORBS);
    for (const [x, y, z] of orbs) {
      assert.ok(Math.abs(x) < 1e-9 && Math.abs(z) < 1e-9, "on the vertical axis, facing the viewer");
      assert.ok(y > 0, "above the centre");
    }
  }
  const [first] = orbPositions(0);
  assert.ok(Math.abs(first.x - (WIDTH - 1) / 2) < 1e-9 && first.y < HEIGHT / 2);
  assert.equal(groups(0), 1);
});

test("orbs group like the PS2 clock: 60 / gcd(seconds, 60), else seven", () => {
  const expected: Record<number, number> = { 0: 1, 30: 2, 20: 3, 40: 3, 15: 4, 45: 4, 12: 5, 24: 5, 36: 5, 48: 5, 10: 6, 50: 6 };
  for (let s = 0; s < MINUTE; s++) assert.equal(groups(s), expected[s] ?? 7, `second :${s}`);
});

test("orbs stay inside the frame", () => {
  for (let i = 0; i < FPS * SECONDS; i++)
    for (const p of orbPositions(i / FPS))
      assert.ok(p.x > 2 && p.x < WIDTH - 3 && p.y > 2 && p.y < HEIGHT - 3, `orb off-frame at frame ${i}`);
});

test("every frame is a valid halftone", () => {
  for (let i = 0; i < FPS * SECONDS; i++) {
    const fb = renderFrame(i / FPS);
    assert.equal(fb.length, WIDTH * HEIGHT);
    assert.ok(fb.every(level => level <= 3));
    assert.ok(fb.some(level => level === 3), `no orb core at frame ${i}`);
  }
  assert.ok(difference(renderFrame(SECONDS - 1 / FPS), renderFrame(0)) > 0, "orbs keep moving across the seam");
});

test("orbs move smoothly, and the seam is an ordinary step", () => {
  const step = (i: number) => {
    const a = orbPositions(i / FPS), b = orbPositions((i + 1) / FPS);
    return Math.max(...a.map((p, k) => Math.hypot(p.x - b[k].x, p.y - b[k].y)));
  };
  const steps = Array.from({ length: FPS * SECONDS }, (_, i) => step(i));
  const max = Math.max(...steps);
  assert.ok(max < 5, `orbs jump ${max.toFixed(1)} dots in one frame`);
  const [before, seam, after] = [steps[steps.length - 2], steps[steps.length - 1], steps[0]];
  assert.ok(seam < 1.5 * Math.max(before, after), `seam step ${seam.toFixed(2)} vs ${before.toFixed(2)}, ${after.toFixed(2)}`);
});

test("SVG plays three brightness layers forever, starting on the merged orb", () => {
  const svg = generateSvg("#fbcb97");
  const animations = svg.match(/<animate [^>]+>/g)!;
  assert.equal(animations.length, 3);
  for (const animation of animations) {
    assert.match(animation, new RegExp(`dur="${SECONDS}s" repeatCount="indefinite" calcMode="discrete"`));
    assert.equal(animation.match(/values="([^"]+)"/)![1].split(";").length, FPS * SECONDS);
  }
  assert.match(svg, /prefers-reduced-motion:reduce/);
  assert.equal(svg, generateSvg("#fbcb97"), "generation is deterministic");
});
