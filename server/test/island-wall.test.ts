import assert from "node:assert/strict";
import test from "node:test";
import { checkMessage, islandWall } from "../src/island-wall.js";

test("message validation normalizes and accepts ordinary Unicode", () => {
  assert.deepEqual(checkMessage("  café 🌱  "), { message: "café 🌱" });
  assert.deepEqual(checkMessage("e\u0301"), { message: "é" });
});

test("message validation rejects malformed, oversized, linked, and invisible content", () => {
  assert.equal("error" in checkMessage(null), true);
  assert.equal("error" in checkMessage("x".repeat(141)), true);
  assert.equal("error" in checkMessage("Visit https://example.org"), true);
  assert.equal("error" in checkMessage("hello\u202e"), true);
  assert.equal("error" in checkMessage("\u0000"), true);
});

test("public submission reports malformed JSON without a database", async () => {
  const response = await islandWall.request("/", { method: "POST", headers: { "content-type": "application/json" }, body: "{" });
  assert.equal(response.status, 400);
});

test("admin routes reject missing authorization before database access", async () => {
  const pending = await islandWall.request("/pending");
  const approve = await islandWall.request("/1/approve", { method: "PATCH" });
  const hide = await islandWall.request("/1", { method: "DELETE" });
  assert.equal(pending.status, 401);
  assert.equal(approve.status, 401);
  assert.equal(hide.status, 401);
});

test("valid admin credentials reach the database check", async () => {
  const previous = process.env.ADMIN_TOKEN;
  process.env.ADMIN_TOKEN = "test-token";
  try {
    const response = await islandWall.request("/pending", { headers: { authorization: "Bearer test-token" } });
    assert.equal(response.status, 503);
  } finally {
    if (previous === undefined) delete process.env.ADMIN_TOKEN;
    else process.env.ADMIN_TOKEN = previous;
  }
});

test("submission limiter rejects the fourth request per client", async () => {
  const request = () => islandWall.request("/", {
    method: "POST", headers: { "content-type": "application/json", "x-forwarded-for": "198.51.100.77" },
    body: JSON.stringify({ name: "A visitor", message: "Hello 🌼", flower: "daisy", color: "coral" }),
  });
  for (let i = 0; i < 3; i++) assert.equal((await request()).status, 503);
  assert.equal((await request()).status, 429);
});
