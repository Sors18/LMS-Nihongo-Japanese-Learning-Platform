/**
 * Pekora — pure helpers (không DB, không fetch) để route + unit test dùng chung.
 * Tính cách: Usada Pekora (Hololive), tiếng Việt + chêm Nhật, kết câu "peko", emoji 🐰.
 */

export const PEKORA_SYSTEM_PROMPT =
  "Bạn là Usada Pekora, VTuber Hololive nổi tiếng, tính cách đáng yêu, tinh nghịch, hơi ngổ ngáo nhưng tốt bụng. " +
  "Bạn nói tiếng Việt là chính, thi thoảng chêm tiếng Nhật (kèm yomikata/romaji), luôn kết thúc câu bằng 'peko' (ví dụ: '... nhé peko~', '... đó peko!'). " +
  "Luôn dùng emoji 🐰 và thỉnh thoảng 💕✨🎀. Bạn là gia sư tiếng Nhật vui tính, giải thích ngữ pháp, dịch câu, luyện hội thoại, kanji. " +
  "Trả lời ngắn gọn (3-8 câu), dễ hiểu, có ví dụ khi cần. Luôn giữ vai Pekora.";

export type ChatMsg = { role: string; content: string };

/** Chuẩn hóa history gửi cho AI: tối đa 10 turns, cắt dài, map role. */
export function normalizeHistory(history: ChatMsg[], limit = 10): ChatMsg[] {
  return history
    .filter((h) => h && typeof h.content === "string")
    .slice(-limit)
    .map((h) => ({
      role: h.role === "assistant" || h.role === "pekora" ? "assistant" : h.role === "system" ? "system" : "user",
      content: String(h.content).slice(0, 2000),
    }));
}

/** Ngữ cảnh video người dùng đang xem — server tự load từ DB theo id, client chỉ gửi id. */
export type VideoContext = {
  id: number;
  title: string;
  level: string;
  subtitles: string[];
};

/** Ngữ cảnh gọn cho client (modal/page) — level optional vì có trang không truyền. */
export type PekoraVideoCtx = { id: number; title: string; level?: string };

/** Câu hỏi gợi ý khi hỏi về video đang xem. */
export const VIDEO_SUGGESTIONS = [
  "Video này nói về gì?",
  "Có nhân vật nào xuất hiện trong video?",
  "Liệt kê từ vựng khó trong video này",
  "Ngữ pháp đáng học trong video này là gì?",
];

/** Event mở popup Pekora góc màn hình kèm ngữ cảnh video. */
export const PEKORA_OPEN_EVENT = "pekora:open";

export function openPekoraWithVideo(ctx: PekoraVideoCtx): void {
  if (typeof window === "undefined") return;
  if (!ctx || !Number.isInteger(ctx.id) || ctx.id <= 0) return;
  window.dispatchEvent(new CustomEvent(PEKORA_OPEN_EVENT, { detail: ctx }));
}

const CTX_MAX_LINES = 60;
const CTX_MAX_CHARS = 3000;

/** Dựng block ngữ cảnh video để nhét vào system prompt. */
export function buildVideoContextBlock(ctx: VideoContext | null | undefined): string {
  if (!ctx || !ctx.title) return "";
  const lines = (ctx.subtitles ?? [])
    .map((s) => String(s ?? "").trim())
    .filter(Boolean)
    .slice(0, CTX_MAX_LINES)
    .map((s) => s.slice(0, 120));
  let text = lines.join("\n- ");
  if (text.length > CTX_MAX_CHARS) text = text.slice(0, CTX_MAX_CHARS) + "…";
  const subs = text ? `\nNội dung phụ đề (trích):\n- ${text}` : "";
  return (
    `[Ngữ cảnh] Người dùng đang xem video "${ctx.title}" (trình độ ${ctx.level || "N4"}).${subs}\n` +
    `Khi câu hỏi nhắc "video này / câu này / bài này / trong video", hãy trả lời dựa trên nội dung trên. ` +
    `Vẫn giữ vai Pekora, kết câu peko 🐰.`
  );
}

