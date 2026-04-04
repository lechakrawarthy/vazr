'use strict';

const chalk = require('chalk');
const readline = require('readline');

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
const strip = s => s.replace(ANSI_RE, '');
const rpad = (s, w) => { const d = w - vlen(s); return d > 0 ? s + ' '.repeat(d) : s; };
const lpad = (s, w) => { const d = w - vlen(s); return d > 0 ? ' '.repeat(d) + s : s; };
const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

// ── Design tokens ──────────────────────────────────────────────
// Strictly semantic — color encodes meaning, not decoration.
const tok = {
  // Severity (applied by size magnitude)
  critical: chalk.red,           // ≥ 1 GB
  moderate: chalk.yellow,        // ≥ 100 MB
  low: chalk.white,         // < 100 MB
  minimal: chalk.gray,          // < 1 MB / secondary

  // Intent
  danger: chalk.red,
  dangerBold: chalk.bold.red,
  warn: chalk.yellow,
  warnBold: chalk.bold.yellow,
  success: chalk.green,
  successBold: chalk.bold.green,

  // Chrome
  brand: chalk.cyan,
  brandBold: chalk.bold.cyan,
  brandDim: chalk.dim.cyan,
  primary: chalk.white,
  bold: chalk.bold.white,
  muted: chalk.gray,
  dim: chalk.dim,

  // Cursor — inverted for the selected row
  cursor: chalk.bgCyan.bold.black,
  cursorBorder: chalk.bold.cyan,
};

// ── Formatters ─────────────────────────────────────────────────
function fmtBytes(b) {
  if (!b) return '0 B';
  if (b >= 1e9) return (b / 1e9).toFixed(2) + ' GB';
  if (b >= 1e6) return (b / 1e6).toFixed(2) + ' MB';
  if (b >= 1e3) return (b / 1e3).toFixed(2) + ' KB';
  return b + ' B';
}

// Semantic color: magnitude determines urgency
function fmtBytesC(b) {
  if (!b) return tok.muted('     0 B');
  if (b >= 1e9) return tok.critical((b / 1e9).toFixed(2) + ' GB');
  if (b >= 100e6) return tok.moderate((b / 1e6).toFixed(2) + ' MB');
  if (b >= 1e6) return tok.low((b / 1e6).toFixed(2) + ' MB');
  if (b >= 1e3) return tok.muted((b / 1e3).toFixed(2) + ' KB');
  return tok.muted(b + ' B');
}

const fmtN = n => n.toLocaleString();
const fmtPct = (part, total) =>
  !total ? '  0%' : ((part / total) * 100).toFixed(0).padStart(3) + '%';

// ── Visual primitives ──────────────────────────────────────────
// Bars are relative to the largest category (not total).
// Color of filled portion mirrors size severity.
function semanticBar(size, ratio, w) {
  const f = Math.round(clamp(ratio || 0, 0, 1) * w);
  const barColor = size >= 1e9 ? chalk.red
    : size >= 100e6 ? chalk.yellow
      : chalk.white;
  return barColor('▓'.repeat(f)) + tok.muted('░'.repeat(w - f));
}

// Verb-first, bracketed actions — not debug labels.
function actLabel(action, destAvailable) {
  if (action === 'Delete') return tok.dangerBold('[D] Delete');
  if (action === 'Move' && destAvailable) return tok.warnBold('[M] Move  ');
  if (action === 'Move') return tok.muted('[D] Delete'); // fallback
  return tok.muted('──────────');
}

const SPIN = '⠋⠙⠹⠸⠼⠴⠦⠧⠇⠏';

// ── Screen ─────────────────────────────────────────────────────
class Screen {
  constructor() {
    this._buf = [];
    this._lastFlush = 0;
    process.stdout.on('resize', () => { });
  }

  get W() { return process.stdout.columns || 100; }
  get H() { return process.stdout.rows || 30; }
  get IW() { return this.W - 2; }

  // ── Border primitives ────────────────────────────────────────
  _top(left = '', right = '') {
    const ls = left ? ' ' + left + ' ' : '';
    const rs = right ? ' ' + right + ' ' : '';
    const mid = Math.max(0, this.IW - vlen(ls) - vlen(rs));
    return tok.brand('╔') + tok.brandBold(ls) + tok.brand('═'.repeat(mid)) + tok.muted(rs) + tok.brand('╗');
  }

