/**
 * CommitMessageService - Reusable AI commit message generation
 *
 * Extracts the diff-collection and AI generation logic that powers the
 * POST /worktree/generate-commit-message endpoint so it can be reused by other
 * server flows (e.g. auto-mode auto-commit on verified) without going through HTTP.
 *
 * Uses the configured model (via phaseModels.commitMessageModel) to generate a
 * concise, conventional commit message from git changes. Defaults to Claude Haiku
 * for speed.
 */

import { execFile } from 'child_process';
import { promisify } from 'util';
import { createLogger } from '@automaker/utils';
import { isCursorModel, stripProviderPrefix } from '@automaker/types';
import { resolvePhaseModel } from '@automaker/model-resolver';
import { mergeCommitMessagePrompts } from '@automaker/prompts';
import { ProviderFactory } from '../providers/provider-factory.js';
import type { SettingsService } from './settings-service.js';
import { getPhaseModelWithOverrides } from '../lib/settings-helpers.js';

const logger = createLogger('CommitMessageService');
const execFileAsync = promisify(execFile);

/** Default timeout for AI provider calls in milliseconds (30 seconds) */
export const DEFAULT_COMMIT_MESSAGE_TIMEOUT_MS = 30_000;

/** Max diff characters sent to the model to avoid token limits */
const MAX_DIFF_CHARS = 10000;

/** Max buffer for git diff output (5MB) */
const GIT_DIFF_MAX_BUFFER = 1024 * 1024 * 5;

export interface GenerateCommitMessageOptions {
  /** Project path used to resolve per-project phase model overrides (defaults to workDir) */
  projectPath?: string;
  /** Timeout for the AI provider call in milliseconds */
  timeoutMs?: number;
}

/**
 * Wraps an async generator with a timeout.
 * If the generator takes longer than the timeout, it throws an error.
 */
async function* withTimeout<T>(
  generator: AsyncIterable<T>,
  timeoutMs: number
): AsyncGenerator<T, void, unknown> {
  let timerId: ReturnType<typeof setTimeout> | undefined;

  const timeoutPromise = new Promise<never>((_, reject) => {
    timerId = setTimeout(
      () => reject(new Error(`AI provider timed out after ${timeoutMs}ms`)),
      timeoutMs
    );
  });

  const iterator = generator[Symbol.asyncIterator]();
  let done = false;

  try {
    while (!done) {
      const result = await Promise.race([iterator.next(), timeoutPromise]).catch(async (err) => {
        // Capture the original error, then attempt to close the iterator.
        // If iterator.return() throws, log it but rethrow the original error
        // so the timeout error (not the teardown error) is preserved.
        try {
          await iterator.return?.();
        } catch (teardownErr) {
          logger.warn('Error during iterator cleanup after timeout:', teardownErr);
        }
        throw err;
      });
      if (result.done) {
        done = true;
      } else {
        yield result.value;
      }
    }
  } finally {
    clearTimeout(timerId);
  }
}

/**
 * Get the effective system prompt for commit message generation.
 * Uses custom prompt from settings if enabled, otherwise falls back to default.
 */
async function getSystemPrompt(settingsService?: SettingsService | null): Promise<string> {
  const settings = await settingsService?.getGlobalSettings();
  const prompts = mergeCommitMessagePrompts(settings?.promptCustomization?.commitMessage);
  return prompts.systemPrompt;
}

/**
 * Get the diff to summarize for a commit message.
 *
 * Returns staged changes if any are staged, otherwise unstaged changes.
 * Returns an empty string when the working tree is clean.
 *
 * @param workDir - Working directory of the git repository / worktree
 */
export async function getCommitDiff(workDir: string): Promise<string> {
  // First try to get staged changes
  const { stdout: stagedDiff } = await execFileAsync('git', ['diff', '--cached'], {
    cwd: workDir,
    maxBuffer: GIT_DIFF_MAX_BUFFER,
  });

  if (stagedDiff.trim()) {
    return stagedDiff;
  }

  // If no staged changes, get unstaged changes
  const { stdout: unstagedDiff } = await execFileAsync('git', ['diff'], {
    cwd: workDir,
    maxBuffer: GIT_DIFF_MAX_BUFFER,
  });
  return unstagedDiff;
}

