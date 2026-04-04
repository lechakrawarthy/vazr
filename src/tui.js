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
const rpad = (s, w) => { 
  const d = w - vlen(s); 
  return d > 0 ? s + ' '.repeat(d) : s; 
};
const lpad = (s, w) => { 
  const d = w - vlen(s); 
  return d > 0 ? ' '.repeat(d) + s : s; 
};
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

const SPIN = '⠋⠙⠹⠸⠼⠴⠦⠧⠇⠏';

// ── Screen ─────────────────────────────────────────────────────
class Screen {
  constructor() {
    this._buf = [];
    this._lastFlush = 0;
    process.stdout.on('resize', () => { });
  }

  get W() { return (process.stdout.columns || 100) - 1; } // Safety buffer to prevent terminal edge wrap
  get H() { return (process.stdout.rows || 30) - 1; } // Safety buffer to prevent bottom scrolling

  push(s) { 
    if (this._buf.length < this.H) {
      this._buf.push(s); 
    }
  }
  
  blank(n = 1) { 
    for (let i = 0; i < n; i++) {
      if (this._buf.length < this.H) this._buf.push(''); 
    }
  }

  flush() {
    process.stdout.write(ESC.home + this._buf.join('\n') + ESC.eraseDown);
    this._buf = [];
    this._lastFlush = Date.now();
  }

  tick() {
    if (Date.now() - this._lastFlush >= 80) this.flush();
    else this._buf = [];
  }

  // ── Shared header & footer ────────────────────────────────────
  _header(metaLeft, metaRight) {
    const art = [
      "██╗   ██╗  █████╗ ███████╗██████╗           ☠  ELIMINATE DISK BLOAT  ☠",
      "██║   ██║ ██╔══██╗╚══███╔╝██╔══██╗         ╔═══════════════════════════╗",
      "╚██╗ ██╔╝ ███████║  ███╔╝ ██████╔╝         ║  FIND · REVIEW · DESTROY  ║",
      " ╚████╔╝  ██╔══██║███████╗██╔══██╗         ╚═══════════════════════════╝",
    ];
    for (const a of art) this.push(tok.brand(a));
    this.push(tok.brandDim('─'.repeat(this.W)));
    
    const mlLen = vlen(metaLeft);
    const mrLen = vlen(metaRight);
    if (mlLen + mrLen + 2 > this.W) {
      this.push(metaLeft);
      this.push(lpad(metaRight, this.W));
    } else {
      const space = Math.max(0, this.W - mlLen - mrLen);
      this.push(metaLeft + ' '.repeat(space) + metaRight);
    }
    this.push(tok.brandDim('─'.repeat(this.W)));
  }

  _footer(info) {
    this.push(tok.brandDim('─'.repeat(this.W)));
    const dkill = tok.muted('VAZR v2');
    const dLen = vlen(dkill);
    const iLen = vlen(info);
    
    if (iLen + dLen + 2 > this.W) {
      this.push('  ' + info);
    } else {
      const space = Math.max(0, this.W - iLen - dLen);
      this.push(info + ' '.repeat(space) + dkill);
    }
  }

  // ── SCAN frame ─────────────────────────────────────────────────
  renderScan(version, scanText, foundCount) {
    const spin = tok.brand(SPIN[Math.floor(Date.now() / 80) % SPIN.length]);
    const mw = this.W - 30;
    const st = scanText.length > mw ? '…' + scanText.slice(-mw) : scanText;
    const ml = spin + '  ' + tok.primary(st);
    const mr = tok.muted(fmtN(foundCount) + ' found');
    this._header(ml, mr);
    this.blank(2);

    const phase = (Date.now() % 1600) / 1600;
    const wave = 0.15 + 0.25 * Math.abs(Math.sin(phase * Math.PI));
    this.push('  ' + semanticBar(1e9, wave, Math.max(10, this.W - 4)));

    this.blank(Math.max(1, this.H - this._buf.length - 2));
    this._footer(tok.muted('Press Ctrl+C to exit'));
  }

