import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { scrolledAwayFromActive, FOLLOW_THRESHOLD_PX, nearestIndicesFirst, SEEK_WINDOW, seekFocusWindow, isSeekJump, SEEK_FOCUS_AFTER, SEEK_JUMP_DELTA } from "../lib/subtitleFollow";

describe("subtitle follow 2 chiều", () => {
  it("kéo xuống (active trôi lên trên viewport) → đọc tự do", () => {
    // panel top=100, active top=-250 (trôi lên trên 350px)
    assert.equal(scrolledAwayFromActive(-250, 100), true);
  });

  it("kéo lên (active tụt xuống dưới viewport) → đọc tự do", () => {
    // panel top=100, active top=550 (tụt xuống dưới 450px)
    assert.equal(scrolledAwayFromActive(550, 100), true);
  });

  it("đối xứng 2 chiều: lệch ±200 cho cùng kết quả", () => {
    assert.equal(
      scrolledAwayFromActive(100 - 8 - 200, 100),
      scrolledAwayFromActive(100 - 8 + 200, 100)
    );
  });

  it("quanh câu active (±80px) → vẫn bám", () => {
    assert.equal(scrolledAwayFromActive(108, 100), false);
    assert.equal(scrolledAwayFromActive(100 - 8 + 50, 100), false);
    assert.equal(scrolledAwayFromActive(100 - 8 - 50, 100), false);
  });

  it(`ngưỡng = ${FOLLOW_THRESHOLD_PX}px`, () => {
    assert.equal(FOLLOW_THRESHOLD_PX, 80);
  });
});

describe("nearestIndicesFirst (ưu tiên điểm tua)", () => {
  it("điểm tua ở giữa → gần trước, xa sau", () => {
    assert.deepEqual(nearestIndicesFirst([0, 1, 2, 197, 198, 199, 200, 201, 202], 200), [
      200, 199, 201, 198, 202, 197, 2, 1, 0,
    ]);
  });

  it("SEEK_WINDOW = 10 sub mỗi bên", () => {
    assert.equal(SEEK_WINDOW, 10);
  });

  it("không có active (-1) → giữ nguyên thứ tự", () => {
    assert.deepEqual(nearestIndicesFirst([5, 3, 9], -1), [5, 3, 9]);
  });

  it("mảng rỗng → rỗng", () => {
    assert.deepEqual(nearestIndicesFirst([], 50), []);
  });

  it("không mutate mảng gốc", () => {
    const src = [0, 100, 50];
    nearestIndicesFirst(src, 50);
    assert.deepEqual(src, [0, 100, 50]);
  });
});

describe("seekFocusWindow (tua lấy ngay điểm tua + 5 dòng)", () => {
  it("điểm tua + 5 dòng sau", () => {
    assert.deepEqual(seekFocusWindow(200, 300), [200, 201, 202, 203, 204, 205]);
    assert.equal(SEEK_FOCUS_AFTER, 5);
  });

  it("kẹp cuối danh sách", () => {
    assert.deepEqual(seekFocusWindow(298, 300), [298, 299]);
  });

  it("không active / rỗng → rỗng", () => {
    assert.deepEqual(seekFocusWindow(-1, 300), []);
    assert.deepEqual(seekFocusWindow(10, 0), []);
  });
});

describe("isSeekJump", () => {
  it("nhảy xa → true, chạy từng câu → false", () => {
    assert.equal(isSeekJump(10, 200), true);
    assert.equal(isSeekJump(10, 11), false);
    assert.equal(isSeekJump(10, 13), false);
    assert.equal(isSeekJump(10, 14), true);
    assert.equal(SEEK_JUMP_DELTA, 3);
  });

  it("không active → false; mở video giữa chừng → true", () => {
    assert.equal(isSeekJump(50, -1), false);
    assert.equal(isSeekJump(-1, 200), true);
    assert.equal(isSeekJump(-1, 5), false);
  });
});
