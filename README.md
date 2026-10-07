# Comeback

Injury rehab tracker that connects college athletes, their athletic trainer and their coach. Frontend only: data lives in your browser and resets from the "Reset demo data" button. See `PLAN.md` for the full plan and `reference/` for the original prototype.

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

1. **Athlete (Maya)**: on Today, tap "Mark done" on the three pending exercises and pick a pain rating for each. The last one ranks her up to Varsity I. Rate one a 7 and message your trainer about it.
2. **Progress**: log 30 for One-leg balance. The card flips to "Goal reached" and adds 10 points.
3. **Trainer**: Maya and Devon are flagged for pain and a new message. Reply to Maya (her flag clears), set Devon to Out with a return date, and assign Jordan new exercises.
4. **Coach**: "Team availability" shows only Out / Limited / Cleared and return dates, no injuries. Message the trainer, then switch to Trainer to see it under "From coach".
5. **Errors**: set "Connection: offline" and try logging; tap "Edit my plan"; log without a pain rating; save an empty result or message.

## Where things live

| Folder | What's in it |
|---|---|
| `src/domain` | Rules as plain functions (points, streaks, rank, week %), with tests. No React. |
| `src/data` | Sample data (`seed.ts`) |
| `src/store` | App state, saving to localStorage, and the commands screens call |
| `src/components` | Reusable pieces: Button, Card, ProgressBar, Toast, TabBar, trophy icons |
| `src/screens` | Athlete and staff screens |
| `src/styles` | `tokens.css` (colors, fonts, sizes), `global.css`, `screens.css` |
