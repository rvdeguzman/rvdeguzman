import { test } from "node:test";
import assert from "node:assert/strict";
import { FPS, SECONDS, WIDTH, HEIGHT, renderFrame, generateSvg } from "./koi-svg.ts";

const difference = (a: Uint8Array, b: Uint8Array) => a.reduce((sum, pixel, i) => sum + Number(pixel !== b[i]), 0);

test("fish positions, body shapes and ripples repeat exactly every 36 seconds", () => {
  assert.equal(SECONDS, 36);
  for (const t of [0, 0.5, 4, 4.5, 13.5, 22.5, 31.5, 35.5]) {
    assert.deepEqual(renderFrame(t), renderFrame(t + SECONDS));
    assert.deepEqual(renderFrame(t), renderFrame(t - SECONDS));
  }
});

test("the loop boundary is an ordinary swimming step, not a reset", () => {
  const before = renderFrame(SECONDS - 1 / FPS), start = renderFrame(0), after = renderFrame(1 / FPS);
  const boundary = difference(before, start), next = difference(start, after);
  assert.ok(boundary > 0, "fish continue swimming across the boundary");
  assert.ok(boundary < 150, `unexpected jump across boundary: ${boundary} pixels`);
  assert.ok(Math.abs(boundary - next) < 80, "seam is comparable to an adjacent step");
});

test("all frames have visible fish and valid framebuffer dimensions", () => {
  let maxDifference = 0;
  let prev = renderFrame((FPS * SECONDS - 1) / FPS);
  for (let i = 0; i < FPS * SECONDS; i++) {
    const fb = renderFrame(i / FPS);
    assert.equal(fb.length, WIDTH * HEIGHT);
    assert.ok(fb.every(pixel => pixel === 0 || pixel === 1));
    assert.ok(fb.reduce((sum, pixel) => sum + pixel, 0) > 120, `empty pond at frame ${i}`);
    maxDifference = Math.max(maxDifference, difference(prev, fb));
    prev = fb;
  }
  // Expanding pixelated ripple rings change many dots at once; allow those
  // redraws while still catching a wholesale reset of the pond.
  assert.ok(maxDifference < 300, `unexpected frame discontinuity: ${maxDifference} pixels`);
});

test("SVG plays 720 discrete frames forever, without an opacity fade", () => {
  const svg = generateSvg("#fbcb97");
  assert.match(svg, /dur="36s" repeatCount="indefinite" calcMode="discrete"/);
  assert.equal(svg.match(/values="([^"]+)"/)![1].split(";").length, 720);
  assert.doesNotMatch(svg, /attributeName="opacity"/);
  assert.match(svg, /prefers-reduced-motion:reduce/);
  assert.equal(svg, generateSvg("#fbcb97"), "generation is deterministic");
});
