'use strict';

const fs = require('fs');
const fsp = require('fs').promises;
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

// ── Concurrency limiter ──────────────────────────────────────
// Keeps at most `limit` async tasks running simultaneously.
function makeLimiter(limit) {
  let active = 0;
  const queue = [];
  function run() {
    while (active < limit && queue.length > 0) {
      active++;
      const { fn, resolve, reject } = queue.shift();
      fn().then(v => { active--; resolve(v); run(); }, e => { active--; reject(e); run(); });
    }
  }
  return fn => new Promise((resolve, reject) => { queue.push({ fn, resolve, reject }); run(); });
}

const schedule = makeLimiter(16);

// ── Core async walker ────────────────────────────────────────

/**
 * Recursively walk a directory up to maxDepth asynchronously.
 * Skips symlinks and silently continues past permission errors.
 * @param {string} dir - Directory to walk
 * @param {number} maxDepth - Maximum recursion depth
 * @param {(fullPath: string, stat: import('fs').Stats) => void} onFile - Called for each file
 * @param {((fullPath: string, name: string) => void) | null} onDir - Called before descending
 * @param {number} [depth=0] - Current depth (internal)
 * @returns {Promise<void>}
 */
async function walk(dir, maxDepth, onFile, onDir, depth = 0) {
  if (depth > maxDepth) return;

  let entries;
  try {
    entries = await schedule(() => fsp.readdir(dir, { withFileTypes: true }));
  } catch {
    return;
  }

  const subtasks = [];
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    try {
      if (entry.isSymbolicLink()) continue;
      if (entry.isDirectory()) {
        if (onDir) onDir(full, entry.name);
        subtasks.push(walk(full, maxDepth, onFile, onDir, depth + 1));
      } else if (entry.isFile()) {
        subtasks.push(
          schedule(() => fsp.stat(full)).then(stat => onFile(full, stat)).catch(err => {
            if (err.code !== 'EACCES' && err.code !== 'EPERM') {
              debugLog(`unexpected stat error at ${full}: ${err.code} ${err.message}`);
            }
          })
        );
      }
    } catch (err) {
      if (err.code !== 'EACCES' && err.code !== 'EPERM') {
        debugLog(`unexpected error at ${full}: ${err.code} ${err.message}`);
      }
    }
  }

  await Promise.all(subtasks);
}

/**
 * Returns the total byte size of all files under a directory (recursive, async).
 * @param {string} dir
 * @returns {Promise<number>}
 */
async function getDirSize(dir) {
  let total = 0;
  await walk(dir, 99, (_f, stat) => { total += stat.size; }, null);
  return total;
}

function isExcluded(filePath) {
  const lower = filePath.toLowerCase();
  return platform.getExcludedPaths().some(ex => lower === ex || lower.startsWith(ex + path.sep));
}

/**
 * Builds a path-exclusion check combining vazr's built-in protected paths
 * with user-supplied --exclude paths.
 * @param {string[]} [userExcludes]
 * @returns {(filePath: string) => boolean}
 */
function makeExcludeChecker(userExcludes) {
  const base = platform.getExcludedPaths();
  const extra = (userExcludes || []).map(p => path.resolve(p).toLowerCase());
  const all = base.concat(extra);
  return function isPathExcluded(filePath) {
    const lower = filePath.toLowerCase();
    return all.some(ex => lower === ex || lower.startsWith(ex + path.sep));
  };
}

// ── Scanners ─────────────────────────────────────────────────

/**
 * Scan OS temp/cache directories.
 * @param {((msg: string) => void) | undefined} onProgress
 * @returns {Promise<{ files: Array<{path: string, size: number}>, totalSize: number }>}
 */
