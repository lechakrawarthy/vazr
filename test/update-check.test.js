'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const { checkForUpdate, isNewer } = require('../src/update-check');

test('isNewer compares dotted version numbers correctly', () => {
    assert.equal(isNewer('1.4.0', '1.3.2'), true);
    assert.equal(isNewer('1.3.2', '1.3.2'), false);
    assert.equal(isNewer('1.3.1', '1.3.2'), false);
    assert.equal(isNewer('2.0.0', '1.9.9'), true);
    assert.equal(isNewer('1.3.10', '1.3.9'), true);
});

test('checkForUpdate resolves null without making a network call when disabled', async () => {
    const result = await checkForUpdate({ enabled: false });
    assert.equal(result, null);
});

test('checkForUpdate resolves null when CI env var is set', async () => {
    const orig = process.env.CI;
    process.env.CI = 'true';
    const result = await checkForUpdate();
    if (orig === undefined) delete process.env.CI; else process.env.CI = orig;
    assert.equal(result, null);
});
