'use strict';

const fs = require('fs');
const path = require('path');
const platform = require('./platform');

function debugLog(msg) {
  if (process.env.DEBUG) console.error('[scanner] ' + msg);
}

const ARTIFACT_NAMES = new Set([
  'node_modules', '.cache', 'dist', 'build', '.next', '.nuxt',
  '__pycache__', '.gradle', 'target', '.parcel-cache', 'out',
  '.turbo', '.svelte-kit', '.expo', 'vendor', 'Pods',
]);

const MEDIA_EXTENSIONS = new Set([
  '.mp4', '.mkv', '.avi', '.mov', '.wmv', '.flv',
  '.iso', '.img', '.m4v', '.webm', '.mpg', '.mpeg',
  '.vob', '.ts', '.m2ts',
]);

// ── Core walker ─────────────────────────────────────────────

/**
 * Recursively walk a directory up to maxDepth.
 * Skips symlinks and silently continues past permission errors.
 * @param {string} dir - Directory to walk
 * @param {number} maxDepth - Maximum recursion depth
 * @param {(fullPath: string, stat: import('fs').Stats) => void} onFile - Called for each file
 * @param {((fullPath: string, name: string) => void) | null} onDir - Called before descending into each directory
 * @param {number} [depth=0] - Current depth (internal)
 */
function walk(dir, maxDepth, onFile, onDir, depth = 0) {
  if (depth > maxDepth) return;
  let entries;
  try { entries = fs.readdirSync(dir, { withFileTypes: true }); }
  catch { return; }

  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    try {
      if (entry.isSymbolicLink()) continue;
      if (entry.isDirectory()) {
        if (onDir) onDir(full, entry.name);
        walk(full, maxDepth, onFile, onDir, depth + 1);
      } else if (entry.isFile()) {
        const stat = fs.statSync(full);
        onFile(full, stat);
      }
    } catch (err) {
      if (err.code !== 'EACCES' && err.code !== 'EPERM') {
        debugLog(`unexpected error at ${full}: ${err.code} ${err.message}`);
      }
    }
  }
}

/**
 * Returns the total byte size of all files under a directory (recursive).
 * @param {string} dir
 * @returns {number}
 */
function getDirSize(dir) {
  let total = 0;
  walk(dir, 99, (_f, stat) => { total += stat.size; }, null);
  return total;
}

function isExcluded(filePath) {
  const lower = filePath.toLowerCase();
  return platform.getExcludedPaths().some(ex => lower === ex || lower.startsWith(ex + path.sep));
}

// ── Scanners ─────────────────────────────────────────────────

/**
 * Scan OS temp/cache directories.
 * @param {((msg: string) => void) | undefined} onProgress
 * @returns {{ files: Array<{path: string, size: number}>, totalSize: number }}
 */
function scanTempCache(onProgress) {
  const tempPaths = platform.getTempPaths();
  const files = [];
  let totalSize = 0;

  for (const p of tempPaths) {
    if (onProgress) onProgress(`Scanning temp: ${p}`);
    walk(p, 10,
      (f, stat) => { files.push({ path: f, size: stat.size }); totalSize += stat.size; },
      null
    );
  }
  return { files, totalSize };
}

/**
 * Scan Downloads folder for files not modified within the last `days` days.
 * @param {number} days
 * @param {((msg: string) => void) | undefined} onProgress
 * @returns {{ files: Array<{path: string, size: number}>, totalSize: number }}
 */
function scanOldDownloads(days, onProgress) {
  const downloadsPath = platform.getDownloadsPath();
  if (!fs.existsSync(downloadsPath)) return { files: [], totalSize: 0 };

  const cutoff = Date.now() - days * 86400 * 1000;
  const files = [];
  let totalSize = 0;

  if (onProgress) onProgress('Scanning Downloads folder...');
  walk(downloadsPath, 4,
    (f, stat) => {
      if (stat.mtimeMs < cutoff) {
        files.push({ path: f, size: stat.size });
        totalSize += stat.size;
      }
    },
    null
  );
  return { files, totalSize };
}

/**
 * Scan for media files (video/image) at or above `minBytes`.
 * @param {number} minBytes - Minimum size in bytes
 * @param {((msg: string) => void) | undefined} onProgress
 * @returns {{ files: Array<{path: string, size: number}>, totalSize: number }}
 */
function scanLargeMedia(minBytes, onProgress) {
  const files = [];
  let totalSize = 0;
  const roots = platform.getLargeScanRoots();

  for (const root of roots) {
    walk(root, 6,
      (f, stat) => {
        if (isExcluded(f)) return;
        if (stat.size >= minBytes && MEDIA_EXTENSIONS.has(path.extname(f).toLowerCase())) {
          files.push({ path: f, size: stat.size });
          totalSize += stat.size;
          if (onProgress) onProgress(`Scanning media... ${files.length} found`);
        }
      },
      null
    );
  }
  return { files, totalSize };
}

/**
 * Scan project directories for common build/dependency artifact folders
 * (node_modules, dist, .cache, __pycache__, etc.).
 * @param {((msg: string) => void) | undefined} onProgress
 * @returns {{ folders: Array<{path: string, size: number, name: string}>, totalSize: number }}
 */
function scanDevArtifacts(onProgress) {
  const searchRoots = platform.getScanRoots();
  const folders = [];
  let totalSize = 0;

  function walkForArtifacts(dir, depth = 0) {
    if (depth > 6) return;
    let entries;
    try { entries = fs.readdirSync(dir, { withFileTypes: true }); }
    catch { return; }

    for (const entry of entries) {
      if (!entry.isDirectory()) continue;
      const full = path.join(dir, entry.name);
      try {
        if (entry.isSymbolicLink()) continue;
        if (ARTIFACT_NAMES.has(entry.name)) {
          const size = getDirSize(full);
          folders.push({ path: full, size, name: entry.name });
          totalSize += size;
          if (onProgress) onProgress(`Scanning dev artifacts... ${folders.length} folders`);
        } else {
          walkForArtifacts(full, depth + 1);
        }
      } catch (err) {
        if (err.code !== 'EACCES' && err.code !== 'EPERM') {
          debugLog(`unexpected error at ${full}: ${err.code} ${err.message}`);
        }
      }
    }
  }

  for (const root of searchRoots) walkForArtifacts(root);
  return { folders, totalSize };
}

/**
 * Catch-all scan for files at or above `minBytes`, excluding paths already found
 * by other scanners.
 * @param {number} minBytes - Minimum size in bytes
 * @param {string[]} skipPaths - File paths to exclude (already captured by another scanner)
 * @param {((msg: string) => void) | undefined} onProgress
 * @returns {{ files: Array<{path: string, size: number}>, totalSize: number }}
 */
function scanLargeFiles(minBytes, skipPaths, onProgress) {
  const skipSet = new Set(skipPaths);
  const files = [];
  let totalSize = 0;
  const roots = platform.getLargeScanRoots();

  for (const root of roots) {
    walk(root, 6,
      (f, stat) => {
        if (isExcluded(f)) return;
        if (stat.size >= minBytes && !skipSet.has(f)) {
          files.push({ path: f, size: stat.size });
          totalSize += stat.size;
          if (onProgress) onProgress(`Scanning large files... ${files.length} found`);
        }
      },
      null
    );
  }
  return { files, totalSize };
}

module.exports = {
  scanTempCache,
  scanOldDownloads,
  scanLargeMedia,
  scanDevArtifacts,
  scanLargeFiles,
};
