import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { getPageCount, clampPage, paginateList } from "../components/TablePager";

describe("TablePager helpers", () => {
  it("getPageCount", () => {
    assert.equal(getPageCount(0, 20), 1);
    assert.equal(getPageCount(20, 20), 1);
    assert.equal(getPageCount(21, 20), 2);
    assert.equal(getPageCount(100, 20), 5);
    assert.equal(getPageCount(100, 0), 1);
  });

  it("clampPage kẹp 2 đầu", () => {
    assert.equal(clampPage(0, 5), 1);
    assert.equal(clampPage(99, 5), 5);
    assert.equal(clampPage(3, 5), 3);
  });

  it("paginateList cắt đúng trang", () => {
    const list = Array.from({ length: 45 }, (_, i) => i + 1);
    assert.deepEqual(paginateList(list, 1, 20), list.slice(0, 20));
    assert.deepEqual(paginateList(list, 3, 20), list.slice(40, 45));
    assert.deepEqual(paginateList(list, 99, 20), list.slice(40, 45));
  });
});
