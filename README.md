# F1 Lights Out Game

Test your reaction time against F1 drivers! Beat the lights out with 5-decimal precision.

## Deploy to Vercel (2 mins)

1. `npm install`
2. Create free Postgres at vercel.com/storage/postgres → Add POSTGRES_URL env var
3. Run SQL:
   ```sql
   CREATE TABLE leaderboard (id SERIAL PRIMARY KEY, name TEXT NOT NULL, time DOUBLE PRECISION NOT NULL, created_at TIMESTAMP DEFAULT NOW());
   CREATE INDEX idx_time ON leaderboard(time);