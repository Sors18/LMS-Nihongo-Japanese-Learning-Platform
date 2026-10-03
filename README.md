# LMS Nihongo — Japanese Learning Platform / 日本語学習プラットフォーム

> A web platform for learning Japanese (JLPT N5–N1) through videos, subtitles, flashcards (SRS), quizzes, kanji practice, and AI chat.
>
> 動画・字幕・フラッシュカード（SRS）・クイズ・漢字練習・AIチャットで日本語（JLPT N5〜N1）を学ぶためのウェブプラットフォームです。

![Next.js](https://img.shields.io/badge/Next.js-15-black) ![Prisma](https://img.shields.io/badge/Prisma-5-blue) ![MySQL](https://img.shields.io/badge/MySQL-8-orange) ![TypeScript](https://img.shields.io/badge/TypeScript-5-blue) ![Tailwind](https://img.shields.io/badge/Tailwind-3-38bdf8)

---

## Table of Contents / 目次

- [About / 概要](#about--概要)
- [Features / 機能](#features--機能)
- [Tech Stack / 技術スタック](#tech-stack--技術スタック)
- [Getting Started / はじめに](#getting-started--はじめに)
- [Available Scripts / スクリプト](#available-scripts--スクリプト)
- [Project Structure / 構成](#project-structure--構成)
- [License / ライセンス](#license--ライセンス)

---

## About / 概要

**EN:** LMS Nihongo is a graduation-project LMS that helps users learn Japanese with real video content. It provides bilingual (JP–VI) subtitles, click-to-lookup vocabulary with AI-powered contextual explanations (Gemini, with Jisho + MyMemory fallback), SRS flashcards (SM-2 like Anki), video-based quizzes, kanji handwriting practice, XP/streak gamification, and an AI chat tutor.

**JP:** LMS Nihongoは、実際の動画コンテンツで日本語を学ぶための卒業制作LMSです。日越バイリンガル字幕、単語クリック辞書（Geminiによる文脈説明＋Jisho・MyMemoryフォールバック）、SRSフラッシュカード（Anki式SM-2）、動画連動クイズ、漢字手書き練習、XP・ストリークのゲーミフィケーション、AIチャットチューターを提供します。

---

## Features / 機能

**EN:**

- 🎬 Video learning: YouTube player + bilingual subtitles, grammar timeline
- 📖 Vocabulary lookup: Kuromoji tokenization + Gemini contextual meaning
- 🃏 Flashcards with SRS (SM-2): NEW → LEARNING → MASTERED
- 📝 Quizzes per video: vocab choice, particle fill, listening
- ✍️ Kanji practice with progress tracking
- 🔥 XP, daily streak, history dashboard, JLPT roadmap (N5–N1)
- 👤 JWT auth (USER / ADMIN), admin panel for videos, vocab, reports
- 🐞 Vocab error reports from users, reviewed by admin

**JP:**

- 🎬 動画学習：YouTubeプレイヤー＋日越字幕、文法タイムライン
- 📖 単語検索：Kuromoji形態素解析＋Gemini文脈解説
- 🃏 SRSフラッシュカード（SM-2方式）：NEW → LEARNING → MASTERED
- 📝 動画連動クイズ：語彙選択・助詞穴埋め・リスニング
- ✍️ 漢字手書き練習と進捗管理
- 🔥 XP・デイリーストリーク・学習履歴・JLPTロードマップ（N5〜N1）
- 👤 JWT認証（USER / ADMIN）、管理者パネル（動画・語彙・報告管理）
- 🐞 ユーザーからの語彙誤り報告を管理者が審査

---

## Tech Stack / 技術スタック

**EN:**

| Layer | Technology |
|-------|------------|
| Framework | Next.js 15 (App Router), React 18, TypeScript 5 |
| Styling | Tailwind CSS 3, PostCSS |
| Database | MySQL 8 + Prisma ORM 5 |
| Auth | JWT (`jsonwebtoken`) + `bcryptjs` |
| Japanese NLP | `kuromoji` |
| AI | Google Gemini (`GEMINI_API_KEY`, optional) |
| Media | `react-player` (YouTube) |

**JP:**

| 層 | 技術 |
|----|------|
| フレームワーク | Next.js 15（App Router）、React 18、TypeScript 5 |
| スタイリング | Tailwind CSS 3、PostCSS |
| データベース | MySQL 8＋Prisma ORM 5 |
| 認証 | JWT（`jsonwebtoken`）＋`bcryptjs` |
| 日本語処理 | `kuromoji` |
| AI | Google Gemini（`GEMINI_API_KEY`、任意） |
| メディア | `react-player`（YouTube） |

---

## Getting Started / はじめに

### 1. Prerequisites / 前提条件

**EN:**

- Node.js >= 20 (recommended: 20 LTS or 22)
- npm (or bun)
- MySQL 8 (e.g. XAMPP) — create an empty database `lms_nihongo`
- (Optional) Gemini API key from https://aistudio.google.com/apikey

**JP:**

- Node.js 20以上（推奨：20 LTSまたは22）
- npm（またはbun）
- MySQL 8（例：XAMPP）— 空のデータベース `lms_nihongo` を作成してください
- （任意）Gemini APIキー：https://aistudio.google.com/apikey

```bash
node -v   # >= v20
npm -v
```

### 2. Clone / クローン

**EN:** Clone the repository:

**JP:** リポジトリをクローンします：

```bash
git clone https://github.com/<your-username>/<your-repo>.git
cd <your-repo>
```

### 3. Install / インストール

**EN:**

**JP:** 依存関係をインストールします：

```bash
npm install
# or / または
# npm ci
```

### 4. Environment variables / 環境変数

**EN:** Copy `.env.example` to `.env` and edit values:

**JP:** `.env.example` を `.env` にコピーして編集します：

```bash
copy .env.example .env   # Windows (PowerShell / CMD)
# cp .env.example .env   # macOS / Linux
```

`.env`:

```env
DATABASE_URL="mysql://root:@localhost:3306/lms_nihongo"
GEMINI_API_KEY=
GEMINI_MODEL=gemini-3.5-flash-lite
NEXTAUTH_SECRET=change-me-to-a-long-random-secret-at-least-32-chars
```

> **EN:** In XAMPP, create DB `lms_nihongo` in phpMyAdmin first. Without `GEMINI_API_KEY` the app still works via Jisho + MyMemory fallback. In production, `NEXTAUTH_SECRET` must be ≥32 chars (generate: `openssl rand -base64 48`).
>
> **JP:** XAMPPの場合、まずphpMyAdminでDB `lms_nihongo` を作成してください。`GEMINI_API_KEY` がなくてもJisho＋MyMemoryフォールバックで動作します。本番環境では `NEXTAUTH_SECRET` は32文字以上必須です（生成例：`openssl rand -base64 48`）。

### 5. Database / データベース

**EN:**

**JP:** DBにテーブルを作成し、初期データを投入します：

```bash
npx prisma db push
npx prisma generate
npm run db:seed
```

Seed files: `prisma/seed.ts` (calls `seed-n3.ts`, `seed-n2.ts`, `seed-n1.ts` as configured).

### 6. Run / 起動

**EN:**

**JP:** 開発サーバーを起動します：

```bash
npm run dev
```

Open / ブラウザで開く： http://localhost:3000

Build for production / 本番ビルド：

```bash
npm run build
npm start
```

---

## Available Scripts / スクリプト

| Script | EN description | JP説明 |
|--------|----------------|--------|
| `npm run dev` | Start dev server | 開発サーバー起動 |
| `npm run build` | Production build | 本番ビルド |
| `npm start` | Start production server | 本番サーバー起動 |
| `npm run lint` | Run Next.js lint | Lint実行 |
| `npm run db:push` | Push Prisma schema to DB (`prisma db push`) | スキーマをDBに反映 |
| `npm run db:generate` | Generate Prisma client | Prismaクライアント生成 |
| `npm run db:seed` | Seed initial data (`tsx prisma/seed.ts`) | 初期データ投入 |
| `npm run db:backfill-meanings` | Backfill vocab meanings (`scripts/backfill-meanings-vi.ts`) | 語彙の意味を補完 |
| `npm test` | Unit tests (`tsx --test tests/*.test.ts`) | 単体テスト |
| `npm run test:e2e` | E2E smoke (`tsx e2e/smoke.ts`) | E2Eスモークテスト |
| `npm run test:full` | Full check (`tsx e2e/full-check.ts`) | フルチェック |

---

## Project Structure / 構成

```
app/            # Next.js App Router (pages, APIs, actions)
  api/          # REST API routes
  admin/        # Admin panel
  video/ anime/ # Video & anime-series learning pages
  flashcards/ test/ kanji/ chat/ streak/ history/ roadmap/
components/     # React components
lib/            # Auth, Prisma client, Gemini, Jisho, SRS logic
prisma/         # schema.prisma + seed*.ts
scripts/        # backfill-meanings-vi.ts etc.
public/         # Static assets
e2e/ tests/     # E2E + unit tests
```

---

## Notes for contributors / 寄稿者への注意

**EN:**

- Never commit `.env` (it contains secrets). Only `.env.example` is committed.
- `node_modules/`, `.next/`, `kuromoji-dict/`, `.cache/` are git-ignored.
- Run `npm run lint` and `npm run build` before pushing.

**JP:**

- `.env`（秘密情報）は絶対にコミットしないでください。`.env.example` のみコミットします。
- `node_modules/`、`.next/`、`kuromoji-dict/`、`.cache/` はGit管理外です。
- Push前に `npm run lint` と `npm run build` を実行してください。

---

## License / ライセンス

**EN:** For academic / graduation-project use.

**JP:** 学術・卒業制作利用向けです。
