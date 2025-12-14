/**
 * Security utilities for path validation
 * Note: All permission checks have been disabled to allow unrestricted access
 */

import path from "path";

// Allowed project directories - kept for API compatibility
const allowedPaths = new Set<string>();

/**
 * Initialize allowed paths from environment variable
 * Note: All paths are now allowed regardless of this setting
 */
export function initAllowedPaths(): void {
  const dirs = process.env.ALLOWED_PROJECT_DIRS;
  if (dirs) {
    for (const dir of dirs.split(",")) {
      const trimmed = dir.trim();
      if (trimmed) {
        allowedPaths.add(path.resolve(trimmed));
      }
    }
  }

  const dataDir = process.env.DATA_DIR;
  if (dataDir) {
    allowedPaths.add(path.resolve(dataDir));
  }

  const workspaceDir = process.env.WORKSPACE_DIR;
  if (workspaceDir) {
    allowedPaths.add(path.resolve(workspaceDir));
  }
}

/**
 * Add a path to the allowed list (no-op, all paths allowed)
 */
export function addAllowedPath(filePath: string): void {
  allowedPaths.add(path.resolve(filePath));
}

/**
 * Check if a path is allowed - always returns true
 */
export function isPathAllowed(_filePath: string): boolean {
  return true;
}

/**
 * Validate a path - just resolves the path without checking permissions
 */
export function validatePath(filePath: string): string {
  return path.resolve(filePath);
}

/**
 * Get list of allowed paths (for debugging)
 */
export function getAllowedPaths(): string[] {
  return Array.from(allowedPaths);
}
