# Comeback

Injury rehab tracker that connects college athletes, their athletic trainer and their coach. You create an account (athlete, coach or athletic trainer), join your team with a code, and everything is saved in Supabase, so the athlete, trainer and coach all see the same data. See `PLAN.md` for the full plan and `reference/` for the original prototype.

## Supabase setup (once)

1. Copy `.env.example` to `.env.local` and fill in the Project URL and publishable key from Supabase (Project Settings > API Keys). Never use the secret key.
2. In Supabase, open SQL Editor and run these files in order:
   1. `supabase/erd_schema.sql`: the tables, security rules and catalogs
   2. `supabase/signup.sql`: roles, teams and join codes
   3. `supabase/live_data.sql`: conversations and plan assignment the screens use
   4. `supabase/demo_data.sql`: the demo team (optional, see below)
3. Authentication > Sign In / Providers: turn on "Allow new users to sign up". Under Email, turn off "Confirm email" unless you want people to confirm by email first.

## Demo accounts

All use the password `ComebackDemo2026!`. The `+demo-...` addresses all deliver to the owner's Gmail.

| Who | Role | Email |
|---|---|---|
| Maya Torres | Athlete (ankle sprain, the main demo athlete) | `bpickard38+demo-athlete@gmail.com` |
| Jordan Reyes | Athlete (ACL, out) | `bpickard38+demo-jordan@gmail.com` |
| Devon Clarke | Athlete (shoulder, pain flagged, sent a message) | `bpickard38+demo-devon@gmail.com` |
| Priya Nair | Athlete (hamstring, cleared) | `bpickard38+demo-priya@gmail.com` |
| Sam Rivera | Athletic trainer | `bpickard38+demo-trainer@gmail.com` |
| Coach Lee | Coach | `bpickard38+demo-coach@gmail.com` |

They're all on the "Demo Soccer" team. **Run `supabase/demo_data.sql` again the morning of a demo**: it resets the demo team to fresh data dated around today (the last three days of logs, this week's retests, visits in the next two weeks). It only touches these accounts.

If the accounts ever get deleted, sign up again in the app with the same emails, names and roles, then run `demo_data.sql`.

## Accounts and teams

- Anyone can create an account as an athlete, coach or athletic trainer. The role picks which screens they see.
- A trainer creates a team and gets two join codes (shown on their home screen): one for athletes, one for coaches.
- Athletes and coaches enter their code to join. A code only works for its role, so nobody can join as staff with an athlete code.
- What anyone can see is decided in the database by team membership, not by the role they picked.

## Run it

```
npm install        # first time only
npm run dev        # open the address it prints
npm test           # business-rule tests (src/domain)
npm run build      # type-check and build into dist/
```

### On your phone

1. Phone and computer on the same Wi-Fi.
2. `npm run dev:phone`
3. Open the `Network:` address it prints (like `http://192.168.1.20:5173`) on your phone. If it doesn't load, allow Node.js through Windows Firewall for private networks.

## Demo script

Use the demo accounts above. To show two roles side by side, sign in to the second one in a private browser window. Changes show up for the others within 30 seconds, or right away with "Refresh data".

1. **Athlete (Maya)**: on Today, tap "Mark done" on the three pending exercises and pick a pain rating for each. The last one ranks her up to Varsity I. Rate one a 7 and message your trainer about it.
2. **Progress**: log 30 for One-leg balance. The card flips to "Goal reached" and adds 10 points.
3. **Trainer**: Maya and Devon are flagged for pain and a new message. Reply to Maya (her flag clears), set Devon to Out with a return date, and assign Jordan new exercises.
4. **Coach**: "Team availability" shows only Out / Limited / Cleared and return dates, no injuries. Message the trainer, then show it under "From coach" on the trainer's screen.
5. **Errors**: set "Connection: offline" and try logging; tap "Edit my plan"; log without a pain rating; save an empty result or message.
6. **Sign-up**: create a new athlete account and join with the athlete code from the trainer's "Join codes" card. Try the coach code first to show it's refused.

## Where things live

| Folder | What's in it |
|---|---|
| `src/domain` | Rules as plain functions (points, streaks, rank, week %), with tests. No React. |
| `src/data` | Sample data (`seed.ts`) used by the tests |
| `src/store` | Sign-in gate, loading from and saving to Supabase (`remote.ts`), app state, and the commands screens call |
| `supabase` | Database setup scripts (run in order, see above) |
| `src/components` | Reusable pieces: Button, Card, ProgressBar, Toast, TabBar, trophy icons |
| `src/screens` | Athlete and staff screens |
| `src/styles` | `tokens.css` (colors, fonts, sizes), `global.css`, `screens.css` |