  // ── REVIEW frame ───────────────────────────────────────────────
  renderReview(version, categories, cursorIdx, checked, flags) {
    const sorted = [...categories].sort((a, b) => b.size - a.size);
    const totalSize = sorted.reduce((s, c) => s + c.size, 0);
    const totalCount = sorted.reduce((s, c) => s + c.count, 0);
    const maxSize = sorted.length > 0 ? sorted[0].size : 1;

    const toDel = sorted.filter(c => checked.has(c.key) && c.defaultAction === 'Delete').reduce((s, c) => s + c.size, 0);
    const toMov = sorted.filter(c => checked.has(c.key) && c.defaultAction === 'Move' && flags.destAvailable).reduce((s, c) => s + c.size, 0);
    const freeable = toDel + toMov;

    const flicker = Math.floor(Date.now() / 900) % 2 === 0;
    const pill = chalk.bgHex('#1a2a1a').green(' ' + (flicker ? tok.brand('◉') : tok.brandDim('◉')) + ' SCAN COMPLETE ') +
      tok.primary(` — ${categories.length} cats · ${fmtN(totalCount)} files`) +
      (flags.dryRun ? '  ' + tok.warnBold('· DRY RUN') : '') +
      (flags.forceDelete ? '  ' + tok.dangerBold('· FORCE DELETE') : '');

    const freeMsg = tok.muted('FREE: ') + (freeable > 0 ? tok.brand('↑ ' + fmtBytes(freeable)) + ' ' : tok.muted('---'));
    this._header(pill, freeMsg);

    const W = this.W;
    const isSplit = W >= 90;
    const rW = 34;
    const lW = isSplit ? W - rW - 3 : W;

    const leftCols = [];
    const numW = 2;
    const barW = 10;
    const pctW = 4;
    const sizeW = 10;
    const actW = 10;
    
    // Total fixed spaces = numW(2)+1+1+1+1+1 + 2+sizeW(10)+2+barW(10)+1+pctW(4)+2+actW(10) = 47
    const catW = Math.max(10, lW - numW - sizeW - barW - pctW - actW - 14);

    leftCols.push(
      tok.muted(rpad(' #', numW + 1)) + ' ' +
      tok.muted(rpad('CATEGORY', catW + 4)) +
      tok.muted(lpad('SIZE', sizeW)) + '  ' +
      tok.muted(rpad('RECLAIM %', barW + pctW + 2)) +
      tok.muted(rpad('ACTION', actW))
    );
    leftCols.push(tok.brandDim('─'.repeat(lW)));

    sorted.forEach((cat, i) => {
      const active = i === cursorIdx;
      const isChk = checked.has(cat.key);
      const hasItems = cat.count > 0;

      const ptr = active ? tok.brand('▶') : ' ';
      const chk = isChk ? tok.brand('✓') : tok.brandDim('·');
      
      const baseLbl = cat.label.length > catW ? cat.label.substring(0, catW - 1) + '…' : cat.label;
      const lbl = hasItems ? tok.primary(baseLbl) : tok.muted(baseLbl);

      const ratio = maxSize > 0 && hasItems ? cat.size / maxSize : 0;
      const barFilled = Math.round(clamp(ratio, 0, 1) * barW);
      const bColor = cat.size >= 1e9 ? chalk.red : cat.size >= 100e6 ? chalk.yellow : tok.brand;
      const barStr = hasItems ? bColor('▓'.repeat(barFilled)) + tok.dim('░'.repeat(barW - barFilled)) : tok.dim('░'.repeat(barW));
      const pctStr = hasItems ? fmtPct(cat.size, totalSize) : '  0%';

      const sz = hasItems ? fmtBytesC(cat.size) : tok.muted('       0 B');
      const act = hasItems ? actLabel(cat.defaultAction, flags.destAvailable) : tok.muted('──────');
      const num = tok.muted(String(i + 1).padStart(numW));

      const rowContent = num + '  ' + ptr + ' ' + chk + ' ' + rpad(lbl, catW) + '  ' +
        lpad(sz, sizeW) + '  ' +
        barStr + ' ' + tok.muted(rpad(pctStr, pctW)) + '  ' +
        act;

      if (active) {
        const fill = rpad(rowContent, lW);
        leftCols.push(chalk.bgHex('#0a200a')(fill)); 
      } else {
        leftCols.push(rpad(rowContent, lW));
      }
    });

    const rightCols = [];
    if (isSplit) {
      rightCols.push(tok.muted('FILES IN FOCUS'.padEnd(rW)));
      rightCols.push(tok.brandDim('─'.repeat(rW)));

      const activeCat = sorted[cursorIdx];
      if (activeCat && activeCat.items && activeCat.items.length > 0) {
        const topFiles = [...activeCat.items].sort((a, b) => (b.size || 0) - (a.size || 0)).slice(0, 6);
        for (let i = 0; i < topFiles.length; i++) {
          const item = topFiles[i];
          const conn = i === topFiles.length - 1 ? '└─' : '├─';
          const sz = fmtBytesC(item.size || 0);
          const mw = Math.max(5, rW - 14);
          const p = item.path.length > mw ? '…' + item.path.slice(-(mw - 1)) : item.path;
          rightCols.push(tok.brandDim(conn) + ' ' + lpad(sz, 8) + ' ' + tok.muted(p));
        }
      } else {
        rightCols.push(tok.muted('No file data.'));
      }

      // We reserve ~8 lines for summary
      const availSpace = this.H - this._buf.length - leftCols.length;
      let padH = Math.max(0, availSpace - rightCols.length - 8 - 2); // 2 for footer 

      const summary = [];
      const selSize = sorted.filter(c => checked.has(c.key)).reduce((s, c) => s + c.size, 0);
      summary.push(tok.brandDim('─'.repeat(rW)));
      summary.push(tok.muted('Total found   ') + lpad(tok.primary(fmtBytes(totalSize)), rW - 14 + vlen(tok.primary(''))));
      summary.push(tok.muted('Selected      ') + lpad(tok.primary(fmtBytes(selSize)), rW - 14 + vlen(tok.primary(''))));
      summary.push(tok.muted('To delete     ') + lpad(tok.danger(fmtBytes(toDel)), rW - 14 + vlen(tok.danger(''))));
      summary.push(tok.muted('To move       ') + lpad(tok.warn(fmtBytes(toMov)), rW - 14 + vlen(tok.warn(''))));
      summary.push('');
      const frees = freeable > 0 ? tok.brand('↑ FREE ' + fmtBytes(freeable)) : tok.muted('Select categories');
      summary.push(chalk.bgHex('#0a1a0a')(rpad('  ' + frees, rW)));

      while (rightCols.length + summary.length < leftCols.length) rightCols.push('');
      rightCols.push(...summary);
    }

    const maxH = isSplit ? Math.max(leftCols.length, rightCols.length) : leftCols.length;
    for (let i = 0; i < maxH; i++) {
      let L = leftCols[i] || '';
      if (isSplit) L = rpad(L, lW);

      if (isSplit) {
        let R = rightCols[i] || '';
        this.push(L + ' ' + tok.brandDim('│') + ' ' + R);
      } else {
        if (leftCols[i]) this.push(leftCols[i]);
      }
    }

    if (!isSplit) {
      const selSize = sorted.filter(c => checked.has(c.key)).reduce((s, c) => s + c.size, 0);
      // We only append summary if we have room!
      if (this._buf.length + 6 < this.H) {
          this.push(tok.brandDim('─'.repeat(this.W)));
          this.push(tok.muted('Selected      ') + tok.primary(fmtBytes(selSize)));
          this.push(tok.muted('To delete     ') + tok.danger(fmtBytes(toDel)));
          this.push(tok.muted('To move       ') + tok.warn(fmtBytes(toMov)));
          const frees = freeable > 0 ? tok.brand('↑ FREE ' + fmtBytes(freeable)) : tok.muted('Select categories');
          this.push(frees);
      }
    }

    this.blank(Math.max(0, this.H - this._buf.length - 2));

    const binds = [
      ['↑↓', 'nav'],
      ['Space', 'tog'],
      ['D', 'del'],
      ['M', 'mov'],
      ['Enter', 'run'],
      ['Q', 'quit']
    ];
    let bstrs = [];
    let curLen = 0;
    for (const [k, d] of binds) {
       const str = chalk.bgHex('#1a2a1a').green(' ' + k + ' ') + tok.muted(' ' + d);
       const l = vlen(str);
       if (curLen + l + 3 < this.W) {
           bstrs.push(str);
           curLen += l + 3;
       }
    }
    this._footer(bstrs.join('   '));
  }

