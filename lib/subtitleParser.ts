import { hasJapanese, pairBilingualLines, splitBilingualCueText } from "./bilingual";

export type ParsedSubtitle = { start_time_ms: number; end_time_ms: number; raw_text: string; translation?: string | null };

function stripFurigana(s: string): string {
  // Xóa furigana kiểu 漢(かん)字(じ) → 漢字
  return s.replace(/([^\s(])\([^)]*\)/g, "$1");
}

function dedupCues(cues: ParsedSubtitle[]): ParsedSubtitle[] {
  const out: ParsedSubtitle[] = [];
  for (const c of cues) {
    const text = stripFurigana(c.raw_text).trim();
    const last = out[out.length - 1];
    if (last && last.raw_text.trim() === text) {
      last.end_time_ms = Math.max(last.end_time_ms, c.end_time_ms);
      continue;
    }
    out.push({ ...c, raw_text: text });
  }
  return out;
}

function cleanScriptText(s: string): string {
  // Bỏ romaji/latin dính vào câu Nhật; giữ nguyên tiếng Việt có dấu
  if (/[ぁ-んァ-ン一-龯]/.test(s)) {
    // Chỉ xóa chuỗi romaji/latin dính ngay sau chữ Nhật, giữ tiếng Việt có dấu
    return s.replace(/([ぁ-んァ-ン一-龯])\s*[a-zA-Z]{2,}/g, "$1").replace(/\s{2,}/g, " ").trim();
  }
  return s.trim();
}

function parseTimeToMs(t: string): number | null {
  const normalized = t.trim().replace(",", ".");
  // remove trailing spaces/punctuation
  const s = normalized.trim();
  const parts = s.split(":");
  if (parts.length === 3) {
    const h = Number(parts[0]);
    const m = Number(parts[1]);
    const sec = Number(parts[2]);
    if (Number.isNaN(h) || Number.isNaN(m) || Number.isNaN(sec)) return null;
    return Math.round((h * 3600 + m * 60 + sec) * 1000);
  }
  if (parts.length === 2) {
    const m = Number(parts[0]);
    const sec = Number(parts[1]);
    if (Number.isNaN(m) || Number.isNaN(sec)) return null;
    return Math.round((m * 60 + sec) * 1000);
  }
  if (parts.length === 1) {
    const sec = Number(parts[0]);
    if (Number.isNaN(sec)) return null;
    return Math.round(sec * 1000);
  }
  return null;
}

// Extract first time token from string like "00:01:34,878" or "00:01:34.878"
function extractTimeToken(s: string): string | null {
  const m = s.match(/(\d{1,2}:\d{2}(?::\d{2})?(?:[.,]\d+)?)/);
  return m ? m[1] : null;
}

