# 🏎️ F1 Lights Out!

Test your reaction time against real F1 drivers. Tap the moment the lights go out — just like a real Grand Prix start.

**Zero dependencies. Single HTML file. Under 30KB. 100% free on Cloudflare.**

## Features

- Realistic 3D light panel with glow effects
- Authentic F1 start sequence (5 lights → lights out → GO!)
- False start detection
- Real F1 driver reaction time comparisons
- Global leaderboard (Cloudflare KV)
- Sound effects via Web Audio API (no audio files)
- Racing car animation on successful reaction
- Native share (mobile) / clipboard copy (desktop)
- Mobile-first responsive design
- Keyboard + touch + click support

## Deploy to Cloudflare (5 mins)

### 1. Create a Cloudflare account
Go to [dash.cloudflare.com](https://dash.cloudflare.com) and sign up (free).

### 2. Deploy via Cloudflare Pages

**Option A: Git integration (recommended)**
1. Push this repo to GitHub
2. In Cloudflare Dashboard → Pages → Create a project → Connect to Git
3. Select this repo, set build output to `/` (root)
4. Deploy

**Option B: Direct upload**
```bash
npx wrangler pages deploy . --project-name f1-lightsout
```

### 3. Add KV for leaderboard
1. In Cloudflare Dashboard → Workers & Pages → KV
2. Create a namespace called `LEADERBOARD`
3. Go to your Pages project → Settings → Functions → KV namespace bindings
4. Add binding: Variable name = `LEADERBOARD`, KV namespace = the one you created

That's it! The `/functions/api/leaderboard.js` file automatically becomes your API endpoint.

## Local Development

```bash
npx wrangler pages dev . --kv LEADERBOARD
```

Opens at `http://localhost:8788`

## Architecture

```
index.html                    → The entire game (HTML + CSS + JS, ~25KB)
functions/api/leaderboard.js  → Cloudflare Pages Function (leaderboard API)
worker/index.js               → Standalone Worker version (alternative)
```

## Cost

**$0/month** on Cloudflare free tier:
- Pages: Unlimited static requests
- Functions: 100,000 requests/day
- KV: 100,000 reads/day, 1,000 writes/day

## License

MIT
