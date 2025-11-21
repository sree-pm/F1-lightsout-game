'use client';

import { useState, useEffect } from 'react';

export default function Leaderboard({ refresh }: { refresh: number }) {
  const [leaderboard, setLeaderboard] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetchLeaderboard();
  }, [refresh]);

  const fetchLeaderboard = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/leaderboard');
      if (res.ok) {
        const data = await res.json();
        setLeaderboard(data);
      } else {
        setError('Failed to fetch leaderboard.');
      }
    } catch (e) {
      setError('An error occurred.');
    } finally {
      setLoading(false);
    }
  };

  if (loading) return <div className="text-center">Loading...</div>;
  if (error) return <div className="text-center text-red-500">{error}</div>;

  return (
    <div className="mt-12 bg-zinc-950 rounded-3xl p-8 border border-zinc-800">
      <div className="flex justify-between items-center mb-6">
        <h2 className="text-3xl font-bold text-center">TOP 20</h2>
        <button onClick={fetchLeaderboard} className="px-4 py-2 bg-gray-700 hover:bg-gray-600 rounded-lg">Refresh</button>
      </div>
      {leaderboard.length > 0 ? (
        <div className="space-y-2 font-mono text-lg">
          {leaderboard.slice(0, 20).map((entry, i) => (
            <div key={entry.id} className="flex justify-between">
              <span>{i + 1}. {entry.name}</span>
              <span>{entry.time.toFixed(5)}s</span>
            </div>
          ))}
        </div>
      ) : (
        <div className="text-center">No scores yet.</div>
      )}
    </div>
  );
}
