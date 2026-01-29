/**
 * Cloudflare Pages Function — /api/leaderboard
 *
 * Hybrid D1 + KV approach:
 * - D1: Primary storage for user accounts and leaderboard
 * - KV: Fallback for anonymous users + caching layer
 *
 * Rate-limited & optimized for Cloudflare free tier:
 * - D1 reads: 5M/day (free), D1 writes: 100K/day
 * - KV reads: 100,000/day → Cache-Control headers reduce repeat reads
 * - KV writes: 1,000/day → Skip writes for non-competitive scores
 */

const MAX_ENTRIES = 100;
const MAX_NAME_LENGTH = 20;
const MAX_EMAIL_LENGTH = 100;
const RATE_LIMIT_WINDOW = 10; // seconds between submissions per IP
const MAX_DAILY_KV_WRITES = 900;

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

function isValidEmail(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
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
    console.error('Leaderboard error:', e);
    return jsonResponse({ error: 'Server error' }, 500);
  }
}

// ==================== GET — Hybrid D1/KV ====================
async function handleGet(env) {
  const cacheHeaders = {
    'Cache-Control': 'public, max-age=15, s-maxage=30, stale-while-revalidate=60',
  };

  // Try D1 first if available
  if (env.DB) {
    try {
      const { results } = await env.DB.prepare(`
        SELECT username as name, best_time as time, updated_at as date
        FROM users
        WHERE best_time IS NOT NULL
        ORDER BY best_time ASC
        LIMIT ?
      `).bind(MAX_ENTRIES).all();

      return jsonResponse(results || [], 200, cacheHeaders);
    } catch (e) {
      console.error('D1 read failed, falling back to KV:', e);
    }
  }

  // Fallback to KV
  if (env.LEADERBOARD) {
    const data = await env.LEADERBOARD.get('scores', { type: 'json' });
    return jsonResponse(data || [], 200, cacheHeaders);
  }

  return jsonResponse([], 200, cacheHeaders);
}

// ==================== POST — Submit score ====================
async function handlePost(request, env) {
  const body = await request.json();
  let { name, time, email } = body;

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

  // --- Per-IP rate limit ---
  const ip = request.headers.get('cf-connecting-ip') || request.headers.get('x-forwarded-for') || 'unknown';

  if (env.LEADERBOARD) {
    const rateLimitKey = `rate:${ip}`;
    const lastSubmit = await env.LEADERBOARD.get(rateLimitKey);
    if (lastSubmit) {
      const elapsed = (Date.now() - parseInt(lastSubmit)) / 1000;
      if (elapsed < RATE_LIMIT_WINDOW) {
        return jsonResponse({ error: 'Too fast — wait a few seconds' }, 429);
      }
    }
    // Update rate limit
    await env.LEADERBOARD.put(rateLimitKey, String(Date.now()), { expirationTtl: RATE_LIMIT_WINDOW * 2 });
  }

  // --- If email provided and D1 available, use D1 ---
  if (email && env.DB) {
    email = email.toLowerCase().trim().slice(0, MAX_EMAIL_LENGTH);
    if (isValidEmail(email)) {
      return await handleD1Submit(env, email, name, time);
    }
  }

  // --- Fallback to KV for anonymous users ---
  if (env.LEADERBOARD) {
    return await handleKVSubmit(env, name, time);
  }

  return jsonResponse({ error: 'Storage unavailable' }, 503);
}

// ==================== D1 Submit (email-linked users) ====================
async function handleD1Submit(env, email, username, time) {
  try {
    // Get or create user
    let user = await env.DB.prepare(
      'SELECT id, username, best_time, games_played FROM users WHERE email = ?'
    ).bind(email).first();

    let personalBest = null;
    let isNewBest = false;

    if (user) {
      personalBest = user.best_time;
      isNewBest = !user.best_time || time < user.best_time;

      // Update user record
      if (isNewBest) {
        await env.DB.prepare(`
          UPDATE users
          SET username = ?, best_time = ?, games_played = games_played + 1, updated_at = datetime('now')
          WHERE email = ?
        `).bind(username, time, email).run();
      } else {
        await env.DB.prepare(`
          UPDATE users
          SET username = ?, games_played = games_played + 1, updated_at = datetime('now')
          WHERE email = ?
        `).bind(username, email).run();
      }
    } else {
      // Create new user with this score as their best
      await env.DB.prepare(`
        INSERT INTO users (email, username, best_time, games_played)
        VALUES (?, ?, ?, 1)
      `).bind(email, username, time).run();
      isNewBest = true;
    }

    // Record individual score in scores table
    const userId = user?.id || (await env.DB.prepare(
      'SELECT id FROM users WHERE email = ?'
    ).bind(email).first())?.id;

    if (userId) {
      await env.DB.prepare(
        'INSERT INTO scores (user_id, time) VALUES (?, ?)'
      ).bind(userId, time).run();
    }

    // Fetch updated leaderboard
    const { results: leaderboard } = await env.DB.prepare(`
      SELECT username as name, best_time as time, updated_at as date
      FROM users
      WHERE best_time IS NOT NULL
      ORDER BY best_time ASC
      LIMIT ?
    `).bind(MAX_ENTRIES).all();

    return jsonResponse({
      ok: true,
      leaderboard: leaderboard || [],
      personalBest: isNewBest ? time : personalBest,
      isNewBest,
    });
  } catch (e) {
    console.error('D1 submit error:', e);
    // Fallback to KV
    if (env.LEADERBOARD) {
      return await handleKVSubmit(env, username, time);
    }
    return jsonResponse({ error: 'Database error' }, 500);
  }
}

// ==================== KV Submit (anonymous users) ====================
async function handleKVSubmit(env, name, time) {
  // Daily write counter
  const today = new Date().toISOString().slice(0, 10);
  const writeCountKey = `writes:${today}`;
  const writeCount = parseInt(await env.LEADERBOARD.get(writeCountKey) || '0');

  if (writeCount >= MAX_DAILY_KV_WRITES) {
    const data = await env.LEADERBOARD.get('scores', { type: 'json' });
    return jsonResponse({
      ok: true,
      leaderboard: data || [],
      notice: 'Leaderboard at capacity today — try again tomorrow!',
    });
  }

  // Load current scores
  const data = await env.LEADERBOARD.get('scores', { type: 'json' });
  const scores = data || [];

  // Check if score matters
  const existing = scores.find(s => s.name.toLowerCase() === name.toLowerCase());
  if (existing && time >= existing.time) {
    return jsonResponse({ ok: true, leaderboard: scores });
  }
  if (!existing && scores.length >= MAX_ENTRIES) {
    const worstTime = scores[scores.length - 1].time;
    if (time >= worstTime) {
      return jsonResponse({ ok: true, leaderboard: scores });
    }
  }

  // Apply score
  if (existing) {
    existing.time = time;
    existing.date = new Date().toISOString();
  } else {
    scores.push({ name, time, date: new Date().toISOString() });
  }

  scores.sort((a, b) => a.time - b.time);
  const trimmed = scores.slice(0, MAX_ENTRIES);

  // Write to KV
  await Promise.all([
    env.LEADERBOARD.put('scores', JSON.stringify(trimmed)),
    env.LEADERBOARD.put(writeCountKey, String(writeCount + 2), { expirationTtl: 86400 }),
  ]);

  return jsonResponse({ ok: true, leaderboard: trimmed });
}
