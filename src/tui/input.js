'use strict';

/** Enable raw keyboard mode — required before reading individual keypresses. */
function enableRaw() {
  if (process.stdin.isTTY) process.stdin.setRawMode(true);
  process.stdin.resume();
  process.stdin.setEncoding('utf8');
}

/** Disable raw keyboard mode and pause stdin. */
function disableRaw() {
  if (process.stdin.isTTY) process.stdin.setRawMode(false);
  process.stdin.pause();
}

/**
 * Wait for a single keypress and resolve with the key string.
 * Must be called while raw mode is active.
 * @returns {Promise<string>}
 */
function nextKey() {
  return new Promise(resolve => process.stdin.once('data', resolve));
}

module.exports = { enableRaw, disableRaw, nextKey };
