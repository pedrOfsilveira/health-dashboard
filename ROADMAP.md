# 🗺️ Health Dashboard — Roadmap

## 🔥 High Impact

### 1. Streak Counter & Gamification
Show a 🔥 streak counter on the header — how many consecutive days the user logged meals. Motivates daily use.

### 2. Weekly Progress Chart
A small chart (Chart.js already loaded) showing calories/protein over the last 7 days. Visual trends are powerful.

### 3. Quick-Log Buttons
Below the chat, show 3-4 buttons with your most frequent meals (learned from history):
`🍚 Arroz + Frango` `🥪 Pão + Ovo` — one tap to log.

### 4. Water Tracking
Simple water counter with a 💧 button. Target 2L/day. Chat command: "bebi 500ml de água".

---

## 🎨 Medium Impact

### 5. Dark/Light Mode Toggle
The app is dark-only. A toggle (moon/sun icon) with `localStorage` persistence.

### 6. Meal Photos (optional)
Let users attach a photo when logging via chat. Store URL in `meal_items.photo_url`. Show as thumbnail on meal cards.

### 7. Export Data
Button to export all data as CSV/PDF for sharing with a nutritionist.

### 8. Weekly Summary Notification
Edge Function triggered by cron (Supabase `pg_cron`) that sends a weekly digest via email/push.

---

## 🎮 Fun / Delight

### 9. Achievement Badges
Unlock badges: "First Week 🏅", "Protein King 💪", "7-Day Streak 🔥", "Night Owl 🦉" (logged sleep past midnight).

### 10. Animated Confetti
When you hit your calorie+protein target for the day, trigger a small confetti animation. Dopamine hit.

### 11. AI Coach Personality
Give the chat AI a name/personality. Instead of dry responses, make it encouraging: "Boa, Pedro! 💪 Mais 40g de proteína e você bate a meta!"

---

## 🐛 Fixes

### 12. Offline Queue
Chat messages sent offline are lost. Queue them in IndexedDB and sync when back online.

### 13. Pull-to-Refresh
On mobile PWA there's no way to refresh. Add touch gesture or a refresh button.

### 14. Input Validation
Empty chat messages can be sent. Add a check before calling the Edge Function.

---

## ✅ Completed
- [x] PWA with install prompt
- [x] Chat-based meal logging via AI
- [x] Sleep tracking via chat
- [x] Health condition tracking (gripe, dor de garganta, etc.)
- [x] Personalized meal suggestions based on history
- [x] Individual macro goals with percentages
- [x] Supabase Edge Functions (no worker needed)
- [x] Serverless deploy (Vercel/GitHub Pages + Supabase)
- [x] Streak Counter & Gamification (UI + backend auto-update on every entry)
- [x] Achievement Badges (auto-unlock: first_meal, streaks, protein_master, goal_hit, early_bird, sleep_master, level milestones)
- [x] Animated Confetti (triggers on 90%+ kcal & protein)
- [x] XP & Leveling System (10 levels, auto-XP on entries/badges/challenges)
- [x] Input Validation (empty/short messages blocked in chat)
- [x] Social / Friend System (search by email, invite, accept/reject, friend list with stats)
- [x] Challenge System (solo & duo challenges, 12 pre-seeded challenges, progress tracking, XP rewards)
- [x] Friend Leaderboard (XP-ranked friend comparison on dashboard)
- [x] Gamification Engine in Edge Function (auto streak, badge, XP, challenge progress on every log)