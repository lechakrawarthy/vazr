'use strict';

const os = require('os');
const path = require('path');
const fs = require('fs');

const HOME = os.homedir();
const PLATFORM = process.platform; // 'win32' | 'darwin' | 'linux'

/**
 * Returns user project directories to scan for dev artifacts.
 * Only returns paths that currently exist on disk.
 * @returns {string[]}
 */
function getScanRoots() {
  if (PLATFORM === 'win32') {
    return [
      path.join(HOME, 'Documents'),
      path.join(HOME, 'Desktop'),
      path.join(HOME, 'Projects'),
      path.join(HOME, 'source'),
      path.join(HOME, 'repos'),
      'C:\\dev', 'C:\\projects', 'C:\\repos', 'C:\\src', 'C:\\code',
    ].filter(p => fs.existsSync(p));
  }
  if (PLATFORM === 'darwin') {
    return [
      path.join(HOME, 'Documents'),
      path.join(HOME, 'Desktop'),
      path.join(HOME, 'Projects'),
      path.join(HOME, 'repos'),
      path.join(HOME, 'dev'),
      path.join(HOME, 'code'),
    ].filter(p => fs.existsSync(p));
  }
  // Linux
  return [
    path.join(HOME, 'Documents'),
    path.join(HOME, 'projects'),
    path.join(HOME, 'repos'),
    path.join(HOME, 'dev'),
    path.join(HOME, 'code'),
    '/var/tmp',
  ].filter(p => fs.existsSync(p));
}

/**
 * Drops duplicate roots and roots nested inside another root in the list.
 * os.tmpdir() is usually the same folder as an explicit entry (AppData\Local\Temp
 * on Windows, /tmp on Linux); walking both would list every file twice.
 * @param {string[]} roots
 * @returns {string[]}
 */
function collapseRoots(roots) {
  const resolved = [];
  for (const r of roots) {
    const abs = path.resolve(r);
    if (!resolved.some(x => x.toLowerCase() === abs.toLowerCase())) resolved.push(abs);
  }
  return resolved.filter(r => !resolved.some(other => other !== r && isInsidePath(r, other)));
}

/**
 * Returns OS temp/cache directories to scan. Only returns paths that exist,
 * with duplicates and nested roots collapsed.
 * @returns {string[]}
 */
function getTempPaths() {
  return collapseRoots(getRawTempPaths());
}

function getRawTempPaths() {
  if (PLATFORM === 'win32') {
    return [
      os.tmpdir(),
      path.join(HOME, 'AppData', 'Local', 'Temp'),
      'C:\\Windows\\Temp',
      path.join(HOME, 'AppData', 'Local', 'Microsoft', 'Windows', 'INetCache'),
      path.join(HOME, 'AppData', 'Local', 'Google', 'Chrome', 'User Data', 'Default', 'Cache'),
      path.join(HOME, 'AppData', 'Local', 'Google', 'Chrome', 'User Data', 'Default', 'Code Cache'),
      path.join(HOME, 'AppData', 'Local', 'Microsoft', 'Edge', 'User Data', 'Default', 'Cache'),
      path.join(HOME, 'AppData', 'Roaming', 'npm-cache'),
    ].filter(p => fs.existsSync(p));
  }
  if (PLATFORM === 'darwin') {
    return [
      os.tmpdir(),
      path.join(HOME, 'Library', 'Caches'),
      path.join(HOME, 'Library', 'Application Support', 'Google', 'Chrome', 'Default', 'Cache'),
      '/private/var/folders',
    ].filter(p => fs.existsSync(p));
  }
  // Linux
  return [
    os.tmpdir(),
    '/tmp',
    path.join(HOME, '.cache'),
    path.join(HOME, '.npm'),
  ].filter(p => fs.existsSync(p));
}

/**
 * Package-manager and tool caches that are safe to delete because the tool
 * re-downloads whatever it needs. Deliberately left out: ~/.m2 (holds your own
 * `mvn install` artifacts) and ~/go/pkg/mod (read-only files). Only existing
 * paths are returned, and ones inside a temp root are dropped because the temp
 * scan already counts them.
 * @returns {Array<{ name: string, path: string }>}
 */
function getToolCachePaths() {
  const local = process.env.LOCALAPPDATA || path.join(HOME, 'AppData', 'Local');
  const common = [
    { name: 'Cargo registry', path: path.join(HOME, '.cargo', 'registry', 'cache') },
    { name: 'Cargo sources', path: path.join(HOME, '.cargo', 'registry', 'src') },
    { name: 'Gradle', path: path.join(HOME, '.gradle', 'caches') },
    { name: 'NuGet', path: path.join(HOME, '.nuget', 'packages') },
  ];
  let specific;
  if (PLATFORM === 'win32') {
    specific = [
      { name: 'npm', path: path.join(local, 'npm-cache') },
      { name: 'pnpm store', path: path.join(local, 'pnpm', 'store') },
      { name: 'Yarn', path: path.join(local, 'Yarn', 'Cache') },
      { name: 'pip', path: path.join(local, 'pip', 'cache') },
      { name: 'Go build', path: path.join(local, 'go-build') },
      { name: 'Playwright browsers', path: path.join(local, 'ms-playwright') },
      { name: 'Puppeteer browsers', path: path.join(HOME, '.cache', 'puppeteer') },
    ];
  } else if (PLATFORM === 'darwin') {
    specific = [
      { name: 'npm', path: path.join(HOME, '.npm', '_cacache') },
      { name: 'pnpm store', path: path.join(HOME, 'Library', 'pnpm', 'store') },
      { name: 'Xcode DerivedData', path: path.join(HOME, 'Library', 'Developer', 'Xcode', 'DerivedData') },
      { name: 'Puppeteer browsers', path: path.join(HOME, '.cache', 'puppeteer') },
    ];
  } else {
    specific = [
      { name: 'pnpm store', path: path.join(HOME, '.local', 'share', 'pnpm', 'store') },
    ];
  }
  const temps = getTempPaths();
  return [...specific, ...common]
    .filter(c => fs.existsSync(c.path))
    .filter(c => !temps.some(t => isInsidePath(c.path, t)));
}

