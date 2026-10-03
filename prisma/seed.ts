import { PrismaClient, Level, QuestionType, Role, VideoCategory } from "@prisma/client";
import bcrypt from "bcryptjs";
const prisma = new PrismaClient();

async function main() {
  const adminHash = await bcrypt.hash("admin123", 10);
  const demoHash = await bcrypt.hash("demo123", 10);

  const admin = await prisma.user.upsert({
    where: { email: "admin@lms.local" },
    update: { password_hash: adminHash, role: Role.ADMIN, name: "Admin" },
    create: { email: "admin@lms.local", password_hash: adminHash, name: "Admin", role: Role.ADMIN, target_level: Level.N4 }
  });

  const user = await prisma.user.upsert({
    where: { email: "demo@lms.local" },
    update: { password_hash: demoHash, role: Role.USER },
    create: { email: "demo@lms.local", password_hash: demoHash, name: "Demo", role: Role.USER, target_level: Level.N4 }
  });

  const v1 = await prisma.video.upsert({
    where: { youtube_id: "dQw4w9WgXcQ" },
    update: { category: VideoCategory.SHORT },
    create: { youtube_id: "dQw4w9WgXcQ", title: "Bài 1: Chào hỏi cơ bản (N5)", level: Level.N5, category: VideoCategory.SHORT, duration: 320 }
  });

  const v2 = await prisma.video.upsert({
    where: { youtube_id: "jNQXAC9IVRw" },
    update: { category: VideoCategory.KAIWA },
    create: { youtube_id: "jNQXAC9IVRw", title: "Bài 2: Hội thoại hàng ngày (N4)", level: Level.N4, category: VideoCategory.KAIWA, duration: 420 }
  });

  const v3 = await prisma.video.upsert({
    where: { youtube_id: "9bZkp7q19f0" },
    update: { category: VideoCategory.SONG },
    create: { youtube_id: "9bZkp7q19f0", title: "Bài 3: Bài hát Sakura (N5)", level: Level.N5, category: VideoCategory.SONG, duration: 280 }
  });

  // Đảm bảo mapping id -> category đúng yêu cầu 1:SHORT, 2:KAIWA, 3:SONG (nếu video đã tồn tại với id khác)
  await prisma.video.update({ where: { id: 1 }, data: { category: VideoCategory.SHORT } }).catch(() => {});
  await prisma.video.update({ where: { id: 2 }, data: { category: VideoCategory.KAIWA } }).catch(() => {});
  await prisma.video.update({ where: { id: 3 }, data: { category: VideoCategory.SONG } }).catch(() => {});

  await prisma.subtitle.createMany({
    data: [
      { video_id: v1.id, start_time_ms: 0, end_time_ms: 2500, raw_text: "こんにちは、はじめまして。" },
      { video_id: v1.id, start_time_ms: 2500, end_time_ms: 6000, raw_text: "私は田中です。よろしくお願いします。" },
      { video_id: v1.id, start_time_ms: 6000, end_time_ms: 9500, raw_text: "今日は天気がいいですね。" }
    ],
    skipDuplicates: true
  });

  await prisma.subtitle.createMany({
    data: [
      { video_id: v2.id, start_time_ms: 0, end_time_ms: 3000, raw_text: "すみません、これはいくらですか。" },
      { video_id: v2.id, start_time_ms: 3000, end_time_ms: 6500, raw_text: "それは500円です。" },
      { video_id: v2.id, start_time_ms: 6500, end_time_ms: 9000, raw_text: "じゃあ、これをください。" }
    ],
    skipDuplicates: true
  });

  await prisma.subtitle.createMany({
    data: [
      { video_id: v3.id, start_time_ms: 0, end_time_ms: 2800, raw_text: "さくら、さくら、野山も里も、見渡す限り。" },
      { video_id: v3.id, start_time_ms: 2800, end_time_ms: 5600, raw_text: "かすみか雲か、朝日ににおう。" },
      { video_id: v3.id, start_time_ms: 5600, end_time_ms: 8500, raw_text: "さくら、さくら、花ざかり。" }
    ],
    skipDuplicates: true
  });

  await prisma.vocabulary.upsert({
    where: { id: 1 },
    update: {},
    create: { word: "こんにちは", reading: "konnichiwa", meaning: "Xin chào (ban ngày)", level: Level.N5 }
  });

  // ==== GRAMMAR N5-N2 (60 mẫu tham khảo Mazii / JLPT) ====
  const grammars: Array<{ id: number; structure: string; explanation: string; level: Level }> = [
    // N5 — 15 mẫu cơ bản
    { id: 1, structure: "〜は〜です", explanation: "A là B — khẳng định (N5, Mazii: は)", level: Level.N5 },
    { id: 2, structure: "〜があります", explanation: "Có (vật) — tồn tại vô tri (N5)", level: Level.N5 },
    { id: 3, structure: "〜がいます", explanation: "Có (người/động vật) — tồn tại hữu tri (N5)", level: Level.N5 },
    { id: 4, structure: "〜たいです", explanation: "Muốn làm ~ (N5, Mazii: たい)", level: Level.N5 },
    { id: 5, structure: "〜てもいいですか", explanation: "Làm ~ có được không? — xin phép (N5)", level: Level.N5 },
    { id: 16, structure: "〜てください", explanation: "Hãy làm ~ — yêu cầu lịch sự (N5)", level: Level.N5 },
    { id: 17, structure: "〜ないでください", explanation: "Đừng làm ~ — cấm/yêu cầu phủ định (N5)", level: Level.N5 },
    { id: 18, structure: "〜ましょう", explanation: "Cùng làm ~ nhé — rủ rê (N5)", level: Level.N5 },
    { id: 19, structure: "〜ませんか", explanation: "Làm ~ không? — mời lịch sự (N5)", level: Level.N5 },
    { id: 20, structure: "〜が好きです", explanation: "Thích ~ (N5)", level: Level.N5 },
    { id: 21, structure: "〜から〜まで", explanation: "Từ ~ đến ~ — khoảng thời gian/địa điểm (N5)", level: Level.N5 },
    { id: 22, structure: "〜と", explanation: "Và / với — liệt kê, cùng làm (N5)", level: Level.N5 },
    { id: 23, structure: "〜にいきます", explanation: "Đi đến ~ — di chuyển (N5)", level: Level.N5 },
    { id: 24, structure: "〜で", explanation: "Tại ~ / bằng ~ — nơi chốn, phương tiện (N5)", level: Level.N5 },
    { id: 25, structure: "〜の", explanation: "Của ~ — sở hữu, định ngữ (N5)", level: Level.N5 },

    // N4 — 15 mẫu
    { id: 6, structure: "〜なければならない", explanation: "Phải làm ~ — nghĩa vụ (N4)", level: Level.N4 },
    { id: 7, structure: "〜ことができる", explanation: "Có thể làm ~ — khả năng (N4)", level: Level.N4 },
    { id: 8, structure: "〜前に", explanation: "Trước khi ~ (N4)", level: Level.N4 },
    { id: 9, structure: "〜後で", explanation: "Sau khi ~ (N4)", level: Level.N4 },
    { id: 10, structure: "〜ながら", explanation: "Vừa ~ vừa ~ — đồng thời (N4)", level: Level.N4 },
    { id: 11, structure: "〜ために", explanation: "Để ~ / Vì ~ — mục đích/lý do (N4)", level: Level.N4 },
    { id: 12, structure: "〜すぎる", explanation: "Quá ~ — mức độ quá (N4)", level: Level.N4 },
    { id: 26, structure: "〜ている", explanation: "Đang ~ — tiếp diễn/kết quả (N4)", level: Level.N4 },
    { id: 27, structure: "〜たことがある", explanation: "Đã từng ~ — kinh nghiệm (N4)", level: Level.N4 },
    { id: 28, structure: "〜やすい", explanation: "Dễ ~ (N4)", level: Level.N4 },
    { id: 29, structure: "〜にくい", explanation: "Khó ~ (N4)", level: Level.N4 },
    { id: 30, structure: "〜そうだ", explanation: "Có vẻ ~ — phỏng đoán ngoại quan (N4)", level: Level.N4 },
    { id: 31, structure: "〜かもしれない", explanation: "Có lẽ ~ — phỏng đoán (N4)", level: Level.N4 },
    { id: 32, structure: "〜たら", explanation: "Nếu/khi ~ — điều kiện (N4)", level: Level.N4 },
    { id: 33, structure: "〜ても", explanation: "Dù ~ cũng — nhượng bộ (N4)", level: Level.N4 },

    // N3 — 15 mẫu
    { id: 13, structure: "〜そうだ", explanation: "Nghe nói ~ — truyền đạt (N3)", level: Level.N3 },
    { id: 14, structure: "〜ようになる", explanation: "Trở nên ~ — thay đổi trạng thái (N3)", level: Level.N3 },
    { id: 15, structure: "〜によって", explanation: "Bởi ~ / Tùy theo ~ (N3)", level: Level.N3 },
    { id: 34, structure: "〜ことにする", explanation: "Quyết định làm ~ (N3)", level: Level.N3 },
    { id: 35, structure: "〜ことになる", explanation: "Được quyết định là ~ / trở nên ~ (N3)", level: Level.N3 },
    { id: 36, structure: "〜のに", explanation: "Vậy mà ~ — nghịch lý (N3)", level: Level.N3 },
    { id: 37, structure: "〜はずだ", explanation: "Chắc hẳn ~ — suy luận (N3)", level: Level.N3 },
    { id: 38, structure: "〜わけだ", explanation: "Hèn gì ~ / thảo nào ~ — giải thích (N3)", level: Level.N3 },
    { id: 39, structure: "〜ばかり", explanation: "Toàn ~ / vừa mới ~ (N3)", level: Level.N3 },
    { id: 40, structure: "〜ておく", explanation: "Làm sẵn ~ — chuẩn bị (N3)", level: Level.N3 },
    { id: 41, structure: "〜てしまう", explanation: "Lỡ làm ~ — hoàn thành/tiếc nuối (N3)", level: Level.N3 },
    { id: 42, structure: "〜ようにする", explanation: "Cố gắng để ~ (N3)", level: Level.N3 },
    { id: 43, structure: "〜につれて", explanation: "Cùng với ~ — tỉ lệ (N3)", level: Level.N3 },
    { id: 44, structure: "〜に対して", explanation: "Đối với ~ — đối tượng (N3)", level: Level.N3 },
    { id: 45, structure: "〜に関して", explanation: "Về ~ / liên quan đến ~ (N3)", level: Level.N3 },

    // N2 — 15 mẫu
    { id: 46, structure: "〜わけではない", explanation: "Không có nghĩa là ~ — phủ định suy luận (N2)", level: Level.N2 },
    { id: 47, structure: "〜に違いない", explanation: "Chắc chắn ~ (N2)", level: Level.N2 },
    { id: 48, structure: "〜を通して", explanation: "Thông qua ~ (N2)", level: Level.N2 },
    { id: 49, structure: "〜において", explanation: "Tại ~ / trong ~ — phạm vi trang trọng (N2)", level: Level.N2 },
    { id: 50, structure: "〜に基づいて", explanation: "Dựa trên ~ (N2)", level: Level.N2 },
    { id: 51, structure: "〜に応じて", explanation: "Tùy theo ~ / tương ứng với ~ (N2)", level: Level.N2 },
    { id: 52, structure: "〜に伴って", explanation: "Kéo theo ~ — đồng thời (N2)", level: Level.N2 },
    { id: 53, structure: "〜をめぐって", explanation: "Xung quanh ~ / về vấn đề ~ (N2)", level: Level.N2 },
    { id: 54, structure: "〜を問わず", explanation: "Bất kể ~ — không phân biệt (N2)", level: Level.N2 },
    { id: 55, structure: "〜ざるを得ない", explanation: "Đành phải ~ — bắt buộc (N2)", level: Level.N2 },
    { id: 56, structure: "〜得る", explanation: "Có thể ~ — khả năng (N2, 得る)", level: Level.N2 },
    { id: 57, structure: "〜にすぎない", explanation: "Chỉ là ~ — giới hạn (N2)", level: Level.N2 },
    { id: 58, structure: "〜といった", explanation: "Như là ~ — ví dụ (N2)", level: Level.N2 },
    { id: 59, structure: "〜を通じて", explanation: "Suốt ~ / thông qua ~ (N2)", level: Level.N2 },
    { id: 60, structure: "〜次第", explanation: "Ngay sau khi ~ thì ~ (N2)", level: Level.N2 },
    // ==== Bổ sung 173 mẫu N2/N3 (attachment) — dedup vs 60 mẫu cũ ====
    { id: 61, structure: "〜として", explanation: "Nói về lập trường, tư cách, chủng loại (N3)", level: Level.N3 },
    { id: 62, structure: "〜とともに", explanation: "Cùng với... (N3)", level: Level.N3 },
    { id: 63, structure: "〜にかわって", explanation: "Đại lý, đại diện (N3)", level: Level.N3 },
    { id: 64, structure: "〜に比べて", explanation: "So với.... (N3)", level: Level.N3 },
    { id: 65, structure: "〜にしたがって", explanation: "Cùng với ~ (N3)", level: Level.N3 },
    { id: 66, structure: "〜について", explanation: "Về, liên quan đến (N3)", level: Level.N3 },
    { id: 67, structure: "〜にとって", explanation: "Đối với… (N3)", level: Level.N3 },
    { id: 68, structure: "〜によると", explanation: "Theo, y theo ~ (N3)", level: Level.N3 },
    { id: 69, structure: "〜を中心に", explanation: "Lấy ~ làm trung tâm (N3)", level: Level.N3 },
    { id: 70, structure: "〜をはじめ", explanation: "Cách nói đưa ra một ví dụ chính. (N3)", level: Level.N3 },
    { id: 71, structure: "〜をもとに", explanation: "Lấy ~ làm cơ sở (N3)", level: Level.N3 },
    { id: 72, structure: "〜上", explanation: "Không chỉ ~, thêm vào với ~ (N3)", level: Level.N3 },
    { id: 73, structure: "〜うちに", explanation: "Trong lúc…/Trong khoảng… (N3)", level: Level.N3 },
    { id: 74, structure: "〜おかげで", explanation: "Nhờ, do có... (N3)", level: Level.N3 },
    { id: 75, structure: "〜かわりに", explanation: "Thay vì không ~ (N3)", level: Level.N3 },
    { id: 76, structure: "〜くらい", explanation: "Biểu thị mức độ trạng thái (N3)", level: Level.N3 },
    { id: 77, structure: "〜最中に", explanation: "Ngay trong lúc đang làm việc gì đó (N3)", level: Level.N3 },
    { id: 78, structure: "〜せいだ", explanation: "Tại vì ~ (kết quả xấu) (N3)", level: Level.N3 },
    { id: 79, structure: "〜たとたん", explanation: "Ngay sau ~ (N3)", level: Level.N3 },
    { id: 80, structure: "〜たび", explanation: "Mỗi khi, mỗi dịp ~ (N3)", level: Level.N3 },
    { id: 81, structure: "〜て以来", explanation: "Suốt từ đó về sau… (N3)", level: Level.N3 },
    { id: 82, structure: "〜とおり", explanation: "Làm giống như ~ (N3)", level: Level.N3 },
    { id: 83, structure: "〜ところに", explanation: "Đúng lúc, đúng địa điểm (N3)", level: Level.N3 },
    { id: 84, structure: "〜ほど", explanation: "Chừng, mức ~ (N3)", level: Level.N3 },
    { id: 85, structure: "〜ばかりに", explanation: "Chỉ vỉ ~ (N3)", level: Level.N3 },
    { id: 86, structure: "〜ものだから", explanation: "Tại vì ~ (N3)", level: Level.N3 },
    { id: 87, structure: "〜ように", explanation: "Biểu thị ví dụ, như là (N3)", level: Level.N3 },
    { id: 88, structure: "〜一方だ", explanation: "Diễn tả việc xu hướng đó ngày càng tiếp diễn (N3)", level: Level.N3 },
    { id: 89, structure: "〜おそれがある", explanation: "Có sự lo lắng là ~ (N3)", level: Level.N3 },
    { id: 90, structure: "〜ことになっている", explanation: "Biểu thị dự định, quy tắc (N3)", level: Level.N3 },
    { id: 91, structure: "〜ことはない", explanation: "Không cần phải làm ~ (N3)", level: Level.N3 },
    { id: 92, structure: "〜しかない", explanation: "Không có cách nào khác ngoài ~ (N3)", level: Level.N3 },
    { id: 93, structure: "〜ということだ", explanation: "Nghe thấy nói là ~ (N3)", level: Level.N3 },
    { id: 94, structure: "〜まい", explanation: "Có lẽ không phải ~ (N3)", level: Level.N3 },
    { id: 95, structure: "〜わけがない", explanation: "Không có nghĩa là ~ (N3)", level: Level.N3 },
    { id: 96, structure: "〜わけにはいかない", explanation: "Có lý do nên ~ không làm được (N3)", level: Level.N3 },
    { id: 97, structure: "〜から〜にかけて", explanation: "Từ khoảng ~ đến ~ (N3)", level: Level.N3 },
    { id: 98, structure: "たとえ〜ても", explanation: "Ví dụ; dù cho; ngay cả nếu (N3)", level: Level.N3 },
    { id: 99, structure: "〜さえ〜ば", explanation: "Chỉ cần có ~ hay thành ~ (N3)", level: Level.N3 },
    { id: 100, structure: "〜も〜ば〜も", explanation: "Cũng ~ cũng ~ (N3)", level: Level.N3 },
    { id: 101, structure: "〜やら〜やら", explanation: "Liệt kê (N3)", level: Level.N3 },
    { id: 102, structure: "〜だらけ", explanation: "~ có đầy, được gắn đầy (N3)", level: Level.N3 },
    { id: 103, structure: "〜っぽい", explanation: "Cảm thấy như là ~ (N3)", level: Level.N3 },
    { id: 104, structure: "〜がたい", explanation: "Khó làm ~ ; gần như không thể ~ (N3)", level: Level.N3 },
    { id: 105, structure: "〜がちだ", explanation: "Việc làm ~ là nhiều; có chiều hướng ~ (N3)", level: Level.N3 },
    { id: 106, structure: "〜気味", explanation: "Hơi có cảm giác là ~ (N3)", level: Level.N3 },
    { id: 107, structure: "〜げ", explanation: "Chỉ trạng thái cảm nhận được (N3)", level: Level.N3 },
    { id: 108, structure: "〜かけだ", explanation: "Chỉ trạng thái giữa chừng (N3)", level: Level.N3 },
    { id: 109, structure: "〜きる", explanation: "Hoàn toàn, hết cả ~ (N3)", level: Level.N3 },
    { id: 110, structure: "〜ぬく", explanation: "~đến cùng. Cố gắng đến cuối cùng (N3)", level: Level.N3 },
    { id: 111, structure: "〜こそ", explanation: "Thể hiện ý nhấn mạnh (N3)", level: Level.N3 },
    { id: 112, structure: "〜さえ", explanation: "Lấy cái ví dụ cực đoan (N3)", level: Level.N3 },
    { id: 113, structure: "〜など", explanation: "Dùng khi muốn nêu lên một ví dụ (N3)", level: Level.N3 },
    { id: 114, structure: "〜に加えて", explanation: "Ngoài ra; thêm vào đó (N3)", level: Level.N3 },
    { id: 115, structure: "〜に答えて", explanation: "Ứng với, đối với ~ (N3)", level: Level.N3 },
    { id: 116, structure: "〜に沿って", explanation: "Sở dĩ, vì vậy, do vậy, theo ~ (N3)", level: Level.N3 },
    { id: 117, structure: "〜に反して", explanation: "Trái ngược với; tương phản với (N3)", level: Level.N3 },
    { id: 118, structure: "〜にわたって", explanation: "Biểu thị sự trải rộng trên phạm vi toàn thể (N3)", level: Level.N3 },
    { id: 119, structure: "〜ばかりか", explanation: "Không chỉ ~, ngoài ra còn… (N3)", level: Level.N3 },
    { id: 120, structure: "〜はもとより", explanation: "~ thì đương nhiên đến mức không cần nói. (N3)", level: Level.N3 },
    { id: 121, structure: "〜もかまわず", explanation: "Không bận tâm đến ~ (N3)", level: Level.N3 },
    { id: 122, structure: "〜をこめて", explanation: "Gửi gắm tâm tư, tình cảm vào ~ (N3)", level: Level.N3 },
    { id: 123, structure: "〜あまり", explanation: "Vì ~ bất thường nên… (N3)", level: Level.N3 },
    { id: 124, structure: "〜一方", explanation: "Mặt khác, trái lại… (N3)", level: Level.N3 },
    { id: 125, structure: "〜上で", explanation: "Xong ~ rồi… (N3)", level: Level.N3 },
    { id: 126, structure: "〜限り", explanation: "Giới hạn, hạn chế, hạn trong ~ (N3)", level: Level.N3 },
    { id: 127, structure: "〜と思うと", explanation: "Làm xong ~ ngay lập tức… (N3)", level: Level.N3 },
    { id: 128, structure: "〜か〜ないかのうちに", explanation: "Việc này chưa qua, việc khác đã xảy ra. (N3)", level: Level.N3 },
    { id: 129, structure: "〜からいうと", explanation: "Nhìn từ quan điểm ~ (N3)", level: Level.N3 },
    { id: 130, structure: "〜からといって", explanation: "Chỉ vì lý do ~ (N3)", level: Level.N3 },
    { id: 131, structure: "〜から見ると", explanation: "Nhìn từ ~ , xét theo ~ (N3)", level: Level.N3 },
    { id: 132, structure: "〜きり", explanation: "Chỉ có ~ (N3)", level: Level.N3 },
    { id: 133, structure: "〜くせに", explanation: "Dù; mặc dầu; lại còn; ngay cả ~ (N3)", level: Level.N3 },
    { id: 134, structure: "〜ことから", explanation: "Bởi vì ~ (N3)", level: Level.N3 },
    { id: 135, structure: "〜ことに", explanation: "Đặc biệt là; một cách đặc biệt (N3)", level: Level.N3 },
    { id: 136, structure: "〜た末", explanation: "Rất lâu sau khi ~ (N3)", level: Level.N3 },
    { id: 137, structure: "〜たところ", explanation: "Sau ~ (N2)", level: Level.N2 },
    { id: 138, structure: "〜ついでに", explanation: "Nhân tiện; tiện thể (N2)", level: Level.N2 },
    { id: 139, structure: "〜というと", explanation: "Lấy lên một ví dụ làm đại diện (N2)", level: Level.N2 },
    { id: 140, structure: "〜といったら", explanation: "Nói về cảm xúc thán phục, ngạc nhiên (N2)", level: Level.N2 },
    { id: 141, structure: "〜というより", explanation: "Là ~ , nhưng cái nói đằng sau mới là thích đáng hơn. (N2)", level: Level.N2 },
    { id: 142, structure: "〜ば〜ほど", explanation: "Càng ~ càng ~ . (N2)", level: Level.N2 },
    { id: 143, structure: "〜かのようだ", explanation: "thực tế thì không phải vậy nhưng có vẻ như là ~ (N2)", level: Level.N2 },
    { id: 144, structure: "〜つつある", explanation: "Dần dần đang (N2)", level: Level.N2 },
    { id: 145, structure: "〜てたまらない", explanation: "Không thể kìm nén được. (N2)", level: Level.N2 },
    { id: 146, structure: "〜てならない", explanation: "~ một cách phi thường (N2)", level: Level.N2 },
    { id: 147, structure: "〜にきまっている", explanation: "Nghĩ ~ là nhất định, đương nhiên (N2)", level: Level.N2 },
    { id: 148, structure: "〜に相違ない", explanation: "Chắc đúng là ~, Nghĩ ~ là không sai được (N2)", level: Level.N2 },
    { id: 149, structure: "〜べき", explanation: "Làm như thế là đương nhiên, nên làm ~ (N2)", level: Level.N2 },
    { id: 150, structure: "〜ほかない", explanation: "Chả có cách nào khác là ~ (N2)", level: Level.N2 },
    { id: 151, structure: "〜向きだ", explanation: "Vừa đẹp với ~, thích hợp với~ (N2)", level: Level.N2 },
    { id: 152, structure: "〜向けだ", explanation: "Để thích hợp với ~ (N2)", level: Level.N2 },
    { id: 153, structure: "〜ものか", explanation: "Quyết không ~ (Ý phủ định mạnh) (N2)", level: Level.N2 },
    { id: 154, structure: "〜ものだ", explanation: "Thể hiện cảm xúc mạnh, cảm thán (N2)", level: Level.N2 },
    { id: 155, structure: "〜っけ", explanation: "Đang nhớ ra, nhớ lại và muốn xác nhận lại (N2)", level: Level.N2 },
    { id: 156, structure: "〜とか", explanation: "Nghe nói là ~ (N2)", level: Level.N2 },
    { id: 157, structure: "〜どころではない", explanation: "Có lý do, chịu không thể ~ (N2)", level: Level.N2 },
    { id: 158, structure: "〜からして", explanation: "Đưa ra một ví dụ, nghĩ là những cái khác là đương nhiên. (N2)", level: Level.N2 },
    { id: 159, structure: "〜からすると", explanation: "Nhìn từ lập trường của ~ (N2)", level: Level.N2 },
    { id: 160, structure: "〜からには", explanation: "Chừng nào ~ ; vì là ~, đương nhiên (N2)", level: Level.N2 },
    { id: 161, structure: "〜ことだから", explanation: "Trình bày lý do mà mọi người đều biết (N2)", level: Level.N2 },
    { id: 162, structure: "〜だけ", explanation: "Phù hợp với, quả đúng là, đúng là (N2)", level: Level.N2 },
    { id: 163, structure: "〜にあたって", explanation: "Trong khi… (N2)", level: Level.N2 },
    { id: 164, structure: "〜にかけては", explanation: "Nếu nói về… (N2)", level: Level.N2 },
    { id: 165, structure: "〜に際して", explanation: "Khi bắt đầu…, Khi đang… (N2)", level: Level.N2 },
    { id: 166, structure: "〜に先立って", explanation: "Trước khi... (N2)", level: Level.N2 },
    { id: 167, structure: "〜にしたら", explanation: "Nếu nói trên lập trường… (N2)", level: Level.N2 },
    { id: 168, structure: "〜につき", explanation: "Vì… (N2)", level: Level.N2 },
    { id: 169, structure: "〜につけ", explanation: "Mỗi lần làm… (N2)", level: Level.N2 },
    { id: 170, structure: "〜のもとで", explanation: "Dưới… (N2)", level: Level.N2 },
    { id: 171, structure: "〜はともかく", explanation: "Tạm thời không nghĩ đến… (N2)", level: Level.N2 },
    { id: 172, structure: "〜をきっかけに", explanation: "Biểu thị rằng từ một việc ngẫu nhiên mà có gì đó bắt đầu (N2)", level: Level.N2 },
    { id: 173, structure: "〜を契機に", explanation: "nhân cơ hội ~ (N2)", level: Level.N2 },
    { id: 174, structure: "〜を〜として", explanation: "Lấy ~ làm ~ (N2)", level: Level.N2 },
    { id: 175, structure: "〜あげく", explanation: "Sau ~ rốt cuộc là ... (N2)", level: Level.N2 },
    { id: 176, structure: "〜以上", explanation: "Chừng nào ~ ; đã là ~ thì (N2)", level: Level.N2 },
    { id: 177, structure: "〜上は", explanation: "Chừng nào ~ ; đã là ~ thì (N2)", level: Level.N2 },
    { id: 178, structure: "〜ことなく", explanation: "Không có ~ (N2)", level: Level.N2 },
    { id: 179, structure: "〜際", explanation: "Thời gian, trường hợp (N2)", level: Level.N2 },
    { id: 180, structure: "〜つつ", explanation: "Đang, trong khi ~ (N2)", level: Level.N2 },
    { id: 181, structure: "〜てからでないと", explanation: "Nếu không thực hiện cái nói đằng trước thì điều đằng sau cũng không thực hiện. (N2)", level: Level.N2 },
    { id: 182, structure: "〜といっても", explanation: "Dù là ~ nhưng ~ (N2)", level: Level.N2 },
    { id: 183, structure: "〜どころか", explanation: "Dùng nhấn mạnh một sự phản đối trực diện (N2)", level: Level.N2 },
    { id: 184, structure: "〜としたら", explanation: "Nếu mà (giả định) (N2)", level: Level.N2 },
    { id: 185, structure: "〜ないことには", explanation: "Nếu không ~ (N2)", level: Level.N2 },
    { id: 186, structure: "〜にしては", explanation: "So với điều được đương nhiên nghĩ đến từ đó thì khác (N2)", level: Level.N2 },
    { id: 187, structure: "〜にしろ", explanation: "Ngay cả nếu, tỉ như ~, vẫn ~ (N2)", level: Level.N2 },
    { id: 188, structure: "〜にかかわらず", explanation: "Không liên quan đến~ (N2)", level: Level.N2 },
    { id: 189, structure: "〜にもかかわらず", explanation: "Dù cho, dẫu cho ~ (N2)", level: Level.N2 },
    { id: 190, structure: "〜ぬきで", explanation: "Không có ~ (N2)", level: Level.N2 },
    { id: 191, structure: "〜のみならず", explanation: "Như, cũng như, và còn thêm ~ (N2)", level: Level.N2 },
    { id: 192, structure: "〜反面", explanation: "Mặt khác, mặt trái (N2)", level: Level.N2 },
    { id: 193, structure: "〜ものなら", explanation: "Nếu ~ (dùng khi hi vọng vào một điều khó thực hiện) (N2)", level: Level.N2 },
    { id: 194, structure: "〜ものの", explanation: "Dù là ~ (N2)", level: Level.N2 },
    { id: 195, structure: "〜わりに", explanation: "Không phù hợp, không xứng với ~ (N2)", level: Level.N2 },
    { id: 196, structure: "〜うではないか", explanation: "Hãy ~ (kêu gọi mạnh mẽ) (N2)", level: Level.N2 },
    { id: 197, structure: "〜かねない", explanation: "Lo ngại là ~ (N2)", level: Level.N2 },
    { id: 198, structure: "〜かねる", explanation: "Muốn làm ~ nhưng không thể (N2)", level: Level.N2 },
    { id: 199, structure: "〜ことか", explanation: "Không biết thế nào đây ~ (N2)", level: Level.N2 },
    { id: 200, structure: "〜ことだ", explanation: "Dùng khi khuyên người khác rằng việc đó là quan trọng (N2)", level: Level.N2 },
    { id: 201, structure: "〜次第だ", explanation: "Vì… (N2)", level: Level.N2 },
    { id: 202, structure: "〜っこない", explanation: "Nhất định không… (N2)", level: Level.N2 },
    { id: 203, structure: "〜というものだ", explanation: "Biểu thị cách nghĩ và cảm giác (N2)", level: Level.N2 },
    { id: 204, structure: "〜というものではない", explanation: "Không thể nói hết là… (N2)", level: Level.N2 },
    { id: 205, structure: "〜ないことはない", explanation: "Cũng có khả năng là... (N2)", level: Level.N2 },
    { id: 206, structure: "〜ないではいられない", explanation: "Dù thế nào cũng đã làm… (N2)", level: Level.N2 },
    { id: 207, structure: "〜に限る", explanation: "Giới hạn ở… (N2)", level: Level.N2 },
    { id: 208, structure: "〜に限らず", explanation: "Không chỉ…mà cũng… (N2)", level: Level.N2 },
    { id: 209, structure: "〜にほかならない", explanation: "Chính là…, Không gì khác là… (N2)", level: Level.N2 },
    { id: 210, structure: "〜もの", explanation: "Bởi vì… (N2)", level: Level.N2 },
    { id: 211, structure: "〜ものがある", explanation: "Có cảm giác… (N2)", level: Level.N2 },
    { id: 212, structure: "〜ようがない", explanation: "Không còn phương pháp nào (N2)", level: Level.N2 },
  ];

  for (const g of grammars) {
    await prisma.grammar.upsert({ where: { id: g.id }, update: { structure: g.structure, explanation: g.explanation, level: g.level }, create: g });
  }

  // Xóa timeline cũ nếu có grammar_id không còn tồn tại? Không cần — giữ lại
  await prisma.videoGrammarTimeline.createMany({
    data: [{ video_id: v1.id, grammar_id: 1, appear_at_ms: 3000 }],
    skipDuplicates: true
  });

  await prisma.question.createMany({
    data: [
      {
        video_id: v1.id,
        question_type: QuestionType.VOCAB_CHOICE,
        content: "「こんにちは」の意味は？",
        options: JSON.stringify(["Xin chào", "Tạm biệt", "Cảm ơn", "Xin lỗi"]),
        correct_answer: "Xin chào"
      }
    ],
    skipDuplicates: true
  });

  console.log("Seed done", { admin: admin.email, user: user.email, videos: [v1.id, v2.id, v3.id], categories: { [v1.id]: "SHORT", [v2.id]: "KAIWA", [v3.id]: "SONG" }, grammars: grammars.length });
}

main().catch(e => { console.error(e); process.exit(1); }).finally(() => prisma.$disconnect());
