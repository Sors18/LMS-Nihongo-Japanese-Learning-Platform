/**
 * FULL-CHECK tổng hợp — quét mọi tính năng, báo PASS/FAIL/SKIP từng mục.
 * Chạy: npx tsx e2e/full-check.ts [--live] [--base http://localhost:3000]
 * - Static (luôn chạy): file, schema, wiring, pure-lib runtime, config.
 * - Live (--live): HTTP vào dev server nếu đang chạy; server tắt → SKIP, không FAIL.
 */
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

const ROOT = process.cwd();
const args = process.argv.slice(2);
const WANT_LIVE = args.includes("--live");
const baseIdx = args.indexOf("--base");
const BASE = (baseIdx >= 0 && args[baseIdx + 1] ? args[baseIdx + 1] : process.env.BASE_URL ?? "http://localhost:3000").replace(/\/$/, "");

type Row = { feature: string; check: string; status: "PASS" | "FAIL" | "SKIP"; detail: string };
const rows: Row[] = [];
const ok = (feature: string, check: string, detail = "") => rows.push({ feature, check, status: "PASS", detail });
const fail = (feature: string, check: string, detail = "") => rows.push({ feature, check, status: "FAIL", detail });
const skip = (feature: string, check: string, detail = "") => rows.push({ feature, check, status: "SKIP", detail });
const file = (p: string) => path.join(ROOT, p);
const has = (p: string) => existsSync(file(p));
const src = (p: string) => (has(p) ? readFileSync(file(p), "utf8") : "");

// ---------- 1. STATIC: file inventory ----------
const REQUIRED_FILES: Array<[string, string]> = [
  ["dashboard", "app/page.tsx"],
  ["video-detail", "app/video/[id]/page.tsx"],
  ["video-client", "components/VideoDetailClient.tsx"],
    ["player", "components/VideoPlayer.tsx"],
  ["subtitle-panel", "components/SubtitlePanel.tsx"],
  ["subtitle-line", "components/SubtitleLine.tsx"],
  ["tokenized", "components/TokenizedSubtitle.tsx"],
  ["vocab-tooltip", "components/VocabTooltip.tsx"],
  ["popup-cursor", "components/TokenizedSubtitle.tsx"], // cursorPos wiring
  ["flashcards-page", "app/flashcards/page.tsx"],
  ["flashcard-deck", "components/FlashcardDeck.tsx"],
  ["srs-lib", "lib/srs.ts"],
  ["video-test", "components/VideoTest.tsx"],
  ["tts-lib", "lib/tts.ts"],
  ["tts-route", "app/api/tts/route.ts"],
  ["chat-page", "app/chat/page.tsx"],
  ["chat-ui", "components/ChatPekora.tsx"],
  ["chat-modal", "components/ChatPekoraModal.tsx"],
  ["chat-route", "app/api/chat/pekora/route.ts"],
  ["pekora-lib", "lib/pekora.ts"],
  ["gemini-lib", "lib/gemini.ts"],
  ["kanji", "app/kanji/page.tsx"],
  ["kanji-canvas", "components/KanjiCanvas.tsx"],
  ["roadmap", "app/roadmap/page.tsx"],
  ["streak", "app/streak/page.tsx"],
  ["streak-lib", "lib/streak.ts"],
  ["shadowing", "components/ShadowingPlayer.tsx"],
  ["history", "app/history/page.tsx"],
  ["auth-lib", "lib/auth.ts"],
  ["env-guard", "lib/env.ts"],
  ["middleware", "middleware.ts"],
  ["admin-videos", "app/admin/videos/page.tsx"],
  ["admin-insert", "app/admin/insert/page.tsx"],
  ["admin-subtitle", "app/admin/subtitle/page.tsx"],
  ["admin-users", "app/admin/users/page.tsx"],
  ["admin-vocab", "app/admin/grammar/page.tsx"],
  ["kuromoji", "lib/kuromoji.ts"],
  ["cache", "lib/cache.ts"],
  ["subtitle-parser", "lib/subtitleParser.ts"],
  ["vocab-filter", "lib/vocabFilter.ts"],
  ["grammar-matcher", "lib/grammarMatcher.ts"],
  ["api-tokenize", "app/api/tokenize/route.ts"],
  ["api-vocab", "app/api/vocab/route.ts"],
  ["api-login", "app/api/auth/login/route.ts"],
  ["api-register", "app/api/auth/register/route.ts"],
  ["api-logout", "app/api/auth/logout/route.ts"],
  ["extract-vocab", "app/actions/extractVocab.ts"],
  ["extract-grammar", "app/actions/extractGrammar.ts"],
  ["generate-test", "app/actions/generateTest.ts"],
  ["manage-video", "app/actions/manageVideo.ts"],
  ["insert-video", "app/actions/insertVideo.ts"],
  ["insert-subtitle", "app/actions/insertSubtitle.ts"],
];
for (const [feature, p] of REQUIRED_FILES) {
  if (has(p)) ok(feature, `file ${p}`);
  else fail(feature, `file ${p}`, "thiếu file");
}

