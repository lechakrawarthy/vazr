'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');

const { loadConfig, buildRuntimeOptions } = require('../src/config');

test('buildRuntimeOptions applies defaults, then config, then cli options', () => {
    const config = { minMediaMB: 50, oldDays: 30 };
    const cli = { oldDays: 7 };
    const result = buildRuntimeOptions(cli, config);

    assert.equal(result.minMediaMB, 50);
    assert.equal(result.oldDays, 7);
    assert.equal(result.dryRun, false);
});

test('loadConfig reads explicit config path JSON', () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'disk-cleanup-config-test-'));
    const configPath = path.join(tempDir, 'config.json');
    fs.writeFileSync(configPath, JSON.stringify({ minLargeMB: 321 }), 'utf8');

    const loaded = loadConfig(configPath);
    assert.equal(loaded.config.minLargeMB, 321);
    assert.equal(loaded.configPath, configPath);
});

test('loadConfig throws for invalid JSON', () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'disk-cleanup-config-test-'));
    const configPath = path.join(tempDir, 'broken.json');
    fs.writeFileSync(configPath, '{bad json', 'utf8');

    assert.throws(() => loadConfig(configPath), /Invalid JSON/);
});