/**
 * Returns lowercase paths that should never be touched by any scan or operation.
 * @returns {string[]}
 */
function getExcludedPaths() {
  if (PLATFORM === 'win32') {
    return [
      'C:\\Windows',
      'C:\\Program Files',
      'C:\\Program Files (x86)',
      'C:\\$Recycle.Bin',
      'C:\\System Volume Information',
      'C:\\ProgramData',
    ].map(p => p.toLowerCase());
  }
  if (PLATFORM === 'darwin') {
    return [
      '/System', '/Library', '/private', '/usr', '/bin', '/sbin',
      path.join(HOME, 'Library'),
    ].map(p => p.toLowerCase());
  }
  return [
    '/proc', '/sys', '/dev', '/run', '/boot', '/usr', '/lib',
    '/lib64', '/bin', '/sbin', '/etc',
  ].map(p => p.toLowerCase());
}

/**
 * Returns true if targetPath is equal to or nested under basePath.
 * Comparison is case-insensitive.
 * @param {string} targetPath
 * @param {string} basePath
 * @returns {boolean}
 */
function isInsidePath(targetPath, basePath) {
  const target = path.resolve(targetPath).toLowerCase();
  const base = path.resolve(basePath).toLowerCase();
  return target === base || target.startsWith(base + path.sep);
}

/**
 * Returns true if targetPath is a filesystem root or inside a protected system directory.
 * Always call this before any delete/move operation.
 * @param {string} targetPath
 * @returns {boolean}
 */
function isProtectedPath(targetPath) {
  const resolved = path.resolve(targetPath);
  const root = path.parse(resolved).root;
  if (resolved === root) return true;
  return getExcludedPaths().some(ex => isInsidePath(resolved, ex));
}

/**
 * Last-line check before any delete or move. Refuses filesystem roots, the home
 * directory, the scan/temp/Downloads roots themselves, and anything inside a
 * protected system directory, except paths under a known temp root (C:\Windows\Temp
 * and ~/Library/Caches live inside protected trees but are fair game).
 * Roots are looked up once per checker (they hit the filesystem), so build one per
 * batch with makeRemovableCheck() rather than calling checkRemovable() per item.
 * @returns {(targetPath: string) => { ok: boolean, reason?: string }}
 */
function makeRemovableCheck() {
  const tempRoots = getTempPaths();
  const roots = new Set([HOME, ...getScanRoots(), ...tempRoots, getDownloadsPath()].map(p => path.resolve(p).toLowerCase()));
  // Fair game even inside a protected tree. Tool caches are listed too (Xcode's
  // DerivedData lives in ~/Library), but unlike temp roots a cache folder is itself
  // the item being removed, so it stays out of `roots`.
  const temps = [...tempRoots, ...getToolCachePaths().map(c => c.path)];

  return function checkOne(targetPath) {
    const resolved = path.resolve(targetPath);
    if (resolved === path.parse(resolved).root) return { ok: false, reason: 'refusing to touch a filesystem root' };
    if (roots.has(resolved.toLowerCase())) return { ok: false, reason: 'refusing to touch the home folder or a scan root itself' };
    if (isProtectedPath(resolved) && !temps.some(t => isInsidePath(resolved, t))) {
      return { ok: false, reason: 'path is inside a protected system directory' };
    }
    return { ok: true };
  };
}

/**
 * One-off form of makeRemovableCheck().
 * @param {string} targetPath
 * @returns {{ ok: boolean, reason?: string }}
 */
function checkRemovable(targetPath) {
  return makeRemovableCheck()(targetPath);
}

/**
 * Returns scan roots for large-file/media scans — project dirs + Downloads,
 * filtered to paths that exist and are not protected.
 * @returns {string[]}
 */
function getLargeScanRoots() {
  const roots = [
    ...getScanRoots(),
    getDownloadsPath(),
  ];

  return roots
    .filter(p => fs.existsSync(p))
    .filter(p => !isProtectedPath(p));
}

/**
 * Returns the system root drive (C:\ on Windows, / elsewhere).
 * @returns {string}
 */
function getSystemRoot() {
  if (PLATFORM === 'win32') return 'C:\\';
  return '/';
}

/**
 * Returns the cross-platform Downloads folder path.
 * @returns {string}
 */
function getDownloadsPath() {
  return path.join(HOME, 'Downloads');
}

module.exports = {
  HOME,
  PLATFORM,
  getScanRoots,
  getLargeScanRoots,
  getTempPaths,
  getToolCachePaths,
  getExcludedPaths,
  isProtectedPath,
  isInsidePath,
  collapseRoots,
  checkRemovable,
  makeRemovableCheck,
  getSystemRoot,
  getDownloadsPath,
};
