/**
 * Claude Model Registry — single source of truth for native Anthropic models.
 *
 * This mirrors the data-driven pattern already used by the other providers
 * (`cursor-models.ts`, `gemini-models.ts`, `opencode-models.ts`,
 * `copilot-models.ts`): one config array, and everything else is derived.
 *
 * ┌──────────────────────────────────────────────────────────────────────┐
 * │ TO ADD A NEW CLAUDE MODEL VERSION (e.g. Opus 4.9):                     │
 * │   1. Add ONE entry to CLAUDE_MODEL_DEFS below.                         │
 * │   2. If it should be the new app-wide default, move `isDefault: true`  │
 * │      to it (and `isFamilyLatest: true` if it's the newest of family).  │
 * │ That's it — the server catalog, UI picker, display names, adaptive-    │
 * │ thinking detection and default model all derive from this array.       │
 * └──────────────────────────────────────────────────────────────────────┘
 *
 * NOTE on the alias layer: the short aliases (`opus`/`sonnet`/`haiku`) and
 * canonical IDs (`claude-opus`/`claude-sonnet`/`claude-haiku`) are resolved
 * by CLAUDE_CANONICAL_MAP / CLAUDE_MODEL_MAP in `model.ts`. That mapping is
 * intentionally NOT derived from this registry (it is frozen for backward
 * compatibility — e.g. `claude-opus` resolves to 4.6, not the latest).
 */

/** Claude model family (used for alias resolution and tier grouping) */
export type ClaudeModelFamily = 'haiku' | 'sonnet' | 'opus';

/** Thinking mode: 'adaptive' lets the SDK allocate tokens; 'manual' uses a budget */
export type ClaudeThinkingMode = 'adaptive' | 'manual';

/** UI/pricing tier */
export type ClaudeModelTier = 'premium' | 'standard' | 'basic';

/**
 * ClaudeModelDef — definition of a single Claude model entry.
 */
export interface ClaudeModelDef {
  /** Canonical full model ID sent to the Anthropic API (e.g. 'claude-opus-4-8') */
  id: string;
  /** Model family */
  family: ClaudeModelFamily;
  /** Full display label (e.g. 'Claude Opus 4.8') */
  label: string;
  /** Short display label for compact UI (e.g. 'Opus 4.8') */
  shortLabel: string;
  /** Description shown in model pickers / catalog */
  description: string;
  /** Extended-thinking mode */
  thinkingMode: ClaudeThinkingMode;
  /** Context window in tokens */
  contextWindow: number;
  /** Maximum output tokens */
  maxOutputTokens: number;
  /** UI/pricing tier */
  tier: ClaudeModelTier;
  /** Optional badge shown in the UI picker ('Speed' | 'Balanced' | 'Premium') */
  badge?: string;
  /**
   * Alias-only entry: appears in the UI picker as a generic family choice
   * (e.g. 'Claude Haiku') but is NOT listed in the server model catalog,
   * because it is not a concrete API version.
   */
  aliasOnly?: boolean;
  /** ID stored when this entry is selected in the picker, if different from `id`
   *  (back-compat shim — e.g. Opus 4.6 is stored as the legacy `claude-opus`). */
  pickerId?: string;
  /** Whether this entry appears in the curated UI model picker */
  inPicker?: boolean;
  /** The single app-wide default model */
  isDefault?: boolean;
  /** The newest model of its family (informational; alias map is separate) */
  isFamilyLatest?: boolean;
}

/**
 * The Claude model registry.
 *
 * Order matters: the UI picker preserves this order (Haiku → Sonnet → Opus
 * newest-first), and the server catalog (alias entries removed) likewise.
 */
