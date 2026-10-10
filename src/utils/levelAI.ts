/**
 * Ask Nebius for small nudges to the platform positions of the level, and for a new order
 * of the sections the level marks as shufflable. Everything here is defensive: a bad key,
 * no network, invalid JSON or an unsafe layout all return null, and the handcrafted level
 * stays exactly as it was.
 */

/** The Nebius key, hardcoded in source for the MVP. */
export const NEBIUS_API_KEY = "v1.CmMKHHN0YXRpY2tleS1lMDBzYTZjYnNiYzBzcTZtdzASIXNlcnZpY2VhY2NvdW50LWUwMG5jNTIyeXJ6YjBwaGhiNDIMCIyu5dUGENawz74COgsIjLH9oAcQgIqoN0ACWgNlMDA.AAAAAAAAAAFVOZqoSCGvhe9QL8cq-iDYDSX8Md64RNFsUkLOLYJGKKibKbF3jeNhpbXzWOlgioB5pL3-zeqIVTRBf6ANngUE";

const ENDPOINT = "https://api.tokenfactory.nebius.com/v1/chat/completions";
const MODEL = "nvidia/NVIDIA-Nemotron-3-Nano-30B-A3B";
/** The model answers this prompt in about 8 seconds once its internal thinking is switched off. */
const TIMEOUT_MS = 20000;

/** What the last attempt did, so a fallback can be told apart from a rejected proposal. */
export const lastAttempt = { ok: false, httpStatus: 0, ms: 0, reason: 'not attempted' };

/** A single jump clears about this much up and across (world units). */
const MAX_RISE = 1.6;
/** Exported so the level can also keep the spacing of a shuffled chapter within it. */
export const MAX_GAP = 3.6;
/** The biggest drop the route may ask of a jump (falling is forgiving, but not bottomless). */
const MAX_DROP = 6;

/**
 * Margins used when OFFERING orders to the model. A jump that uses only this much of the
 * rise and gap leaves real slack on the landing, so the chapter is comfortable to play, not
 * just barely clearable. The hard limits above still guard the final layout.
 */
const COMFORT_RISE = 1.0;
const COMFORT_GAP = 2.2;

/** One platform, as the level hands it over: where it is, what you can walk on, and how far it may move. */
export interface LayoutPieceSpec {
  id: string;
  label: string;
  x: number;
  y: number;
  /** World x of the left and right edge of the walkable part of the top, at rest. */
  walkLeft: number;
  walkRight: number;
  /** Height of the first standing spot, at rest. */
  standY: number;
  /** How far the piece may be nudged (0..0 means "do not move"). */
  dxMin: number;
  dxMax: number;
  dyMin: number;
  dyMax: number;
  /** How far it drifts on its own while the game runs (0 for still pieces). */
  driftX: number;
  driftY: number;
  /** False platforms vanish as you get close: skip them when checking the jump chain. */
  walkable: boolean;
  /** Sections the model may put in a different order along the route. */
  reorderable: boolean;
}

/** The nudges the model asked for, per piece id. */
type Nudges = Map<string, { dx: number; dy: number }>;

/** Round to 2 decimals so the model's output stays tidy and comparable. */
const round2 = (v: number) => Math.round(v * 100) / 100;
const clampTo = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

/** The jump chain checked with the given rise and gap limits; drops always use MAX_DROP. */
function chainClear(specs: LayoutPieceSpec[], at: Map<string, { x: number; y: number }>, maxRise: number, maxGap: number) {
  const chain = specs
    .filter((s) => s.walkable)
    .map((s) => {
      const p = at.get(s.id) ?? { x: s.x, y: s.y };
      const dx = p.x - s.x;
      const dy = p.y - s.y;
      return {
        left: s.walkLeft + dx,
        right: s.walkRight + dx + s.driftX,
        standMin: s.standY + dy,
        standMax: s.standY + dy + s.driftY
      };
    })
    .sort((a, b) => a.left - b.left);
  for (let i = 1; i < chain.length; i += 1) {
    const a = chain[i - 1];
    const b = chain[i];
    if (b.left - a.right > maxGap) return false;
    if (b.standMin - a.standMax > maxRise) return false;
    if (a.standMin - b.standMax > MAX_DROP) return false;
  }
  return true;
}

/**
 * Whether the route is still clearable: for every pair of neighbours on the route (left to
 * right, false platforms skipped), the far edge of one and the near edge of the next must be
 * within a single jump, counting how far each piece drifts on its own. `at` is where each
 * piece ends up for this page load; pieces not in it stay where they were built. The route
 * is walked by final position, so a shuffled chapter is checked in its new order.
 */
export function isClearable(specs: LayoutPieceSpec[], at: Map<string, { x: number; y: number }>) {
  return chainClear(specs, at, MAX_RISE, MAX_GAP);
}

/**
 * Where the shufflable sections end up when the route puts them in `order`: evenly spaced
 * between the two fixed neighbours that hold the chapter together, each keeping its own
 * height. Null means the spacing would be unsafe.
 */
