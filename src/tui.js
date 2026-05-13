'use strict';

/**
 * Public facade for the TUI subsystem.
 * Consumers import from here; internals live in src/tui/.
 */

const { ESC, ANSI_RE, SPIN, vlen, rpad, lpad, clamp, tok, fmtBytes, fmtBytesC, fmtN, fmtPct, semanticBar, actLabel } = require('./tui/tokens');
const { Screen } = require('./tui/screen');
const { enableRaw, disableRaw, nextKey } = require('./tui/input');
const { runReview, confirmForceDelete } = require('./tui/review');

module.exports = {
  // Escape sequences
  ESC,
  // Design tokens & formatters
  tok, fmtBytes, fmtBytesC, fmtN, fmtPct,
  // Visual primitives
  ANSI_RE, SPIN, vlen, rpad, lpad, clamp, semanticBar, actLabel,
  // Screen renderer
  Screen,
  // Input helpers
  enableRaw, disableRaw, nextKey,
  // Interactive screens
  runReview, confirmForceDelete,
};