/** Body cho Gemini generateContent (systemInstruction + contents). */
export function buildGeminiChatBody(message: string, history: ChatMsg[], videoCtx?: VideoContext | null) {
  const turns = normalizeHistory(history);
  const ctxBlock = buildVideoContextBlock(videoCtx);
  const contents = [
    ...turns.map((t) => ({
      role: t.role === "assistant" ? "model" : "user",
      parts: [{ text: t.content }],
    })),
    { role: "user", parts: [{ text: message }] },
  ];
  return {
    systemInstruction: { parts: [{ text: ctxBlock ? `${PEKORA_SYSTEM_PROMPT}\n\n${ctxBlock}` : PEKORA_SYSTEM_PROMPT }] },
    contents,
    generationConfig: { temperature: 0.85, maxOutputTokens: 600 },
  };
}

/** Đảm bảo đuôi peko + 🐰 nếu model quên vai. */
export function ensurePekoTail(text: string): string {
  let out = (text ?? "").trim();
  if (!out) return "Pekora hơi lag xíu peko... thử lại nhé! 🐰";
  if (!out.includes("peko")) out += " peko~ 🐰";
  else if (!out.includes("🐰")) out += " 🐰";
  return out;
}

/** Trích text từ response Gemini generateContent. */
export function extractGeminiText(json: unknown): string | null {
  try {
    const j = json as {
      candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
    };
    let text = "";
    for (const p of j.candidates?.[0]?.content?.parts ?? []) {
      if (p.text) text += p.text;
    }
    text = text.trim();
    return text || null;
  } catch {
    return null;
  }
}

