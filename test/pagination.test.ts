import assert from "node:assert";
import { cursorFrom, isAfterCursor } from "../src/lib/pagination";

const at = new Date("2026-08-28T12:00:00.000Z");
const cursor = cursorFrom({ id: "b", timestamp: at });

assert.deepEqual(cursor, { id: "b", timestamp: at.toISOString() });
assert.equal(isAfterCursor({ id: "a", timestamp: at }, cursor), true, "id breaks equal timestamps without duplicates");
assert.equal(isAfterCursor({ id: "b", timestamp: at }, cursor), false, "cursor row is excluded");
assert.equal(isAfterCursor({ id: "c", timestamp: at }, cursor), false, "earlier page row is excluded");
assert.equal(isAfterCursor({ id: "z", timestamp: new Date(at.getTime() - 1) }, cursor), true, "older rows continue descending pages");
assert.equal(isAfterCursor({ id: "c", timestamp: at }, cursor, "asc"), true, "ascending cursors reverse the boundary");

console.log("pagination: ok");
