import { useContext } from 'react';
import { MLCEngineInterface } from '@mlc-ai/web-llm';
import { NemotronContext } from '../pages/NemotronChat';

/**
 * Hook that returns the initialized MLCEngine (or null if not ready yet).
 * Throws an error if used outside of <NemotronChat.Provider>.
 */
export function useNemotronEngine(): MLCEngineInterface | null {
  const ctx = useContext(NemotronContext);
  if (!ctx) {
    throw new Error('useNemotronEngine must be used within a NemotronChat provider');
  }
  return ctx.engine;
}