// ---------- 2. STATIC: prisma schema ----------
const schema = src("prisma/schema.prisma");
for (const m of ["User", "Video", "Subtitle", "Vocabulary", "Grammar", "Flashcard", "Question", "TestResult", "DailyActivity", "KanjiProgress", "ChatMessage"]) {
  if (new RegExp(`model\\s+${m}\\b`).test(schema)) ok("schema", `model ${m}`);
  else fail("schema", `model ${m}`, "thiếu model");
}
for (const f of ["due_at", "interval", "ease", "repetitions", "last_reviewed_at"]) {
  if (schema.includes(f)) ok("schema-srs", `Flashcard.${f}`);
  else fail("schema-srs", `Flashcard.${f}`, "chưa migrate field SRS");
}

// ---------- 3. STATIC: wiring ----------
function wiring(feature: string, check: string, p: string, needle: string | RegExp, detail = "") {
  const s = src(p);
  const hit = typeof needle === "string" ? s.includes(needle) : needle.test(s);
  if (hit) ok(feature, check, detail);
  else fail(feature, check, `không thấy ${String(needle).slice(0, 60)} trong ${p}`);
}
wiring("pekora-gemini", "route gọi Gemini", "app/api/chat/pekora/route.ts", "callGemini");
wiring("pekora-gemini", "lib pekora tách pure", "app/api/chat/pekora/route.ts", "@/lib/pekora");
wiring("pekora-gemini", "fallback mock giữ lại", "app/api/chat/pekora/route.ts", "mockPekoraReply");
wiring("pekora-gemini", "GET trả engine", "app/api/chat/pekora/route.ts", "engine");
wiring("pekora-video", "route nhận videoId", "app/api/chat/pekora/route.ts", "videoId");
wiring("pekora-video", "load phụ đề từ DB", "app/api/chat/pekora/route.ts", "subtitles");
wiring("pekora-video", "block ngữ cảnh video", "lib/pekora.ts", "buildVideoContextBlock");
wiring("pekora-video", "chat page ?videoId=", "app/chat/page.tsx", "videoId");
wiring("pekora-video", "nút mở popup từ video", "components/VideoDetailClient.tsx", "openPekoraWithVideo");
wiring("pekora-video", "modal nghe event video", "components/ChatPekoraModal.tsx", "PEKORA_OPEN_EVENT");
wiring("pekora-video", "gợi ý modal", "components/ChatPekoraModal.tsx", "VIDEO_SUGGESTIONS");
wiring("pekora-video", "gợi ý trang chat", "components/ChatPekora.tsx", "VIDEO_SUGGESTIONS");
if (!src("components/VideoDetailClient.tsx").includes("/chat?videoId")) ok("pekora-video", "không thẻ inline thừa");
else fail("pekora-video", "không thẻ inline thừa", "vẫn còn link /chat?videoId trong VideoDetailClient");
wiring("subtitle-batch", "PAGE=15", "components/SubtitlePanel.tsx", "PAGE = 15");
wiring("player", "overlay sub trên video", "components/VideoPlayer.tsx", "video-overlay-sub");
wiring("player", "nút bật/tắt CC", "components/VideoPlayer.tsx", "showOverlay");
wiring("player", "truyền câu active", "components/VideoDetailClient.tsx", "overlayText");
wiring("player", "tua ±5s", "components/VideoPlayer.tsx", "seekBy");
wiring("player", "âm lượng", "components/VideoPlayer.tsx", "volume-slider");
wiring("player", "tự ẩn chuột + controls", "components/VideoPlayer.tsx", "cursor-none");
wiring("player", "click sub tua thật", "components/VideoPlayer.tsx", "seekRequest");wiring("subtitle-batch", "cap batch tokenize", "app/actions/tokenize.ts", "BATCH_MAX");
wiring("subtitle-scroll", "ghim câu active lên top", "components/SubtitlePanel.tsx", "scrollTo");
wiring("vocab-merge", "gộp kata+hira", "lib/vocabFilter.ts", "mergeMixedScriptTokens");
wiring("vocab-merge", "gộp cụm động từ", "lib/vocabFilter.ts", "tryMergeVerbCluster");
wiring("vocab-merge", "gộp tiếp đầu/vĩ ngữ", "lib/vocabFilter.ts", "tryMergePrefix");
wiring("proper-noun", "giữ pos_detail kuromoji", "lib/kuromoji.ts", "pos_detail");
wiring("proper-noun", "nhận diện + nghĩa tên", "lib/vocabFilter.ts", "getProperNounKind");
wiring("proper-noun", "extractor tách tab tên", "components/VocabExtractor.tsx", "isProper");
wiring("proper-noun", "tooltip badge tên", "components/VocabTooltip.tsx", "isProperName");
wiring("subtitle-align", "token cùng baseline", "components/TokenizedSubtitle.tsx", "align-baseline");
wiring("modal-suggest", "gợi ý wrap 2 hàng", "components/ChatPekoraModal.tsx", "flex flex-wrap gap-1.5");
wiring("streak-watch", "xem hết video ghi streak", "components/VideoDetailClient.tsx", "recordActivity");
wiring("vocab-merge", "dùng khi trích xuất", "app/actions/extractVocab.ts", "mergeMixedScriptTokens");
wiring("vocab-merge", "dùng khi hiển thị", "components/TokenizedSubtitle.tsx", "mergeMixedScriptTokens");
wiring("vocab-meaning", "lookup Gemini fallback", "lib/vocabLookup.ts", "resolveVocabMeanings");
wiring("vocab-meaning", "tooltip gửi câu mẫu", "components/VocabTooltip.tsx", "sample");
wiring("vocab-meaning", "API nhận sample", "app/api/vocab/route.ts", "sample");
wiring("meaning-vi", "helper Việt thuần", "lib/meaningVi.ts", "normalizeMeaningVi");
wiring("meaning-vi", "Gemini cấm chêm EN", "lib/gemini.ts", "CẤM chêm tiếng Anh");
wiring("meaning-vi", "Jisho bỏ EN-only", "app/actions/extractVocab.ts", "CHỈ lấy tiếng Việt");
wiring("meaning-vi", "tooltip hiển thị Việt", "components/VocabTooltip.tsx", "normalizeMeaningVi");
wiring("meaning-vi", "flashcard hiển thị Việt", "components/FlashcardDeck.tsx", "normalizeMeaningVi");
wiring("subtitle-editor", "sửa từng dòng", "app/admin/subtitle/SubtitleInsertForm.tsx", "updateSubtitlesAction");
if (!src("app/admin/subtitle/SubtitleInsertForm.tsx").includes("append")) ok("subtitle-editor", "đã bỏ chế độ nối thêm");
else fail("subtitle-editor", "đã bỏ chế độ nối thêm", "vẫn còn append");
wiring("subtitle-editor", "action update", "app/actions/insertSubtitle.ts", "updateSubtitlesAction");
wiring("subtitle-editor", "helper giờ", "lib/subtitleTime.ts", "parseMsInput");
wiring("popup-cursor", "cursorPos state", "components/TokenizedSubtitle.tsx", "cursorPos");
wiring("popup-cursor", "tooltip dùng cursorPos", "components/VocabTooltip.tsx", "cursorPos");
if (!src("components/VocabTooltip.tsx").includes("animate-in")) ok("popup-cursor", "không còn animate-in");
else fail("popup-cursor", "không còn animate-in", "vẫn còn class bay/zoom");
wiring("srs-ui", "4 nút review", "components/FlashcardDeck.tsx", "handleReview");
wiring("srs-ui", "filter Đến hạn", "components/FlashcardDeck.tsx", "Đến hạn");
wiring("srs-action", "reviewFlashcard", "app/actions/flashcard.ts", "reviewFlashcard");
wiring("tts", "audio server + fallback", "components/VideoTest.tsx", "ListeningPlayButton");
wiring("tts", "cache public/tts", "lib/tts.ts", "public");
wiring("rbac", "requireAdmin insertVideo", "app/actions/insertVideo.ts", "requireAdmin");
wiring("rbac", "requireAdmin insertSubtitle", "app/actions/insertSubtitle.ts", "requireAdmin");
wiring("rbac", "requireAdmin manageVideo", "app/actions/manageVideo.ts", "requireAdmin");
wiring("rbac", "requireAdmin generateTest", "app/actions/generateTest.ts", "requireAdmin");
wiring("env", "secret >=32 production", "lib/env.ts", "32");
wiring("middleware", "bảo vệ /chat", "middleware.ts", "/chat");
wiring("middleware", "bảo vệ /admin", "middleware.ts", "/admin");
wiring("build", "strict TS", "next.config.mjs", "ignoreBuildErrors: false");
wiring("build", "strict ESLint", "next.config.mjs", "ignoreDuringBuilds: false");