  // ── CONFIRM frame ──────────────────────────────────────────────
  renderConfirm(version, plan) {
    this._header(tok.brand(' ☠ Confirm Plan'), tok.muted('review before running'));
    this.blank();

    for (const item of plan) {
      const icon = item.action === 'delete' ? tok.danger('✕ DELETE') : tok.warn('→  MOVE ');
      const maxL = Math.max(10, this.W - 30);
      const lText = item.label.length > maxL ? item.label.substring(0, maxL-1)+'…' : item.label;
      const label = rpad(tok.primary(lText), maxL + 4);
      const sz = fmtBytesC(item.size);
      this.push('    ' + icon + '  ' + label + '  ' + sz);
    }
    this.blank(Math.max(1, this.H - this._buf.length - 2));

    const binds = [['Y', 'Yes, proceed'], ['N / Q', 'Cancel']];
    const info = tok.muted('Proceed?   ') + binds.map(([k, d]) => chalk.bgHex('#1a2a1a').green(' ' + k + ' ') + tok.muted(' ' + d)).join('   ');
    this._footer(info);
  }

  // ── EXECUTE frame ──────────────────────────────────────────────
  renderExecute(version, catLabel, action, done, total) {
    const ratio = total > 0 ? done / total : 0;
    const actC = action === 'delete' ? tok.danger : tok.warn;
    const verb = action === 'delete' ? 'DELETING' : 'MOVING';
    
    const ml = actC(verb + '  ') + tok.primary(catLabel.substring(0, Math.max(10, this.W-40)));
    const mr = tok.muted(fmtN(done) + ' / ' + fmtN(total));

    this._header(ml, mr);
    this.blank(2);
    this.push('  ' + semanticBar(action === 'delete' ? 1e9 : 500e6, ratio, Math.max(10, this.W - 4)));
    this.blank();
    this.push('  ' + tok.bold(Math.round(ratio * 100) + '%'));

    this.blank(Math.max(1, this.H - this._buf.length - 2));
    this._footer(tok.muted('Executing cleanup plan...'));
  }

