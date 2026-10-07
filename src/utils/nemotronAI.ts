/**
 * Nemotron 2B Inference via WebGPU using @mlc-ai/web-llm
 *
 * Provides AI‑powered game decisions for SpideyVerse.
 * Falls back to the existing Rust/JS decision generator if the model fails to load.
 */

let engine: any = null;
let isModelLoaded: boolean = false;

/**
 * Initialize the Nemotron 2B model for game AI.
 * @returns {Promise<boolean>} True if the model loaded successfully.
 */
export async function initNemotronModel(): Promise<boolean> {
  try {
    const { CreateMLCEngine } = await import('@mlc-ai/web-llm');

    // Load the 4‑bit quantized Nemotron‑2B model (~1.3 GB).
    // On first run the model is downloaded and cached in IndexedDB;
    // subsequent loads are almost instantaneous.
    // Uses custom appConfig to include Nemotron model not in default prebuilt list.
    // Starts downloading the model immediately upon initNemotronModel() call.
    const nemotronAppConfig = {
      model_list: [
        {
          model: 'https://huggingface.co/mlc-ai/nemotron-2b-instruct-q4f16_1/resolve/main/config.json',
          model_id: 'mlc-ai/nemotron-2b-instruct-q4f16_1',
          model_lib: 'https://huggingface.co/mlc-ai/nemotron-2b-instruct-q4f16_1-MLC/resolve/main/model.wasm',
        }
      ]
    };
    console.log('🤖 Starting Nemotron 2B model download (~1.3 GB) via WebGPU...');
    engine = await CreateMLCEngine('mlc-ai/nemotron-2b-instruct-q4f16_1', { appConfig: nemotronAppConfig });

    isModelLoaded = true;
    console.log('✅ Nemotron 2B model loaded successfully via WebGPU');
    return true;
  } catch (error: any) {
    console.error('❌ Failed to load Nemotron model:', error.message);
    isModelLoaded = false;
    return false;
  }
}

/**
 * Map AI action to game key event.
 * This translates Nemotron's decision text to actual keyboard events
 * that the game engine understands.
 * @param action The AI action string
 * @param gameOver Whether the game is over (affects jump key behavior)
 * @returns The mapped key configuration
 */
const getActionMapping = (
  action: 'move_left' | 'move_right' | 'move_idle' | 'jump' | 'switch_suit' | 'wait',
  gameOver: boolean
): { key: string; preventDefault: (e: KeyboardEvent) => boolean } | undefined => {
  const baseMapping: Record<string, { key: string; preventDefault: (e: KeyboardEvent) => boolean }> = {
    move_left: { key: 'ArrowLeft', preventDefault: () => true },
    move_right: { key: 'ArrowRight', preventDefault: () => true },
    move_idle: { key: '', preventDefault: () => false },
    jump: { key: ' ', preventDefault: e => !e.repeat && !gameOver },
    switch_suit: { key: 's', preventDefault: () => true },
    wait: { key: '', preventDefault: () => false }
  };
  return baseMapping[action];
};

/**
 * Dispatch a keyboard event for the given action.
 * @param action The AI action string
 * @param gameOver Whether the game is over (for jump logic)
 */
export const dispatchAIAction = (
  action: 'move_left' | 'move_right' | 'move_idle' | 'jump' | 'switch_suit' | 'wait',
  gameOver: boolean
): void => {
  const mapped = getActionMapping(action, gameOver);
  if (!mapped) return;

  if (mapped.key && !gameOver) {
    const event = new KeyboardEvent('keydown', {
      key: mapped.key,
      bubbles: true,
      cancelable: true
    });
    // Prevent default for key presses
    if (mapped.preventDefault) {
      // Prevent default for all key presses
      // The jump repeat handling is managed by the game's key listener
      event.preventDefault();
    }
    window.dispatchEvent(event);
  } else if (mapped.key === '') {
    // move_idle or wait - just ensure no key is pressed
    const upEvent = new KeyboardEvent('keyup', { key: mapped.key, bubbles: true });
    window.dispatchEvent(upEvent);
  }
};

/**
 * Get an AI decision for the current game state.
 * @param gameState – current state of the game
 * @param gameOver – whether the game is currently over
 * @returns {Promise<{action, source, confidence}>}
 */
