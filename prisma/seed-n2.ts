import { PrismaClient, Level } from "@prisma/client";
const prisma = new PrismaClient();

const n2Kanji: Array<{ word: string; reading: string; meaning: string; level: Level }> = [
  // 19 base kanji
  { word: "細", reading: "さい", meaning: "tế", level: Level.N2 },
  { word: "密", reading: "みつ", meaning: "mật", level: Level.N2 },
  { word: "容", reading: "よう", meaning: "dung", level: Level.N2 },
  { word: "器", reading: "き", meaning: "khí", level: Level.N2 },
  { word: "材", reading: "ざい", meaning: "tài", level: Level.N2 },
  { word: "産", reading: "さん", meaning: "sản", level: Level.N2 },
  { word: "製", reading: "せい", meaning: "chế", level: Level.N2 },
  { word: "質", reading: "しつ", meaning: "chất", level: Level.N2 },
  { word: "量", reading: "りょう", meaning: "lượng", level: Level.N2 },
  { word: "価", reading: "か", meaning: "giá", level: Level.N2 },
  { word: "格", reading: "かく", meaning: "cách", level: Level.N2 },
  { word: "効", reading: "こう", meaning: "hiệu", level: Level.N2 },
  { word: "率", reading: "りつ", meaning: "suất", level: Level.N2 },
  { word: "能", reading: "のう", meaning: "năng", level: Level.N2 },
  { word: "式", reading: "しき", meaning: "thức", level: Level.N2 },
  { word: "備", reading: "び", meaning: "bị", level: Level.N2 },
  { word: "設", reading: "せつ", meaning: "thiết", level: Level.N2 },
  { word: "機", reading: "き", meaning: "cơ", level: Level.N2 },
  { word: "関", reading: "かん", meaning: "quan", level: Level.N2 },
  // 25 replacement kanji (if trùng N3, second list without duplicate 密)
  { word: "優", reading: "ゆう", meaning: "ưu", level: Level.N2 },
  { word: "秀", reading: "しゅう", meaning: "tú", level: Level.N2 },
  { word: "厳", reading: "げん", meaning: "nghiêm", level: Level.N2 },
  { word: "圧", reading: "あつ", meaning: "áp", level: Level.N2 },
  { word: "縮", reading: "しゅく", meaning: "súc", level: Level.N2 },
  { word: "拡", reading: "かく", meaning: "khuếch", level: Level.N2 },
  { word: "張", reading: "ちょう", meaning: "trương", level: Level.N2 },
  { word: "徴", reading: "ちょう", meaning: "trưng", level: Level.N2 },
  { word: "収", reading: "しゅう", meaning: "thu", level: Level.N2 },
  { word: "支", reading: "し", meaning: "chi", level: Level.N2 },
  { word: "払", reading: "はら", meaning: "trả", level: Level.N2 },
  { word: "戻", reading: "もど", meaning: "trở", level: Level.N2 },
  { word: "扱", reading: "あつか", meaning: "xử", level: Level.N2 },
  { word: "担", reading: "たん", meaning: "đảm", level: Level.N2 },
  { word: "任", reading: "にん", meaning: "nhiệm", level: Level.N2 },
  { word: "保", reading: "ほ", meaning: "bảo", level: Level.N2 },
  { word: "存", reading: "そん", meaning: "tồn", level: Level.N2 },
  { word: "険", reading: "けん", meaning: "hiểm", level: Level.N2 },
  { word: "危", reading: "き", meaning: "nguy", level: Level.N2 },
  { word: "害", reading: "がい", meaning: "hại", level: Level.N2 },
  { word: "災", reading: "さい", meaning: "tai", level: Level.N2 },
  { word: "救", reading: "きゅう", meaning: "cứu", level: Level.N2 },
  { word: "援", reading: "えん", meaning: "viện", level: Level.N2 },
  { word: "策", reading: "さく", meaning: "sách", level: Level.N2 },
  { word: "略", reading: "りゃく", meaning: "lược", level: Level.N2 },
  // 6 pad to reach 50 (N2 economy kanji, not overlapping N3/N1 expected)
  { word: "増", reading: "ぞう", meaning: "tăng", level: Level.N2 },
  { word: "減", reading: "げん", meaning: "giảm", level: Level.N2 },
  { word: "税", reading: "ぜい", meaning: "thuế", level: Level.N2 },
  { word: "貿", reading: "ぼう", meaning: "mậu", level: Level.N2 },
  { word: "易", reading: "えき", meaning: "dịch", level: Level.N2 },
  { word: "続", reading: "ぞく", meaning: "tục", level: Level.N2 },
];

async function main() {
  console.log(`Preparing to insert ${n2Kanji.length} N2 kanji...`);
  // Verify not trùng existing N3 singles etc — skipDuplicates handles but we log
  const result = await prisma.vocabulary.createMany({
    data: n2Kanji,
    skipDuplicates: true,
  });
  console.log(`Inserted N2 kanji count: ${result.count} / ${n2Kanji.length}`);
  // Verify total N2 singles
  const totalN2 = await prisma.vocabulary.count({ where: { level: Level.N2 } });
  const singlesN2 = await prisma.vocabulary.findMany({
    where: { level: Level.N2 },
    select: { word: true, reading: true, meaning: true, level: true },
  });
  const singleCharN2 = singlesN2.filter(v => [...v.word].length === 1);
  console.log(`Total Vocabulary N2: ${totalN2}, single-char N2: ${singleCharN2.length}`);
  console.log(singleCharN2.map(v => `${v.word}(${v.reading},${v.meaning})`).join(" "));
  if (result.count !== 50) {
    // If skipDuplicates dropped some due to duplicate word already present, warn
    console.warn(`Warning: expected 50 inserts but got ${result.count}. Check duplicates.`);
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
