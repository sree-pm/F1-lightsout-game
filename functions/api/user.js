/**
 * Cloudflare Pages Function — /api/user
 *
 * FAST email-based user management:
 * - GET ?email=xxx: Lookup user by email (cached at edge)
 * - POST: Create or update user profile
 *
 * Optimized for Cloudflare free tier with edge caching.
 */

const MAX_USERNAME_LENGTH = 20;
const MAX_EMAIL_LENGTH = 100;

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

// Simple email validation
function isValidEmail(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

export async function onRequest(context) {
  const { request, env } = context;

  if (request.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders() });
  }

  // Check if D1 is available, fallback gracefully
  if (!env.DB) {
    return jsonResponse({ error: 'Database not configured' }, 503);
  }

  try {
    if (request.method === 'GET') {
      return await handleGet(request, env);
    }
    if (request.method === 'POST') {
      return await handlePost(request, env);
    }
    return jsonResponse({ error: 'Method not allowed' }, 405);
  } catch (e) {
    console.error('User API error:', e);
    return jsonResponse({ error: 'Server error' }, 500);
  }
}

// GET — Lookup user by email (edge-cached)
async function handleGet(request, env) {
  const url = new URL(request.url);
  const email = url.searchParams.get('email')?.toLowerCase()?.trim();

  if (!email || !isValidEmail(email)) {
    return jsonResponse({ error: 'Valid email required' }, 400);
  }

  // Short cache for user lookups (personalized, but can be stale briefly)
  const cacheHeaders = {
    'Cache-Control': 'private, max-age=5, stale-while-revalidate=10',
  };

  const user = await env.DB.prepare(
    'SELECT id, username, best_time, games_played FROM users WHERE email = ?'
  ).bind(email).first();

  if (!user) {
    return jsonResponse({ found: false }, 200, cacheHeaders);
  }

  // Fetch user's recent scores (up to 20)
  let scores = [];
  try {
    const { results } = await env.DB.prepare(
      'SELECT time, created_at as date FROM scores WHERE user_id = ? ORDER BY created_at DESC LIMIT 20'
    ).bind(user.id).all();
    scores = results || [];
  } catch (e) {
    // Scores table might not exist yet
  }

  return jsonResponse({
    found: true,
    username: user.username,
    bestTime: user.best_time,
    gamesPlayed: user.games_played,
    scores,
  }, 200, cacheHeaders);
}

// POST — Create or update user
async function handlePost(request, env) {
  const body = await request.json();
  let { email, username } = body;

  // Validate email
  if (!email || typeof email !== 'string') {
    return jsonResponse({ error: 'Email required' }, 400);
  }
  email = email.toLowerCase().trim().slice(0, MAX_EMAIL_LENGTH);
  if (!isValidEmail(email)) {
    return jsonResponse({ error: 'Invalid email format' }, 400);
  }

  // Validate username
  if (!username || typeof username !== 'string' || username.trim().length === 0) {
    return jsonResponse({ error: 'Username required' }, 400);
  }
  username = username.trim().slice(0, MAX_USERNAME_LENGTH);

  // Check if user exists
  const existing = await env.DB.prepare(
    'SELECT id, username, best_time FROM users WHERE email = ?'
  ).bind(email).first();

  if (existing) {
    // Update username if different
    if (existing.username !== username) {
      await env.DB.prepare(
        'UPDATE users SET username = ?, updated_at = datetime("now") WHERE email = ?'
      ).bind(username, email).run();
    }
    return jsonResponse({
      ok: true,
      created: false,
      username,
      bestTime: existing.best_time,
    });
  }

  // Create new user
  await env.DB.prepare(
    'INSERT INTO users (email, username) VALUES (?, ?)'
  ).bind(email, username).run();

  return jsonResponse({
    ok: true,
    created: true,
    username,
    bestTime: null,
  });
}
