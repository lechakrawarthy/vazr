'use strict';

const fs = require('fs');
const path = require('path');
const _trashModule = require('trash');
const trash = _trashModule.default || _trashModule;

function ensureDir(dirPath) {
  if (!fs.existsSync(dirPath)) fs.mkdirSync(dirPath, { recursive: true });
}

/**
 * Move a file or directory to destRoot, preserving its relative path from the drive root.
 * Falls back to copy+delete for cross-device moves (e.g. C: → H:).
 * @param {string} src - Source path
 * @param {string} destRoot - Destination root directory
 * @param {boolean} isDir - Whether src is a directory
 * @returns {{ ok: boolean, reason?: string }}
 */
function movePath(src, destRoot, isDir) {
  try {
    // Strip leading drive letter or slash to get a relative path
    const rel = src.replace(/^([A-Za-z]:[/\\]|\/+)/, '');
    const dest = path.join(destRoot, rel);
    ensureDir(isDir ? dest : path.dirname(dest));

    try {
      // Fast path: same device rename (works for both files and directories)
      fs.renameSync(src, dest);
    } catch (renameErr) {
      if (renameErr.code === 'EXDEV') {
        // Cross-device: copy then delete
        if (isDir) {
          fs.cpSync(src, dest, { recursive: true });
          fs.rmSync(src, { recursive: true, force: true });
        } else {
          fs.copyFileSync(src, dest);
          fs.unlinkSync(src);
        }
      } else {
        throw renameErr;
      }
    }
    return { ok: true };
  } catch (err) {
    return { ok: false, reason: err.message };
  }
}

/**
 * Permanently delete a single file.
 * @param {string} filePath
 * @returns {{ ok: boolean, reason?: string }}
 */
function deleteFile(filePath) {
  try {
    fs.unlinkSync(filePath);
    return { ok: true };
  } catch (err) {
    return { ok: false, reason: err.message };
  }
}

/**
 * Permanently delete a directory and all its contents.
 * @param {string} dirPath
 * @returns {{ ok: boolean, reason?: string }}
 */
function deleteDir(dirPath) {
  try {
    fs.rmSync(dirPath, { recursive: true, force: true });
    return { ok: true };
  } catch (err) {
    return { ok: false, reason: err.message };
  }
}

/**
 * Move a path to the OS trash/recycle bin (safe delete).
 * @param {string} targetPath
 * @returns {Promise<{ ok: boolean, reason?: string }>}
 */
async function trashPath(targetPath) {
  try {
    await trash([targetPath]);
    return { ok: true };
  } catch (err) {
    return { ok: false, reason: err.message };
  }
}

/**
 * Execute a batch of file operations with per-item progress callbacks.
 * @param {Array<{path: string, size: number}>} items
 * @param {'delete' | 'move'} action
 * @param {boolean} isDir - Whether items are directories
 * @param {{ destRoot?: string, dryRun?: boolean, forceDelete?: boolean, logger?: object, onItem?: (r: object) => void }} opts
 * @returns {Promise<{ done: number, skipped: number }>}
 */
async function execute(items, action, isDir, opts = {}) {
  const { destRoot, dryRun = false, forceDelete = false, logger, onItem } = opts;
  let done = 0; let skipped = 0;

  for (const item of items) {
    let result;

    if (dryRun) {
      result = { ok: true, dryRun: true };
    } else if (action === 'delete') {
      // Default behavior is safe delete via OS recycle bin/trash.
      result = forceDelete
        ? (isDir ? deleteDir(item.path) : deleteFile(item.path))
        : await trashPath(item.path);
    } else if (action === 'move') {
      if (!destRoot) {
        result = { ok: false, reason: 'No destination drive set' };
      } else {
        result = movePath(item.path, destRoot, isDir);
      }
    } else {
      result = { ok: false, reason: 'Unknown action: ' + action };
    }

    if (result.ok) done++;
    else skipped++;

    if (logger && !result.ok) {
      logger.warn('item_failed', {
        path: item.path,
        action,
        reason: result.reason || 'unknown',
      });
    }

    if (onItem) onItem({ item, result, done, skipped });
  }

  return { done, skipped };
}

module.exports = { execute, movePath, deleteFile, deleteDir };
