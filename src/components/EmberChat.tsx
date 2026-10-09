import React, { FormEvent, KeyboardEvent, useEffect, useRef, useState } from 'react';

import { art } from '../game/art';
import { askEmber, EmberAnswer } from '../game/ember';
import type { EmberAction } from '../game/ember';
import { getNemotronEngine } from '../utils/nemotronEngine';

type Line = { from: 'ninja' | 'ember'; text: string; did?: EmberAction };

// What to tell the player when Ember actually does something
const DID: Partial<Record<EmberAction, string>> = {
  LIGHT_AREA: 'Ember lights up the area',
  PUSH_TOWARD_LEDGE: 'Ember pushes you toward the ledge',
  SLOW_FALL: 'Ember slows your fall',
  WARN_UNSAFE_PLATFORM: 'Ember marks the unsafe block'
};

type Props = { onClose: () => void };

/** Chat with Ember while the game is frozen. Enter sends, Esc closes. */
export function EmberChat({ onClose }: Props) {
  const [lines, setLines] = useState<Line[]>([]);
  const [text, setText] = useState('');
  const [thinking, setThinking] = useState(false);
  const [ready, setReady] = useState(false);
  const [status, setStatus] = useState('Warming the fire brain...');
  const [progress, setProgress] = useState('');
  const input = useRef<HTMLInputElement>(null);
  const log = useRef<HTMLDivElement>(null);

  // Load the model when the chat opens; the shared engine loads only once
  useEffect(() => {
    const load = async () => {
      const engine = await getNemotronEngine((report) => {
        setProgress(
          `${report.text} ${report.progress !== undefined ? Math.round(report.progress * 100) + '%' : ''}`
        );
      });
      if (engine) {
        setReady(true);
        setStatus('Ember is awake');
      } else {
        setStatus('The model could not load');
      }
    };
    void load();
  }, []);

  useEffect(() => input.current?.focus(), []);
  useEffect(() => {
    log.current?.scrollTo({ top: log.current.scrollHeight });
  }, [lines, thinking]);

  const show = (line: Line) => {
    setLines((l) => {
      const next = [...l];
      if (next.length > 0 && next[next.length - 1].from === line.from) {
        next[next.length - 1] = line;
      } else {
        next.push(line);
      }
      return next;
    });
  };

  const send = async (e: FormEvent) => {
    e.preventDefault();
    const message = text.trim();
    if (!message || thinking || !ready) return;
    setText('');
    setLines((l) => [...l, { from: 'ninja', text: message }]);
    setThinking(true);
    // One inference run; show Ember's words as they arrive
    const answer = await askEmber(message, (partial) => {
      show({ from: 'ember', text: partial });
    });
    show({ did: answer.done, from: 'ember', text: answer.reply });
    setThinking(false);
    input.current?.focus();
  };

  const onKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    e.stopPropagation(); // typing here never moves the ninja
    if (e.key === 'Escape') onClose();
  };

  return (
    <div className="fixed inset-x-0 bottom-0 z-40 flex justify-center p-4 font-pixel">
      <div className="w-full max-w-2xl border-4 border-white bg-slate-950/90 p-4 text-white">
        <div className="mb-3 flex items-center gap-3">
          <img src={art.fireball1.src} alt="" className="h-10 [image-rendering:pixelated]" />
          <div className="text-xs text-amber-300">Talk to Ember</div>
          <div className="ml-auto text-[8px] text-white/50">Enter send · Esc close</div>
        </div>

        <div ref={log} className="mb-3 max-h-48 space-y-2 overflow-y-auto text-[10px] leading-5">
          {!ready && (
            <div className="text-white/50">
              {status}
              {progress && <span> — {progress}</span>}
            </div>
          )}
          {ready && lines.length === 0 && (
            <div className="text-white/50">Ask Ember about the route ahead...</div>
          )}
          {lines.map((line, i) => (
            // eslint-disable-next-line react/no-array-index-key
            <div key={i} className={line.from === 'ninja' ? 'text-teal-300' : 'text-amber-200'}>
              <span className="text-white/50">{line.from === 'ninja' ? 'You: ' : 'Ember: '}</span>
              {line.text}
              {line.did && DID[line.did] && <div className="text-[8px] text-orange-400">* {DID[line.did]}</div>}
            </div>
          ))}
          {thinking && <div className="text-amber-200/70">Ember is thinking...</div>}
        </div>

        <form onSubmit={send}>
          <input
            ref={input}
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={onKeyDown}
            disabled={!ready}
            maxLength={200}
            placeholder={ready ? 'Should I jump to the next platform?' : 'Waiting for the model to warm up...'}
            className="w-full border-2 border-white/60 bg-black px-2 py-2 text-[10px] text-white outline-none focus:border-amber-300"
          />
        </form>
      </div>
    </div>
  );
}
