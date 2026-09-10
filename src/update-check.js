'use strict';

const https = require('https');
const pkg = require('../package.json');

/**
 * Returns true if `remote` is a strictly newer semver-ish version than `local`.
 * Deliberately simple (no pre-release/build-metadata handling) — this only needs
 * to catch "there's a newer release," not do full semver resolution.
 * @param {string} remote
 * @param {string} local
 * @returns {boolean}
 */
function isNewer(remote, local) {
  const pa = String(remote).split('.').map(Number);
  const pb = String(local).split('.').map(Number);
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const a = pa[i] || 0;
    const b = pb[i] || 0;
    if (a > b) return true;
    if (a < b) return false;
  }
  return false;
}

/**
 * Fire-and-forget check against the npm registry for a newer published version.
 * Fails silently (resolves null) on any error, offline state, or timeout —
 * this must never block or crash a scan. Respects CI and opt-out env vars.
 * @param {{ enabled?: boolean }} [opts]
 * @returns {Promise<string|null>} the newer version string, or null
 */
function checkForUpdate(opts = {}) {
  const enabled = opts.enabled !== false;
  if (!enabled || process.env.CI || process.env.VAZR_NO_UPDATE_CHECK || process.env.NO_UPDATE_NOTIFIER) {
    return Promise.resolve(null);
  }

  return new Promise(resolve => {
    let settled = false;
    const done = (value) => {
      if (settled) return;
      settled = true;
      resolve(value);
    };

    try {
      const req = https.get(
        `https://registry.npmjs.org/${pkg.name}/latest`,
        { timeout: 1500, headers: { 'user-agent': `${pkg.name}/${pkg.version} update-check` } },
        res => {
          if (res.statusCode !== 200) { res.resume(); return done(null); }
          let data = '';
          res.on('data', chunk => { data += chunk; });
          res.on('end', () => {
            try {
              const parsed = JSON.parse(data);
              if (parsed && typeof parsed.version === 'string' && isNewer(parsed.version, pkg.version)) {
                done(parsed.version);
              } else {
                done(null);
              }
            } catch { done(null); }
          });
        }
      );
      req.on('timeout', () => { req.destroy(); done(null); });
      req.on('error', () => done(null));
    } catch {
      done(null);
    }
  });
}

module.exports = { checkForUpdate, isNewer };
