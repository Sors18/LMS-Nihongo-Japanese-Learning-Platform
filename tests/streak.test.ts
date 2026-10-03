import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { formatDateKey, getMidnight, addDays } from "../lib/streak";

describe("streak helpers", () => {
  it("formatDateKey: YYYY-MM-DD local", () => {
    assert.equal(formatDateKey(new Date(2026, 0, 5)), "2026-01-05");
    assert.equal(formatDateKey(new Date(2026, 11, 25)), "2026-12-25");
  });

  it("getMidnight: về 00:00", () => {
    const m = getMidnight(new Date(2026, 5, 10, 15, 30, 45));
    assert.equal(m.getHours(), 0);
    assert.equal(m.getMinutes(), 0);
    assert.equal(m.getDate(), 10);
  });

  it("addDays: cộng/trừ ngày", () => {
    const d = new Date(2026, 0, 31);
    assert.equal(formatDateKey(addDays(d, 1)), "2026-02-01");
    assert.equal(formatDateKey(addDays(d, -1)), "2026-01-30");
  });
});
