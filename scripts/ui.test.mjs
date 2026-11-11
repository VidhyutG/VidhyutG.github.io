import assert from "node:assert/strict";
import { test } from "node:test";
import { bezelMap } from "../assets/js/glass.js";
import { score } from "../assets/js/palette.js";

test("the refraction map bends the rim inward and leaves the middle flat", () => {
  const width = 240;
  const height = 60;
  const { data, reach } = bezelMap(width, height, 30, 16);
  const at = (x, y) => [
    ...data.slice((y * width + x) * 4, (y * width + x) * 4 + 4),
  ];
  assert(reach > 0 && Number.isFinite(reach));
  // The flat middle of the pane does not move anything.
  assert.deepEqual(at(120, 30), [128, 128, 0, 255]);
  // Along the top rim light is pulled down, toward the middle; along the bottom, up.
  assert(at(120, 1)[1] > 150, "top rim should sample from below");
  assert(at(120, 58)[1] < 106, "bottom rim should sample from above");
  assert.equal(
    at(120, 1)[0],
    128,
    "a straight edge bends in one direction only",
  );
  // At the left cap it is pulled to the right.
  assert(at(1, 30)[0] > 150, "left rim should sample from the right");
  // Outside the rounded corner nothing is drawn, so nothing is bent.
  assert.deepEqual(at(1, 1), [128, 128, 0, 255]);
  // The bend fades smoothly toward the middle.
  assert(at(120, 1)[1] > at(120, 6)[1] && at(120, 6)[1] > at(120, 12)[1]);
});

test("the refraction map never reaches past the pane", () => {
  for (const [width, height, radius, bezel] of [
    [44, 44, 22, 14],
    [400, 56, 28, 14],
    [580, 420, 26, 18],
  ]) {
    const { data, reach } = bezelMap(width, height, radius, bezel);
    assert.equal(data.length, width * height * 4);
    assert(reach < Math.min(width, height), "a shift larger than the pane");
    for (let i = 0; i < data.length; i += 4) assert.equal(data[i + 3], 255);
  }
});

test("command search finds words in order and ranks whole matches first", () => {
  assert.equal(score("", "anything"), 0);
  assert.equal(score("xyz", "Open GitHub"), -1);
  assert(score("gh", "Open GitHub") > 0, "letters in order should match");
  assert(
    score("rev", "Route a new board revision") >
      score("rev", "get in touch resume cv"),
    "a word that starts with the query should beat scattered letters",
  );
  assert(
    score("work", "Work") > score("work", "Take the platform apart"),
    "an exact match should win",
  );
});
