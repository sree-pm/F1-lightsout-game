/**
 * Cloudflare Pages Function — /api/leaderboard
 *
 * This runs as part of Cloudflare Pages (no separate Worker deploy needed).
 * Bind a KV namespace called "LEADERBOARD" in the Pages dashboard.
 */

const MAX_ENTRIES = 100;
const MAX_NAME_LENGTH = 20;

function corsHeaders() {
  return {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
  };
}

function jsonResponse(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders(), 'Content-Type': 'application/json' },
  });
}

// Handle GET + POST + OPTIONS
export async function onRequest(context) {
  const { request, env } = context;

  if (request.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders() });
  }

  try {
    if (request.method === 'GET') {
      const data = await env.LEADERBOARD.get('scores', { type: 'json' });
      return jsonResponse(data || []);
    }

    if (request.method === 'POST') {
      const body = await request.json();
      let { name, time } = body;

      // Validate name
      if (!name || typeof name !== 'string' || name.trim().length === 0) {
        return jsonResponse({ error: 'Name required' }, 400);
      }
      name = name.trim().slice(0, MAX_NAME_LENGTH);

      // Validate time
      time = parseFloat(time);
      if (isNaN(time) || time <= 0 || time > 10) {
        return jsonResponse({ error: 'Invalid time' }, 400);
      }

      // Anti-cheat: sub-100ms is humanly impossible
      if (time < 0.1) {
        return jsonResponse({ error: 'Nice try 😏' }, 400);
      }

      // Load scores
      const data = await env.LEADERBOARD.get('scores', { type: 'json' });
      const scores = data || [];

      // Upsert: keep best time per name
      const existing = scores.find(s => s.name.toLowerCase() === name.toLowerCase());
      if (existing) {
        if (time < existing.time) {
          existing.time = time;
          existing.date = new Date().toISOString();
        }
      } else {
        scores.push({ name, time, date: new Date().toISOString() });
      }

      // Sort and trim
      scores.sort((a, b) => a.time - b.time);
      const trimmed = scores.slice(0, MAX_ENTRIES);

      await env.LEADERBOARD.put('scores', JSON.stringify(trimmed));

      return jsonResponse({ ok: true, leaderboard: trimmed });
    }

    return jsonResponse({ error: 'Method not allowed' }, 405);
  } catch (e) {
    return jsonResponse({ error: 'Server error' }, 500);
  }
}
