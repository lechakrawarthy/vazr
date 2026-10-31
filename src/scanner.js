'use strict';

const fs = require('fs');
const fsp = require('fs').promises;
const path = require('path');
const platform = require('./platform');

function debugLog(msg) {
  if (process.env.DEBUG) console.error('[scanner] ' + msg);
}

// A folder name alone is not proof of a build artifact: `Documents/build` or
// `Taxes/out` are often hand-made. Each rule says what has to be true before a
// folder with that name is flagged:
//   markers: a file beside the folder that identifies the project (`*.ext` = any file with that extension)
//   inner:   a file inside the folder that identifies it
//   neither: the name is unambiguous on its own
const JS = ['package.json'];
const GRADLE = ['build.gradle', 'build.gradle.kts', 'settings.gradle', 'settings.gradle.kts'];
const DOTNET = ['*.csproj', '*.fsproj', '*.vbproj'];
const ARTIFACT_RULES = {
  node_modules: { markers: JS },
  '.next': { markers: JS },
  '.nuxt': { markers: JS },
  '.svelte-kit': { markers: JS },
  '.turbo': { markers: JS },
  '.parcel-cache': { markers: JS },
  '.expo': { markers: JS },
  '.cache': { markers: JS },
  '.angular': { markers: ['angular.json'] },
  dist: { markers: [...JS, 'pyproject.toml', 'setup.py'] },
  out: { markers: JS },
  build: { markers: [...JS, ...GRADLE, 'pubspec.yaml', 'CMakeLists.txt', 'pyproject.toml', 'setup.py'] },
  target: { markers: ['Cargo.toml', 'pom.xml', 'build.sbt'] },
  '.gradle': { markers: GRADLE },
  bin: { markers: DOTNET },
  obj: { markers: DOTNET },
  vendor: { markers: ['composer.json'] }, // Go vendor/ is usually committed, so it is deliberately not matched
  Pods: { markers: ['Podfile'] },
  '.dart_tool': { markers: ['pubspec.yaml'] },
  '.build': { markers: ['Package.swift'] },
  _build: { markers: ['mix.exs'] },
  deps: { markers: ['mix.exs'] },
  '.stack-work': { markers: ['stack.yaml'] },
  '.zig-cache': { markers: ['build.zig'] },
  '.venv': { inner: ['pyvenv.cfg'], ecosystem: 'Python' },
  venv: { inner: ['pyvenv.cfg'], ecosystem: 'Python' },
  __pycache__: { ecosystem: 'Python' },
  '.pytest_cache': { ecosystem: 'Python' },
  '.mypy_cache': { ecosystem: 'Python' },
  '.ruff_cache': { ecosystem: 'Python' },
  '.tox': { ecosystem: 'Python' },
};

const MARKER_ECOSYSTEMS = {
  'package.json': 'Node', 'angular.json': 'Angular', 'pyproject.toml': 'Python', 'setup.py': 'Python',
  'build.gradle': 'Gradle', 'build.gradle.kts': 'Gradle', 'settings.gradle': 'Gradle', 'settings.gradle.kts': 'Gradle',
  'pubspec.yaml': 'Dart', 'CMakeLists.txt': 'CMake', 'Cargo.toml': 'Rust', 'pom.xml': 'Maven', 'build.sbt': 'Scala',
  '*.csproj': '.NET', '*.fsproj': '.NET', '*.vbproj': '.NET', 'composer.json': 'PHP', 'Podfile': 'CocoaPods',
  'Package.swift': 'Swift', 'mix.exs': 'Elixir', 'stack.yaml': 'Haskell', 'build.zig': 'Zig',
};

// Used only by the legacy single-purpose scanDevArtifacts below.
const ARTIFACT_NAMES = new Set(Object.keys(ARTIFACT_RULES));

/**
 * Returns the first marker in `markers` present among `siblings`, or null.
 * @param {string[]} markers
 * @param {Set<string>} siblings - entry names in the folder's parent directory
 * @returns {string | null}
 */
function findMarker(markers, siblings) {
  for (const m of markers) {
    if (m.startsWith('*')) {
      const ext = m.slice(1);
      for (const s of siblings) if (s.endsWith(ext)) return m;
    } else if (siblings.has(m)) {
      return m;
    }
  }
  return null;
}

/**
 * Decides whether `dir/name` is a genuine artifact folder.
 * @param {string} name
 * @param {string} full - absolute path of the candidate folder
 * @param {Set<string>} siblings - entry names beside it
 * @returns {Promise<{ ecosystem: string } | null>}
 */