  _div(left = '', right = '') {
    const ls = left ? ' ' + left + ' ' : '';
    const rs = right ? ' ' + right + ' ' : '';
    const mid = Math.max(0, this.IW - vlen(ls) - vlen(rs));
    return tok.brand('╠') + tok.brandDim(ls) + tok.brand('═'.repeat(mid)) + tok.muted(rs) + tok.brand('╣');
  }

  _bot() { return tok.brand('╚' + '═'.repeat(this.IW) + '╝'); }

  // Normal content row
  _row(content) {
    const space = Math.max(0, this.IW - 2 - vlen(content));
    return tok.brand('║') + ' ' + content + ' '.repeat(space) + ' ' + tok.brand('║');
  }

  // Cursor row — full-width inverted background. Strip inner ANSI so
  // the cyan background shows cleanly rather than fighting embedded colors.
  _cursorRow(content) {
    const plain = strip(content);
    const padded = plain + ' '.repeat(Math.max(0, this.IW - 2 - plain.length));
    return tok.cursorBorder('║') + tok.cursor(' ' + padded + ' ') + tok.cursorBorder('║');
  }

  _blank() { return tok.brand('║') + ' '.repeat(this.IW) + tok.brand('║'); }

  // ── Buffer management ─────────────────────────────────────────
  push(s) { this._buf.push(s); }
  blank(n = 1) { for (let i = 0; i < n; i++) this._buf.push(this._blank()); }

  flush() {
    process.stdout.write(ESC.home + this._buf.join('\n') + ESC.eraseDown);
    this._buf = [];
    this._lastFlush = Date.now();
  }

  tick() {
    if (Date.now() - this._lastFlush >= 80) this.flush();
    else this._buf = [];
  }

  // ── Shared header ─────────────────────────────────────────────
  _header(version, statusLine) {
    this.push(this._top(
      tok.warnBold('reap') + tok.muted(' · Disk Cleanup TUI'),
      tok.warn('v' + version)
    ));

    const hero =
      tok.warnBold('reap') +
      tok.warn('  ▣  ☠  ▣  ') +
      tok.warnBold('ELIMINATE DISK BLOAT');

    this.push(this._row(hero));
    this.push(this._row(tok.warn('─'.repeat(Math.max(8, this.IW - 6)))));
    this.push(this._row(statusLine));
  }

  _keybindings(pairs) {
    const txt = pairs
      .map(([k, v]) => tok.bold(k) + tok.dim(':' + v))
      .join(tok.muted('  ·  '));
    this.push(this._div());
    this.push(this._row(txt));
    this.push(this._bot());
  }

  // ── SCAN frame ─────────────────────────────────────────────────
  renderScan(version, scanText, foundCount) {
    const spin = tok.brand(SPIN[Math.floor(Date.now() / 80) % SPIN.length]);
    const status = spin + '  ' + rpad(tok.primary(scanText), 46) + tok.muted(fmtN(foundCount) + ' found');
    this._header(version, status);
    this.push(this._div());
    this.blank(2);

    // Animated wave to show activity — not a progress %
    const phase = (Date.now() % 1600) / 1600;
    const wave = 0.15 + 0.25 * Math.abs(Math.sin(phase * Math.PI));
    this.push(this._row(semanticBar(1e9, wave, this.IW - 4))); // use red for drama

    this.blank(Math.max(1, this.H - this._buf.length - 4));
    this._keybindings([['Ctrl+C', 'exit']]);
  }

