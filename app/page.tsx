'use client';

import { useState, useEffect, useRef } from 'react';
import Leaderboard from './components/Leaderboard';

const PRO_RECORDS = [
  { rank: 1, driver: "Valtteri Bottas", time: 0.040, note: "Fastest ever recorded" },
  { rank: 2, driver: "Max Verstappen", time: 0.168, note: "2024 average" },
  { rank: 3, driver: "Lewis Hamilton", time: 0.173, note: "Career best" },
  { rank: 4, driver: "Sebastian Vettel", time: 0.159, note: "2011 Spa" },
  { rank: 5, driver: "Charles Leclerc", time: 0.179, note: "2023 data" },
];

export default function Home() {
  const [phase, setPhase] = useState<'idle' | 'countdown' | 'waiting' | 'reacted' | 'false'>('idle');
  const [lightsOn, setLightsOn] = useState(0);
  const [reactionTime, setReactionTime] = useState<number | null>(null);
  const [name, setName] = useState('');
  const [personalBest, setPersonalBest] = useState<number | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [leaderboardKey, setLeaderboardKey] = useState(0);

  const startTimeRef = useRef<number | null>(null);
  const timeoutRef = useRef<NodeJS.Timeout | null>(null);
  const hasReacted = useRef(false);

  useEffect(() => {
    const saved = localStorage.getItem('f1PersonalBest');
    if (saved) setPersonalBest(parseFloat(saved));
  }, []);

  const submitScore = async () => {
    if (!reactionTime || !name.trim()) return;
    setSubmitting(true);
    setSubmitError(null);
    try {
      const res = await fetch('/api/leaderboard', {
        method: 'POST',
        body: JSON.stringify({ name: name.trim().slice(0, 15), time: reactionTime }),
        headers: { 'Content-Type': 'application/json' },
      });
      if (res.ok) {
        if (!personalBest || reactionTime < personalBest) {
          localStorage.setItem('f1PersonalBest', reactionTime.toString());
          setPersonalBest(reactionTime);
        }
        setName('');
        setLeaderboardKey(prev => prev + 1);
      } else {
        const data = await res.json();
        setSubmitError(data.error || 'Submit failed - try again!');
      }
    } catch (e) {
      setSubmitError('An error occurred.');
    } finally {
      setSubmitting(false);
    }
  };

  const start = () => {
    hasReacted.current = false;
    setReactionTime(null);
    setPhase('countdown');
    setLightsOn(0);

    let count = 0;
    const interval = setInterval(() => {
      count++;
      setLightsOn(count);
      if (count === 5) {
        clearInterval(interval);
        const delay = 800 + Math.random() * 4200; // 0.8–5.0s
        timeoutRef.current = setTimeout(() => {
          setLightsOn(0);
          startTimeRef.current = performance.now();
          setPhase('waiting');
        }, delay);
      }
    }, 700);
  };

  const handleReaction = () => {
    if (hasReacted.current) return;
    hasReacted.current = true;

    if (phase === 'countdown' || phase === 'idle') {
      setPhase('false');
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
      return;
    }

    if (phase === 'waiting' && startTimeRef.current !== null) {
      const time = (performance.now() - startTimeRef.current) / 1000;
      setReactionTime(time);
      setPhase('reacted');
    }
  };

  useEffect(() => {
    const handler = (e: KeyboardEvent) => e.code === 'Space' && handleReaction();
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [phase]);

  return (
    <div className="min-h-screen bg-black text-white flex items-center justify-center p-4" onClick={handleReaction}>
      <div className="max-w-4xl w-full">

        <h1 className="text-center text-5xl md:text-7xl font-black mb-12 tracking-tighter">
          F1 LIGHTS OUT
        </h1>

        {/* Lights */}
        <div className="flex justify-center gap-6 md:gap-12 mb-16">
          {[1, 2, 3, 4, 5].map((i) => (
            <div key={i} className="flex flex-col gap-8">
              <div className={`w-24 h-40 md:w-36 md:h-56 rounded-3xl transition-all duration-200 shadow-2xl
                ${lightsOn >= i ? 'bg-red-600 shadow-red-600/80' : 'bg-zinc-900'}`} />
              <div className={`w-24 h-40 md:w-36 md:h-56 rounded-3xl transition-all duration-200 shadow-2xl
                ${lightsOn >= i ? 'bg-red-600 shadow-red-600/80' : 'bg-zinc-900'} -mt-8 md:-mt-12`} />
            </div>
          ))}
        </div>

        {/* Controls */}
        {phase === 'idle' && (
          <div className="text-center">
            <button onClick={start} className="px-16 py-8 text-4xl font-bold bg-red-600 hover:bg-red-500 rounded-3xl transition">
              START (Spacebar or Tap)
            </button>
          </div>
        )}

        {(phase === 'countdown' || phase === 'waiting') && (
          <div className="text-center text-5xl md:text-7xl font-mono">
            {phase === 'waiting' ? 'GO!' : 'WAIT...'}
          </div>
        )}

        {phase === 'false' && (
          <div className="text-center">
            <div className="text-8xl text-red-500 font-black mb-8">FALSE START!</div>
            <button onClick={start} className="px-12 py-6 text-3xl bg-gray-800 hover:bg-gray-700 rounded-2xl">
              Try Again
            </button>
          </div>
        )}

        {phase === 'reacted' && reactionTime !== null && (
          <div className="text-center space-y-8">
            <div className="text-8xl md:text-9xl font-black font-mono">
              {reactionTime.toFixed(5)}<span className="text-5xl">s</span>
            </div>

            {personalBest && reactionTime < personalBest && (
              <div className="text-4xl text-green-400 animate-pulse">NEW PB!</div>
            )}

            <div className="flex flex-col items-center gap-4">
              <input
                type="text"
                placeholder="Name (15 chars max)"
                value={name}
                onChange={(e) => setName(e.target.value)}
                maxLength={15}
                className="px-6 py-4 bg-zinc-900 rounded-xl text-2xl text-center w-80"
                onClick={(e) => e.stopPropagation()}
              />
              <button onClick={submitScore} disabled={submitting} className="px-12 py-5 bg-green-600 hover:bg-green-500 rounded-2xl text-2xl font-bold disabled:bg-gray-500">
                {submitting ? 'Submitting...' : 'Submit Score'}
              </button>
              {submitError && <div className="text-red-500">{submitError}</div>}
            </div>

            <button onClick={start} className="px-12 py-5 bg-gray-700 hover:bg-gray-600 rounded-2xl text-2xl">
              Retry
            </button>
          </div>
        )}

        {/* Pro Records */}
        <div className="mt-20 bg-zinc-950 rounded-3xl p-8 border border-zinc-800">
          <h2 className="text-3xl font-bold mb-6 text-center">PRO RECORDS</h2>
          <div className="space-y-3 text-xl">
            {PRO_RECORDS.map(p => (
              <div key={p.rank} className="flex justify-between">
                <span>{p.rank}. {p.driver} <span className="text-gray-500 text-sm">({p.note})</span></span>
                <span className="font-mono">{p.time.toFixed(5)}s</span>
              </div>
            ))}
          </div>
        </div>

        <Leaderboard refresh={leaderboardKey} />

        {personalBest && phase === 'idle' && (
          <div className="text-center mt-12 text-3xl">
            PB: <span className="text-green-400 font-mono">{personalBest.toFixed(5)}s</span>
          </div>
        )}
      </div>
    </div>
  );
}
