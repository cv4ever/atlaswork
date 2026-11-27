import test from "node:test";
import assert from "node:assert/strict";
import { moonPhase, placeOf, sunTimes } from "./sky.ts";

const minutes = (hours: number) => Math.round(hours * 60);

test("Lisbon's sun rises and sets within a few minutes of the almanac", () => {
  // timeanddate.com, Lisbon, 18 November 2026: 07:22 and 17:21 (WET, UTC+0).
  const { lat, lon } = placeOf("Europe/Lisbon", 0);
  const { rise, set } = sunTimes(new Date(Date.UTC(2026, 10, 18, 12)), lat, lon, 0);
  assert.ok(Math.abs(minutes(rise) - (7 * 60 + 22)) <= 4, `rise ${rise}`);
  assert.ok(Math.abs(minutes(set) - (17 * 60 + 21)) <= 4, `set ${set}`);
});

test("summer time moves the clock times, not the daylight", () => {
  // Berlin, 21 June 2026 (CEST, UTC+2): about 04:43 and 21:33.
  const { lat, lon } = placeOf("Europe/Berlin", 60);
  const { rise, set } = sunTimes(new Date(Date.UTC(2026, 5, 21, 12)), lat, lon, 120);
  assert.ok(Math.abs(minutes(rise) - (4 * 60 + 43)) <= 6, `rise ${rise}`);
  assert.ok(Math.abs(minutes(set) - (21 * 60 + 33)) <= 6, `set ${set}`);
});

test("polar winter has no daylight and polar summer no night", () => {
  const winter = sunTimes(new Date(Date.UTC(2026, 11, 21, 12)), 78, 15, 60);
  assert.equal(winter.rise, winter.set);
  assert.deepEqual(sunTimes(new Date(Date.UTC(2026, 5, 21, 12)), 78, 15, 120), { rise: 0, set: 24 });
});

test("the moon's phase follows the almanac's new, first quarter and full moons", () => {
  // November 2026: new moon on the 9th, first quarter on the 17th, full on the 24th.
  assert.ok(moonPhase(new Date(Date.UTC(2026, 10, 9, 12))) < 0.03 || moonPhase(new Date(Date.UTC(2026, 10, 9, 12))) > 0.97);
  assert.ok(Math.abs(moonPhase(new Date(Date.UTC(2026, 10, 17, 12))) - 0.25) < 0.03);
  assert.ok(Math.abs(moonPhase(new Date(Date.UTC(2026, 10, 24, 12))) - 0.5) < 0.03);
});

test("a zone without a city falls back to its hemisphere and standard meridian", () => {
  assert.deepEqual(placeOf("Africa/Lagos", 60), { lat: 40, lon: 15 });
  assert.equal(placeOf("America/Argentina/Cordoba", -180).lat, -30);
});
