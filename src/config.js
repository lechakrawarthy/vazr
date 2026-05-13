'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');

const APP_DIR = path.join(os.homedir(), '.vazr');
const DEFAULT_CONFIG_PATHS = [
    path.join(APP_DIR, 'config.json'),
    path.join(os.homedir(), '.vazr.json'),
];

function getDefaultOptions() {
    return {
        dryRun: false,
        target: null,
        minMediaMB: 100,
        minLargeMB: 500,
        oldDays: 60,
        forceDelete: false,
        logFile: path.join(APP_DIR, 'logs', 'cleanup.log'),
    };
}

const KNOWN_KEYS = new Set([
    'dryRun', 'target', 'minMediaMB', 'minLargeMB', 'oldDays', 'forceDelete', 'logFile',
]);

function validateConfig(cfg, configPath) {
    const label = configPath ? `(${configPath})` : '';

    for (const key of Object.keys(cfg)) {
        if (!KNOWN_KEYS.has(key)) {
            console.warn(`[vazr] Warning: Unknown config key "${key}" ${label} — ignored.`);
        }
    }

    const posInts = ['minMediaMB', 'minLargeMB', 'oldDays'];
    for (const key of posInts) {
        if (cfg[key] !== undefined) {
            const v = cfg[key];
            if (typeof v !== 'number' || !Number.isInteger(v) || v <= 0) {
                throw new Error(`Config "${key}" must be a positive integer. Got: ${JSON.stringify(v)} ${label}`);
            }
        }
    }

    const bools = ['dryRun', 'forceDelete'];
    for (const key of bools) {
        if (cfg[key] !== undefined && typeof cfg[key] !== 'boolean') {
            throw new Error(`Config "${key}" must be a boolean. Got: ${JSON.stringify(cfg[key])} ${label}`);
        }
    }

    const strings = ['target', 'logFile'];
    for (const key of strings) {
        if (cfg[key] !== undefined && cfg[key] !== null && typeof cfg[key] !== 'string') {
            throw new Error(`Config "${key}" must be a string. Got: ${JSON.stringify(cfg[key])} ${label}`);
        }
    }
}

function findConfigPath(customPath) {
    if (customPath) return customPath;
    if (process.env.VAZR_CONFIG) return process.env.VAZR_CONFIG;

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

    validateConfig(parsed, configPath);

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