export const CLAUDE_MODEL_DEFS: ClaudeModelDef[] = [
  // ── Family aliases (picker-only generic choices; auto-track latest) ──
  {
    id: 'claude-haiku',
    family: 'haiku',
    label: 'Claude Haiku',
    // Short label reflects the version this alias resolves to (Haiku 4.5),
    // matching CLAUDE_CANONICAL_MAP['claude-haiku'].
    shortLabel: 'Haiku 4.5',
    description: 'Fast and efficient for simple tasks.',
    thinkingMode: 'manual',
    contextWindow: 200000,
    maxOutputTokens: 8000,
    tier: 'basic',
    badge: 'Speed',
    aliasOnly: true,
    inPicker: true,
  },
  {
    id: 'claude-sonnet',
    family: 'sonnet',
    label: 'Claude Sonnet',
    // Short label reflects the version this alias resolves to (Sonnet 4.6),
    // matching CLAUDE_CANONICAL_MAP['claude-sonnet'].
    shortLabel: 'Sonnet 4.6',
    description: 'Balanced performance with strong reasoning.',
    thinkingMode: 'manual',
    contextWindow: 200000,
    maxOutputTokens: 64000,
    tier: 'standard',
    badge: 'Balanced',
    aliasOnly: true,
    inPicker: true,
  },

  // ── Opus (version-selectable in the picker) ──
  {
    id: 'claude-opus-4-8',
    family: 'opus',
    label: 'Claude Opus 4.8',
    shortLabel: 'Opus 4.8',
    description: 'Most capable model for complex work.',
    thinkingMode: 'adaptive',
    contextWindow: 200000,
    maxOutputTokens: 128000,
    tier: 'premium',
    badge: 'Premium',
    inPicker: true,
    isDefault: true,
    isFamilyLatest: true,
  },
  {
    id: 'claude-opus-4-7',
    family: 'opus',
    label: 'Claude Opus 4.7',
    shortLabel: 'Opus 4.7',
    description: 'Highly capable model for complex work.',
    thinkingMode: 'adaptive',
    contextWindow: 200000,
    maxOutputTokens: 128000,
    tier: 'premium',
    badge: 'Premium',
    inPicker: true,
  },
  {
    id: 'claude-opus-4-6',
    // Stored as the legacy canonical alias `claude-opus` for backward
    // compatibility (existing selections persist; CLAUDE_CANONICAL_MAP
    // resolves `claude-opus` → `claude-opus-4-6`).
    pickerId: 'claude-opus',
    family: 'opus',
    label: 'Claude Opus 4.6',
    shortLabel: 'Opus 4.6',
    description: 'Previous-generation Opus for complex work.',
    thinkingMode: 'adaptive',
    contextWindow: 200000,
    maxOutputTokens: 128000,
    tier: 'premium',
    badge: 'Premium',
    inPicker: true,
  },

  // ── Catalog-only concrete versions (server model list; not in picker) ──
  {
    id: 'claude-sonnet-4-6',
    family: 'sonnet',
    label: 'Claude Sonnet 4.6',
    shortLabel: 'Sonnet 4.6',
    description: 'Balanced performance and cost with enhanced reasoning',
    thinkingMode: 'manual',
    contextWindow: 200000,
    maxOutputTokens: 64000,
    tier: 'standard',
    isFamilyLatest: true,
  },
  {
    id: 'claude-sonnet-4-20250514',
    family: 'sonnet',
    label: 'Claude Sonnet 4',
    shortLabel: 'Sonnet 4',
    description: 'Balanced performance and cost',
    thinkingMode: 'manual',
    contextWindow: 200000,
    maxOutputTokens: 16000,
    tier: 'standard',
  },
  {
    id: 'claude-3-5-sonnet-20241022',
    family: 'sonnet',
    label: 'Claude 3.5 Sonnet',
    shortLabel: 'Sonnet 3.5',
    description: 'Fast and capable',
    thinkingMode: 'manual',
    contextWindow: 200000,
    maxOutputTokens: 8000,
    tier: 'standard',
  },
  {
    id: 'claude-haiku-4-5-20251001',
    family: 'haiku',
    label: 'Claude Haiku 4.5',
    shortLabel: 'Haiku 4.5',
    description: 'Fastest Claude model',
    thinkingMode: 'manual',
    contextWindow: 200000,
    maxOutputTokens: 8000,
    tier: 'basic',
  },
];

/**
 * Concrete model catalog (excludes generic family aliases).
 * This is what the server's ClaudeProvider exposes as available models.
 */
export const CLAUDE_CATALOG_MODELS: ClaudeModelDef[] = CLAUDE_MODEL_DEFS.filter(
  (m) => !m.aliasOnly
);

/**
 * Curated list shown in the UI model picker (preserves registry order).
 */
export const CLAUDE_PICKER_MODELS: ClaudeModelDef[] = CLAUDE_MODEL_DEFS.filter((m) => m.inPicker);

/**
 * The single app-wide default Claude model ID (e.g. 'claude-opus-4-8').
 */
