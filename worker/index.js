/**
 * F1 Lights Out - Standalone Worker (alternative to Pages Functions)
 * Same logic as functions/api/leaderboard.js
 * KV Namespace binding: LEADERBOARD
 */

const MAX_ENTRIES = 100;
const MAX_NAME_LENGTH = 20;
const RATE_LIMIT_WINDOW = 10;
const MAX_DAILY_WRITES = 900;

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

export default {
  async fetch(request, env) {
    if (request.method === 'OPTIONS') {
      return new Response(null, { headers: corsHeaders() });
    }
    const url = new URL(request.url);
    if (url.pathname !== '/api/leaderboard') {
      return new Response('Not found', { status: 404 });
    }
    try {
      if (request.method === 'GET') return await handleGet(env);
      if (request.method === 'POST') return await handlePost(request, env);
      return jsonResponse({ error: 'Method not allowed' }, 405);
    } catch (e) {
      return jsonResponse({ error: 'Server error' }, 500);
    }
  },
};

async function handleGet(env) {
  const data = await env.LEADERBOARD.get('scores', { type: 'json' });
  return jsonResponse(data || [], 200, {
    'Cache-Control': 'public, max-age=15, s-maxage=30, stale-while-revalidate=60',
  });
}

async function handlePost(request, env) {
  const body = await request.json();
  let { name, time } = body;

  if (!name || typeof name !== 'string' || name.trim().length === 0) {
    return jsonResponse({ error: 'Name required' }, 400);
  }
  name = name.trim().slice(0, MAX_NAME_LENGTH);

  time = parseFloat(time);
  if (isNaN(time) || time <= 0 || time > 10) {
    return jsonResponse({ error: 'Invalid time' }, 400);
  }
  if (time < 0.1) {
    return jsonResponse({ error: 'Nice try' }, 400);
  }

  const ip = request.headers.get('cf-connecting-ip') || request.headers.get('x-forwarded-for') || 'unknown';
  const rateLimitKey = `rate:${ip}`;
  const lastSubmit = await env.LEADERBOARD.get(rateLimitKey);
  if (lastSubmit) {
    const elapsed = (Date.now() - parseInt(lastSubmit)) / 1000;
    if (elapsed < RATE_LIMIT_WINDOW) {
      return jsonResponse({ error: 'Too fast — wait a few seconds' }, 429);
    }
  }

  const today = new Date().toISOString().slice(0, 10);
  const writeCountKey = `writes:${today}`;
  const writeCount = parseInt(await env.LEADERBOARD.get(writeCountKey) || '0');
  if (writeCount >= MAX_DAILY_WRITES) {
    const data = await env.LEADERBOARD.get('scores', { type: 'json' });
    return jsonResponse({ ok: true, leaderboard: data || [], notice: 'Leaderboard at capacity today' });
  }

  const data = await env.LEADERBOARD.get('scores', { type: 'json' });
  const scores = data || [];

  const existing = scores.find(s => s.name.toLowerCase() === name.toLowerCase());
  if (existing && time >= existing.time) {
    return jsonResponse({ ok: true, leaderboard: scores });
  }
  if (!existing && scores.length >= MAX_ENTRIES) {
    if (time >= scores[scores.length - 1].time) {
      return jsonResponse({ ok: true, leaderboard: scores });
    }
  }

  if (existing) {
    existing.time = time;
    existing.date = new Date().toISOString();
  } else {
    scores.push({ name, time, date: new Date().toISOString() });
  }

  scores.sort((a, b) => a.time - b.time);
  const trimmed = scores.slice(0, MAX_ENTRIES);

  await Promise.all([
    env.LEADERBOARD.put('scores', JSON.stringify(trimmed)),
    env.LEADERBOARD.put(rateLimitKey, String(Date.now()), { expirationTtl: RATE_LIMIT_WINDOW * 2 }),
    env.LEADERBOARD.put(writeCountKey, String(writeCount + 3), { expirationTtl: 86400 }),
  ]);

  return jsonResponse({ ok: true, leaderboard: trimmed });
}
