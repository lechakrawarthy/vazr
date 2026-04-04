'use strict';

const fs = require('fs');
const path = require('path');
const platform = require('./platform');

function parsePositiveInteger(value, optionName) {
    if (value === undefined || value === null || value === '') return undefined;
    const parsed = Number.parseInt(String(value), 10);
    if (!Number.isFinite(parsed) || parsed <= 0) {
        throw new Error(optionName + ' must be a positive integer. Received: ' + value);
    }
    return parsed;
}

function normalizePath(inputPath) {
    return path.resolve(String(inputPath || ''));
}

function assertTargetPathSafe(targetPath) {
    if (!targetPath) return;

    const resolved = normalizePath(targetPath);
    const root = path.parse(resolved).root;

    if (resolved === root) {
        throw new Error('Target path cannot be a filesystem root: ' + targetPath);
    }

    if (!fs.existsSync(root)) {
        throw new Error('Target drive or root path does not exist: ' + root);
    }

    if (platform.isProtectedPath(resolved)) {
        throw new Error('Target path is protected and cannot be used: ' + targetPath);
    }
}

module.exports = {
    parsePositiveInteger,
    normalizePath,
    assertTargetPathSafe,
};
