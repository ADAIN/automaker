/**
 * POST /worktree/generate-commit-message endpoint - Generate an AI commit message from git diff
 *
 * Uses the configured model (via phaseModels.commitMessageModel) to generate a concise,
 * conventional commit message from git changes. Defaults to Claude Haiku for speed.
 *
 * The diff-collection and AI generation logic lives in CommitMessageService so it can be
 * shared with other server flows (e.g. auto-mode auto-commit on verified).
 */

import type { Request, Response } from 'express';
import { existsSync } from 'fs';
import { join } from 'path';
import { createLogger } from '@automaker/utils';
import type { SettingsService } from '../../../services/settings-service.js';
import { getErrorMessage, logError } from '../common.js';
import {
  getCommitDiff,
  generateCommitMessageFromDiffText,
} from '../../../services/commit-message-service.js';

const logger = createLogger('GenerateCommitMessage');

interface GenerateCommitMessageRequestBody {
  worktreePath: string;
}

interface GenerateCommitMessageSuccessResponse {
  success: true;
  message: string;
}

interface GenerateCommitMessageErrorResponse {
  success: false;
  error: string;
}

export function createGenerateCommitMessageHandler(
  settingsService?: SettingsService
): (req: Request, res: Response) => Promise<void> {
  return async (req: Request, res: Response): Promise<void> => {
    try {
      const { worktreePath } = req.body as GenerateCommitMessageRequestBody;

      if (!worktreePath || typeof worktreePath !== 'string') {
        const response: GenerateCommitMessageErrorResponse = {
          success: false,
          error: 'worktreePath is required and must be a string',
        };
        res.status(400).json(response);
        return;
      }

      // Validate that the directory exists
      if (!existsSync(worktreePath)) {
        const response: GenerateCommitMessageErrorResponse = {
          success: false,
          error: 'worktreePath does not exist',
        };
        res.status(400).json(response);
        return;
      }

      // Validate that it's a git repository (check for .git folder or file for worktrees)
      const gitPath = join(worktreePath, '.git');
      if (!existsSync(gitPath)) {
        const response: GenerateCommitMessageErrorResponse = {
          success: false,
          error: 'worktreePath is not a git repository',
        };
        res.status(400).json(response);
        return;
      }

      logger.info(`Generating commit message for worktree: ${worktreePath}`);

      // Get git diff of staged and unstaged changes
      let diff = '';
      try {
        diff = await getCommitDiff(worktreePath);
      } catch (error) {
        logger.error('Failed to get git diff:', error);
        const response: GenerateCommitMessageErrorResponse = {
          success: false,
          error: 'Failed to get git changes',
        };
        res.status(500).json(response);
        return;
      }

      if (!diff.trim()) {
        const response: GenerateCommitMessageErrorResponse = {
          success: false,
          error: 'No changes to commit',
        };
        res.status(400).json(response);
        return;
      }

      const message = await generateCommitMessageFromDiffText(diff, worktreePath, settingsService);

      if (!message) {
        logger.warn('Received empty response from model');
        const response: GenerateCommitMessageErrorResponse = {
          success: false,
          error: 'Failed to generate commit message - empty response',
        };
        res.status(500).json(response);
        return;
      }

      logger.info(`Generated commit message: ${message.substring(0, 100)}...`);

      const response: GenerateCommitMessageSuccessResponse = {
        success: true,
        message,
      };
      res.json(response);
    } catch (error) {
      logError(error, 'Generate commit message failed');
      const response: GenerateCommitMessageErrorResponse = {
        success: false,
        error: getErrorMessage(error),
      };
      res.status(500).json(response);
    }
  };
}