  // ── REVIEW frame ───────────────────────────────────────────────
  renderReview(version, categories, cursorIdx, checked, flags) {
    // Sort display by size descending — biggest wasters first.
    // cursorIdx maps to this sorted order.
    const sorted = [...categories].sort((a, b) => b.size - a.size);

    const totalSize = sorted.reduce((s, c) => s + c.size, 0);
    const totalCount = sorted.reduce((s, c) => s + c.count, 0);
    const maxSize = sorted.length > 0 ? sorted[0].size : 1; // for relative bars

    // Opinionated header: tell user what they can free, not just show data
    const checkedCats = sorted.filter(c => checked.has(c.key));
    const toDelete = checkedCats
      .filter(c => c.defaultAction === 'Delete')
      .reduce((s, c) => s + c.size, 0);
    const toMove = checkedCats
      .filter(c => c.defaultAction === 'Move' && flags.destAvailable)
      .reduce((s, c) => s + c.size, 0);
    const freeable = toDelete + toMove;

    const freeMsg = freeable > 0
      ? tok.successBold('Free up  ' + fmtBytes(freeable)) + tok.muted('  by running this plan')
      : tok.muted('Select categories below to build a cleanup plan');

    this._header(version,
      freeMsg +
      (flags.dryRun ? '  ' + tok.warnBold('· DRY RUN') : '') +
      (flags.forceDelete ? '  ' + tok.dangerBold('· FORCE DELETE') : '')
    );

    // ── Category table ─────────────────────────────────────────
    this.push(this._div(tok.muted('top space wasters')));

    // Column layout
    const W = this.IW;
    const barW = 14, pctW = 4, sizeW = 10, actW = 12, numW = 3;
    const catW = Math.max(14, W - numW - sizeW - barW - pctW - actW - 12);

    // Table header — muted, doesn't compete with data
    this.push(this._row(
      tok.muted(rpad('  # ', numW + 1)) + tok.brand('│') +
      tok.muted(rpad(' Category', catW + 1)) + tok.brand('│') +
      tok.muted(lpad('Size', sizeW)) + ' ' + tok.brand('│') +
      tok.muted(rpad(' Reclaim', barW + pctW + 1)) + tok.brand('│') +
      tok.muted(' Action')
    ));

    // Separator
    this.push(this._row(
      tok.muted('─'.repeat(numW + 1)) + tok.brand('┼') +
      tok.muted('─'.repeat(catW + 1)) + tok.brand('┼') +
      tok.muted('─'.repeat(sizeW + 1)) + tok.brand('┼') +
      tok.muted('─'.repeat(barW + pctW + 1)) + tok.brand('┼') +
      tok.muted('─'.repeat(actW + 1))
    ));

    sorted.forEach((cat, i) => {
      const active = i === cursorIdx;
      const isChk = checked.has(cat.key);
      const hasItems = cat.count > 0;

      const ptr = active ? '▶' : ' ';
      const chk = isChk ? '✓' : '·';
      const lbl = hasItems ? cat.label : cat.label;

      // Relative bar — largest gets full width
      const ratio = maxSize > 0 && hasItems ? cat.size / maxSize : 0;
      const bar = hasItems
        ? semanticBar(cat.size, ratio, barW) + tok.muted(fmtPct(cat.size, totalSize))
        : tok.muted('░'.repeat(barW) + '   0%');
      const sz = hasItems ? fmtBytesC(cat.size) : tok.muted('      ─');
      const act = hasItems ? actLabel(cat.defaultAction, flags.destAvailable) : tok.muted('──────────');
      const num = String(i + 1).padStart(numW);

      // Build raw content (with ANSI for non-cursor rows)
      const coloredContent =
        tok.muted(num) + ' ' + tok.brand('│') + ' ' +
        rpad(ptr + ' ' + (isChk ? tok.success(chk) : tok.muted(chk)) + ' ' + (hasItems ? tok.primary(lbl) : tok.muted(lbl)), catW) +
        tok.brand('│') + lpad(sz, sizeW) + ' ' + tok.brand('│') + ' ' +
        bar + ' ' + tok.brand('│') + ' ' + act;

      // Plain content for cursor row (bgCyan wipes color)
      const plainContent =
        num + ' │ ' +
        rpad(ptr + ' ' + chk + ' ' + lbl, catW) +
        '│' + fmtBytes(cat.size).padStart(sizeW) + ' │ ' +
        '░'.repeat(barW) + fmtPct(cat.size, totalSize) + ' │ ' +
        (cat.defaultAction === 'Delete' ? '[D] Delete' : cat.defaultAction === 'Move' ? '[M] Move  ' : '──────────');

      if (active) {
        this.push(this._cursorRow(plainContent));
      } else {
        this.push(this._row(coloredContent));
      }
    });

    // ── Preview panel — files in focused category ─────────────
    const activeCat = sorted[cursorIdx];
    const hasPreview = activeCat && activeCat.items && activeCat.items.length > 0;

    if (hasPreview) {
      const topFiles = [...activeCat.items]
        .sort((a, b) => (b.size || 0) - (a.size || 0))
        .slice(0, 4);

      const cntLabel = tok.muted(topFiles.length + ' of ' + fmtN(activeCat.items.length) + ' items');
      this.push(this._div(tok.muted(activeCat.label), cntLabel));

      for (const [i, item] of topFiles.entries()) {
        const isLast = i === topFiles.length - 1;
        const conn = isLast ? tok.muted('└─') : tok.muted('├─');
        const sz = fmtBytesC(item.size || 0);
        const maxPW = this.IW - 18;
        const p = item.path.length > maxPW ? '…' + item.path.slice(-(maxPW - 1)) : item.path;
        this.push(this._row(conn + ' ' + lpad(sz, 10) + '  ' + tok.muted(p)));
      }
    } else {
      this.push(this._div());
      this.push(this._row(tok.muted('No files in this category.')));
    }

    // Fill remaining height
    this.blank(Math.max(0, this.H - this._buf.length - 5));

    // ── Decision summary — opinionated, not neutral ───────────
    this.push(this._div());
    const parts = [];
    if (toDelete > 0) parts.push(tok.danger(fmtBytes(toDelete)) + tok.muted(' to delete'));
    if (toMove > 0) parts.push(tok.warn(fmtBytes(toMove)) + tok.muted(' to move'));
    if (parts.length === 0) parts.push(tok.muted('Nothing selected — use Space to toggle categories'));
    const summaryLine = !flags.destAvailable && !flags.dryRun
      ? parts.join(tok.muted('  ·  ')) + tok.muted('  ·  ') + tok.warn('no destination drive set')
      : parts.join(tok.muted('  ·  '));
    this.push(this._row(summaryLine));

    this._keybindings([
      ['Enter', 'confirm'], ['Space', 'select'],
      ['D', 'delete'], ['M', 'move'],
      ['↑↓', 'navigate'], ['Q', 'quit'],
    ]);
  }

