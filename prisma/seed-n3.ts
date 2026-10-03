import { PrismaClient, Level } from "@prisma/client";
const prisma = new PrismaClient();

async function main() {
  const kanjiN3: Array<{ word: string; reading: string; meaning: string; level: Level }> = [
    { word: "政", reading: "せい", meaning: "chính", level: Level.N3 },
    { word: "治", reading: "じ", meaning: "trị", level: Level.N3 },
    { word: "経", reading: "けい", meaning: "kinh", level: Level.N3 },
    { word: "済", reading: "ざい", meaning: "tế", level: Level.N3 },
    { word: "議", reading: "ぎ", meaning: "nghị", level: Level.N3 },
    { word: "管", reading: "かん", meaning: "quản", level: Level.N3 },
    { word: "理", reading: "り", meaning: "lý", level: Level.N3 },
    { word: "事", reading: "じ", meaning: "sự", level: Level.N3 },
    { word: "業", reading: "ぎょう", meaning: "nghiệp", level: Level.N3 },
    { word: "務", reading: "む", meaning: "vụ", level: Level.N3 },
    { word: "働", reading: "どう", meaning: "động", level: Level.N3 },
    { word: "料", reading: "りょう", meaning: "liệu", level: Level.N3 },
    { word: "開", reading: "かい", meaning: "mở", level: Level.N3 },
    { word: "閉", reading: "へい", meaning: "đóng", level: Level.N3 },
    { word: "関", reading: "かん", meaning: "quan", level: Level.N3 },
    { word: "係", reading: "けい", meaning: "hệ", level: Level.N3 },
    { word: "決", reading: "けつ", meaning: "quyết", level: Level.N3 },
    { word: "定", reading: "てい", meaning: "định", level: Level.N3 },
    { word: "意", reading: "い", meaning: "ý", level: Level.N3 },
    { word: "味", reading: "み", meaning: "vị", level: Level.N3 },
    { word: "通", reading: "つう", meaning: "thông", level: Level.N3 },
    { word: "信", reading: "しん", meaning: "tin", level: Level.N3 },
    { word: "知", reading: "ち", meaning: "tri", level: Level.N3 },
    { word: "識", reading: "しき", meaning: "thức", level: Level.N3 },
    { word: "研", reading: "けん", meaning: "nghiên", level: Level.N3 },
    { word: "究", reading: "きゅう", meaning: "cứu", level: Level.N3 },
    { word: "表", reading: "ひょう", meaning: "biểu", level: Level.N3 },
    { word: "現", reading: "げん", meaning: "hiện", level: Level.N3 },
    { word: "実", reading: "じつ", meaning: "thực", level: Level.N3 },
    { word: "際", reading: "さい", meaning: "tế", level: Level.N3 },
    { word: "対", reading: "たい", meaning: "đối", level: Level.N3 },
    { word: "象", reading: "しょう", meaning: "tượng", level: Level.N3 },
    { word: "期", reading: "き", meaning: "kỳ", level: Level.N3 },
    { word: "待", reading: "たい", meaning: "đãi", level: Level.N3 },
    { word: "望", reading: "ぼう", meaning: "vọng", level: Level.N3 },
    { word: "態", reading: "たい", meaning: "thái", level: Level.N3 },
    { word: "度", reading: "ど", meaning: "độ", level: Level.N3 },
    { word: "情", reading: "じょう", meaning: "tình", level: Level.N3 },
    { word: "報", reading: "ほう", meaning: "báo", level: Level.N3 },
    { word: "法", reading: "ほう", meaning: "pháp", level: Level.N3 },
    { word: "律", reading: "りつ", meaning: "luật", level: Level.N3 },
    { word: "制", reading: "せい", meaning: "chế", level: Level.N3 },
    { word: "費", reading: "ひ", meaning: "phí", level: Level.N3 },
    { word: "段", reading: "だん", meaning: "đoạn", level: Level.N3 },
    { word: "階", reading: "かい", meaning: "giai", level: Level.N3 },
    { word: "割", reading: "かつ", meaning: "cát", level: Level.N3 },
    { word: "選", reading: "せん", meaning: "tuyển", level: Level.N3 },
    { word: "択", reading: "たく", meaning: "trạch", level: Level.N3 },
    { word: "営", reading: "えい", meaning: "doanh", level: Level.N3 },
    { word: "果", reading: "か", meaning: "quả", level: Level.N3 },
  ];

  // Đảm bảo đủ 50 và không trùng nội bộ
  if (kanjiN3.length !== 50) {
    throw new Error(`Kanji N3 list must have 50, got ${kanjiN3.length}`);
  }
  const dupCheck = new Set(kanjiN3.map((k) => k.word));
  if (dupCheck.size !== 50) {
    throw new Error(`Kanji N3 list has duplicates: ${kanjiN3.length - dupCheck.size}`);
  }

  const result = await prisma.vocabulary.createMany({
    data: kanjiN3,
    skipDuplicates: true,
  });

  console.log(`N3 seed: requested 50, inserted ${result.count}`);

  // Verify KanjiPage extraction logic: count how many of our kanji are extractable
  const allN3 = await prisma.vocabulary.findMany({
    where: { level: Level.N3 },
    select: { word: true },
  });
  const wordSet = new Set(allN3.map((r) => r.word));
  const missing = kanjiN3.filter((k) => !wordSet.has(k.word));
  console.log(`Verification: total N3 vocab now ${allN3.length}, missing from our list: ${missing.length}`);
  if (missing.length > 0) {
    console.log("Missing:", missing.map((m) => m.word).join(", "));
  }

  // Also verify extractKanjiItems would find them
  const kanjiRegex = /[\u4E00-\u9FFF]/g;
  const extractable = kanjiN3.filter((k) => k.word.match(kanjiRegex));
  console.log(`Extractable kanji count: ${extractable.length}/50`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
