import test from "node:test";
import assert from "node:assert/strict";
import { createSessionId } from "../server/session-id.js";

test("new folder names contain the subject ID and timestamp", () => {
  assert.equal(createSessionId(" S45 ", 1778610081008), "S45_1778610081008");
});

test("invalid subject IDs cannot create Dropbox paths", () => {
  for (const value of [undefined, "", "  ", "../S45", "S45/video", "S45\\video", "a".repeat(81)]) {
    assert.throws(() => createSessionId(value), (error) => error.status === 400);
  }
});
