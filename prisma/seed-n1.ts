import { PrismaClient, Level } from "@prisma/client";
const prisma = new PrismaClient();

/**
 * N1 50 kanji - each kanji as 1 Vocabulary entry
 * word=kanji, reading=on/kun (hiragana), meaning=VI, level=N1
 * Uses createMany skipDuplicates for idempotency.
 * 
 * Spec list 44 + pad 6 to reach 50 as per acceptance 5*50=250.
 * Pad kanji are N1-only to avoid overlap with N5-N2 slices.
 */
const n1Kanji: Array<{ word: string; reading: string; meaning: string; level: Level }> = [
  // 44 từ spec
  { word: "憾", reading: "かん", meaning: "hám", level: Level.N1 },
  { word: "歓", reading: "かん", meaning: "hoan", level: Level.N1 },
  { word: "環", reading: "かん", meaning: "hoàn", level: Level.N1 },
  { word: "還", reading: "かん", meaning: "hoàn", level: Level.N1 },
  { word: "韓", reading: "かん", meaning: "hàn", level: Level.N1 },
  // 含 spec ghi "含(含, hàm)" - reading lỗi, dùng がん (on yomi)
  { word: "含", reading: "がん", meaning: "hàm", level: Level.N1 },
  { word: "怨", reading: "えん", meaning: "oán", level: Level.N1 },
  { word: "謙", reading: "けん", meaning: "khiêm", level: Level.N1 },
  { word: "顕", reading: "けん", meaning: "hiển", level: Level.N1 },
  { word: "懸", reading: "けん", meaning: "huyền", level: Level.N1 },
  { word: "幻", reading: "げん", meaning: "ảo", level: Level.N1 },
  { word: "玄", reading: "げん", meaning: "huyền", level: Level.N1 },
  { word: "孤", reading: "こ", meaning: "cô", level: Level.N1 },
  { word: "己", reading: "こ", meaning: "kỷ", level: Level.N1 },
  { word: "顧", reading: "こ", meaning: "cố", level: Level.N1 },
  { word: "互", reading: "ご", meaning: "hỗ", level: Level.N1 },
  { word: "呉", reading: "ご", meaning: "ngô", level: Level.N1 },
  { word: "後", reading: "ご", meaning: "hậu", level: Level.N1 },
  { word: "御", reading: "ご", meaning: "ngự", level: Level.N1 },
  { word: "悟", reading: "ご", meaning: "ngộ", level: Level.N1 },
  { word: "梗", reading: "こう", meaning: "ngạnh", level: Level.N1 },
  { word: "侯", reading: "こう", meaning: "hầu", level: Level.N1 },
  { word: "恒", reading: "こう", meaning: "hằng", level: Level.N1 },
  { word: "洪", reading: "こう", meaning: "hồng", level: Level.N1 },
  { word: "皇", reading: "こう", meaning: "hoàng", level: Level.N1 },
  { word: "紅", reading: "こう", meaning: "hồng", level: Level.N1 },
  { word: "荒", reading: "こう", meaning: "hoang", level: Level.N1 },
  { word: "衡", reading: "こう", meaning: "hành", level: Level.N1 },
  { word: "講", reading: "こう", meaning: "giảng", level: Level.N1 },
  { word: "鋼", reading: "こう", meaning: "cương", level: Level.N1 },
  { word: "降", reading: "こう", meaning: "giáng", level: Level.N1 },
  { word: "項", reading: "こう", meaning: "hạng", level: Level.N1 },
  { word: "香", reading: "こう", meaning: "hương", level: Level.N1 },
  { word: "高", reading: "こう", meaning: "cao", level: Level.N1 },
  { word: "剛", reading: "ごう", meaning: "cương", level: Level.N1 },
  { word: "号", reading: "ごう", meaning: "hiệu", level: Level.N1 },
  { word: "合", reading: "ごう", meaning: "hợp", level: Level.N1 },
  { word: "克", reading: "こく", meaning: "khắc", level: Level.N1 },
  { word: "刻", reading: "こく", meaning: "khắc", level: Level.N1 },
  { word: "告", reading: "こく", meaning: "cáo", level: Level.N1 },
  { word: "谷", reading: "こく", meaning: "cốc", level: Level.N1 },
  { word: "骨", reading: "こつ", meaning: "cốt", level: Level.N1 },
  // 込 spec "込(こ,込)" - reading rút gọn, dùng こむ
  { word: "込", reading: "こむ", meaning: "vào", level: Level.N1 },
  { word: "懇", reading: "こん", meaning: "khẩn", level: Level.N1 },
  // Pad 6 kanji N1-only để đủ 50 (không trùng N2/N4 pads)
  // 拡 đã tồn tại ở N2 (id 322) nên thay bằng 裁 để tránh trùng word toàn cục
  { word: "憂", reading: "ゆう", meaning: "ưu", level: Level.N1 },
  { word: "抑", reading: "よく", meaning: "ức", level: Level.N1 },
  { word: "裁", reading: "さい", meaning: "tài", level: Level.N1 },
  { word: "律", reading: "りつ", meaning: "luật", level: Level.N1 },
  { word: "湾", reading: "わん", meaning: "loan", level: Level.N1 },
  { word: "憶", reading: "おく", meaning: "ức", level: Level.N1 },
];

async function main() {
  console.log(`[N1] Preparing to insert ${n1Kanji.length} kanji...`);
  // Kiểm tra trùng word hiện có để báo cáo, nhưng vẫn insert tất cả (bone sẽ duplicate word nhưng khác level)
  const existing = await prisma.vocabulary.findMany({
    where: { word: { in: n1Kanji.map((k) => k.word) } },
    select: { word: true, level: true },
  });
  const existingWords = new Set(existing.map((e) => e.word));
  const overlap = n1Kanji.filter((k) => existingWords.has(k.word));
  if (overlap.length > 0) {
    console.log(`[N1] Overlap with existing Vocabulary (word already exists): ${overlap.map((o) => `${o.word}(${existing.find(e=>e.word===o.word)?.level})`).join(", ")} - will insert anyway as N1 variant (word not unique)`);
  }

  const res = await prisma.vocabulary.createMany({
    data: n1Kanji,
    skipDuplicates: true,
  });
  console.log(`[N1] createMany result count: ${res.count}`);

  const total = await prisma.vocabulary.count();
  const n1Count = await prisma.vocabulary.count({ where: { level: Level.N1 } });
  const n5Count = await prisma.vocabulary.count({ where: { level: Level.N5 } });
  const n4Count = await prisma.vocabulary.count({ where: { level: Level.N4 } });
  const n3Count = await prisma.vocabulary.count({ where: { level: Level.N3 } });
  const n2Count = await prisma.vocabulary.count({ where: { level: Level.N2 } });
  console.log(`[N1] Totals -> Vocabulary: ${total} (N5:${n5Count} N4:${n4Count} N3:${n3Count} N2:${n2Count} N1:${n1Count})`);
  console.log(`[N1] KanjiPage will extract via prisma.vocabulary.findMany select word/reading/meaning/level where word contains kanji`);
}

main()
  .catch((e) => {
    console.error("[N1] Seed failed", e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