export function placeOrder(specs: LayoutPieceSpec[], order: string[]): Map<string, number> | null {
  const group: LayoutPieceSpec[] = [];
  for (const id of order) {
    const spec = specs.find((s) => s.id === id);
    if (spec === undefined || !spec.reorderable) return null;
    group.push(spec);
  }
  const anchors = specs.filter((s) => !s.reorderable && s.walkable);
  const minX = Math.min(...group.map((s) => s.x));
  const maxX = Math.max(...group.map((s) => s.x));
  const before = anchors.filter((s) => s.x < minX).pop();
  const after = anchors.filter((s) => s.x > maxX)[0];
  if (!before || !after) return null;
  const widths = group.map((s) => s.walkRight - s.walkLeft);
  const gap = (after.walkLeft - before.walkRight - widths.reduce((sum, w) => sum + w, 0)) / (group.length + 1);
  if (gap < 0.8 || gap > MAX_GAP) return null;
  const placed = new Map<string, number>();
  let cursor = before.walkRight + gap;
  group.forEach((s) => {
    placed.set(s.id, cursor - (s.walkLeft - s.x)); // keep the walkable edge where the cursor says
    cursor += s.walkRight - s.walkLeft + gap;
  });
  return placed;
}

/**
 * Orders of the shufflable sections the ninja can walk comfortably, at the handcrafted
 * heights: every jump uses only part of the rise and gap, so landings have real slack
 * instead of asking for frame-perfect hops. A small model almost never gets this
 * constraint right on its own, so the level offers a few safe orders and the model only
 * chooses among them. The handcrafted order is left out, so a chosen order always
 * changes how the chapter reads.
 */
function safeOrders(specs: LayoutPieceSpec[], wanted = 6): string[][] {
  const group = specs.filter((s) => s.reorderable);
  if (group.length < 2) return [];
  const identity = group.map((s) => s.id).join(",");
  const found: string[][] = [];
  const seen = new Set<string>();
  const perm = identity.split(",");
  for (let tries = 0; tries < 5000 && found.length < wanted; tries += 1) {
    for (let i = perm.length - 1; i > 0; i -= 1) {
      const j = Math.floor(Math.random() * (i + 1));
      const swap = perm[i];
      perm[i] = perm[j];
      perm[j] = swap;
    }
    const key = perm.join(",");
    if (key === identity || seen.has(key)) continue;
    seen.add(key);
    const placed = placeOrder(specs, perm);
    if (placed === null) continue;
    const at = new Map<string, { x: number; y: number }>();
    specs.forEach((s) => at.set(s.id, { x: s.x, y: s.y }));
    placed.forEach((x, id) => {
      const s = specs.find((q) => q.id === id) as LayoutPieceSpec;
      at.set(id, { x, y: s.y });
    });
    if (chainClear(specs, at, COMFORT_RISE, COMFORT_GAP)) found.push(perm.slice());
  }
  return found;
}