// ---- Mock Pekora replies (kawaii, Vietnamese + Japanese, 🐰, peko) ----
export function mockPekoraReply(message: string, videoTitle?: string | null): string {
  const lower = message.toLowerCase();

  // Grammar ~てる
  if (
    lower.includes("~てる") ||
    lower.includes("てる") ||
    lower.includes("ngữ pháp") ||
    lower.includes("grammar")
  ) {
    return `Konnichiwa peko! 🐰 Ngữ pháp 「～てる」là dạng rút gọn siêu kawaii của 「～ている」đó peko~ 🐰\n\n✨ Cách dùng:\n• 食べてる (tabeteru) = 食べている — đang ăn\n• 見てる (miteru) = 見ている — đang xem\n• 待ってる (matteru) = 待っている — đang đợi\n\n📌 Nhớ nhé peko: 「～てる」dùng khi nói chuyện thân mật với bạn bè thôi! Khi lịch sự thì phải dùng 「～ている」đầy đủ nha peko! 🐰💕\n\nBạn muốn Pekora cho thêm ví dụ với câu của bạn không peko? 「教えてあげるよ！」(oshiete ageru yo) peko~ 🎀`;
  }

  if (lower.includes("dịch") || lower.includes("translate") || lower.includes("dịch câu")) {
    return `Để Pekora dịch cho bạn peko! 🐰✨\n\nBạn gửi: 「${message}」\n\nVí dụ nè peko:\n• 今日は天気がいい (kyou wa tenki ga ii) = Hôm nay thời tiết đẹp peko~ ☀️\n• ありがとう (arigatou) = Cảm ơn peko! 🐰💕\n\nHãy gửi câu cụ thể bạn muốn dịch (Nhật ↔ Việt) nhé, Pekora sẽ dịch thật cute luôn peko! 🎀 「任せて peko!」(makasete peko)`;
  }

  if (lower.includes("kanji") || lower.includes("今日") || lower.includes("漢字")) {
    return `Kanji 「今日」đọc là 「きょう (kyou)」nghĩa là "hôm nay" đó peko! 🐰\n\n• 今 (いま - ima) : bây giờ\n• 日 (ひ/にち - hi/nichi) : ngày\nGhép lại → 今日 (きょう) siêu hay đúng không peko? 🐰✨\n\nVí dụ: 今日は楽しい日だね！(kyou wa tanoshii hi da ne) = Hôm nay là một ngày vui nhỉ peko~ 💕\n\nBạn muốn học thêm kanji nào nữa không peko? Pekora sẵn sàng~ 🎀`;
  }

  if (
    lower.includes("xin chào") ||
    lower.includes("hello") ||
    lower.includes("konnichiwa") ||
    lower.includes("こんにちは") ||
    lower.includes("chào")
  ) {
    return `Konpeko, konpeko, konpeko! Hololive san-kisei no Usada Pekora-peko! doumo, doumo! 🐰💕 Pekora đây! 「ようこそ！」(youkoso) chào mừng bạn đến với LMS Nihongo peko~ ✨\n\nPekora có thể giúp bạn:\n🌸 Giải thích ngữ pháp (～てる, ～ている, ...)\n🌸 Dịch câu Nhật-Việt\n🌸 Luyện kaiwa hội thoại\n🌸 Giải thích kanji & từ vựng\n\nHôm nay bạn muốn học gì nào peko? 🐰🎀 「一緒に頑張ろう！」(issho ni ganbarou)`;
  }

  if (lower.includes("cảm ơn") || lower.includes("arigatou") || lower.includes("ありがとう")) {
    return `Ehehe~ không có gì đâu peko! 🐰💕 「どういたしまして (douitashimashite)」peko~\n\nPekora rất vui khi được giúp bạn đó! Nếu còn thắc mắc gì cứ hỏi Pekora nhé peko! 🐰✨ 「いつでも聞いてね！」(itsudemo kiite ne) peko~ 🎀`;
  }

  // Nếu đang hỏi về video cụ thể mà không khớp nhánh nào → trả lời gắn với video đó
  if (videoTitle) {
    return `Peko peko~ 🐰💕 Về video 「${videoTitle}」 nè peko!\n\n「${message}」— Pekora chưa có AI online lúc này nên trả lời theo trí nhớ peko~ ✨ Hãy thử hỏi cụ thể hơn nhé, ví dụ:\n• "Dịch câu đầu tiên trong video này"\n• "Ngữ pháp nào đáng học trong bài này?"\n• "Từ vựng khó nhất trong video là gì?"\n\n「一緒に頑張ろう (issho ni ganbarou)」peko! 🐰🎀`;
  }

  // Generic pool — always contains 🐰, peko, Vietnamese + Japanese
  const generics = [
    `Ehehe~ 🐰 Bạn nói: 「${message}」— Pekora nghe rồi peko! ✨\n\nPekora nghĩ tiếng Nhật thật thú vị đúng không? 「頑張ってね (ganbatte ne)」— cố lên nhé peko! 🐰💕\n\nBạn muốn Pekora giải thích thêm về ngữ pháp hay từ vựng nào không peko? Cứ hỏi Pekora nha~ 🎀`,
    `Wah~ 🐰 Câu hỏi hay lắm peko! 「${message}」\n\nPekora sẽ cố gắng trả lời thật kawaii nhé! 「日本語は楽しいよ (nihongo wa tanoshii yo)」— tiếng Nhật vui lắm peko~ 🐰🎀\n\nBạn thử nói thêm chi tiết để Pekora giúp chính xác hơn nha peko! ✨`,
    `Peko peko~ 🐰💕 Pekora ở đây rồi!\n\n「${message}」— Pekora hiểu rồi peko! Trong tiếng Nhật, nhớ chú ý ngữ cảnh và kính ngữ nhé! 「丁寧語 (teineigo)」rất quan trọng đó peko~ ✨\n\nBạn muốn Pekora cho ví dụ hoặc dịch câu liên quan không peko? 🐰`,
    `Kyaa~ 🐰✨ Cảm ơn bạn đã chat với Pekora peko!\n\n「${message}」— Pekora sẽ ghi nhớ và trả lời cute nhất có thể peko~ 🎀\n\n「一緒に頑張ろう (issho ni ganbarou)」— cùng nhau cố gắng nhé peko! 🐰💕 Nếu bạn cần ví dụ cụ thể hơn thì gửi thêm nha peko!`,
    `Hmm hmm~ 🐰 Pekora đang suy nghĩ về 「${message}」peko...\n\nTiếng Nhật có nhiều điều thú vị lắm! 「なるほど (naruhodo)」— ra là vậy peko~ ✨\n\nBạn có muốn Pekora giải thích bằng ví dụ anime/manga cho dễ nhớ không peko? 🐰🎀`,
  ];
  return generics[Math.floor(Math.random() * generics.length)] as string;
}
