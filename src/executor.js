'use strict';

const fs = require('fs');
const path = require('path');
const trash = require('trash');

function ensureDir(dirPath) {
  if (!fs.existsSync(dirPath)) fs.mkdirSync(dirPath, { recursive: true });
}

// Move a file to destRoot, preserving its relative path from the drive root.
// Falls back to copy+delete for cross-device moves (e.g. C: -> H:).
function moveFile(src, destRoot) {
  try {
    // Strip leading drive letter or slash to get a relative path
    const rel = src.replace(/^([A-Za-z]:[/\\]|\/+)/, '');
    const dest = path.join(destRoot, rel);
    const destDir = path.dirname(dest);
    ensureDir(destDir);

    try {
      // Fast path: same device rename
      fs.renameSync(src, dest);
    } catch (renameErr) {
      if (renameErr.code === 'EXDEV') {
        // Cross-device: copy then delete
        fs.copyFileSync(src, dest);
        fs.unlinkSync(src);
      } else {
        throw renameErr;
      }
    }
    return { ok: true };
  } catch (err) {
    return { ok: false, reason: err.message };
  }
}

function deleteFile(filePath) {
  try {
    fs.unlinkSync(filePath);
    return { ok: true };
  } catch (err) {
    return { ok: false, reason: err.message };
  }
}

function deleteDir(dirPath) {
  try {
    fs.rmSync(dirPath, { recursive: true, force: true });
    return { ok: true };
  } catch (err) {
    return { ok: false, reason: err.message };
  }
}

async function trashPath(targetPath) {
  try {
    await trash([targetPath]);
    return { ok: true };
  } catch (err) {
    return { ok: false, reason: err.message };
  }
}

// Run all operations with per-item callbacks.
// items: Array<{ path, size }>
// action: 'delete' | 'move'
// isDir: boolean
// opts: { destRoot, dryRun, forceDelete, logger, onItem(result) }
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
        result = moveFile(item.path, destRoot);
      }
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

module.exports = { execute, moveFile, deleteFile, deleteDir };
