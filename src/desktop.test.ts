import test from "node:test";
import assert from "node:assert/strict";
import { computerName } from "./desktop.ts";

test("a new computer is named by Windows unless Windows made the name up, then after you (D77)", () => {
  assert.equal(computerName("OFFICE-PC", "Carlos"), "OFFICE-PC");
  assert.equal(computerName("DESKTOP-4F2K1AB", "Carlos"), "Carlos's computer");
  assert.equal(computerName("WIN-N18PVDJMC9C", " Carlos "), "Carlos's computer");
  assert.equal(computerName("LAPTOP-9QX2", ""), "This computer");
  assert.equal(computerName("", "Ana"), "Ana's computer");
});
