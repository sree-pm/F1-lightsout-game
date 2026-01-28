/**
 * Cloudflare Pages Function — /api/leaderboard
 *
 * Rate-limited & optimized for Cloudflare free tier:
 * - KV reads: 100,000/day  → Cache-Control headers reduce repeat reads
 * - KV writes: 1,000/day   → Skip writes for non-competitive scores + per-IP rate limit
 * - Functions: 100,000/day  → Client-side caching reduces calls
 *
 * Bind a KV namespace called "LEADERBOARD" in the Pages dashboard.
 */

const MAX_ENTRIES = 100;
const MAX_NAME_LENGTH = 20;
const RATE_LIMIT_WINDOW = 10; // seconds between submissions per IP
const MAX_DAILY_WRITES = 900; // soft cap (leave 100 buffer from 1,000 limit)

function corsHeaders() {
  return {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
  };
}

function jsonResponse(data, status = 200, extraHeaders = {}) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders(), 'Content-Type': 'application/json', ...extraHeaders },
  });
}

export async function onRequest(context) {
  const { request, env } = context;

  if (request.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders() });
  }

  try {
    if (request.method === 'GET') {
      return await handleGet(env);
    }
    if (request.method === 'POST') {
      return await handlePost(request, env);
    }
    return jsonResponse({ error: 'Method not allowed' }, 405);
  } catch (e) {
    return jsonResponse({ error: 'Server error' }, 500);
  }
}

// ==================== GET — with cache headers ====================
async function handleGet(env) {
  const data = await env.LEADERBOARD.get('scores', { type: 'json' });
  return jsonResponse(data || [], 200, {
    // Browser caches for 15s, Cloudflare edge caches for 30s
    // This dramatically cuts KV reads under load
    'Cache-Control': 'public, max-age=15, s-maxage=30, stale-while-revalidate=60',
  });
}

// ==================== POST — rate-limited & write-optimized ====================
async function handlePost(request, env) {
  const body = await request.json();
  let { name, time } = body;

  // --- Validate name ---
  if (!name || typeof name !== 'string' || name.trim().length === 0) {
    return jsonResponse({ error: 'Name required' }, 400);
  }
  name = name.trim().slice(0, MAX_NAME_LENGTH);

  // --- Validate time ---
  time = parseFloat(time);
  if (isNaN(time) || time <= 0 || time > 10) {
    return jsonResponse({ error: 'Invalid time' }, 400);
  }

  // Anti-cheat: sub-100ms is humanly impossible
  if (time < 0.1) {
    return jsonResponse({ error: 'Nice try' }, 400);
  }

  // --- Per-IP rate limit (uses 1 KV read, avoids write spam) ---
  const ip = request.headers.get('cf-connecting-ip') || request.headers.get('x-forwarded-for') || 'unknown';
  const rateLimitKey = `rate:${ip}`;
  const lastSubmit = await env.LEADERBOARD.get(rateLimitKey);
  if (lastSubmit) {
    const elapsed = (Date.now() - parseInt(lastSubmit)) / 1000;
    if (elapsed < RATE_LIMIT_WINDOW) {
      return jsonResponse({ error: 'Too fast — wait a few seconds' }, 429);
    }
  }

  // --- Daily write counter (soft cap) ---
  const today = new Date().toISOString().slice(0, 10); // YYYY-MM-DD
  const writeCountKey = `writes:${today}`;
  const writeCount = parseInt(await env.LEADERBOARD.get(writeCountKey) || '0');
  if (writeCount >= MAX_DAILY_WRITES) {
    // Return success with cached leaderboard but don't write
    const data = await env.LEADERBOARD.get('scores', { type: 'json' });
    return jsonResponse({
      ok: true,
      leaderboard: data || [],
      notice: 'Leaderboard is at capacity today — try again tomorrow!',
    });
  }

  // --- Load scores (1 KV read) ---
  const data = await env.LEADERBOARD.get('scores', { type: 'json' });
  const scores = data || [];

  // --- Check if score would even matter ---
  const existing = scores.find(s => s.name.toLowerCase() === name.toLowerCase());
  if (existing && time >= existing.time) {
    // Not a personal best — skip the write entirely
    return jsonResponse({ ok: true, leaderboard: scores });
  }
  if (!existing && scores.length >= MAX_ENTRIES) {
    const worstTime = scores[scores.length - 1].time;
    if (time >= worstTime) {
      // Wouldn't make top 100 — skip write
      return jsonResponse({ ok: true, leaderboard: scores });
    }
  }

  // --- Apply the score ---
  if (existing) {
    existing.time = time;
    existing.date = new Date().toISOString();
  } else {
    scores.push({ name, time, date: new Date().toISOString() });
  }

  scores.sort((a, b) => a.time - b.time);
  const trimmed = scores.slice(0, MAX_ENTRIES);

  // --- Write scores + rate limit + daily counter (3 KV writes) ---
  await Promise.all([
    env.LEADERBOARD.put('scores', JSON.stringify(trimmed)),
    env.LEADERBOARD.put(rateLimitKey, String(Date.now()), { expirationTtl: RATE_LIMIT_WINDOW * 2 }),
    env.LEADERBOARD.put(writeCountKey, String(writeCount + 3), { expirationTtl: 86400 }),
  ]);

  return jsonResponse({ ok: true, leaderboard: trimmed });
}
