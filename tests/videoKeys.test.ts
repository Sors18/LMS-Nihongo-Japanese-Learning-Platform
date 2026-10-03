import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { arrowSeekDeltaMs } from "../components/VideoPlayer";

describe("arrowSeekDeltaMs", () => {
  it("←/→ = ∓5s kiểu YouTube", () => {
    assert.equal(arrowSeekDeltaMs("ArrowLeft"), -5000);
    assert.equal(arrowSeekDeltaMs("ArrowRight"), 5000);
  });

  it("phím khác → null", () => {
    assert.equal(arrowSeekDeltaMs(" "), null);
    assert.equal(arrowSeekDeltaMs("ArrowUp"), null);
    assert.equal(arrowSeekDeltaMs("a"), null);
  });
});
