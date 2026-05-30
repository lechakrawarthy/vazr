'use strict';

const fs = require('fs');
const path = require('path');
const os = require('os');

const PROFILES_DIR = path.join(os.homedir(), '.vazr', 'profiles');

// ── Built-in profiles ────────────────────────────────────────────
const BUILTIN_PROFILES = {
  minimal: {
    description: 'Only node_modules and temp/cache files. Safe for everyday use.',
    scanCategories: ['temp', 'devArt'],
    dryRun: false,
    forceDelete: false,
  },
  aggressive: {
    description: 'Everything: temp, downloads, media, dev artifacts, and large files.',
    scanCategories: ['temp', 'downloads', 'media', 'devArt', 'catchAll'],
    dryRun: false,
    forceDelete: false,
    oldDays: 30,
    minMediaMB: 50,
    minLargeMB: 200,
  },
  media: {
    description: 'Large media files only (video, ISO, etc.) above the size threshold.',
    scanCategories: ['media'],
    dryRun: false,
    forceDelete: false,
    minMediaMB: 100,
  },
  'dry-run': {
    description: 'Full scan in dry-run mode. Shows what would be removed without touching anything.',
    scanCategories: ['temp', 'downloads', 'media', 'devArt', 'catchAll'],
    dryRun: true,
    forceDelete: false,
  },
  downloads: {
    description: 'Only old downloads older than 60 days.',
    scanCategories: ['downloads'],
    dryRun: false,
    forceDelete: false,
    oldDays: 60,
  },
};

// ── Helpers ──────────────────────────────────────────────────────

function ensureProfilesDir() {
  fs.mkdirSync(PROFILES_DIR, { recursive: true });
}

function profilePath(name) {
  return path.join(PROFILES_DIR, name + '.json');
}

/**
 * List all available profiles: built-ins + user-defined.
 * @returns {{ name: string, source: 'builtin'|'user', description: string }[]}
 */
function listProfiles() {
  const result = [];
  for (const [name, p] of Object.entries(BUILTIN_PROFILES)) {
    result.push({ name, source: 'builtin', description: p.description || '' });
  }

  if (fs.existsSync(PROFILES_DIR)) {
    try {
      const files = fs.readdirSync(PROFILES_DIR).filter(f => f.endsWith('.json'));
      for (const file of files) {
        const name = file.replace(/\.json$/, '');
        if (BUILTIN_PROFILES[name]) continue; // user overrides builtin — mark user
        try {
          const raw = fs.readFileSync(path.join(PROFILES_DIR, file), 'utf8');
          const parsed = JSON.parse(raw);
          result.push({ name, source: 'user', description: parsed.description || '' });
        } catch {
          // skip malformed profile files
        }
      }
    } catch {
      // ignore if profiles dir is unreadable
    }
  }

  return result;
}

/**
 * Load a named profile. Checks user dir first, then built-ins.
 * @param {string} name
 * @returns {object}
 */
function loadProfile(name) {
  const userFile = profilePath(name);
  if (fs.existsSync(userFile)) {
    const raw = fs.readFileSync(userFile, 'utf8');
    return JSON.parse(raw);
  }
  if (BUILTIN_PROFILES[name]) {
    return { ...BUILTIN_PROFILES[name] };
  }
  throw new Error(`Profile "${name}" not found. Run \`vazr profile list\` to see available profiles.`);
}

/**
 * Save a profile to ~/.vazr/profiles/<name>.json
 * @param {string} name
 * @param {object} profileData
 */
function saveProfile(name, profileData) {
  ensureProfilesDir();
  const file = profilePath(name);
  fs.writeFileSync(file, JSON.stringify(profileData, null, 2), 'utf8');
  return file;
}

/**
 * Delete a user profile. Cannot delete built-ins.
 * @param {string} name
 */
function deleteProfile(name) {
  if (BUILTIN_PROFILES[name]) throw new Error(`Cannot delete built-in profile "${name}".`);
  const file = profilePath(name);
  if (!fs.existsSync(file)) throw new Error(`Profile "${name}" not found.`);
  fs.unlinkSync(file);
}

/**
 * Export a profile to a JSON string (for piping / sharing).
 * @param {string} name
 * @returns {string}
 */
function exportProfile(name) {
  const data = loadProfile(name);
  return JSON.stringify({ _vazrProfile: name, ...data }, null, 2);
}

/**
 * Import a profile from a JSON string. Saves it to user profiles dir.
 * @param {string} jsonStr
 * @returns {string} The name the profile was saved under
 */
function importProfile(jsonStr) {
  let parsed;
  try { parsed = JSON.parse(jsonStr); } catch { throw new Error('Invalid JSON for profile import.'); }
  const name = parsed._vazrProfile;
  if (!name || typeof name !== 'string') throw new Error('Profile JSON must contain a "_vazrProfile" name field.');
  const { _vazrProfile: _ignored, ...data } = parsed;
  saveProfile(name, data);
  return name;
}

/**
 * Merge profile options into runtime options (profile is lower priority than CLI).
 * @param {object} runtimeOptions
 * @param {object} profile
 * @returns {object}
 */
function applyProfile(runtimeOptions, profile) {
  const merged = { ...profile };
  // CLI / explicit options win over profile
  for (const [k, v] of Object.entries(runtimeOptions)) {
    if (v !== undefined && v !== null) merged[k] = v;
  }
  return merged;
}

module.exports = {
  PROFILES_DIR,
  BUILTIN_PROFILES,
  listProfiles,
  loadProfile,
  saveProfile,
  deleteProfile,
  exportProfile,
  importProfile,
  applyProfile,
};
