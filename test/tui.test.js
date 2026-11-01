'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { resolveAction, ANSI_RE } = require('../src/tui/tokens');
const { Screen } = require('../src/tui/screen');

// ── resolveAction ─────────────────────────────────────────────

test('resolveAction never turns Skip into a delete', () => {
  assert.equal(resolveAction('Skip', false), null);
  assert.equal(resolveAction('Skip', true), null);
  assert.equal(resolveAction('Delete', false), 'delete');
  assert.equal(resolveAction('Move', true), 'move');
  assert.equal(resolveAction('Move', false), 'delete');
});

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

// ── item picker ───────────────────────────────────────────────

test('withSelection shows only the items still selected', () => {
  const { withSelection } = require('../src/tui/review');
  const cat = { key: 't', label: 'Temp', count: 3, size: 6, items: [{ path: 'a', size: 1 }, { path: 'b', size: 2 }, { path: 'c', size: 3 }] };
  assert.equal(withSelection(cat, new Set()), cat);
  const view = withSelection(cat, new Set(['c']));
  assert.equal(view.label, 'Temp (2/3)');
  assert.equal(view.size, 3);
  assert.equal(view.count, 2);
});

test('renderItems marks left-out items and totals the rest', () => {
  const screen = new Screen();
  Object.defineProperty(screen, 'W', { get: () => 120 });
  Object.defineProperty(screen, 'H', { get: () => 40 });
  const items = [{ path: '/p/one/node_modules', size: 3e6, ecosystem: 'Node', lastActivityMs: Date.now() - 45 * 86400000 },
    { path: '/p/two/node_modules', size: 1e6 }];
  screen.renderItems('x', { label: 'Dev' }, items, 0, new Set(['/p/two/node_modules']));
  const text = screen._buf.map(l => l.replace(ANSI_RE, '')).join('\n');
  assert.match(text, /1 of 2 selected/);
  assert.match(text, /3\.00 MB/);
  assert.match(text, /Node · idle 45d/);
});
