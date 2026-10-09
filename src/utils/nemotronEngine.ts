/**
 * Nemotron Mini 4B inference via WebGPU using @mlc-ai/web-llm.
 *
 * One shared engine for the whole app: every page that needs the model
 * calls getNemotronEngine(), and the model is loaded only once.
 * The model files are served locally from /mlc (see the public folder).
 */

import {
  CreateMLCEngine,
  type MLCEngineInterface,
  type InitProgressReport
} from '@mlc-ai/web-llm';

export const MODEL_ID = 'Nemotron-Mini-4B-q4f16_1';

const appConfig = {
  model_list: [
    {
      model: new URL(
        '/mlc/nemotron-mini-4b-q4f16_1',
        window.location.origin
      ).toString(),
      model_id: MODEL_ID,
      model_lib: '/mlc/nemotron-mini-4b-q4f16_1-webgpu.wasm',

      vram_required_MB: 3300,
      low_resource_required: true,

      overrides: {
        // Ember sends the game state and a few past turns with every message,
        // so the window has to be bigger than a plain chat needs
        context_window_size: 3072
      }
    }
  ]
};

let engine: MLCEngineInterface | null = null;
let started: Promise<MLCEngineInterface | null> | null = null;

/**
 * Get the shared engine, loading it on the first call.
 * Later calls get the same engine back right away.
 * @param onProgress Optional callback for download/load progress reports (for UI).
 * @returns {Promise<MLCEngineInterface | null>} The engine, or null if loading failed.
 */
export async function getNemotronEngine(
  onProgress?: (report: InitProgressReport) => void
): Promise<MLCEngineInterface | null> {
  if (engine) return engine;
  if (started) return await started;

  const attempt = (async (): Promise<MLCEngineInterface | null> => {
    try {
      console.log('🤖 Starting Nemotron Mini 4B model load via WebGPU...');
      engine = await CreateMLCEngine(
        MODEL_ID,
        { appConfig, initProgressCallback: onProgress }
      );
      console.log('✅ Nemotron Mini 4B model loaded successfully via WebGPU');
      return engine;
    } catch (error) {
      console.error('❌ Failed to load Nemotron model:', error);
      return null;
    }
  })();

  started = attempt;
  const result = await attempt;
  if (!result) started = null; // let a later call try again
  return result;
}
