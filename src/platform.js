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
 * Returns OS temp/cache directories to scan. Only returns paths that exist.
 * @returns {string[]}
 */
function getTempPaths() {
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
  getExcludedPaths,
  isProtectedPath,
  getSystemRoot,
  getDownloadsPath,
};
