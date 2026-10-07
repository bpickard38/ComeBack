# Comeback: build plan (frontend only)

Put this file in the repo root and tell Claude Code: "Read PLAN.md and build Phase 0 and 1. Stop and show me before Phase 2."

## 1. What this is

A web app that connects college athletes, their athletic trainer and their coach during injury rehab. The trainer assigns exercises, the athlete does and logs them, and the trainer and coach see completion. Athletes also track milestone tests and earn points and rank.

Source: the class PRD (IS 401, "Product Requirements - 04-5") plus the clickable prototype in `reference/`.

Scope for now: frontend only. No backend, no login, no real texts. Data lives in the browser (localStorage) and resets with one button.

## 2. Stack

- Vite + React + TypeScript
- react-router-dom for routes
- Plain CSS with CSS variables (one `styles/tokens.css`). No UI library.
- State: React Context + `useReducer`, saved to localStorage
- Vitest, only for the pure logic in `src/domain` (points, streaks, rank)
- No other dependencies unless a phase needs one

Why this: smallest set you can read and edit yourself. Swapping localStorage for a real API later only touches `src/store`.

## 3. Folder layout

```
src/
  domain/        pure functions + types, no React. points.ts, streak.ts, rank.ts, types.ts
  data/          seed.ts (exercises, tests, 4 athletes, appointments)
  store/         context, reducer, localStorage persistence
  components/    Button, Card, ProgressBar, Toast, TabBar, TrophyIcon
  screens/
    athlete/     Today, Goals, Trophies, Appointments
    staff/       Roster, AthleteDetail, AssignForm, MessageBox
  styles/        tokens.css, global.css
  App.tsx        shell: header, role switcher, demo controls, routes
```

## 4. Design tokens

- Navy `#0E2A3B` (text, primary buttons), pale blue `#C3DAE7`, ground `#EAF1F6`, secondary text `#3F5868`
- Warning orange `#B4490F`, warning text `#8A3607`, warning background `#FFF1E6`
- Rank metals on dark: bronze `#CD7F32`, silver `#C9D3DB`, gold `#F2B632`
- Fonts (Google Fonts): Bricolage Grotesque for headings, Figtree for body
- Touch targets at least 44px. Real `<button>` and `<label>` elements. No emoji. Never rely on color alone: status always has text ("Behind", "Goal reached").
- Layout: athlete screens are a single column, max 520px, work at 390px wide. Staff screens max 1100px with a two-column layout that stacks on phones.

See `reference/*.png` for how it should look.

## 5. Roles and routes

No auth. A role switcher in the header (Athlete / Trainer / Coach) stands in for login. The signed-in athlete is Maya Torres.

| Route | Who | Screen |
|---|---|---|
| `/athlete` | Athlete | Today |
| `/athlete/goals` | Athlete | Your goals (milestones) |
| `/athlete/trophies` | Athlete | Rank and trophy ladder |
| `/athlete/appointments` | Athlete | Upcoming appointments |
| `/staff` | Trainer, Coach | Roster + selected athlete detail |

Switching role redirects to that role's home. A trainer or coach opening `/athlete` is redirected to `/staff`, and the reverse.

## 6. Data model (`domain/types.ts`)

- `Exercise`: id, name, prescription (text, e.g. "3 sets of 12"), videoUrl (null for now, show a labeled placeholder)
- `Athlete`: id, name, sport, injury, assignedExerciseIds, priorExerciseCount, priorBestStreak, availability ("out" | "limited" | "cleared"), expectedReturn ("YYYY-MM-DD" or null)
- `ExerciseLog`: athleteId, exerciseId, loggedAt (ISO string), pain (0 to 10)
- `MilestoneTest`: id, name, description, unit, baseline, target
- `TestResult`: athleteId, testId, value, recordedAt, source ("athlete" for now)
- `Appointment`: id, athleteId, startsAt, location, title, testIds, testNotes (optional wording per test), exerciseIds
- `Message`: id, thread ("athlete:<id>" or "coach-trainer"), from ("Trainer" | "Coach" | "Athlete"), text, sentAt

Seed data: copy the 4 athletes, 14 exercises, 4 tests, 3 appointments and the log history from `reference/prototype.dc.html` (see `initial()`, `lib()`, `tests()`, `appointments()`). All names and numbers there are sample data. Use real dates relative to today instead of the prototype's fixed "Wed, Sep 30".

## 7. Business rules (put these in `domain/`, test them)

- **Daily list:** an athlete's today list is their assigned exercises. Each can be logged once per calendar day.
- **Day streak:** consecutive days where every assigned exercise was logged. Today still pending does not break the streak. Best streak = max(priorBestStreak, current).
- **Week completion:** logs for currently assigned exercises this week divided by (assigned count x days elapsed this week). 80% or more is "On track", otherwise "Behind".
- **Goal reached:** latest result for a test is at or above its target.
- **Points:** 1 per exercise logged (including prior count) + 10 per goal reached.
- **Rank:** from points. Bronze, silver and gold, three tiers each:

| Rank | Points | Metal |
|---|---|---|
| Starter I / II / III | 0 / 20 / 40 | Bronze |
| Varsity I / II / III | 60 / 90 / 120 | Silver |
| All-conference I / II / III | 160 / 210 / 270 | Gold |

