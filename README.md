# Gig Pipeline — deploy guide

Jason's gig command center, as a normal website. He opens a link in any browser — no Claude account, no login. The AI pitch-drafting and email-finder run through a small server function that holds **your** Anthropic API key, so the key is never exposed in his browser.

## What's in here

```
api/claude.js      ← server function that talks to Anthropic (holds your key)
src/App.jsx        ← the dashboard (now uses localStorage + the proxy)
src/main.jsx       ← React entry point
index.html         ← page shell
package.json       ← dependencies
.env.example       ← what env vars to set
```

His data (leads, statuses, drafted pitches, profile) saves in **his browser's localStorage** — it persists on his device, but it's per-browser (not synced across devices).

---

## Deploy on Vercel (free tier) — ~10 minutes

You need a free [vercel.com](https://vercel.com) account and an Anthropic API key from [console.anthropic.com](https://console.anthropic.com).

### Option A — GitHub (easiest to update later)
1. Put this folder in a new GitHub repo (push it up).
2. In Vercel: **Add New → Project → Import** your repo. It auto-detects Vite; accept the defaults.
3. Before deploying, open **Environment Variables** and add:
   - `ANTHROPIC_API_KEY` = your key (starts with `sk-ant-`)
   - *(optional)* `APP_PASSCODE` = a word/phrase — if set, the app asks for it before AI features run (keeps randoms off your key).
4. **Deploy.** Vercel gives you a URL like `https://gig-pipeline-xxx.vercel.app`. That's the link for Jason.

### Option B — Vercel CLI (no GitHub)
```bash
npm i -g vercel
cd gig-pipeline-app
vercel              # follow prompts; accept Vite defaults
vercel env add ANTHROPIC_API_KEY     # paste your key when asked
vercel --prod       # redeploy with the key live
```

---

## Run it locally first (optional sanity check)
```bash
npm install
npm i -g vercel
echo "ANTHROPIC_API_KEY=sk-ant-your-key" > .env.local
vercel dev          # runs the app AND the /api function together
```
Open the local URL it prints. (`npm run dev` alone runs the UI but NOT the proxy, so the AI buttons won't work — use `vercel dev`.)

---

## Things to know

- **Cost is on you now.** Every Draft Pitch and Find Email call bills to your Anthropic key (typically pennies each; the email finder uses web search, which costs a bit more per call). Set a **spend limit** in the Anthropic console so there are no surprises.
- **The proxy is open by default.** Anyone with the link can use it and spend your credits. For a private link to one person that's usually fine — but if you want a gate, set `APP_PASSCODE` (above) or turn on Vercel's Deployment Protection.
- **Model name:** the app calls `claude-sonnet-4-6`. If Anthropic returns a "model not found" error, check the current model IDs in their docs and update the two `model:` lines in `src/App.jsx`.
- **Verify contacts before sending.** Web-found emails and the seeded phone numbers can be stale.

## Updating later
- GitHub route: push a change → Vercel redeploys automatically.
- CLI route: `vercel --prod` again.
