'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const {
    parsePositiveInteger,
    assertTargetPathSafe,
} = require('../src/validators');

test('parsePositiveInteger accepts valid positive integers', () => {
    assert.equal(parsePositiveInteger('42', '--x'), 42);
    assert.equal(parsePositiveInteger(3, '--x'), 3);
});

test('parsePositiveInteger rejects invalid values', () => {
    assert.throws(() => parsePositiveInteger('0', '--x'), /positive integer/);
    assert.throws(() => parsePositiveInteger('-5', '--x'), /positive integer/);
    assert.throws(() => parsePositiveInteger('abc', '--x'), /positive integer/);
});

test('assertTargetPathSafe rejects filesystem roots', () => {
    if (process.platform === 'win32') {
        assert.throws(() => assertTargetPathSafe('C:\\'), /filesystem root/);
    } else {
        assert.throws(() => assertTargetPathSafe('/'), /filesystem root/);
    }
});
