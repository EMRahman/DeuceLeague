import { test } from "node:test";
import assert from "node:assert/strict";
import { pairingKey, roundRobin } from "../dist/index.js";

test("every pairing exactly once: four entries play six matches", () => {
  const pairings = roundRobin(["d", "b", "a", "c"]);
  assert.equal(pairings.length, 6);
  const keys = new Set(pairings.map((p) => p.pairingKey));
  assert.equal(keys.size, 6, "no pairing twice");
  for (const p of pairings) assert.ok(p.side0 !== p.side1, "nobody plays themselves");
});

test("a division of eleven plays fifty-five matches", () => {
  const ids = Array.from({ length: 11 }, (_, i) => `entry-${String(i).padStart(2, "0")}`);
  assert.equal(roundRobin(ids).length, 55);
});

test("the same entries give the same pairings, in whatever order they arrive", () => {
  assert.deepEqual(roundRobin(["c", "a", "d", "b"]), roundRobin(["a", "b", "c", "d"]));
});

test("a late entry adds its own pairings and leaves every existing one alone", () => {
  const before = new Set(roundRobin(["a", "b", "c", "d"]).map((p) => p.pairingKey));
  const after = roundRobin(["a", "b", "c", "d", "e"]).map((p) => p.pairingKey);
  for (const key of before) assert.ok(after.includes(key), key);
  assert.deepEqual(
    after.filter((k) => !before.has(k)),
    ["a|e", "b|e", "c|e", "d|e"],
  );
});

test("one entry, or none, means no matches; a repeated entry counts once", () => {
  assert.deepEqual(roundRobin([]), []);
  assert.deepEqual(roundRobin(["a"]), []);
  assert.equal(roundRobin(["a", "b", "a"]).length, 1);
});

test("a pairing key is the same whichever way round", () => {
  assert.equal(pairingKey("b", "a"), pairingKey("a", "b"));
  assert.equal(pairingKey("a", "b"), "a|b");
});
