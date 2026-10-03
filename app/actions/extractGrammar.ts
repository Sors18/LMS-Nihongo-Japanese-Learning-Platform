"use server";

import "server-only";

import { prisma } from "@/lib/prisma";
import { matchesGrammar } from "@/lib/grammarMatcher";
import { detectGrammarPoints } from "@/lib/gemini";
import type { StageProgressFn } from "@/lib/gemini";
import type { Grammar, Level, VideoGrammarTimeline } from "@prisma/client";

function dedupTimelineByGrammar(entries: GrammarTimelineEntry[]): GrammarTimelineEntry[] {
  // Giữ 1 record / grammar (earliest appear_at_ms), sắp xếp theo thời gian đầu tiên
  const map = new Map<number, GrammarTimelineEntry>();
  const sorted = [...entries].sort((a, b) => a.appear_at_ms - b.appear_at_ms);
  for (const e of sorted) {
    if (!map.has(e.grammar.id)) map.set(e.grammar.id, e);
  }
  return Array.from(map.values()).sort((a, b) => a.appear_at_ms - b.appear_at_ms);
}
// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type GrammarMatch = Grammar;

export type GrammarTimelineEntry = {
  grammar: Grammar;
  appear_at_ms: number;
  subtitleId: number;
};

// ---------------------------------------------------------------------------
// detectGrammarInText
// Load all Grammar from DB, with each grammar.structure check
// text.includes(structure.replace("〜","")) OR regex "〜" → ".*"
// ---------------------------------------------------------------------------
// Cache grammar toàn cục — tránh N lần findMany per subtitle
let grammarCache: Grammar[] | null = null;
let grammarCacheAt = 0;
const GRAMMAR_TTL_MS = 5 * 60_000;
async function getAllGrammars(): Promise<Grammar[]> {
  const now = Date.now();
  if (grammarCache && now - grammarCacheAt < GRAMMAR_TTL_MS) return grammarCache;
  const grammars = await prisma.grammar.findMany();
  grammarCache = grammars;
  grammarCacheAt = now;
  return grammars;
}