/** Ask the model for nudges and a section order; null means "keep the handcrafted layout". */
export async function proposeLayout(specs: LayoutPieceSpec[]): Promise<{ nudges: Nudges; order: string[] | null } | null> {
  const movable = specs.filter((s) => s.dxMax > s.dxMin || s.dyMax > s.dyMin);
  if (movable.length === 0) return null;
  const shuffleable = specs.filter((s) => s.reorderable);
  // A small model rarely picks a walkable order on its own, so the level works out a few
  // orders the ninja can actually walk and the model only chooses among them.
  const candidates = safeOrders(specs);

  const listing = movable
    .map((s) => `${s.id}: ${s.label} at x=${s.x}, y=${s.y}; nudge x by ${s.dxMin}..${s.dxMax}, y by ${s.dyMin}..${s.dyMax}`)
    .join("\n");
  const prompt = [
    "You are arranging platforms in a 2D platformer. A single jump clears about 1.6 units up and 3.6 units across.",
    "Here are the platforms that may move, with the ranges they may be nudged by:",
    listing,
    candidates.length === 0 ? "" : [
      "The chapter between the start rooftop and the first checkpoint may also be walked in a different order. Every order below is one the ninja can walk with room to spare on every jump:",
      shuffleable.map((s) => `${s.id}: ${s.label}: you stand at y=${s.standY}, and it can rise to y=${round2(s.standY + s.driftY)}`).join("\n"),
      candidates.map((c, i) => `${i + 1}: ${c.join(", ")}`).join("\n"),
      "Choose one of those orders and put its number in \"pick\". Never invent an order of your own.",
      ""
    ].join("\n"),
    "Suggest small nudges that make the level feel different while keeping every jump between neighbouring platforms (left to right) clearable with a single jump, counting the drift some platforms do on their own.",
    'Reply with ONLY a JSON object like {"nudges":{"3":{"dx":1.2,"dy":-0.4}},"pick":2}. No other text.'
  ].join("\n");

  const startedAt = Date.now();
  try {
    const abort = new AbortController();
    const timer = setTimeout(() => abort.abort(), TIMEOUT_MS);
    const response = await fetch(
      ENDPOINT,
      {
        method: "POST",
        signal: abort.signal,
        body: JSON.stringify({
          model: MODEL,
          temperature: 0.9,
          // This model is a "thinking" model: left to itself it writes thousands of reasoning
          // tokens before the JSON, which makes the call take 20-70 seconds and the browser
          // gives up on it. Turning thinking off answers the same prompt in about 8 seconds.
          chat_template_kwargs: { enable_thinking: false },
          messages: [{ role: "user", content: prompt }]
        }),
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${NEBIUS_API_KEY}`
        }
      }
    );
    const text = await response.text();
    clearTimeout(timer);
    lastAttempt.ms = Date.now() - startedAt;
    lastAttempt.httpStatus = response.status;
    if (!response.ok) {
      lastAttempt.reason = `the API said ${response.status}`;
      return null;
    }

    let content: unknown;
    try {
      content = (JSON.parse(text) as { choices?: { message?: { content?: string } }[] }).choices?.[0]?.message?.content;
    } catch {
      lastAttempt.reason = 'the API did not send back JSON';
      return null;
    }
    if (typeof content !== "string") {
      lastAttempt.reason = 'the model said nothing';
      return null;
    }

    // Models like to wrap JSON in code fences or a sentence: take the outermost object.
    const start = content.indexOf("{");
    const end = content.lastIndexOf("}");
    if (start === -1 || end <= start) {
      lastAttempt.reason = 'the model answer held no JSON object';
      return null;
    }
    let parsed: unknown = null;
    const broken = content.slice(start, end + 1);
    try {
      parsed = JSON.parse(broken);
    } catch {
      // Small models sometimes drop a closing brace at the very end: close what is open
      // and try again before giving up.
      let open = 0;
      for (const ch of broken) {
        if (ch === "{") open += 1;
        else if (ch === "}") open -= 1;
      }
      const closed = broken + "}".repeat(Math.max(0, open));
      try {
        parsed = JSON.parse(closed);
      } catch {
        lastAttempt.reason = 'the model answer was not valid JSON';
        return null;
      }
    }
    if (typeof parsed !== "object" || Array.isArray(parsed)) {
      lastAttempt.reason = 'the model answer was not a list of nudges';
      return null;
    }
    const answer = parsed as Record<string, unknown>;
    const rawNudges = answer["nudges"];
    if (typeof rawNudges !== "object" || Array.isArray(rawNudges)) {
      lastAttempt.reason = 'the model answer was not a list of nudges';
      return null;
    }

    const nudges = new Map<string, { dx: number; dy: number }>();
    for (const spec of specs) {
      const raw = (rawNudges as Record<string, unknown>)[spec.id];
      const dx = typeof raw === "object" && typeof (raw as { dx?: unknown }).dx === "number" ? (raw as { dx: number }).dx : 0;
      const dy = typeof raw === "object" && typeof (raw as { dy?: unknown }).dy === "number" ? (raw as { dy: number }).dy : 0;
      nudges.set(spec.id, { dx: round2(clampTo(dx, spec.dxMin, spec.dxMax)), dy: round2(clampTo(dy, spec.dyMin, spec.dyMax)) });
    }

    // The model only chooses among the walkable orders the level offered.
    let order: string[] | null = null;
    if (candidates.length > 0) {
      const pick = answer["pick"];
      const picked = typeof pick === "number" ? pick : typeof pick === "string" ? Number(pick) : Number.NaN;
      if (Number.isFinite(picked)) {
        const index = Math.trunc(picked) - 1;
        if (index >= 0 && index < candidates.length) order = candidates[index];
      }
      if (order === null && Array.isArray(answer["order"])) {
        // Some models answer with the order itself; accept it only if it is one of the
        // walkable orders the level offered.
        const ids = (answer["order"] as unknown[]).map((v) => typeof v === "string" ? v : typeof v === "number" ? String(v) : "");
        for (const candidate of candidates) {
          if (ids.length === candidate.length && candidate.every((id, i) => ids[i] === id)) {
            order = candidate;
            break;
          }
        }
      }
    }

    const at = new Map<string, { x: number; y: number }>();
    specs.forEach((s) => {
      const n = nudges.get(s.id) ?? { dx: 0, dy: 0 };
      at.set(s.id, { x: s.x + n.dx, y: s.y + n.dy });
    });
    if (!isClearable(specs, at)) {
      lastAttempt.reason = 'the proposal asked for a jump the ninja cannot make';
      return null;
    }
    lastAttempt.ok = true;
    lastAttempt.reason = 'ok';
    return { nudges, order };
  } catch (error) {
    lastAttempt.ms = Date.now() - startedAt;
    lastAttempt.reason =
      error instanceof Error && error.name === 'AbortError' ? `the call took longer than ${TIMEOUT_MS}ms` : 'no network, or the browser refused the call';
    return null;
  }
}