/**
 * Generate a commit message from a diff string using the configured AI model.
 *
 * @param diff - The git diff text to summarize (must be non-empty)
 * @param workDir - Working directory (used as the provider cwd)
 * @param settingsService - Settings service for model/prompt resolution
 * @param options - Optional project path (for phase-model overrides) and timeout
 * @returns The trimmed commit message, or null if generation produced no output
 */
export async function generateCommitMessageFromDiffText(
  diff: string,
  workDir: string,
  settingsService?: SettingsService | null,
  options?: GenerateCommitMessageOptions
): Promise<string | null> {
  if (!diff.trim()) {
    return null;
  }

  const timeoutMs = options?.timeoutMs ?? DEFAULT_COMMIT_MESSAGE_TIMEOUT_MS;

  // Truncate diff if too long to avoid token limits
  const truncatedDiff =
    diff.length > MAX_DIFF_CHARS
      ? diff.substring(0, MAX_DIFF_CHARS) + '\n\n[... diff truncated ...]'
      : diff;

  const userPrompt = `Generate a commit message for these changes:\n\n\`\`\`diff\n${truncatedDiff}\n\`\`\``;

  // Get model from phase settings with provider info
  const {
    phaseModel: phaseModelEntry,
    provider: claudeCompatibleProvider,
    credentials,
  } = await getPhaseModelWithOverrides(
    'commitMessageModel',
    settingsService,
    options?.projectPath ?? workDir,
    '[CommitMessageService]'
  );
  const { model, thinkingLevel } = resolvePhaseModel(phaseModelEntry);

  logger.info(
    `Using model for commit message: ${model}`,
    claudeCompatibleProvider ? `via provider: ${claudeCompatibleProvider.name}` : 'direct API'
  );

  // Get the effective system prompt (custom or default)
  const systemPrompt = await getSystemPrompt(settingsService);

  // Get provider for the model type
  const aiProvider = ProviderFactory.getProviderForModel(model);
  const bareModel = stripProviderPrefix(model);

  // For Cursor models, combine prompts since Cursor doesn't support systemPrompt separation
  const effectivePrompt = isCursorModel(model) ? `${systemPrompt}\n\n${userPrompt}` : userPrompt;
  const effectiveSystemPrompt = isCursorModel(model) ? undefined : systemPrompt;

  let responseText = '';
  const stream = aiProvider.executeQuery({
    prompt: effectivePrompt,
    model: bareModel,
    cwd: workDir,
    systemPrompt: effectiveSystemPrompt,
    maxTurns: 1,
    allowedTools: [],
    readOnly: true,
    thinkingLevel,
    claudeCompatibleProvider,
    credentials,
  });

  // Wrap with timeout to prevent indefinite hangs
  for await (const msg of withTimeout(stream, timeoutMs)) {
    if (msg.type === 'assistant' && msg.message?.content) {
      for (const block of msg.message.content) {
        if (block.type === 'text' && block.text) {
          responseText += block.text;
        }
      }
    } else if (msg.type === 'result' && msg.subtype === 'success' && msg.result) {
      // Use result text if longer than accumulated text (consistent with simpleQuery pattern)
      if (msg.result.length > responseText.length) {
        responseText = msg.result;
      }
    }
  }

  const message = responseText.trim();
  return message || null;
}

/**
 * Convenience helper: collect the working-tree diff and generate a commit message.
 *
 * @param workDir - Working directory of the git repository / worktree
 * @param settingsService - Settings service for model/prompt resolution
 * @param options - Optional project path (for phase-model overrides) and timeout
 * @returns The trimmed commit message, or null if there are no changes or
 *          generation produced no output.
 */
export async function generateCommitMessage(
  workDir: string,
  settingsService?: SettingsService | null,
  options?: GenerateCommitMessageOptions
): Promise<string | null> {
  const diff = await getCommitDiff(workDir);
  if (!diff.trim()) {
    return null;
  }
  return generateCommitMessageFromDiffText(diff, workDir, settingsService, options);
}
