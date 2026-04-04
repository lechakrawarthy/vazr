'use strict';

const fs = require('fs');
const path = require('path');

function ensureDir(dirPath) {
    if (!dirPath) return;
    if (!fs.existsSync(dirPath)) {
        fs.mkdirSync(dirPath, { recursive: true });
    }
}

function createLogger(logFilePath) {
    const filePath = logFilePath ? path.resolve(logFilePath) : null;
    if (filePath) ensureDir(path.dirname(filePath));

    function write(level, message, meta) {
        const time = new Date().toISOString();
        const payload = meta ? ' ' + JSON.stringify(meta) : '';
        const line = '[' + time + '] [' + level.toUpperCase() + '] ' + message + payload + '\n';

        if (filePath) {
            try {
                fs.appendFileSync(filePath, line, 'utf8');
            } catch {
                // Logging must never crash cleanup operations.
            }
        }

        if (process.env.DEBUG) {
            const out = level === 'error' ? console.error : console.log;
            out(line.trimEnd());
        }
    }

    return {
        info: (message, meta) => write('info', message, meta),
        warn: (message, meta) => write('warn', message, meta),
        error: (message, meta) => write('error', message, meta),
        logFilePath: filePath,
    };
}

module.exports = { createLogger };
