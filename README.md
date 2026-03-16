# 🎭 Two Truths and a Lie

A real-time party game web application for hybrid office events, built with **Next.js**, **TypeScript**, **Tailwind CSS**, and **Supabase**.

---

## ✨ Features

- 🎮 **Instant join** — no sign-up, just enter your name
- 📝 **Submit questions** — each player writes 2 truths + 1 lie
- 🗳️ **Live voting** with shuffled statements + 20-second countdown
- 🎉 **Auto scoring** (+10 pts for correct guesses)
- 🏆 **Live leaderboard** that updates after every round
- 🎊 **Confetti animation** on results reveal
- 🔄 **Rejoin support** — same name reconnects your session
- 📡 **Real-time** — all screens update instantly via Supabase Realtime

---

## 🚀 Quick Start

### 1. Set up Supabase

1. Go to [supabase.com](https://supabase.com) and create a free project
2. In the **SQL Editor**, run the entire contents of [`supabase-schema.sql`](./supabase-schema.sql)
3. In **Project Settings → API**, copy your **Project URL** and **anon public** key

### 2. Configure environment variables

Rename (or copy) `.env.local` and fill in your values:

```bash
NEXT_PUBLIC_SUPABASE_URL=https://your-project-id.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key-here
```

### 3. Install dependencies

```bash
npm install
```

### 4. Run locally

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000)

---

## 📄 Pages

| Route | Description |
|-------|-------------|
| `/` | Join page — enter your name to join |
| `/player` | Player dashboard — submit questions, vote, see results |
| `/admin` | Admin dashboard — manage rounds, reveal answers |

---

## 🎮 How to Run a Game Session

### Setup (1 min)
1. Host opens `/admin`
2. Share the app URL with all participants (show it on the projector)
3. Everyone joins at `/`

### Each Round
1. **Admin** picks a question from the "Submitted Questions" list and clicks **Start Round**
2. **Admin** clicks **▶ Start Voting** when everyone is ready
3. **Participants** see the 3 shuffled statements and vote for the lie
4. **Admin** clicks **⏹ End Voting** (or waits for the 20s timer)
5. **Admin** clicks **🎉 Reveal Answer** — scores update automatically
6. Everyone sees confetti + results + updated leaderboard

### Scoring
- ✅ Correct guess → **+10 points**
- ❌ Wrong guess → **0 points**
- 🚫 Nobody guesses correctly → **Question creator gets +10**

---

## ☁️ Deploy on Vercel

1. Push to GitHub
2. Import project on [vercel.com](https://vercel.com)
3. Add environment variables in Vercel dashboard:
   - `NEXT_PUBLIC_SUPABASE_URL`
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY`
4. Deploy — done!

---

## 🗄️ Database Schema

```
players      → id, name, score, joined_at
questions    → id, player_id, statement_1/2/3, lie_index, status, created_at
votes        → id, player_id, question_id, selected_index, created_at
game_state   → id (=1), current_question_id, status
```

---

## 🛠 Tech Stack

- **Next.js 16** (App Router)
- **React 19** + **TypeScript**
- **Tailwind CSS 4**
- **Supabase** (Postgres + Realtime)
- **canvas-confetti** (celebration animation)