  // ── CONFIRM frame ──────────────────────────────────────────────
  renderConfirm(version, plan) {
    this._header(version, tok.warnBold('Confirm plan  ') + tok.muted('review before running'));
    this.push(this._div());
    this.blank();

    for (const item of plan) {
      const icon = item.action === 'delete'
        ? tok.dangerBold('  ✕  DELETE')
        : tok.warnBold('  →   MOVE ');
      const label = rpad(tok.primary(item.label), 34);
      const sz = fmtBytesC(item.size);
      this.push(this._row(icon + '  ' + label + '  ' + sz));
    }

    this.blank(Math.max(1, this.H - this._buf.length - 5));
    this.push(this._div());
    this.push(this._row(tok.muted('Proceed with this plan?')));
    this._keybindings([['Y', 'yes, proceed'], ['N / Q', 'cancel']]);
  }

  // ── EXECUTE frame ──────────────────────────────────────────────
  renderExecute(version, catLabel, action, done, total) {
    const ratio = total > 0 ? done / total : 0;
    const actC = action === 'delete' ? tok.danger : tok.warn;
    const verb = action === 'delete' ? 'DELETING' : 'MOVING';
    const status = actC(verb + '  ') +
      rpad(tok.primary(catLabel), 34) +
      tok.muted(fmtN(done) + ' / ' + fmtN(total));

    this._header(version, status);
    this.push(this._div());
    this.blank(2);
    this.push(this._row(semanticBar(action === 'delete' ? 1e9 : 500e6, ratio, this.IW - 4)));
    this.blank();
    this.push(this._row(lpad(tok.bold(Math.round(ratio * 100) + '%'), 6)));
    this.blank(Math.max(1, this.H - this._buf.length - 3));
    this.push(this._bot());
  }

  // ── DONE frame ─────────────────────────────────────────────────
  renderDone(version, results, destRoot, dryRun) {
    const title = dryRun ? tok.warnBold('DRY RUN COMPLETE') : tok.successBold('ALL DONE!');
    const color = dryRun ? tok.warn : tok.success;
    this._header(version, title);
    this.push(this._div());
    this.blank();

    this.push(this._row(tok.muted('Processed  ') + color(fmtN(results.done) + ' items')));
    if (results.moved > 0) this.push(this._row(tok.muted('Moved to   ') + tok.warn(destRoot || '')));
    if (results.skipped > 0) this.push(this._row(tok.muted('Skipped    ') + tok.muted(fmtN(results.skipped) + ' (locked or in use)')));
    this.blank();
    if (dryRun) this.push(this._row(tok.dim('Re-run without --dry-run to apply changes.')));

    this.blank(Math.max(0, this.H - this._buf.length - 4));
    this.push(this._div());
    this.push(this._row(tok.dim('Press any key to exit.')));
    this.push(this._bot());
  }

