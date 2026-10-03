import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { scheduleReview, clampQuality } from "../lib/srs";

describe("srs SM-2", () => {
  it("Again (q=2) reset chuỗi, due sau ~10 phút", () => {
    const now = new Date("2026-01-01T00:00:00Z");
    const r = scheduleReview({ interval: 6, ease: 2.5, repetitions: 3 }, 2, now);
    assert.equal(r.repetitions, 0);
    assert.equal(r.interval, 0);
    assert.equal(r.status, "LEARNING");
    assert.equal(r.due_at.getTime() - now.getTime(), 10 * 60_000);
  });

  it("Good lần 1 → interval 1 ngày", () => {
    const r = scheduleReview({ interval: 0, ease: 2.5, repetitions: 0 }, 4);
    assert.equal(r.interval, 1);
    assert.equal(r.repetitions, 1);
    assert.equal(r.status, "LEARNING");
  });

  it("Good lần 2 → interval 6 ngày", () => {
    const r = scheduleReview({ interval: 1, ease: 2.5, repetitions: 1 }, 4);
    assert.equal(r.interval, 6);
  });

  it("Lần 3+ nhân ease, Easy tăng ease", () => {
    const r = scheduleReview({ interval: 6, ease: 2.5, repetitions: 2 }, 5);
    assert.ok(r.interval >= 6);
    assert.ok(r.ease >= 2.5);
  });

  it("interval >=21 → MASTERED", () => {
    const r = scheduleReview({ interval: 20, ease: 2.5, repetitions: 4 }, 4);
    assert.equal(r.status, "MASTERED");
  });

  it("ease không rớt dưới 1.3", () => {
    const r = scheduleReview({ interval: 1, ease: 1.3, repetitions: 1 }, 3);
    assert.ok(r.ease >= 1.3);
  });

  it("clampQuality kẹp 0..5", () => {
    assert.equal(clampQuality(99), 5);
    assert.equal(clampQuality(-3), 0);
    assert.equal(clampQuality("x"), 0);
  });
});