export function parseSubtitleInput(raw: string): ParsedSubtitle[] {
  const trimmed = raw.trim();
  if (!trimmed) return [];

  const normalized = trimmed.replace(/\r\n/g, "\n").replace(/\b100:/g, "00:");

  // --- 1) Try robust line-scan for SRT/VTT containing --> ---
  if (normalized.includes("-->")) {
    const lines = normalized.split("\n");
    // Remove WEBVTT header
    let startIdx = 0;
    if (lines[0]?.trim().startsWith("WEBVTT")) startIdx = 1;

    const cues: ParsedSubtitle[] = [];
    let i = startIdx;
    while (i < lines.length) {
      const line = lines[i].trim();
      if (!line.includes("-->")) {
        i++;
        continue;
      }
      // line is timestamp: "00:01:34,878 --> 00:01:34,945" or with extra settings
      const arrowParts = line.split("-->");
      if (arrowParts.length < 2) {
        i++;
        continue;
      }
      const startToken = extractTimeToken(arrowParts[0]);
      const endToken = extractTimeToken(arrowParts[1]);
      if (!startToken || !endToken) {
        i++;
        continue;
      }
      const start = parseTimeToMs(startToken);
      const end = parseTimeToMs(endToken);
      if (start === null || end === null) {
        i++;
        continue;
      }
      // Collect text until next timestamp line or numeric index that precedes timestamp or blank double
      const textLines: string[] = [];
      i++;
      while (i < lines.length) {
        const cur = lines[i];
        const curTrim = cur.trim();
        // Look ahead: if this line contains --> it's next cue
        if (curTrim.includes("-->")) break;
        // If line is numeric index and next non-empty line contains -->, skip index
        if (/^\d+$/.test(curTrim)) {
          // peek next non-empty
          let peek = i + 1;
          while (peek < lines.length && !lines[peek].trim()) peek++;
          if (peek < lines.length && lines[peek].includes("-->")) {
            // this is an index line, skip it
            i++;
            continue;
          }
        }
        // Empty line: if next cue is close, break on empty? Actually cues may be separated by empty, but text could be multi-line
        // We treat empty as cue boundary only if we already collected text and next content is timestamp/index
        if (!curTrim) {
          // check if next non-empty is timestamp
          let peek = i + 1;
          while (peek < lines.length && !lines[peek].trim()) peek++;
          if (peek < lines.length && lines[peek].trim().includes("-->")) break;
          if (peek < lines.length && /^\d+$/.test(lines[peek].trim())) {
            let peek2 = peek + 1;
            while (peek2 < lines.length && !lines[peek2].trim()) peek2++;
            if (peek2 < lines.length && lines[peek2].includes("-->")) break;
          }
          // otherwise empty is just within cue (rare), skip
          i++;
          continue;
        }
        textLines.push(curTrim);
        i++;
        // If we collected and next line is empty and then timestamp, break will handle
      }
      const text = textLines.join("\n").trim();
      // Cue song ngữ: dòng Nhật + dòng Việt → tách JP/VI
      const { jp, vi } = splitBilingualCueText(text);
      if (jp) cues.push({ start_time_ms: start, end_time_ms: end, raw_text: jp, translation: vi });
      // don't increment i here, loop will handle
    }
    if (cues.length > 0) return dedupCues(cues.sort((a, b) => a.start_time_ms - b.start_time_ms));
  }

  // --- 2) Timestamped lines like "00:01 こんにちは" (every line starts with timestamp) ---
  const lines2 = normalized
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean);

  const timeLinePattern = /^\d{1,2}:\d{2}(?::\d{2})?(?:[.,]\d+)?\s+/;
  // Check if at least 70% lines start with timestamp -> treat as timestamped mode
  const tsCount = lines2.filter((l) => timeLinePattern.test(l)).length;
  if (lines2.length > 0 && tsCount >= Math.ceil(lines2.length * 0.6) && tsCount > 0) {
    const out: ParsedSubtitle[] = [];
    for (let idx = 0; idx < lines2.length; idx++) {
      const l = lines2[idx];
      const m = l.match(/^(\d{1,2}:\d{2}(?::\d{2})?(?:[.,]\d+)?)\s*[-–]?\s*(.*)$/);
        if (!m) {
        // Dòng trần không timestamp: bản dịch Việt → gắn vào cue ngay trước.
        // Bỏ qua dòng chứa --> / timestamp lẻ / chỉ số dòng để không nhầm làm dịch Việt.
        if (
          prev &&
          !prev.translation &&
          !hasJapanese(l) &&
          !l.includes("-->") &&
          !/^\d{1,2}:\d{2}/.test(l) &&
          !/^\d+\s*,/.test(l)
        ) {
          prev.translation = l.trim().slice(0, 2000);
        }
        continue;
      }
      const start = parseTimeToMs(m[1]);
      if (start === null) continue;
      const text = m[2].trim();
      if (!text) continue;
      // Also handle lines where timestamp alone and text on next line (YouTube copy)
      // This case already filtered by requiring text same line, but if text empty, peek next
      let actualText = text;
      let nextStart: number | null = null;
      // Find next timestamp line
      for (let j = idx + 1; j < lines2.length; j++) {
        const nm = lines2[j].match(/^(\d{1,2}:\d{2}(?::\d{2})?(?:[.,]\d+)?)/);
        if (nm) {
          nextStart = parseTimeToMs(nm[1]);
          break;
        }
      }
      const end = nextStart !== null && nextStart > start ? nextStart - 150 : start + 3000;
      out.push({ start_time_ms: start, end_time_ms: end, raw_text: actualText });
    }
    // Handle case where timestamp and text are on separate lines (e.g., "00:01:34,878" next line "ヒエエ")
    // If no cues found, try alternating pattern
    if (out.length === 0) {
      // Scan for timestamp-only lines followed by text
      const alt: ParsedSubtitle[] = [];
      for (let idx = 0; idx < lines2.length; idx++) {
        const cur = lines2[idx];
        const tok = extractTimeToken(cur);
        const isTimeOnly = tok !== null && cur.trim() === tok.trim();
        // or timestamp with no trailing text
        const mSolo = cur.match(/^(\d{1,2}:\d{2}(?::\d{2})?(?:[.,]\d+)?)(?:\s*-->.*)?\s*$/);
        if (mSolo) {
          const start = parseTimeToMs(mSolo[1]);
          if (start === null) continue;
          // next non-time line is text
          let textLine: string | null = null;
          let nextIdx = idx + 1;
          while (nextIdx < lines2.length) {
            const nxt = lines2[nextIdx].trim();
            if (!nxt) { nextIdx++; continue; }
            if (/^\d+$/.test(nxt) || /^\d{1,2}:\d{2}/.test(nxt) || nxt.includes("-->")) break;
            textLine = nxt;
            break;
          }
          if (textLine) {
            // Dòng ngay sau text: bản dịch Việt (không chữ Nhật, không phải timestamp) → gắn kèm
            let translation: string | null = null;
            let afterText = nextIdx + 1;
            while (afterText < lines2.length && !lines2[afterText].trim()) afterText++;
            if (afterText < lines2.length) {
              const cand = lines2[afterText].trim();
              if (!/^\d+$/.test(cand) && !/^\d{1,2}:\d{2}/.test(cand) && !cand.includes("-->") && !hasJapanese(cand)) {
                translation = cand.slice(0, 2000);
              }
            }
            // find next timestamp for end
            let nxtStart: number | null = null;
            for (let k = (translation ? afterText : nextIdx) + 1; k < lines2.length; k++) {
              const tk = extractTimeToken(lines2[k]);
              if (tk) { nxtStart = parseTimeToMs(tk); if (nxtStart !== null) break; }
            }
            const end = nxtStart !== null && nxtStart > start ? nxtStart - 150 : start + 2800;
            alt.push({ start_time_ms: start, end_time_ms: end, raw_text: textLine, translation });
          }
        }
      }
      if (alt.length > 0) return dedupCues(alt);
    }
    if (out.length > 0) return dedupCues(out);
  }

  // --- 3) Plain: câu Nhật + bản dịch Việt cách dòng → ghép cặp song ngữ ---
  const cleaned = lines2
    .map((l) => l.replace(/^\d{1,2}:\d{2}(?::\d{2})?(?:[.,]\d+)?\s*(?:-->.*)?\s*[-–]?\s*/, "").trim())
    .map((l) => l.replace(/^\d+\s*$/, "").trim())
    .filter(Boolean);
  const pairs = pairBilingualLines(cleaned);
  const perLineMs = 3000;
  return dedupCues(pairs.map((p, idx) => ({
    start_time_ms: idx * perLineMs,
    end_time_ms: (idx + 1) * perLineMs - 200,
    raw_text: stripFurigana(p.jp),
    translation: p.vi,
  })));
}
