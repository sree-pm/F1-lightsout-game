-- F1 Lights Out - D1 Database Schema
-- Run with: npx wrangler d1 execute f1-lightsout-db --file=./schema.sql

-- Users table: email-linked accounts with personal bests
CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  email TEXT UNIQUE NOT NULL,
  username TEXT NOT NULL,
  best_time REAL,
  games_played INTEGER DEFAULT 0,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now'))
);

-- Index for fast email lookups
CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);

-- Index for leaderboard queries (sorted by best_time)
CREATE INDEX IF NOT EXISTS idx_users_best_time ON users(best_time) WHERE best_time IS NOT NULL;

-- Scores table: individual game history (optional, for analytics)
CREATE TABLE IF NOT EXISTS scores (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL,
  time REAL NOT NULL,
  created_at TEXT DEFAULT (datetime('now')),
  FOREIGN KEY (user_id) REFERENCES users(id)
);

-- Index for user score history
CREATE INDEX IF NOT EXISTS idx_scores_user_id ON scores(user_id);

-- Rate limiting table (tracks recent submissions per IP)
CREATE TABLE IF NOT EXISTS rate_limits (
  ip TEXT PRIMARY KEY,
  last_submit TEXT NOT NULL,
  daily_count INTEGER DEFAULT 1
);