export async function detectGrammarInText(text: string): Promise<Grammar[]> {
  if (typeof text !== "string") return [];
  const trimmed = text.trim();
  if (!trimmed) return [];

  const grammars = await getAllGrammars();

  const builtin: Grammar[] = grammars.length < 5 ? (getBuiltinGrammars() as unknown as Grammar[]) : [];
  const all = [...grammars, ...builtin.filter((b) => !grammars.some((g) => g.structure === b.structure))];

  const matches: Grammar[] = [];
  for (const g of all) {
    const structure = (g.structure ?? "").trim();
    if (!structure) continue;
    if (matchesGrammar(trimmed, structure)) {
      matches.push(g);
    }
  }
  return matches;
}
function getBuiltinGrammars(): Array<{ id: number; structure: string; explanation: string; level: string }> {
  return [
    { id: 1, structure: "〜は〜です", explanation: "A là B — khẳng định (N5)", level: "N5" },
    { id: 2, structure: "〜があります", explanation: "Có (vật) — tồn tại vô tri (N5)", level: "N5" },
    { id: 3, structure: "〜がいます", explanation: "Có (người/động vật) — tồn tại hữu tri (N5)", level: "N5" },
    { id: 4, structure: "〜たいです", explanation: "Muốn làm ~ (N5)", level: "N5" },
    { id: 5, structure: "〜てもいいですか", explanation: "Làm ~ có được không? — xin phép (N5)", level: "N5" },
    { id: 16, structure: "〜てください", explanation: "Hãy làm ~ — yêu cầu lịch sự (N5)", level: "N5" },
    { id: 17, structure: "〜ないでください", explanation: "Đừng làm ~ (N5)", level: "N5" },
    { id: 18, structure: "〜ましょう", explanation: "Cùng làm ~ nhé (N5)", level: "N5" },
    { id: 19, structure: "〜ませんか", explanation: "Làm ~ không? — mời lịch sự (N5)", level: "N5" },
    { id: 20, structure: "〜が好きです", explanation: "Thích ~ (N5)", level: "N5" },
    { id: 21, structure: "〜から〜まで", explanation: "Từ ~ đến ~ (N5)", level: "N5" },
    { id: 22, structure: "〜と", explanation: "Và / với (N5)", level: "N5" },
    { id: 23, structure: "〜にいきます", explanation: "Đi đến ~ (N5)", level: "N5" },
    { id: 24, structure: "〜で", explanation: "Tại ~ / bằng ~ (N5)", level: "N5" },
    { id: 25, structure: "〜の", explanation: "Của ~ (N5)", level: "N5" },
    { id: 6, structure: "〜なければならない", explanation: "Phải làm ~ — nghĩa vụ (N4)", level: "N4" },
    { id: 7, structure: "〜ことができる", explanation: "Có thể làm ~ — khả năng (N4)", level: "N4" },
    { id: 8, structure: "〜前に", explanation: "Trước khi ~ (N4)", level: "N4" },
    { id: 9, structure: "〜後で", explanation: "Sau khi ~ (N4)", level: "N4" },
    { id: 10, structure: "〜ながら", explanation: "Vừa ~ vừa ~ — đồng thời (N4)", level: "N4" },
    { id: 11, structure: "〜ために", explanation: "Để ~ / Vì ~ (N4)", level: "N4" },
    { id: 12, structure: "〜すぎる", explanation: "Quá ~ (N4)", level: "N4" },
    { id: 26, structure: "〜ている", explanation: "Đang ~ — tiếp diễn/kết quả (N4)", level: "N4" },
    { id: 27, structure: "〜たことがある", explanation: "Đã từng ~ — kinh nghiệm (N4)", level: "N4" },
    { id: 28, structure: "〜やすい", explanation: "Dễ ~ (N4)", level: "N4" },
    { id: 29, structure: "〜にくい", explanation: "Khó ~ (N4)", level: "N4" },
    { id: 30, structure: "〜そうだ", explanation: "Có vẻ ~ — phỏng đoán ngoại quan (N4)", level: "N4" },
    { id: 31, structure: "〜かもしれない", explanation: "Có lẽ ~ (N4)", level: "N4" },
    { id: 32, structure: "〜たら", explanation: "Nếu/khi ~ (N4)", level: "N4" },
    { id: 33, structure: "〜ても", explanation: "Dù ~ cũng (N4)", level: "N4" },
    { id: 13, structure: "〜そうだ", explanation: "Nghe nói ~ — truyền đạt (N3)", level: "N3" },
    { id: 14, structure: "〜ようになる", explanation: "Trở nên ~ (N3)", level: "N3" },
    { id: 15, structure: "〜によって", explanation: "Bởi ~ / Tùy theo ~ (N3)", level: "N3" },
    { id: 34, structure: "〜ことにする", explanation: "Quyết định làm ~ (N3)", level: "N3" },
    { id: 35, structure: "〜ことになる", explanation: "Được quyết định là ~ (N3)", level: "N3" },
    { id: 36, structure: "〜のに", explanation: "Vậy mà ~ — nghịch lý (N3)", level: "N3" },
    { id: 37, structure: "〜はずだ", explanation: "Chắc hẳn ~ (N3)", level: "N3" },
    { id: 38, structure: "〜わけだ", explanation: "Hèn gì ~ (N3)", level: "N3" },
    { id: 39, structure: "〜ばかり", explanation: "Toàn ~ / vừa mới ~ (N3)", level: "N3" },
    { id: 40, structure: "〜ておく", explanation: "Làm sẵn ~ (N3)", level: "N3" },
    { id: 41, structure: "〜てしまう", explanation: "Lỡ làm ~ (N3)", level: "N3" },
    { id: 42, structure: "〜ようにする", explanation: "Cố gắng để ~ (N3)", level: "N3" },
    { id: 43, structure: "〜につれて", explanation: "Cùng với ~ (N3)", level: "N3" },
    { id: 44, structure: "〜に対して", explanation: "Đối với ~ (N3)", level: "N3" },
    { id: 45, structure: "〜に関して", explanation: "Về ~ (N3)", level: "N3" },
    { id: 46, structure: "〜わけではない", explanation: "Không có nghĩa là ~ (N2)", level: "N2" },
    { id: 47, structure: "〜に違いない", explanation: "Chắc chắn ~ (N2)", level: "N2" },
    { id: 48, structure: "〜を通して", explanation: "Thông qua ~ (N2)", level: "N2" },
    { id: 49, structure: "〜において", explanation: "Tại ~ / trong ~ (N2)", level: "N2" },
    { id: 50, structure: "〜に基づいて", explanation: "Dựa trên ~ (N2)", level: "N2" },
    { id: 51, structure: "〜に応じて", explanation: "Tùy theo ~ (N2)", level: "N2" },
    { id: 52, structure: "〜に伴って", explanation: "Kéo theo ~ (N2)", level: "N2" },
    { id: 53, structure: "〜をめぐって", explanation: "Xung quanh ~ (N2)", level: "N2" },
    { id: 54, structure: "〜を問わず", explanation: "Bất kể ~ (N2)", level: "N2" },
    { id: 55, structure: "〜ざるを得ない", explanation: "Đành phải ~ (N2)", level: "N2" },
    { id: 56, structure: "〜得る", explanation: "Có thể ~ (N2)", level: "N2" },
    { id: 57, structure: "〜にすぎない", explanation: "Chỉ là ~ (N2)", level: "N2" },
    { id: 58, structure: "〜といった", explanation: "Như là ~ (N2)", level: "N2" },
    { id: 59, structure: "〜を通じて", explanation: "Suốt ~ (N2)", level: "N2" },
    { id: 60, structure: "〜次第", explanation: "Ngay sau khi ~ (N2)", level: "N2" },
        // ==== Bổ sung 173 mẫu N2/N3 (attachment) — fallback khi DB chưa seed ====
    { id: 61, structure: "〜として", explanation: "Nói về lập trường, tư cách, chủng loại (N3)", level: "N3" },
    { id: 62, structure: "〜とともに", explanation: "Cùng với... (N3)", level: "N3" },
    { id: 63, structure: "〜にかわって", explanation: "Đại lý, đại diện (N3)", level: "N3" },
    { id: 64, structure: "〜に比べて", explanation: "So với.... (N3)", level: "N3" },
    { id: 65, structure: "〜にしたがって", explanation: "Cùng với ~ (N3)", level: "N3" },
    { id: 66, structure: "〜について", explanation: "Về, liên quan đến (N3)", level: "N3" },
    { id: 67, structure: "〜にとって", explanation: "Đối với… (N3)", level: "N3" },
    { id: 68, structure: "〜によると", explanation: "Theo, y theo ~ (N3)", level: "N3" },
    { id: 69, structure: "〜を中心に", explanation: "Lấy ~ làm trung tâm (N3)", level: "N3" },
    { id: 70, structure: "〜をはじめ", explanation: "Cách nói đưa ra một ví dụ chính. (N3)", level: "N3" },
    { id: 71, structure: "〜をもとに", explanation: "Lấy ~ làm cơ sở (N3)", level: "N3" },
    { id: 72, structure: "〜上", explanation: "Không chỉ ~, thêm vào với ~ (N3)", level: "N3" },
    { id: 73, structure: "〜うちに", explanation: "Trong lúc…/Trong khoảng… (N3)", level: "N3" },
    { id: 74, structure: "〜おかげで", explanation: "Nhờ, do có... (N3)", level: "N3" },
    { id: 75, structure: "〜かわりに", explanation: "Thay vì không ~ (N3)", level: "N3" },
    { id: 76, structure: "〜くらい", explanation: "Biểu thị mức độ trạng thái (N3)", level: "N3" },
    { id: 77, structure: "〜最中に", explanation: "Ngay trong lúc đang làm việc gì đó (N3)", level: "N3" },
    { id: 78, structure: "〜せいだ", explanation: "Tại vì ~ (kết quả xấu) (N3)", level: "N3" },
    { id: 79, structure: "〜たとたん", explanation: "Ngay sau ~ (N3)", level: "N3" },
    { id: 80, structure: "〜たび", explanation: "Mỗi khi, mỗi dịp ~ (N3)", level: "N3" },
    { id: 81, structure: "〜て以来", explanation: "Suốt từ đó về sau… (N3)", level: "N3" },
    { id: 82, structure: "〜とおり", explanation: "Làm giống như ~ (N3)", level: "N3" },
    { id: 83, structure: "〜ところに", explanation: "Đúng lúc, đúng địa điểm (N3)", level: "N3" },
    { id: 84, structure: "〜ほど", explanation: "Chừng, mức ~ (N3)", level: "N3" },
    { id: 85, structure: "〜ばかりに", explanation: "Chỉ vỉ ~ (N3)", level: "N3" },
    { id: 86, structure: "〜ものだから", explanation: "Tại vì ~ (N3)", level: "N3" },
    { id: 87, structure: "〜ように", explanation: "Biểu thị ví dụ, như là (N3)", level: "N3" },
    { id: 88, structure: "〜一方だ", explanation: "Diễn tả việc xu hướng đó ngày càng tiếp diễn (N3)", level: "N3" },
    { id: 89, structure: "〜おそれがある", explanation: "Có sự lo lắng là ~ (N3)", level: "N3" },
    { id: 90, structure: "〜ことになっている", explanation: "Biểu thị dự định, quy tắc (N3)", level: "N3" },
    { id: 91, structure: "〜ことはない", explanation: "Không cần phải làm ~ (N3)", level: "N3" },
    { id: 92, structure: "〜しかない", explanation: "Không có cách nào khác ngoài ~ (N3)", level: "N3" },
    { id: 93, structure: "〜ということだ", explanation: "Nghe thấy nói là ~ (N3)", level: "N3" },
    { id: 94, structure: "〜まい", explanation: "Có lẽ không phải ~ (N3)", level: "N3" },
    { id: 95, structure: "〜わけがない", explanation: "Không có nghĩa là ~ (N3)", level: "N3" },
    { id: 96, structure: "〜わけにはいかない", explanation: "Có lý do nên ~ không làm được (N3)", level: "N3" },
    { id: 97, structure: "〜から〜にかけて", explanation: "Từ khoảng ~ đến ~ (N3)", level: "N3" },
    { id: 98, structure: "たとえ〜ても", explanation: "Ví dụ; dù cho; ngay cả nếu (N3)", level: "N3" },
    { id: 99, structure: "〜さえ〜ば", explanation: "Chỉ cần có ~ hay thành ~ (N3)", level: "N3" },
    { id: 100, structure: "〜も〜ば〜も", explanation: "Cũng ~ cũng ~ (N3)", level: "N3" },
    { id: 101, structure: "〜やら〜やら", explanation: "Liệt kê (N3)", level: "N3" },
    { id: 102, structure: "〜だらけ", explanation: "~ có đầy, được gắn đầy (N3)", level: "N3" },
    { id: 103, structure: "〜っぽい", explanation: "Cảm thấy như là ~ (N3)", level: "N3" },
    { id: 104, structure: "〜がたい", explanation: "Khó làm ~ ; gần như không thể ~ (N3)", level: "N3" },
    { id: 105, structure: "〜がちだ", explanation: "Việc làm ~ là nhiều; có chiều hướng ~ (N3)", level: "N3" },
    { id: 106, structure: "〜気味", explanation: "Hơi có cảm giác là ~ (N3)", level: "N3" },
    { id: 107, structure: "〜げ", explanation: "Chỉ trạng thái cảm nhận được (N3)", level: "N3" },
    { id: 108, structure: "〜かけだ", explanation: "Chỉ trạng thái giữa chừng (N3)", level: "N3" },
    { id: 109, structure: "〜きる", explanation: "Hoàn toàn, hết cả ~ (N3)", level: "N3" },
    { id: 110, structure: "〜ぬく", explanation: "~đến cùng. Cố gắng đến cuối cùng (N3)", level: "N3" },
    { id: 111, structure: "〜こそ", explanation: "Thể hiện ý nhấn mạnh (N3)", level: "N3" },
    { id: 112, structure: "〜さえ", explanation: "Lấy cái ví dụ cực đoan (N3)", level: "N3" },
    { id: 113, structure: "〜など", explanation: "Dùng khi muốn nêu lên một ví dụ (N3)", level: "N3" },
    { id: 114, structure: "〜に加えて", explanation: "Ngoài ra; thêm vào đó (N3)", level: "N3" },
    { id: 115, structure: "〜に答えて", explanation: "Ứng với, đối với ~ (N3)", level: "N3" },
    { id: 116, structure: "〜に沿って", explanation: "Sở dĩ, vì vậy, do vậy, theo ~ (N3)", level: "N3" },
    { id: 117, structure: "〜に反して", explanation: "Trái ngược với; tương phản với (N3)", level: "N3" },
    { id: 118, structure: "〜にわたって", explanation: "Biểu thị sự trải rộng trên phạm vi toàn thể (N3)", level: "N3" },
    { id: 119, structure: "〜ばかりか", explanation: "Không chỉ ~, ngoài ra còn… (N3)", level: "N3" },
    { id: 120, structure: "〜はもとより", explanation: "~ thì đương nhiên đến mức không cần nói. (N3)", level: "N3" },
    { id: 121, structure: "〜もかまわず", explanation: "Không bận tâm đến ~ (N3)", level: "N3" },
    { id: 122, structure: "〜をこめて", explanation: "Gửi gắm tâm tư, tình cảm vào ~ (N3)", level: "N3" },
    { id: 123, structure: "〜あまり", explanation: "Vì ~ bất thường nên… (N3)", level: "N3" },
    { id: 124, structure: "〜一方", explanation: "Mặt khác, trái lại… (N3)", level: "N3" },
    { id: 125, structure: "〜上で", explanation: "Xong ~ rồi… (N3)", level: "N3" },
    { id: 126, structure: "〜限り", explanation: "Giới hạn, hạn chế, hạn trong ~ (N3)", level: "N3" },
    { id: 127, structure: "〜と思うと", explanation: "Làm xong ~ ngay lập tức… (N3)", level: "N3" },
    { id: 128, structure: "〜か〜ないかのうちに", explanation: "Việc này chưa qua, việc khác đã xảy ra. (N3)", level: "N3" },
    { id: 129, structure: "〜からいうと", explanation: "Nhìn từ quan điểm ~ (N3)", level: "N3" },
    { id: 130, structure: "〜からといって", explanation: "Chỉ vì lý do ~ (N3)", level: "N3" },
    { id: 131, structure: "〜から見ると", explanation: "Nhìn từ ~ , xét theo ~ (N3)", level: "N3" },
    { id: 132, structure: "〜きり", explanation: "Chỉ có ~ (N3)", level: "N3" },
    { id: 133, structure: "〜くせに", explanation: "Dù; mặc dầu; lại còn; ngay cả ~ (N3)", level: "N3" },
    { id: 134, structure: "〜ことから", explanation: "Bởi vì ~ (N3)", level: "N3" },
    { id: 135, structure: "〜ことに", explanation: "Đặc biệt là; một cách đặc biệt (N3)", level: "N3" },
    { id: 136, structure: "〜た末", explanation: "Rất lâu sau khi ~ (N3)", level: "N3" },
    { id: 137, structure: "〜たところ", explanation: "Sau ~ (N2)", level: "N2" },
    { id: 138, structure: "〜ついでに", explanation: "Nhân tiện; tiện thể (N2)", level: "N2" },
    { id: 139, structure: "〜というと", explanation: "Lấy lên một ví dụ làm đại diện (N2)", level: "N2" },
    { id: 140, structure: "〜といったら", explanation: "Nói về cảm xúc thán phục, ngạc nhiên (N2)", level: "N2" },
    { id: 141, structure: "〜というより", explanation: "Là ~ , nhưng cái nói đằng sau mới là thích đáng hơn. (N2)", level: "N2" },
    { id: 142, structure: "〜ば〜ほど", explanation: "Càng ~ càng ~ . (N2)", level: "N2" },
    { id: 143, structure: "〜かのようだ", explanation: "thực tế thì không phải vậy nhưng có vẻ như là ~ (N2)", level: "N2" },
    { id: 144, structure: "〜つつある", explanation: "Dần dần đang (N2)", level: "N2" },
    { id: 145, structure: "〜てたまらない", explanation: "Không thể kìm nén được. (N2)", level: "N2" },
    { id: 146, structure: "〜てならない", explanation: "~ một cách phi thường (N2)", level: "N2" },
    { id: 147, structure: "〜にきまっている", explanation: "Nghĩ ~ là nhất định, đương nhiên (N2)", level: "N2" },
    { id: 148, structure: "〜に相違ない", explanation: "Chắc đúng là ~, Nghĩ ~ là không sai được (N2)", level: "N2" },
    { id: 149, structure: "〜べき", explanation: "Làm như thế là đương nhiên, nên làm ~ (N2)", level: "N2" },
    { id: 150, structure: "〜ほかない", explanation: "Chả có cách nào khác là ~ (N2)", level: "N2" },
    { id: 151, structure: "〜向きだ", explanation: "Vừa đẹp với ~, thích hợp với~ (N2)", level: "N2" },
    { id: 152, structure: "〜向けだ", explanation: "Để thích hợp với ~ (N2)", level: "N2" },
    { id: 153, structure: "〜ものか", explanation: "Quyết không ~ (Ý phủ định mạnh) (N2)", level: "N2" },
    { id: 154, structure: "〜ものだ", explanation: "Thể hiện cảm xúc mạnh, cảm thán (N2)", level: "N2" },
    { id: 155, structure: "〜っけ", explanation: "Đang nhớ ra, nhớ lại và muốn xác nhận lại (N2)", level: "N2" },
    { id: 156, structure: "〜とか", explanation: "Nghe nói là ~ (N2)", level: "N2" },
    { id: 157, structure: "〜どころではない", explanation: "Có lý do, chịu không thể ~ (N2)", level: "N2" },
    { id: 158, structure: "〜からして", explanation: "Đưa ra một ví dụ, nghĩ là những cái khác là đương nhiên. (N2)", level: "N2" },
    { id: 159, structure: "〜からすると", explanation: "Nhìn từ lập trường của ~ (N2)", level: "N2" },
    { id: 160, structure: "〜からには", explanation: "Chừng nào ~ ; vì là ~, đương nhiên (N2)", level: "N2" },
    { id: 161, structure: "〜ことだから", explanation: "Trình bày lý do mà mọi người đều biết (N2)", level: "N2" },
    { id: 162, structure: "〜だけ", explanation: "Phù hợp với, quả đúng là, đúng là (N2)", level: "N2" },
    { id: 163, structure: "〜にあたって", explanation: "Trong khi… (N2)", level: "N2" },
    { id: 164, structure: "〜にかけては", explanation: "Nếu nói về… (N2)", level: "N2" },
    { id: 165, structure: "〜に際して", explanation: "Khi bắt đầu…, Khi đang… (N2)", level: "N2" },
    { id: 166, structure: "〜に先立って", explanation: "Trước khi... (N2)", level: "N2" },
    { id: 167, structure: "〜にしたら", explanation: "Nếu nói trên lập trường… (N2)", level: "N2" },
    { id: 168, structure: "〜につき", explanation: "Vì… (N2)", level: "N2" },
    { id: 169, structure: "〜につけ", explanation: "Mỗi lần làm… (N2)", level: "N2" },
    { id: 170, structure: "〜のもとで", explanation: "Dưới… (N2)", level: "N2" },
    { id: 171, structure: "〜はともかく", explanation: "Tạm thời không nghĩ đến… (N2)", level: "N2" },
    { id: 172, structure: "〜をきっかけに", explanation: "Biểu thị rằng từ một việc ngẫu nhiên mà có gì đó bắt đầu (N2)", level: "N2" },
    { id: 173, structure: "〜を契機に", explanation: "nhân cơ hội ~ (N2)", level: "N2" },
    { id: 174, structure: "〜を〜として", explanation: "Lấy ~ làm ~ (N2)", level: "N2" },
    { id: 175, structure: "〜あげく", explanation: "Sau ~ rốt cuộc là ... (N2)", level: "N2" },
    { id: 176, structure: "〜以上", explanation: "Chừng nào ~ ; đã là ~ thì (N2)", level: "N2" },
    { id: 177, structure: "〜上は", explanation: "Chừng nào ~ ; đã là ~ thì (N2)", level: "N2" },
    { id: 178, structure: "〜ことなく", explanation: "Không có ~ (N2)", level: "N2" },
    { id: 179, structure: "〜際", explanation: "Thời gian, trường hợp (N2)", level: "N2" },
    { id: 180, structure: "〜つつ", explanation: "Đang, trong khi ~ (N2)", level: "N2" },
    { id: 181, structure: "〜てからでないと", explanation: "Nếu không thực hiện cái nói đằng trước thì điều đằng sau cũng không thực hiện. (N2)", level: "N2" },
    { id: 182, structure: "〜といっても", explanation: "Dù là ~ nhưng ~ (N2)", level: "N2" },
    { id: 183, structure: "〜どころか", explanation: "Dùng nhấn mạnh một sự phản đối trực diện (N2)", level: "N2" },
    { id: 184, structure: "〜としたら", explanation: "Nếu mà (giả định) (N2)", level: "N2" },
    { id: 185, structure: "〜ないことには", explanation: "Nếu không ~ (N2)", level: "N2" },
    { id: 186, structure: "〜にしては", explanation: "So với điều được đương nhiên nghĩ đến từ đó thì khác (N2)", level: "N2" },
    { id: 187, structure: "〜にしろ", explanation: "Ngay cả nếu, tỉ như ~, vẫn ~ (N2)", level: "N2" },
    { id: 188, structure: "〜にかかわらず", explanation: "Không liên quan đến~ (N2)", level: "N2" },
    { id: 189, structure: "〜にもかかわらず", explanation: "Dù cho, dẫu cho ~ (N2)", level: "N2" },
    { id: 190, structure: "〜ぬきで", explanation: "Không có ~ (N2)", level: "N2" },
    { id: 191, structure: "〜のみならず", explanation: "Như, cũng như, và còn thêm ~ (N2)", level: "N2" },
    { id: 192, structure: "〜反面", explanation: "Mặt khác, mặt trái (N2)", level: "N2" },
    { id: 193, structure: "〜ものなら", explanation: "Nếu ~ (dùng khi hi vọng vào một điều khó thực hiện) (N2)", level: "N2" },
    { id: 194, structure: "〜ものの", explanation: "Dù là ~ (N2)", level: "N2" },
    { id: 195, structure: "〜わりに", explanation: "Không phù hợp, không xứng với ~ (N2)", level: "N2" },
    { id: 196, structure: "〜うではないか", explanation: "Hãy ~ (kêu gọi mạnh mẽ) (N2)", level: "N2" },
    { id: 197, structure: "〜かねない", explanation: "Lo ngại là ~ (N2)", level: "N2" },
    { id: 198, structure: "〜かねる", explanation: "Muốn làm ~ nhưng không thể (N2)", level: "N2" },
    { id: 199, structure: "〜ことか", explanation: "Không biết thế nào đây ~ (N2)", level: "N2" },
    { id: 200, structure: "〜ことだ", explanation: "Dùng khi khuyên người khác rằng việc đó là quan trọng (N2)", level: "N2" },
    { id: 201, structure: "〜次第だ", explanation: "Vì… (N2)", level: "N2" },
    { id: 202, structure: "〜っこない", explanation: "Nhất định không… (N2)", level: "N2" },
    { id: 203, structure: "〜というものだ", explanation: "Biểu thị cách nghĩ và cảm giác (N2)", level: "N2" },
    { id: 204, structure: "〜というものではない", explanation: "Không thể nói hết là… (N2)", level: "N2" },
    { id: 205, structure: "〜ないことはない", explanation: "Cũng có khả năng là... (N2)", level: "N2" },
    { id: 206, structure: "〜ないではいられない", explanation: "Dù thế nào cũng đã làm… (N2)", level: "N2" },
    { id: 207, structure: "〜に限る", explanation: "Giới hạn ở… (N2)", level: "N2" },
    { id: 208, structure: "〜に限らず", explanation: "Không chỉ…mà cũng… (N2)", level: "N2" },
    { id: 209, structure: "〜にほかならない", explanation: "Chính là…, Không gì khác là… (N2)", level: "N2" },
    { id: 210, structure: "〜もの", explanation: "Bởi vì… (N2)", level: "N2" },
    { id: 211, structure: "〜ものがある", explanation: "Có cảm giác… (N2)", level: "N2" },
    { id: 212, structure: "〜ようがない", explanation: "Không còn phương pháp nào (N2)", level: "N2" },

  ];
}