- Thresholds are guesses. Keep them in one constant so they are easy to tune.
- **Reminder:** after 6:00 PM local time, if exercises remain, the athlete sees an in-app banner listing how many are left. The demo bar has a "Simulate end-of-day reminder" button.
- **Pain rating:** every exercise log carries a 0 to 10 pain rating, required. A rating of 5 or more in the last 3 days flags the athlete on the trainer roster (`PAIN_ALERT_LEVEL`, a guess to tune).
- **Messaging:** the trainer and each athlete share one thread. An athlete can write only in their own thread. The roster shows "New message" when the athlete wrote last. Coaches write only to the trainer.
- **Coach privacy:** the coach sees availability (Out / Limited / Cleared) and expected return date only, never injury, exercises, pain or messages with athletes. Only the trainer sets availability. Clearing an athlete removes the return date.
- **Milestone results:** athlete-entered for now and labeled "Self-reported. Your trainer confirms it at your next retest." They count toward goals immediately.

## 8. Error states (all required)

- Log fails (demo toggle "Connection: offline"): toast says nothing was recorded, exercise stays pending.
- Logging an exercise already logged today: blocked with a message.
- Athlete taps "Edit my plan": "Only your trainer can change your plan, injury or records."
- Milestone input empty or not a number: error, nothing saved.
- Assign form missing athlete, injury or exercises: error, nothing saved.
- Empty message: "Write a message first."
- Only the trainer can assign injuries and exercises. The coach view is read-only except for messaging the trainer.
- Marking an exercise done without picking a pain rating: "Pick how much pain you felt, from 0 to 10."
- Only the trainer can change availability.

## 9. Build phases

Do one phase at a time. Each ends with `npm run build` passing and a short demo of what works.

**Phase 0: scaffold.** Vite + React + TS, router, tokens.css, fonts, empty screens at each route. Done when all routes load.

**Phase 1: domain + data.** Types, seed, points/streak/rank/week functions with Vitest tests, store with localStorage and a reset action. Done when tests pass for: streak with a pending today, duplicate log blocked, rank boundaries (59 vs 60 points), goals adding 10 points.

**Phase 2: shell.** Header, role switcher with redirects, demo bar (reminder, offline toggle, reset), toast with polite live region. Done when switching roles works and persists on refresh.

**Phase 3: athlete Today.** Header card with "X of Y done" and progress bar, exercise cards, "Mark done" with timestamp and confirmation toast, tutorial toggle with video placeholder, reminder banner, "Edit my plan" error. Done when logging updates the count and the trainer roster.

**Phase 4: trainer and coach roster.** Roster rows (today count, week %, status), detail panel with Mon-to-today grid (Done / Missed / Pending), trainer-only "Assign injury and exercises" form, coach read-only. Done when a trainer assignment shows up on the athlete's Today screen.

**Phase 5: Your goals.** One card per test: plain description, current number, goal, remaining, bar, trend line, "Log new result". Header shows goals reached and overall %. Done when logging a result at target flips the card to "Goal reached" and adds 10 points.

**Phase 6: Trophies.** Rank hero card (metal-colored trophy, rank name, points to next rank, streak, best streak, points, breakdown line) and the nine-tier ladder (earned, current, locked with points away). Rank-up message when exercise or result logging crosses a threshold. Done when finishing today's list takes Maya from Starter III to Varsity I.

**Phase 7: Appointments.** Upcoming visits with milestone tests to work toward and exercises to focus on, with done-today flag. Done when each appointment lists linked tests and exercises from the data.

**Phase 8: messaging.** Trainer messages the selected athlete, athlete sees it on Today. Coach messages the trainer, trainer sees it under "From coach". Done when each message appears for the right person only.

**Phase 9: polish.** Keyboard pass, contrast check, 390px width check, empty states, remove dead code. Done when you can run the whole demo on your phone.

**Phase 10: athlete feedback (added after review).** Pain rating on "Mark done", athlete to trainer messaging, roster flags for high pain and unanswered messages, pain shown in the week grid. Done when a pain of 5+ or an athlete message flags that athlete on the roster, and replying clears the message flag.

**Phase 11: coach privacy (added after review).** Availability and expected return per athlete, set by the trainer. Coach screen becomes "Team availability" with no medical details. Done when the coach screen shows no injury, exercise or pain information.

## 10. Out of scope for now

Backend, real accounts, real SMS or push, real tutorial videos (use placeholders), AI chat or AI trainers, injury-aware exercise recommendations, automatic recovery reports, insurance reporting, other languages, product sales. Most of these are PRD Should-Have, Could-Have or Won't-Have items.

## 11. Decide later

- Should the trainer confirm self-reported results? (Recommended next feature.)
- Where tutorial videos come from.
- Backend choice when you add one (Supabase is the least work).
- Rank thresholds and the 10-point goal value after real use.

## 12. Rules for Claude Code

- Build one phase at a time and stop for review.
- Keep logic out of components. Anything in section 7 lives in `domain/` with tests.
- No new dependencies without asking.
- Explain new concepts briefly in comments, since the owner is still learning to code.
- Keep the prototype's copy and behavior unless this plan says otherwise.
