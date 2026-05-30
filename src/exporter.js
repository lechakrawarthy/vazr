'use strict';

const fs = require('fs');
const path = require('path');

/**
 * Serialize scan results as JSON.
 * @param {object[]} categories
 * @param {object} meta
 * @returns {string}
 */
function toJSON(categories, meta) {
  const out = {
    generated: new Date().toISOString(),
    meta,
    categories: categories.map(c => ({
      key: c.key,
      label: c.label,
      count: c.count,
      totalSizeBytes: c.size,
      items: (c.items || []).map(item => ({
        path: item.path,
        sizeBytes: item.size || 0,
      })),
    })),
  };
  return JSON.stringify(out, null, 2);
}

/**
 * Serialize scan results as CSV (flat file list).
 * @param {object[]} categories
 * @returns {string}
 */
function toCSV(categories) {
  const rows = ['category,path,size_bytes'];
  for (const c of categories) {
    for (const item of c.items || []) {
      const escapedPath = '"' + (item.path || '').replace(/"/g, '""') + '"';
      rows.push(`${c.key},${escapedPath},${item.size || 0}`);
    }
  }
  return rows.join('\n');
}

/**
 * Export scan results to stdout or a file.
 * @param {object[]} categories
 * @param {object} meta - { version, dryRun, scanDurationMs, ... }
 * @param {{ format: 'json'|'csv', outputPath?: string }} exportOpts
 */
function exportResults(categories, meta, exportOpts) {
  const fmt = (exportOpts.format || 'json').toLowerCase();
  const content = fmt === 'csv' ? toCSV(categories) : toJSON(categories, meta);

  if (exportOpts.outputPath) {
    fs.mkdirSync(path.dirname(exportOpts.outputPath), { recursive: true });
    fs.writeFileSync(exportOpts.outputPath, content, 'utf8');
  } else {
    process.stdout.write(content + '\n');
  }
}

module.exports = { exportResults };
