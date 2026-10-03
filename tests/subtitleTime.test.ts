import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { formatMs, parseMsInput } from "../lib/subtitleTime";

describe("subtitleTime", () => {
  it("formatMs: 65000 → 01:05.000", () => {
    assert.equal(formatMs(65000), "01:05.000");
    assert.equal(formatMs(0), "00:00.000");
    assert.equal(formatMs(1500), "00:01.500");
  });

  it("parseMsInput: mm:ss.mmm", () => {
    assert.equal(parseMsInput("01:05.000"), 65000);
    assert.equal(parseMsInput("1:05"), 65000);
    assert.equal(parseMsInput("00:01.500"), 1500);
  });

  it("parseMsInput: số giây thuần", () => {
    assert.equal(parseMsInput("65"), 65000);
    assert.equal(parseMsInput("1.5"), 1500);
  });

  it("parseMsInput: hậu tố ms", () => {
    assert.equal(parseMsInput("65000ms"), 65000);
  });

  it("parseMsInput: sai định dạng → null", () => {
    assert.equal(parseMsInput(""), null);
    assert.equal(parseMsInput("abc"), null);
    assert.equal(parseMsInput("01:99"), null);
    assert.equal(parseMsInput("-5"), null);
  });

  it("roundtrip format → parse", () => {
    assert.equal(parseMsInput(formatMs(123456)), 123456);
  });
});