export async function getAIAction(
  gameState: {
    level: string;
    villain_energy: number;
    attack: string;
    timeOfDay: string;
    suit: string;
    buildings: Array<{ x: number; y: number; height: number }>;
    danger_zone: Array<[number, number, number]>;
  },
  gameOver: boolean = false
): Promise<{
  action: 'move_left' | 'move_right' | 'move_idle' | 'jump' | 'switch_suit' | 'wait';
  source: 'nemotron-webgpu' | 'fallback-rules';
  confidence: number;
}> {
  if (!isModelLoaded || !engine) {
    // Fallback to existing decision generator
    const fallbackAction = await fallbackDecision(gameState);
    // Still dispatch the fallback action if we have gameOver context
    if (gameOver) {
      dispatchAIAction(fallbackAction.action, true);
    }
    return fallbackAction;
  }

  try {
    // ----- Prompt for Nemotron -----
    const prompt = `
      You are controlling Spider-Man in an arcade pixel art game. Help Spider-Man survive and progress.

      GAME STATE:
      - Level: ${gameState.level}
      - Villain Energy: ${gameState.villain_energy}
      - Attack Type: ${gameState.attack}
      - Time of Day: ${gameState.timeOfDay}
      - Suit: ${gameState.suit}
      - Buildings: ${JSON.stringify(gameState.buildings.slice(0, 3))}... (total: ${gameState.buildings.length})
      - Danger Zones: ${JSON.stringify(gameState.danger_zone.slice(0, 2))}... (total: ${gameState.danger_zone.length})

      ACTION REQUIRED:
      Based on the state above, decide the next action for Spider-Man.
      
      Output format (choose EXACTLY ONE of these, no explanation):
      - "move_left"
      - "move_right"
      - "move_idle"
      - "jump"
      - "switch_suit"
      - "wait"

      Consider: danger zones, building heights, villain energy, and survival.
    `;

    // ----- Get AI response -----
    const response: any = await engine.completions.create({
      messages: [{ role: 'user', content: prompt }],
      max_tokens: 32,
      temperature: 0.7,
      stop: ['\n']
    });

    const actionText: string = response.choices?.[0]?.message?.content?.trim() || 'move_idle';

    // ----- Validate action -----
    const validActions: Array<
      'move_left' | 'move_right' | 'move_idle' | 'jump' | 'switch_suit' | 'wait'
    > = [
      'move_left',
      'move_right',
      'move_idle',
      'jump',
      'switch_suit',
      'wait'
    ];
    const validAction: 'move_left' | 'move_right' | 'move_idle' | 'jump' | 'switch_suit' | 'wait' =
      validActions.includes(actionText as any) ? (actionText as any) : 'move_idle';

    // Dispatch the action as a key event
    dispatchAIAction(validAction, gameOver);

    return {
      action: validAction,
      source: 'nemotron-webgpu',
      confidence: 0.85
    };
  } catch (error: any) {
    console.error('Nemotron inference error, falling back:', error.message);
    const fallbackAction = await fallbackDecision(gameState);
    if (gameOver) {
      dispatchAIAction(fallbackAction.action, true);
    }
    return fallbackAction;
  }
}

/**
 * Fallback decision generator (existing rule‑based logic).
 * Simple rules based on game state.
 */
function fallbackDecision(
  gameState: {
    level: string;
    villain_energy: number;
    attack: string;
    timeOfDay: string;
    suit: string;
    buildings: Array<{ x: number; y: number; height: number }>;
    danger_zone: Array<[number, number, number]>;
  }
): Promise<{
  action: 'move_left' | 'move_right' | 'move_idle' | 'jump' | 'switch_suit' | 'wait';
  source: 'fallback-rules';
  confidence: number;
}> {
  const { level, villain_energy, attack, timeOfDay, suit, buildings, danger_zone } = gameState;

  // Simple rule‑based fallback
  let action: 'move_left' | 'move_right' | 'move_idle' | 'jump' | 'switch_suit' | 'wait' = 'move_idle';

  // If in immediate danger, stay idle
  if (danger_zone && danger_zone.length > 0) {
    action = 'move_idle';
  }

  // If low energy and we have the Jarvis suit, switch to it to recharge/recover
  if (villain_energy < 30 && suit === 'jarvis') {
    action = 'switch_suit';
  }

  return Promise.resolve({
    action,
    source: 'fallback-rules',
    confidence: 0.6
  });
}

/**
 * Check if the Nemotron model is ready.
 */
export function isNemotronReady(): boolean {
  return isModelLoaded && !!engine;
}

/**
 * Get model information for logging/debugging.
 */
export function getModelInfo(): {
  loaded: boolean;
  engine: string | null;
  model: string;
  size: string;
  fallbackAvailable: boolean;
} {
  return {
    loaded: isModelLoaded,
    engine: engine ? 'mlc-web-llm' : null,
    model: 'Nemotron-2B-Instruct (4-bit quantized)',
    size: '~1.3GB (WebGPU)',
    fallbackAvailable: true
  };
}