  // ── DONE frame ─────────────────────────────────────────────────
  renderDone(version, results, destRoot, dryRun) {
    const title = dryRun ? tok.warnBold('DRY RUN COMPLETE') : tok.successBold('✓ ALL DONE!');
    this._header(title, '');
    this.blank();

    this.push('  ' + tok.muted('Processed  ') + tok.success(fmtN(results.done) + ' items'));
    if (results.moved > 0) this.push('  ' + tok.muted('Moved to   ') + tok.warn((destRoot || '').substring(0, Math.max(10, this.W-20))));
    if (results.skipped > 0) this.push('  ' + tok.muted('Skipped    ') + tok.muted(fmtN(results.skipped) + ' (locked or in use)'));
    this.blank();
    if (dryRun) this.push('  ' + tok.dim('Re-run without --dry-run to apply changes.'));

    this.blank(Math.max(0, this.H - this._buf.length - 2));
    this._footer(tok.muted('Press any key to dismiss'));
  }

  // ── FORCE DELETE frame ──────────────────────────────────────────
  renderForceDelete(version) {
    this._header(tok.dangerBold('!! FORCE DELETE !!'), tok.muted('v' + version));
    this.blank();
    this.push('  ' + tok.dangerBold('PERMANENT DELETION — files will NOT go to Trash / Recycle Bin.'));
    this.blank();
    this.push('  ' + tok.danger('All selected DELETE actions will bypass the OS trash.'));
    this.push('  ' + tok.danger('This cannot be undone.'));
    this.blank();
    this.push('  ' + tok.muted('Type  DELETE  exactly (all caps) and press Enter to continue.'));

    this.blank(Math.max(1, this.H - this._buf.length - 2));
    this._footer(tok.muted('Press Ctrl+C to abort'));
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
    else if ((key === 'm' || key === 'M') && flags.destAvailable && !sorted[cursorIdx].isDir) {
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
