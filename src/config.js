'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');

const APP_DIR = path.join(os.homedir(), '.disk-cleanup-tui');
const DEFAULT_CONFIG_PATHS = [
    path.join(APP_DIR, 'config.json'),
    path.join(os.homedir(), '.disk-cleanup-tui.json'),
];

function getDefaultOptions() {
    return {
        dryRun: false,
        target: process.platform === 'win32' ? 'H:\\dev_hardware_moved' : null,
        minMediaMB: 100,
        minLargeMB: 500,
        oldDays: 60,
        forceDelete: false,
        logFile: path.join(APP_DIR, 'logs', 'cleanup.log'),
    };
}

function findConfigPath(customPath) {
    if (customPath) return customPath;
    if (process.env.DISK_CLEANUP_CONFIG) return process.env.DISK_CLEANUP_CONFIG;

    for (const candidate of DEFAULT_CONFIG_PATHS) {
        if (fs.existsSync(candidate)) return candidate;
    }
    return null;
}

function loadConfig(customPath) {
    const configPath = findConfigPath(customPath);
    if (!configPath) {
        return { config: {}, configPath: null };
    }

    if (!fs.existsSync(configPath)) {
        throw new Error('Config file not found: ' + configPath);
    }

    let raw;
    try {
        raw = fs.readFileSync(configPath, 'utf8');
    } catch (err) {
        throw new Error('Unable to read config file: ' + err.message);
    }

    let parsed;
    try {
        parsed = JSON.parse(raw);
    } catch (err) {
        throw new Error('Invalid JSON in config file: ' + configPath);
    }

    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
        throw new Error('Config root must be a JSON object: ' + configPath);
    }

    return { config: parsed, configPath };
}

function pickDefined(source, keys) {
    const result = {};
    for (const key of keys) {
        if (Object.prototype.hasOwnProperty.call(source, key) && source[key] !== undefined) {
            result[key] = source[key];
        }
    }
    return result;
}

function buildRuntimeOptions(cliOptions, configOptions) {
    const defaults = getDefaultOptions();
    return {
        ...defaults,
        ...pickDefined(configOptions || {}, Object.keys(defaults)),
        ...pickDefined(cliOptions || {}, Object.keys(defaults)),
    };
}

module.exports = {
    APP_DIR,
    getDefaultOptions,
    loadConfig,
    buildRuntimeOptions,
};