export function getDefaultClaudeModelId(): string {
  const def = CLAUDE_MODEL_DEFS.find((m) => m.isDefault);
  // Fallback to the first catalog model if no default is flagged (shouldn't happen).
  return def?.id ?? CLAUDE_CATALOG_MODELS[0]?.id ?? 'claude-opus-4-8';
}

/** Strip the leading `claude-` so substring matching also catches prefixed
 *  variants (e.g. a Cursor 'cursor-opus-4-6' or provider model IDs). */
function versionToken(id: string): string {
  return id.startsWith('claude-') ? id.slice('claude-'.length) : id;
}

/**
 * Find a registry definition for a model string by EXACT canonical `id` or
 * `pickerId`. (Intentionally exact: substring matching lives in the short-label
 * helper, where matching prefixed variants like 'cursor-opus-4-6' is desired.)
 */
export function findClaudeModelDef(model: string | undefined | null): ClaudeModelDef | undefined {
  if (!model || typeof model !== 'string') return undefined;
  for (const def of CLAUDE_MODEL_DEFS) {
    if (def.id === model || def.pickerId === model) return def;
  }
  return undefined;
}

/**
 * Full display label for a Claude model (e.g. 'Claude Opus 4.8'),
 * or undefined if `model` is not a recognizable native Claude model.
 * Uses exact + `claude-`-prefixed family matching (does NOT claim
 * prefixed third-party variants such as 'cursor-opus-4-6').
 */
export function getClaudeModelLabel(model: string | undefined | null): string | undefined {
  if (!model || typeof model !== 'string') return undefined;
  const def = findClaudeModelDef(model);
  if (def) return def.label;
  // Bare legacy aliases.
  if (model === 'opus' || model === 'claude-opus') return 'Claude Opus 4.6';
  if (model === 'sonnet' || model === 'claude-sonnet') return 'Claude Sonnet';
  if (model === 'haiku' || model === 'claude-haiku') return 'Claude Haiku';
  // Older/partial native Claude IDs (e.g. 'claude-haiku-4-5') → generic family label.
  if (model.startsWith('claude-haiku')) return 'Claude Haiku';
  if (model.startsWith('claude-sonnet')) return 'Claude Sonnet';
  if (model.startsWith('claude-opus')) return 'Claude Opus';
  return undefined;
}

/**
 * Short display label for a Claude model (e.g. 'Opus 4.8'), with legacy
 * fallbacks preserved, or undefined if not a Claude model. Uses substring
 * matching so prefixed variants resolve too (e.g. 'cursor-opus-4-6' → 'Opus 4.6').
 */
export function getClaudeShortLabel(model: string | undefined | null): string | undefined {
  if (!model || typeof model !== 'string') return undefined;
  const def = findClaudeModelDef(model);
  if (def) return def.shortLabel;
  // Substring match against concrete versions (catalog), newest-first.
  for (const m of CLAUDE_CATALOG_MODELS) {
    if (model.includes(versionToken(m.id))) return m.shortLabel;
  }
  // Legacy fallbacks for unknown/older versions (preserves historical behavior).
  if (model.includes('opus')) return 'Opus 4.5';
  if (model.includes('sonnet')) return 'Sonnet 4.5';
  if (model.includes('haiku')) return 'Haiku 4.5';
  return undefined;
}

/**
 * Whether a model uses adaptive extended thinking (SDK allocates tokens).
 * Uses substring matching so prefixed/provider variants are also detected.
 */
export function isClaudeAdaptiveThinkingModel(model: string | undefined | null): boolean {
  if (!model || typeof model !== 'string') return false;
  if (model === 'claude-opus') return true; // canonical alias → Opus 4.6 (adaptive)
  return CLAUDE_MODEL_DEFS.some(
    (m) => m.thinkingMode === 'adaptive' && model.includes(versionToken(m.id))
  );
}

/**
 * Resolve the Claude family ('opus' | 'sonnet' | 'haiku') for a model string,
 * or undefined if it is not a recognizable native Claude model. Used for
 * tier-based bulk replacement.
 */
export function getClaudeModelFamily(
  model: string | undefined | null
): ClaudeModelFamily | undefined {
  if (!model || typeof model !== 'string') return undefined;
  const def = findClaudeModelDef(model);
  if (def) return def.family;
  if (model === 'opus' || model.startsWith('claude-opus')) return 'opus';
  if (model === 'sonnet' || model.startsWith('claude-sonnet')) return 'sonnet';
  if (model === 'haiku' || model.startsWith('claude-haiku')) return 'haiku';
  return undefined;
}