// ---------------------------------------------------------------------------
// extractGrammarFromVideo
// Load video subtitles ordered, for each subtitle call detectGrammarInText,
// if match then create entry {grammar, appear_at_ms, subtitleId}
// Does NOT write to DB — pure extraction.
// ---------------------------------------------------------------------------
/**
 * Lookup/create các Grammar row cho structures Gemini trả về — dùng chung
 * cho extract full-video và sync scoped (chỉ dòng mới).
 */
async function resolveGrammarRows(
  geminiPoints: Map<number, Array<{ structure: string; explanation: string; level: string | null }>>,
  onProgress?: StageProgressFn
): Promise<Map<string, Grammar>> {
  const allStructures = new Set<string>();
  for (const points of geminiPoints.values()) for (const p of points) allStructures.add(p.structure);
  const existing = await prisma.grammar.findMany({ where: { structure: { in: [...allStructures] } } });
  const byStructure = new Map(existing.map((g) => [g.structure, g]));
  let persisted = 0;
  for (const structure of allStructures) {
    if (!byStructure.has(structure)) {
      const seed = [...geminiPoints.values()].flat().find((p) => p.structure === structure);
      const created = await prisma.grammar.create({
        data: { structure, explanation: seed?.explanation ?? structure, level: (seed?.level ?? "N3") as Level },
      });
      byStructure.set(structure, created);
    }
    persisted++;
    onProgress?.("persist", persisted, allStructures.size);
  }
  return byStructure;
}