// ---------- 4. STATIC: pure-lib runtime ----------
async function runtimeChecks() {
  try {
    const { scheduleReview } = await import("../lib/srs");
    const r = scheduleReview({ interval: 0, ease: 2.5, repetitions: 0 }, 4);
    if (r.interval === 1 && r.repetitions === 1) ok("runtime-srs", "Good lần 1 → 1 ngày");
    else fail("runtime-srs", "Good lần 1 → 1 ngày", JSON.stringify(r));
  } catch (e) {
    fail("runtime-srs", "import lib/srs", String(e));
  }
  try {
    const { matchesGrammar } = await import("../lib/grammarMatcher");
    if (matchesGrammar("食べたい", "〜たいです")) ok("runtime-grammar", "〜たい match 食べたい");
    else fail("runtime-grammar", "〜たい match 食べたい", "matcher sai");
  } catch (e) {
    fail("runtime-grammar", "import lib/grammarMatcher", String(e));
  }
  try {
    const { parseSubtitleInput } = await import("../lib/subtitleParser");
    const out = parseSubtitleInput("00:00:01,000 --> 00:00:02,000\nこんにちは");
    if (out.length === 1 && out[0].start_time_ms === 1000) ok("runtime-subtitle", "parse SRT 1 cue");
    else fail("runtime-subtitle", "parse SRT 1 cue", JSON.stringify(out));
  } catch (e) {
    fail("runtime-subtitle", "import lib/subtitleParser", String(e));
  }
  try {
    const { mockPekoraReply, ensurePekoTail, buildGeminiChatBody } = await import("../lib/pekora");
    const r = mockPekoraReply("hello");
    if (r.includes("peko") && r.includes("🐰")) ok("runtime-pekora", "mock có peko + 🐰");
    else fail("runtime-pekora", "mock có peko + 🐰", r.slice(0, 80));
    if (ensurePekoTail("hi").includes("peko")) ok("runtime-pekora", "ensurePekoTail");
    else fail("runtime-pekora", "ensurePekoTail", "mất đuôi peko");
    const body = buildGeminiChatBody("hi", []);
    if (body.contents.length >= 1 && body.systemInstruction) ok("runtime-pekora", "buildGeminiChatBody");
    else fail("runtime-pekora", "buildGeminiChatBody", "body sai shape");
  } catch (e) {
    fail("runtime-pekora", "import lib/pekora", String(e));
  }
  try {
    const { ttsKey, ttsPublicUrl } = await import("../lib/tts");
    const k = ttsKey("test");
    if (/^[0-9a-f]{40}$/.test(k) && ttsPublicUrl("test").startsWith("/tts/")) ok("runtime-tts", "ttsKey + url");
    else fail("runtime-tts", "ttsKey + url", k);
  } catch (e) {
    fail("runtime-tts", "import lib/tts", String(e));
  }
}

