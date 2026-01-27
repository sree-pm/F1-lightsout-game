/**
 * F1 Lights Out - Leaderboard API
 * Cloudflare Worker + KV
 *
 * KV Namespace binding: LEADERBOARD
 * Key: "scores" → JSON array of { name, time, date }
 */

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};

const MAX_ENTRIES = 100;
const MAX_NAME_LENGTH = 20;

export default {
  async fetch(request, env) {
    // Handle CORS preflight
    if (request.method === 'OPTIONS') {
      return new Response(null, { headers: CORS_HEADERS });
    }

    const url = new URL(request.url);

    // Only handle /api/leaderboard
    if (url.pathname !== '/api/leaderboard') {
      return new Response('Not found', { status: 404 });
    }

    try {
      if (request.method === 'GET') {
        return await getLeaderboard(env);
      }
      if (request.method === 'POST') {
        return await postScore(request, env);
      }
      return new Response('Method not allowed', { status: 405, headers: CORS_HEADERS });
    } catch (e) {
      return new Response(JSON.stringify({ error: 'Internal error' }), {
        status: 500,
        headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
      });
    }
  },
};

async function getLeaderboard(env) {
  const data = await env.LEADERBOARD.get('scores', { type: 'json' });
  const scores = data || [];
  return new Response(JSON.stringify(scores), {
    headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
  });
}

async function postScore(request, env) {
  const body = await request.json();
  let { name, time } = body;

  // Validate
  if (!name || typeof name !== 'string') {
    return new Response(JSON.stringify({ error: 'Name required' }), {
      status: 400,
      headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
    });
  }
  name = name.trim().slice(0, MAX_NAME_LENGTH);
  if (name.length === 0) {
    return new Response(JSON.stringify({ error: 'Name required' }), {
      status: 400,
      headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
    });
  }

  time = parseFloat(time);
  if (isNaN(time) || time <= 0 || time > 10) {
    return new Response(JSON.stringify({ error: 'Invalid time' }), {
      status: 400,
      headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
    });
  }

  // Reject obviously cheated times (< 100ms is humanly impossible)
  if (time < 0.1) {
    return new Response(JSON.stringify({ error: 'Nice try 😏' }), {
      status: 400,
      headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
    });
  }

  // Get current scores
  const data = await env.LEADERBOARD.get('scores', { type: 'json' });
  const scores = data || [];

  // Check if user already exists — keep their best time only
  const existing = scores.find(s => s.name.toLowerCase() === name.toLowerCase());
  if (existing) {
    if (time < existing.time) {
      existing.time = time;
      existing.date = new Date().toISOString();
    }
  } else {
    scores.push({
      name,
      time,
      date: new Date().toISOString(),
    });
  }

  // Sort by time ascending, keep top N
  scores.sort((a, b) => a.time - b.time);
  const trimmed = scores.slice(0, MAX_ENTRIES);

  // Save
  await env.LEADERBOARD.put('scores', JSON.stringify(trimmed));

  return new Response(JSON.stringify({ ok: true, leaderboard: trimmed }), {
    headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
  });
}