export async function extractGrammarFromVideo(videoId: number): Promise<GrammarTimelineEntry[]> {
  return extractGrammarCore(videoId);
}

/**
 * Core quét ngữ pháp — route SSE truyền onProgress để báo phần trăm.
 */
export async function extractGrammarCore(videoId: number, onProgress?: StageProgressFn): Promise<GrammarTimelineEntry[]> {
  if (!Number.isInteger(videoId) || videoId <= 0) return [];

  const subtitles = await prisma.subtitle.findMany({ where: { video_id: videoId }, orderBy: { start_time_ms: "asc" } });

  if (subtitles.length === 0) return [];
  onProgress?.("load", 1, 1);

  // Bổ sung TOÀN BỘ mẫu phát hiện được — không lọc theo level video.

  const timeline: GrammarTimelineEntry[] = [];

  // 1) Gemini batch song song: phát hiện mẫu theo ngữ cảnh cho mọi subtitle
  const geminiPoints = await detectGrammarPoints(
    subtitles
      .filter((s) => (s.raw_text ?? "").trim() !== "")
      .map((s) => ({ id: s.id, text: (s.raw_text ?? "").trim().slice(0, 200) })),
    (d, t) => onProgress?.("detect", d, t)
  );

  if (geminiPoints.size > 0) {
    // Gom mọi structure Gemini trả về → lookup/create 1 lần (dùng chung với sync scoped)
    const byStructure = await resolveGrammarRows(geminiPoints, (_s, d, t) => onProgress?.("persist", d, t));
    const subById = new Map(subtitles.map((s) => [s.id, s]));
    for (const [subId, points] of geminiPoints) {
      const sub = subById.get(subId);
      if (!sub) continue;
      for (const p of points) {
        const grammar = byStructure.get(p.structure);
        if (!grammar) continue;
        timeline.push({ grammar, appear_at_ms: sub.start_time_ms, subtitleId: sub.id });
      }
    }
  } else {
    // 1b) Fallback matcher cũ khi thiếu key Gemini / API lỗi
    for (const sub of subtitles) {
      const raw = sub.raw_text ?? "";
      if (!raw.trim()) continue;
      const matched = await detectGrammarInText(raw);
      for (const grammar of matched) {
        timeline.push({
          grammar,
          appear_at_ms: sub.start_time_ms,
          subtitleId: sub.id,
        });
      }
    }
    // Quét toàn bộ script nối lại — bắt các mẫu trải dài nhiều câu
    if (subtitles.length > 1) {
      const fullScript = subtitles.map((s) => s.raw_text).join("\n");
      const fullMatches = await detectGrammarInText(fullScript);
      const seenGrammarIds = new Set(timeline.map((t) => t.grammar.id));
      for (const g of fullMatches) {
        if (!seenGrammarIds.has(g.id)) {
          timeline.push({
            grammar: g,
            appear_at_ms: subtitles[0].start_time_ms,
            subtitleId: subtitles[0].id,
          });
          seenGrammarIds.add(g.id);
        }
      }
    }
  }

  // Giữ toàn bộ mẫu (mọi level), dedup: 1 record / grammar (earliest time)
  return dedupTimelineByGrammar(timeline);
}


