'use strict';

const chalk = require('chalk');

// ── Terminal escape sequences ──────────────────────────────────
const ESC = {
  home: '\x1b[H',
  eraseDown: '\x1b[J',
  hideCursor: '\x1b[?25l',
  showCursor: '\x1b[?25h',
  altOn: '\x1b[?1049h',
  altOff: '\x1b[?1049l',
};

// ── ANSI utilities ─────────────────────────────────────────────
const ANSI_RE = /\x1b\[[0-9;]*[a-zA-Z]/g;
const vlen = s => s.replace(ANSI_RE, '').length;
const rpad = (s, w) => { const d = w - vlen(s); return d > 0 ? s + ' '.repeat(d) : s; };
const lpad = (s, w) => { const d = w - vlen(s); return d > 0 ? ' '.repeat(d) + s : s; };
const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

// ── Design tokens ──────────────────────────────────────────────
const neonGreen = chalk.hex('#39ff14');
const darkGreen = chalk.hex('#0d4a00');
const amber = chalk.hex('#ffb700');
const red = chalk.hex('#ff2222');
const lightGreen = chalk.hex('#c8f0c8');
const dimGreen = chalk.hex('#1a2a1a');
const mutedGreen = chalk.hex('#4a7a4a');

const tok = {
  critical: red,
  moderate: amber,
  low: lightGreen,
  minimal: mutedGreen,

  danger: red,
  dangerBold: red.bold,
  warn: amber,
  warnBold: amber.bold,
  success: neonGreen,
  successBold: neonGreen.bold,

  brand: neonGreen,
  brandBold: neonGreen.bold,
  brandDim: darkGreen,
  primary: chalk.white,
  bold: chalk.bold.white,
  muted: mutedGreen,
  dim: dimGreen,

  cursor: chalk.bgHex('#0d200d').bold.white,
  cursorBorder: neonGreen,
};

// ── Formatters ─────────────────────────────────────────────────
function fmtBytes(b) {
  if (!b) return '0 B';
  if (b >= 1e9) return (b / 1e9).toFixed(2) + ' GB';
  if (b >= 1e6) return (b / 1e6).toFixed(2) + ' MB';
  if (b >= 1e3) return (b / 1e3).toFixed(2) + ' KB';
  return b + ' B';
}

function fmtBytesC(b) {
  if (!b) return tok.muted('     0 B');
  if (b >= 1e9) return tok.critical((b / 1e9).toFixed(2) + ' GB');
  if (b >= 100e6) return tok.moderate((b / 1e6).toFixed(2) + ' MB');
  if (b >= 1e6) return tok.low((b / 1e6).toFixed(2) + ' MB');
  if (b >= 1e3) return tok.muted((b / 1e3).toFixed(2) + ' KB');
  return tok.muted(b + ' B');
}

const fmtN = n => n.toLocaleString();
const fmtPct = (part, total) => !total ? '  0%' : ((part / total) * 100).toFixed(0).padStart(3) + '%';

// ── Visual primitives ──────────────────────────────────────────
const SPIN = '⠋⠙⠹⠸⠼⠴⠦⠧⠇⠏';

function semanticBar(size, ratio, w) {
  const f = Math.round(clamp(ratio || 0, 0, 1) * w);
  const barColor = size >= 1e9 ? red : size >= 100e6 ? amber : neonGreen;
  return barColor('▓'.repeat(f)) + chalk.hex('#1a2a1a')('░'.repeat(w - f));
}

function actLabel(action, destAvailable) {
  if (action === 'Delete') return tok.danger('[D] DELETE');
  if (action === 'Move' && destAvailable) return tok.warn('[M] MOVE  ');
  if (action === 'Move') return tok.muted('[D] DELETE'); // fallback
  return tok.muted('──────');
}

module.exports = {
  ESC, ANSI_RE, SPIN,
  vlen, rpad, lpad, clamp,
  tok, fmtBytes, fmtBytesC, fmtN, fmtPct,
  semanticBar, actLabel,
};
