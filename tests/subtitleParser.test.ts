import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { parseSubtitleInput } from "../lib/subtitleParser";

describe("subtitleParser", () => {
  it("parse SRT cơ bản (--> + index + WEBVTT)", () => {
    const raw = `WEBVTT\n\n1\n00:00:01,000 --> 00:00:03,000\nこんにちは\n\n2\n00:00:04,000 --> 00:00:06,000\nありがとう`;
    const out = parseSubtitleInput(raw);
    assert.equal(out.length, 2);
    assert.equal(out[0].start_time_ms, 1000);
    assert.equal(out[0].end_time_ms, 3000);
    assert.equal(out[0].raw_text, "こんにちは");
  });

  it("parse VTT với dấu chấm", () => {
    const raw = `00:00:01.500 --> 00:00:02.500\nおはよう`;
    const out = parseSubtitleInput(raw);
    assert.equal(out.length, 1);
    assert.equal(out[0].start_time_ms, 1500);
  });

  it("timestamped lines 00:01 + text", () => {
    const raw = `00:01 こんにちは\n00:02 ありがとう\n00:03 さようなら`;
    const out = parseSubtitleInput(raw);
    assert.equal(out.length, 3);
    assert.equal(out[0].start_time_ms, 1_000); // 00:01 = 1 giây
    assert.ok(out[0].end_time_ms > out[0].start_time_ms);
  });

  it("plain mỗi dòng 1 câu 3000ms", () => {
    const raw = `こんにちは\nありがとう`;
    const out = parseSubtitleInput(raw);
    assert.equal(out.length, 2);
    assert.equal(out[0].start_time_ms, 0);
    assert.equal(out[0].end_time_ms, 2800);
    assert.equal(out[1].start_time_ms, 3000);
  });

  it("input rỗng → []", () => {
    assert.deepEqual(parseSubtitleInput("   \n  "), []);
  });

  it("sắp xếp theo start_time_ms", () => {
    const raw = `00:00:05,000 --> 00:00:06,000\nb\n\n00:00:01,000 --> 00:00:02,000\na`;
    const out = parseSubtitleInput(raw);
    assert.equal(out[0].raw_text, "a");
  });

  it("plain song ngữ JP/VI xen kẽ → ghép cặp", () => {
    const raw = `だが人間を襲う泳者を\nNhưng không thể để yên\n乙骨憂太\nOkkotsu Yuta`;
    const out = parseSubtitleInput(raw);
    assert.equal(out.length, 2);
    assert.equal(out[0].raw_text, "だが人間を襲う泳者を");
    assert.equal(out[0].translation, "Nhưng không thể để yên");
    assert.equal(out[1].raw_text, "乙骨憂太");
    assert.equal(out[1].translation, "Okkotsu Yuta");
  });

  it("SRT cue 2 dòng JP+VI → tách translation", () => {
    const raw = `1\n00:00:01,000 --> 00:00:03,000\nこんにちは\nXin chào`;
    const out = parseSubtitleInput(raw);
    assert.equal(out.length, 1);
    assert.equal(out[0].raw_text, "こんにちは");
    assert.equal(out[0].translation, "Xin chào");
  });
});