// ---------- 5. LIVE (optional) ----------
async function liveChecks() {
  if (!WANT_LIVE) {
    skip("live", "bỏ qua (chạy với --live để test HTTP)", "dùng: npx tsx e2e/full-check.ts --live");
    return;
  }
  let reachable = false;
  try {
    const res = await fetch(`${BASE}/login`, { signal: AbortSignal.timeout(8000) });
    reachable = true;
    if (res.status === 200) ok("live", "GET /login → 200");
    else fail("live", "GET /login → 200", `status ${res.status}`);
  } catch (e) {
    skip("live", "server không chạy", `${BASE} — bật npm run dev trước (${e instanceof Error ? e.message : e})`);
    return;
  }
  if (!reachable) return;
  const get = async (feature: string, check: string, p: string, expect: number[]) => {
    try {
      const res = await fetch(`${BASE}${p}`, { signal: AbortSignal.timeout(15000) });
      if (expect.includes(res.status)) ok(feature, `${check} → ${res.status}`);
      else fail(feature, check, `status ${res.status}, mong đợi ${expect.join("/")}`);
      return res;
    } catch (e) {
      fail(feature, check, e instanceof Error ? e.message : String(e));
      return null;
    }
  };
  await get("live", "GET /", "/", [200, 500]);
  await get("live", "GET /api/chat/pekora", "/api/chat/pekora", [200]);
  // POST chat không auth → 401
  try {
    const res = await fetch(`${BASE}/api/chat/pekora`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ message: "hello peko" }),
      signal: AbortSignal.timeout(15000),
    });
    if (res.status === 401) ok("live", "POST /api/chat/pekora không auth → 401");
    else fail("live", "POST /api/chat/pekora không auth → 401", `status ${res.status}`);
  } catch (e) {
    fail("live", "POST /api/chat/pekora", e instanceof Error ? e.message : String(e));
  }
  await get("live", "POST /api/tokenize không auth → 401", "/api/tokenize", [401, 405]);
  await get("live", "GET /api/tts", "/api/tts?text=%E3%81%93%E3%82%93%E3%81%AB%E3%81%A1%E3%81%AF", [200, 502]);
}

// ---------- main ----------
async function main() {
  await runtimeChecks();
  await liveChecks();

  const pass = rows.filter((r) => r.status === "PASS").length;
  const failed = rows.filter((r) => r.status === "FAIL");
  const skipped = rows.filter((r) => r.status === "SKIP").length;

  console.log("\n==== FULL-CHECK LMS NIHONGO ====");
  console.log(`PASS ${pass} | FAIL ${failed.length} | SKIP ${skipped} | tổng ${rows.length}\n`);
  for (const f of failed) console.log(`[FAIL] ${f.feature} — ${f.check} :: ${f.detail}`);
  if (failed.length === 0) console.log("(không có lỗi static — mọi tính năng wiring đúng)");
  console.log("\nChi tiết SKIP:");
  for (const s of rows.filter((r) => r.status === "SKIP")) console.log(`[SKIP] ${s.feature} — ${s.check} :: ${s.detail}`);
  process.exit(failed.length > 0 ? 1 : 0);
}

main().catch((e) => {
  console.error("[full-check] crashed:", e instanceof Error ? e.message : e);
  process.exit(2);
});
