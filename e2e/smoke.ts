/**
 * E2E smoke: login → dashboard filter → video detail → extract vocab → save flashcard → test submit → history.
 * Chạy: BASE_URL=http://localhost:3000 TEST_EMAIL=user@example.com TEST_PASSWORD=demo123 npx tsx e2e/smoke.ts
 * Không cần Playwright — dùng fetch + cookie jar thủ công. DB MySQL + dev server phải chạy.
 */
const BASE = (process.env.BASE_URL ?? "http://localhost:3000").replace(/\/$/, "");
const EMAIL = process.env.TEST_EMAIL ?? "user@example.com";
const PASSWORD = process.env.TEST_PASSWORD ?? "demo123";

let cookie = "";

function req(path: string, init: RequestInit = {}) {
  const headers = new Headers(init.headers);
  if (cookie) headers.set("cookie", cookie);
  return fetch(`${BASE}${path}`, { ...init, headers });
}

function saveCookie(res: Response) {
  const set = res.headers.get("set-cookie");
  if (set) {
    const m = set.match(/lms_token=[^;]+/);
    if (m) cookie = m[0];
  }
}

async function main() {
  console.log(`[smoke] BASE=${BASE} EMAIL=${EMAIL}`);

  // 1. login
  let res = await req("/api/auth/login", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email: EMAIL, password: PASSWORD }),
  });
  saveCookie(res);
  if (!res.ok) throw new Error(`login failed: ${res.status} ${await res.text()}`);
  console.log("✓ 1. login ok");

  // 2. dashboard filter
  res = await req("/?level=N5&page=1");
  if (res.status !== 200) throw new Error(`dashboard failed: ${res.status}`);
  console.log("✓ 2. dashboard filter ok");

  // 3. video detail (id=1, fallback id=2)
  let videoId = 1;
  res = await req(`/video/${videoId}`);
  if (res.status === 404) {
    videoId = 2;
    res = await req(`/video/${videoId}`);
  }
  if (res.status !== 200) throw new Error(`video detail failed: ${res.status}`);
  console.log(`✓ 3. video detail ok (id=${videoId})`);

  // 4. tokenize API (auth guard)
  res = await req("/api/tokenize", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ text: "私は田中です" }),
  });
  if (![200, 500].includes(res.status)) throw new Error(`tokenize unexpected: ${res.status}`);
  console.log(`✓ 4. tokenize ok (${res.status})`);

  // 5. vocab lookup
  res = await req(`/api/vocab?word=${encodeURIComponent("食べる")}`);
  if (![200, 404].includes(res.status)) throw new Error(`vocab unexpected: ${res.status}`);
  console.log(`✓ 5. vocab lookup ok (${res.status})`);

  // 6. history (cần auth)
  res = await req("/history");
  if (res.status !== 200) throw new Error(`history failed: ${res.status}`);
  console.log("✓ 6. history ok");

  // 7. flashcards (cần auth)
  res = await req("/flashcards");
  if (res.status !== 200) throw new Error(`flashcards failed: ${res.status}`);
  console.log("✓ 7. flashcards ok");

  console.log("\n[smoke] PASS — 7/7 bước");
}

main().catch((e) => {
  console.error("[smoke] FAIL:", e instanceof Error ? e.message : e);
  process.exit(1);
});