async function matchArtifact(name, full, siblings) {
  const rule = Object.prototype.hasOwnProperty.call(ARTIFACT_RULES, name) ? ARTIFACT_RULES[name] : null;
  if (!rule) return null;
  if (rule.markers) {
    const marker = findMarker(rule.markers, siblings);
    return marker ? { ecosystem: MARKER_ECOSYSTEMS[marker] || 'Build' } : null;
  }
  if (rule.inner) {
    for (const f of rule.inner) {
      try {
        await schedule(() => fsp.access(path.join(full, f)));
        return { ecosystem: rule.ecosystem };
      } catch { /* try the next one */ }
    }
    return null;
  }
  return { ecosystem: rule.ecosystem };
}

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
 * Size the package-manager and tool caches that exist on this machine.
 * @param {((msg: string) => void) | undefined} onProgress
 * @returns {Promise<{ folders: Array<{path: string, size: number, name: string, ecosystem: string}>, totalSize: number }>}
 */
async function scanToolCaches(onProgress) {
  const caches = platform.getToolCachePaths();
  const folders = await Promise.all(caches.map(async c => {
    if (onProgress) onProgress(`Sizing ${c.name} cache...`);
    debugLog(`tool cache: ${c.path}`);
    return { path: c.path, size: await getDirSize(c.path), name: c.name, ecosystem: c.name };
  }));
  const nonEmpty = folders.filter(f => f.size > 0);
  return { folders: nonEmpty, totalSize: nonEmpty.reduce((s, f) => s + f.size, 0) };
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

  // A project's last activity is the newest mtime among its top-level files and its
  // git index/HEAD (touched by commits, checkouts, and editors running `git status`).
  // Memoized so several artifacts in one project cost one lookup.
  const activityCache = new Map();
  function projectActivity(projectDir, entries, gitDir) {
    if (!activityCache.has(projectDir)) {
      const files = entries.filter(e => e.isFile()).slice(0, 50).map(e => path.join(projectDir, e.name));
      if (gitDir) files.push(path.join(gitDir, 'index'), path.join(gitDir, 'HEAD'));
      activityCache.set(projectDir, Promise.all(
        files.map(f => schedule(() => fsp.stat(f)).then(s => s.mtimeMs, () => 0))
      ).then(times => Math.max(0, ...times)));
    }
    return activityCache.get(projectDir);
  }

  // Walks a project root (Documents, Projects, repos, ...): detects dev-artifact
  // folders (and stops descending into them) plus media/large files elsewhere.
  // `gitDir` is the .git of the nearest enclosing repository, if any.
  async function walkProjectRoot(dir, depth, gitDir = null) {
    if (depth > 6) return;
    if (isPathExcluded(dir)) { debugLog(`skipping excluded path: ${dir}`); return; }
    if (depth === 0) debugLog(`scanning project root: ${dir}`);
    let entries;
    try {
      entries = await schedule(() => fsp.readdir(dir, { withFileTypes: true }));
    } catch { return; }

    const siblings = new Set(entries.map(e => e.name));
    if (siblings.has('.git')) gitDir = path.join(dir, '.git');

    const subtasks = [];
    for (const entry of entries) {
      if (entry.isSymbolicLink()) continue;
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        if (entry.name === '.git') continue;
        subtasks.push(matchArtifact(entry.name, full, siblings).then(match => {
          // An unproven node_modules is still installed packages: walking into it would
          // flag each package's own dist/ or build/ (they all carry a package.json).
          if (!match && entry.name === 'node_modules') return;
          if (!match) return walkProjectRoot(full, depth + 1, gitDir);
          if (isPathExcluded(full)) { debugLog(`skipping excluded path: ${full}`); return; }
          return Promise.all([getDirSize(full), projectActivity(dir, entries, gitDir)]).then(([size, lastActivityMs]) => {
            devFolders.push({ path: full, size, name: entry.name, ecosystem: match.ecosystem, project: dir, lastActivityMs });
            devTotalSize += size;
            debugLog(`dev artifact found: ${full} (${match.ecosystem}, ${size} bytes)`);
            report(`Scanning dev artifacts... ${devFolders.length} folders`);
          });
        }));
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
                return; // one category per file, or its bytes get counted (and acted on) twice
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
  scanToolCaches,
  scanOldDownloads,
  scanLargeMedia,
  scanDevArtifacts,
  scanWorkspace,
  scanLargeFiles,
};