/**
 * Bổ sung thư viện Grammar từ các dòng sub mới thêm — không quét lại cả video.
 * Chỉ lookup/create hàng Grammar (không ghi timeline — tính năng timeline đã gỡ).
 * Dùng cho flow thêm video/phụ đề.
 */
export async function syncGrammarForSubtitles(
  videoId: number,
  rows: Array<{ id: number; start_time_ms: number; raw_text: string | null }>,
  onProgress?: StageProgressFn
): Promise<{ addedGrammar: number; checked: number }> {
  if (!videoId || Number.isNaN(videoId) || rows.length === 0) return { addedGrammar: 0, checked: 0 };
  const geminiPoints = await detectGrammarPoints(
    rows
      .filter((s) => (s.raw_text ?? "").trim() !== "")
      .map((s) => ({ id: s.id, text: (s.raw_text ?? "").trim().slice(0, 200) })),
    (d, t) => onProgress?.("detect", d, t)
  );
  if (geminiPoints.size === 0) return { addedGrammar: 0, checked: rows.length };
  const before = new Set((await prisma.grammar.findMany({ select: { structure: true } })).map((g) => g.structure));
  const byStructure = await resolveGrammarRows(geminiPoints, (_s, d, t) => onProgress?.("persist", d, t));
  let addedGrammar = 0;
  for (const s of byStructure.keys()) if (!before.has(s)) addedGrammar++;
  return { addedGrammar, checked: rows.length };
}

