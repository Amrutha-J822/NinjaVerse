import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';

import { invoke, isTauri } from '@tauri-apps/api/core';

import { JarvisDecision, Level } from '../types/jarvis';
import { generateDecision } from '../utils/decisionGenerator';

import GameScene from './Scenes/GameScene';

const levels: { color: string; label: string; value: Level }[] = [
  { color: 'bg-green-600', label: 'Easy', value: 'easy' },
  { color: 'bg-orange-500', label: 'Medium', value: 'medium' },
  { color: 'bg-red-600', label: 'Hard', value: 'hard' }
];

export default function PlayDemoPage() {
  const navigate = useNavigate();
  const [level, setLevel] = useState<Level | null>(null);
  const [decision, setDecision] = useState<JarvisDecision | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleStart = async () => {
    if (!level) return;
    setLoading(true);
    setError(null);
    try {
      // Tauri commands take named arguments matching the Rust parameter names.
      // Outside Tauri (plain browser) we fall back to the JS mirror of the generator.
      const result = isTauri()
        ? await invoke<string>('jarvis_decision', { level })
        : JSON.stringify(generateDecision(level));
      setDecision(JSON.parse(result) as JarvisDecision);
    } catch (e) {
      console.error('Failed to call jarvis_decision:', e);
      setError('Jarvis could not generate this level. Are you running inside the Tauri app?');
    } finally {
      setLoading(false);
    }
  };

  if (decision && level) {
    return <GameScene decision={decision} level={level} />;
  }

  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-4 bg-gradient-to-r from-slate-950 from-10% via-teal-950 via-50% to-slate-900 to-90% font-mono text-white">
      <h1 className="font-main_menu text-6xl text-white/80">Select Game Level</h1>

      <div className="flex gap-3">
        {levels.map((l) => (
          <button
            key={l.value}
            type="button"
            onClick={() => setLevel(l.value)}
            className={`rounded px-5 py-2 text-sm ${l.color} ${
              level === l.value ? 'ring-4 ring-white' : 'opacity-70 hover:opacity-100'
            }`}
          >
            {l.label}
          </button>
        ))}
      </div>

      {level && (
        <button
          type="button"
          onClick={handleStart}
          disabled={loading}
          className="mt-4 rounded bg-white px-6 py-2 text-sm text-black disabled:opacity-50"
        >
          {loading ? 'Jarvis is thinking...' : 'Start Game'}
        </button>
      )}

      {error && <p className="max-w-md text-center text-sm text-red-400">{error}</p>}

      <button
        type="button"
        onClick={() => navigate('/main-menu')}
        className="mt-8 text-sm text-white/50 hover:text-white"
      >
        Back to menu
      </button>
    </div>
  );
}
