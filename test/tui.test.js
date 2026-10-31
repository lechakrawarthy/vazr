'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { ANSI_RE } = require('../src/tui/tokens');
const { Screen } = require('../src/tui/screen');

// ── renderReview ──────────────────────────────────────────────

test('renderReview points at the row cursorIdx refers to, in the order given', () => {
  const screen = new Screen();
  Object.defineProperty(screen, 'W', { get: () => 120 });
  Object.defineProperty(screen, 'H', { get: () => 40 });
  // Name-sorted order: the smaller category comes first.
  const cats = [
    { key: 'a', label: 'Alpha small', size: 10, count: 1, items: [], defaultAction: 'Delete' },
    { key: 'b', label: 'Beta huge', size: 1e9, count: 1, items: [], defaultAction: 'Delete' },
  ];
  screen.renderReview('x', cats, 0, new Set(), { destAvailable: false });
  const pointerRow = screen._buf.map(l => l.replace(ANSI_RE, '')).find(l => l.includes('▶'));
  assert.ok(pointerRow && pointerRow.includes('Alpha small'), 'cursor 0 must be the first category passed in');
});