  // ── FORCE DELETE frame ──────────────────────────────────────────
  renderForceDelete(version) {
    this.push(this._top(tok.dangerBold('!! FORCE DELETE'), tok.muted('v' + version)));
    this.push(this._row(tok.dangerBold('PERMANENT DELETION — files will NOT go to Trash / Recycle Bin.')));
    this.push(this._div());
    this.blank();
    this.push(this._row(tok.danger('All selected DELETE actions will bypass the OS trash.')));
    this.push(this._row(tok.danger('This cannot be undone.')));
    this.blank();
    this.push(this._row(tok.muted('Type  DELETE  exactly (all caps) and press Enter to continue.')));
    this.blank(Math.max(1, this.H - this._buf.length - 4));
    this.push(this._div());
    this.push(this._row(tok.dim('Press Ctrl+C to abort.')));
    this.push(this._bot());
    this.flush();
  }
}

// ── Raw keyboard input ──────────────────────────────────────────
function enableRaw() {
  if (process.stdin.isTTY) process.stdin.setRawMode(true);
  process.stdin.resume();
  process.stdin.setEncoding('utf8');
}

function disableRaw() {
  if (process.stdin.isTTY) process.stdin.setRawMode(false);
  process.stdin.pause();
}

function nextKey() {
  return new Promise(resolve => process.stdin.once('data', resolve));
}

// ── Interactive review UI ───────────────────────────────────────
async function runReview(screen, version, categories, flags) {
  const visible = categories.filter(c => c.count > 0);
  if (visible.length === 0) return null;

  // Sort by size descending for display. cursor maps to this sorted order.
  const sorted = [...visible].sort((a, b) => b.size - a.size);

  let cursorIdx = 0;
  const checked = new Set(
    sorted.filter(c => c.defaultChecked !== false).map(c => c.key)
  );

  process.stdout.write(ESC.altOn + ESC.hideCursor);
  enableRaw();

  const render = () => {
    screen.renderReview(version, sorted, cursorIdx, checked, flags);
    screen.flush();
  };

  render();

  while (true) {
    const key = await nextKey();

    if (key === '\u0003' || key === 'q' || key === 'Q') {
      disableRaw();
      process.stdout.write(ESC.altOff + ESC.showCursor);
      return null;
    }

    if (key === '\u001b[A' || key === 'k') cursorIdx = Math.max(0, cursorIdx - 1);
    else if (key === '\u001b[B' || key === 'j') cursorIdx = Math.min(sorted.length - 1, cursorIdx + 1);
    else if (key === ' ') {
      const cat = sorted[cursorIdx];
      if (checked.has(cat.key)) checked.delete(cat.key);
      else checked.add(cat.key);
    }
    else if (key === 'd' || key === 'D') {
      sorted[cursorIdx].defaultAction = 'Delete';
    }
    else if ((key === 'm' || key === 'M') && flags.destAvailable) {
      sorted[cursorIdx].defaultAction = 'Move';
    }
    else if (key === '\r' || key === '\n') {
      if (checked.size === 0) continue;
      break;
    }

    render();
  }

  // Build plan
  const selectedKeys = [...checked];
  const plan = selectedKeys.map(k => {
    const cat = sorted.find(c => c.key === k);
    const action = (cat.defaultAction === 'Move' && flags.destAvailable) ? 'move' : 'delete';
    return { key: k, label: cat.label, size: cat.size, action };
  });

  // Confirm
  screen.renderConfirm(version, plan);
  screen.flush();

  let confirmed = false;
  while (true) {
    const key = await nextKey();
    if (key === 'y' || key === 'Y') { confirmed = true; break; }
    if (key === 'n' || key === 'N' || key === 'q' || key === '\u0003') break;
  }

  disableRaw();
  process.stdout.write(ESC.altOff + ESC.showCursor);

  if (!confirmed) return null;

  const actionMap = {};
  for (const item of plan) actionMap[item.key] = item.action;
  return { selectedKeys, actionMap };
}

// ── Force delete gate ───────────────────────────────────────────
async function confirmForceDelete(screen, version) {
  process.stdout.write(ESC.altOn + ESC.hideCursor);
  screen.renderForceDelete(version);
  process.stdout.write(ESC.altOff + ESC.showCursor);

  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  const answer = await new Promise(resolve =>
    rl.question('\n  ' + tok.dangerBold('Type DELETE to confirm: '), resolve)
  );
  rl.close();
  return answer.trim() === 'DELETE';
}

module.exports = {
  Screen, ESC, tok,
  fmtBytes, fmtBytesC, fmtN, fmtPct,
  semanticBar, actLabel,
  enableRaw, disableRaw, nextKey,
  runReview, confirmForceDelete,
};
