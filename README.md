# Clash Stats

Personal Clash of Clans dashboard for one player (default `#GV98LGCC9`). Express backend calls the official API, Neon PostgreSQL stores snapshots, vanilla JS + Tailwind frontend.

## What comes from where (read this first)

| Section | Source |
|---|---|
| Profile, trophies, wars, donations, clan, league, Legend stats | Official API (live) |
| Heroes, hero equipment, troops, super troops, spells, siege machines, pets | Official API (live). `maxLevel` = cap for your **current Town Hall** |
| Buildings, defenses, traps, walls | **Not in the official API.** Shown as a manual tracker (you type level / max / quantity; saved to your DB) |
| Upgrade timers / "currently upgrading" | **Not in the official API** (not shown) |
| Images | Not in the official API. Clan badge and league icon come from the API; other items use icon tiles. Add your own in `public/data/images.json` (`{"Barbarian King": "https://..."}`) |
| History / charts | Your Neon DB snapshots (labelled as stored, not live) |

Category lists (`src/utils/gameData.js`) only sort API items into groups. Unknown items appear under "Other (uncategorised)": add their names to the lists to move them.

## Structure
```
clash-stats/
├── public/ (index.html, assets/css, assets/js, data/images.json)
├── src/ (server.js, config/, routes/player.js, services/, utils/)
├── database/schema.sql
├── .env.example  .gitignore  package.json  README.md
```

## 1. Clash API token
Go to developer.clashofclans.com, create a key.
- **Hosting on Render (no fixed IP):** use the RoyaleAPI proxy. Create the key with allowed IP `45.79.218.79`. The app defaults to `https://cocproxy.royaleapi.dev/v1`.
- Own static IP: allow that IP and set `COC_API_BASE=https://api.clashofclans.com/v1`.

## 2. Neon database
1. neon.tech, create a project, copy the connection string (keep `?sslmode=require`).
2. Create tables, either way:
   - Neon **SQL Editor**: paste all of `database/schema.sql`, Run.
   - or locally: `npm run migrate` with `DATABASE_URL` set.
The schema is safe to re-run.

## 3. Local development
```
npm install
cp .env.example .env     # fill in COC_API_TOKEN, DATABASE_URL, PLAYER_TAG
npm run migrate
npm run dev              # http://localhost:3000
```
Note: a token tied to `45.79.218.79` only works through the proxy URL, which is the default.

## 4. GitHub
Never upload `.env`. Easiest options without a PC:
- GitHub web: new repo, **Add file > Create new file**, type the full path (e.g. `src/routes/player.js`) and paste the code; repeat per file. Or **Upload files** for files in the same folder.
- Or Termux/Codespaces: `git init && git add . && git commit -m "init" && git remote add origin <url> && git push -u origin main`.

## 5. Render
1. New > **Web Service**, connect the repo.
2. Runtime Node, Build `npm install`, Start `npm start`.
3. Environment: `COC_API_TOKEN`, `DATABASE_URL`, `PLAYER_TAG`, optional `COC_API_BASE`, `SNAPSHOT_INTERVAL_HOURS`. (Render sets `PORT`.)
4. Advanced > Health Check Path: `/health`.
5. Deploy, open the URL.

Free Render instances sleep when idle, so the 6-hourly timer only runs while awake. Use **Settings > Sync now**, or ping `/health` every ~10 min (e.g. UptimeRobot) for steadier history.

## 6. Change the player tag
Render > Environment > edit `PLAYER_TAG` (with or without `#`) > save (redeploys). Each tag keeps its own history rows.

## Security notes
Token and DB URL exist only in server env vars. Frontend only calls `/api/*`. SQL is parameterized, inputs validated, API responses normalised, errors sanitised, `/api` rate-limited, Helmet CSP on.

## Troubleshooting
- **403 from API**: key's allowed IP doesn't match. Proxy mode needs `45.79.218.79`; direct mode needs your server's IP. Create a new key.
- **404 player not found**: check `PLAYER_TAG` (letters `0289PYLQGRJCUV` only).
- **429**: rate limited, wait. **503**: game maintenance.
- **Page unstyled / blank**: a CDN (Tailwind, Lucide, Chart.js) is blocked by your network or the CSP in `src/server.js`.
- **DB errors / SSL**: connection string must include `?sslmode=require`; Neon may need a few seconds to wake.
- **"relation does not exist"**: schema not applied (step 2).
- **No history charts**: need 2+ snapshots with changes between them; see Settings > sync log.
- **Render deploy fails**: check Node >= 18 and that `package.json` is in the repo root.