async function scanTempCache(onProgress) {
  const tempPaths = platform.getTempPaths();
  const files = [];
  let totalSize = 0;

  for (const p of tempPaths) {
    debugLog(`scanning temp root: ${p}`);
    if (onProgress) onProgress(`Scanning temp: ${p}`);
    await walk(p, 10,
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
 * @returns {Promise<{ files: Array<{path: string, size: number}>, totalSize: number }>}
 */
async function scanOldDownloads(days, onProgress) {
  const downloadsPath = platform.getDownloadsPath();
  if (!fs.existsSync(downloadsPath)) return { files: [], totalSize: 0 };

  const cutoff = Date.now() - days * 86400 * 1000;
  const files = [];
  let totalSize = 0;

  if (onProgress) onProgress('Scanning Downloads folder...');
  await walk(downloadsPath, 4,
    (f, stat) => {
      // Use the most recent of mtime and atime to reduce false positives.
      // birthtime is excluded — it is unreliable on Linux and often equals mtime.
      // A file touched recently by any means should not be flagged as old.
      const lastActivity = Math.max(
        stat.mtimeMs || 0,
        stat.atimeMs || 0,
      );
      if (lastActivity < cutoff) {
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
 * @returns {Promise<{ files: Array<{path: string, size: number}>, totalSize: number }>}
 */
async function scanLargeMedia(minBytes, onProgress) {
  const files = [];
  let totalSize = 0;
  const roots = platform.getLargeScanRoots();

  for (const root of roots) {
    await walk(root, 6,
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
 * @returns {Promise<{ folders: Array<{path: string, size: number, name: string}>, totalSize: number }>}
 */
async function scanDevArtifacts(onProgress) {
  const searchRoots = platform.getScanRoots();
  const folders = [];
  let totalSize = 0;

  async function walkForArtifacts(dir, depth = 0) {
    if (depth > 6) return;
    let entries;
    try {
      entries = await schedule(() => fsp.readdir(dir, { withFileTypes: true }));
    } catch { return; }

    const subtasks = [];
    for (const entry of entries) {
      if (!entry.isDirectory() || entry.isSymbolicLink()) continue;
      const full = path.join(dir, entry.name);
      try {
        if (ARTIFACT_NAMES.has(entry.name)) {
          subtasks.push(
            getDirSize(full).then(size => {
              folders.push({ path: full, size, name: entry.name });
              totalSize += size;
              if (onProgress) onProgress(`Scanning dev artifacts... ${folders.length} folders`);
            })
          );
        } else {
          subtasks.push(walkForArtifacts(full, depth + 1));
        }
      } catch (err) {
        if (err.code !== 'EACCES' && err.code !== 'EPERM') {
          debugLog(`unexpected error at ${full}: ${err.code} ${err.message}`);
        }
      }
    }
    await Promise.all(subtasks);
  }

  await Promise.all(searchRoots.map(root => walkForArtifacts(root)));
  return { folders, totalSize };
}

/**
 * Single-pass replacement for scanDevArtifacts + scanLargeMedia + scanLargeFiles +
 * scanOldDownloads. Those four scanners each independently re-walk the same
 * project/Downloads directory trees; on a machine with a few large repos this means
 * every file under `node_modules` (etc.) gets `readdir`/`stat`-ed three or four times
 * over. This walks each root exactly once and classifies as it goes.
 *
 * Behavioral notes vs. the four separate scanners:
 * - A file's byte size still counts once it's inside a matched dev-artifact folder
 *   (e.g. `node_modules`) — that folder is not re-descended into for media/large-file
 *   detection, so a big file inside it is reflected in the folder's total instead of
 *   also appearing under "Other Large Files". This avoids double-counting the same
 *   bytes across two categories.
 * - Old-downloads detection still only applies within the Downloads folder, still
 *   capped at depth 4 there (media/large detection in Downloads still goes to depth 6,
 *   matching the previous behavior).
 * - User-supplied excludePaths prune whole subtrees before they're even read, which is
 *   both a correctness and a performance win over the old file-level-only exclusion.
 *
 * @param {{ minMediaBytes: number, minLargeBytes: number, oldDownloadsCutoffMs: number, excludePaths?: string[] }} opts
 * @param {((msg: string, runningBytes: number) => void) | undefined} onProgress
 * @returns {Promise<{
 *   devArtifacts: { folders: Array<{path:string,size:number,name:string}>, totalSize: number },
 *   media: { files: Array<{path:string,size:number}>, totalSize: number },
 *   large: { files: Array<{path:string,size:number}>, totalSize: number },
 *   oldDownloads: { files: Array<{path:string,size:number}>, totalSize: number },
 * }>}
 */
async function scanWorkspace(opts, onProgress) {
  const { minMediaBytes, minLargeBytes, oldDownloadsCutoffMs, excludePaths } = opts;
  const isPathExcluded = makeExcludeChecker(excludePaths);

  const devFolders = [];
  const mediaFiles = [];
  const largeFiles = [];
  const oldDownloadFiles = [];
  let devTotalSize = 0;
  let mediaTotalSize = 0;
  let largeTotalSize = 0;
  let oldDownloadsTotalSize = 0;

  function report(msg) {
    if (onProgress) onProgress(msg, devTotalSize + mediaTotalSize + largeTotalSize + oldDownloadsTotalSize);
  }

  function classifySizedFile(full, stat) {
    if (isExcluded(full) || isPathExcluded(full)) return;
    const size = stat.size;
    const ext = path.extname(full).toLowerCase();
    if (size >= minMediaBytes && MEDIA_EXTENSIONS.has(ext)) {
      mediaFiles.push({ path: full, size });
      mediaTotalSize += size;
      report(`Scanning... ${mediaFiles.length + largeFiles.length} large files found`);
    } else if (size >= minLargeBytes) {
      largeFiles.push({ path: full, size });
      largeTotalSize += size;
      report(`Scanning... ${mediaFiles.length + largeFiles.length} large files found`);
    }
  }

  // Walks a project root (Documents, Projects, repos, ...): detects dev-artifact
  // folders (and stops descending into them) plus media/large files elsewhere.
  async function walkProjectRoot(dir, depth) {
    if (depth > 6) return;
    if (isPathExcluded(dir)) { debugLog(`skipping excluded path: ${dir}`); return; }
    if (depth === 0) debugLog(`scanning project root: ${dir}`);
    let entries;
    try {
      entries = await schedule(() => fsp.readdir(dir, { withFileTypes: true }));
    } catch { return; }

    const subtasks = [];
    for (const entry of entries) {
      if (entry.isSymbolicLink()) continue;
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        if (ARTIFACT_NAMES.has(entry.name)) {
          if (isPathExcluded(full)) { debugLog(`skipping excluded path: ${full}`); continue; }
          subtasks.push(
            getDirSize(full).then(size => {
              devFolders.push({ path: full, size, name: entry.name });
              devTotalSize += size;
              debugLog(`dev artifact found: ${full} (${size} bytes)`);
              report(`Scanning dev artifacts... ${devFolders.length} folders`);
            })
          );
        } else {
          subtasks.push(walkProjectRoot(full, depth + 1));
        }
      } else if (entry.isFile()) {
        subtasks.push(
          schedule(() => fsp.stat(full)).then(stat => classifySizedFile(full, stat)).catch(err => {
            if (err.code !== 'EACCES' && err.code !== 'EPERM') {
              debugLog(`unexpected stat error at ${full}: ${err.code} ${err.message}`);
            }
          })
        );
      }
    }
    await Promise.all(subtasks);
  }

  // Walks the Downloads root: age-based staleness (depth <= 4) plus media/large
  // detection (depth <= 6). No dev-artifact detection here (matches old behavior).
  async function walkDownloadsRoot(dir, depth) {
    if (depth > 6) return;
    if (isPathExcluded(dir)) { debugLog(`skipping excluded path: ${dir}`); return; }
    if (depth === 0) debugLog(`scanning downloads root: ${dir}`);
    let entries;
    try {
      entries = await schedule(() => fsp.readdir(dir, { withFileTypes: true }));
    } catch { return; }

    const subtasks = [];
    for (const entry of entries) {
      if (entry.isSymbolicLink()) continue;
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        subtasks.push(walkDownloadsRoot(full, depth + 1));
      } else if (entry.isFile()) {
        subtasks.push(
          schedule(() => fsp.stat(full)).then(stat => {
            if (depth <= 4) {
              const lastActivity = Math.max(stat.mtimeMs || 0, stat.atimeMs || 0);
              if (lastActivity < oldDownloadsCutoffMs) {
                oldDownloadFiles.push({ path: full, size: stat.size });
                oldDownloadsTotalSize += stat.size;
                report(`Scanning Downloads... ${oldDownloadFiles.length} old files`);
              }
            }
            classifySizedFile(full, stat);
          }).catch(err => {
            if (err.code !== 'EACCES' && err.code !== 'EPERM') {
              debugLog(`unexpected stat error at ${full}: ${err.code} ${err.message}`);
            }
          })
        );
      }
    }
    await Promise.all(subtasks);
  }

  const scanRoots = platform.getScanRoots();
  const downloadsPath = platform.getDownloadsPath();
  const downloadsExists = fs.existsSync(downloadsPath) && !platform.isProtectedPath(downloadsPath);

  const tasks = scanRoots.map(root => walkProjectRoot(root, 0));
  if (downloadsExists) tasks.push(walkDownloadsRoot(downloadsPath, 0));
  await Promise.all(tasks);

  return {
    devArtifacts: { folders: devFolders, totalSize: devTotalSize },
    media: { files: mediaFiles, totalSize: mediaTotalSize },
    large: { files: largeFiles, totalSize: largeTotalSize },
    oldDownloads: { files: oldDownloadFiles, totalSize: oldDownloadsTotalSize },
  };
}

/**
 * Catch-all scan for files at or above `minBytes`, excluding paths already found
 * by other scanners.
 * @param {number} minBytes - Minimum size in bytes
 * @param {string[]} skipPaths - File paths to exclude (already captured by another scanner)
 * @param {((msg: string) => void) | undefined} onProgress
 * @returns {Promise<{ files: Array<{path: string, size: number}>, totalSize: number }>}
 */
async function scanLargeFiles(minBytes, skipPaths, onProgress) {
  const skipSet = new Set(skipPaths);
  const files = [];
  let totalSize = 0;
  const roots = platform.getLargeScanRoots();

  for (const root of roots) {
    await walk(root, 6,
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
  scanWorkspace,
  scanLargeFiles,
};
