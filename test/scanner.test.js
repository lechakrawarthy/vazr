'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');

// We test the internal helpers indirectly by monkey-patching platform paths,
// and test scanLargeFiles / scanOldDownloads directly with temp directories.

// Use a fresh temp tree for each test
function tmpDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'vazr-scanner-test-'));
}

function writeFile(dir, name, content = 'x') {
  const p = path.join(dir, name);
  fs.mkdirSync(path.dirname(p), { recursive: true });
  fs.writeFileSync(p, content, 'utf8');
  return p;
}

// ── scanLargeFiles ────────────────────────────────────────────
// We test scanLargeFiles by temporarily overriding platform.getLargeScanRoots

test('scanLargeFiles finds files above threshold', async () => {
  const dir = tmpDir();
  const big = writeFile(dir, 'bigfile.bin', 'x'.repeat(600));
  writeFile(dir, 'tiny.txt', 'hi');

  const platform = require('../src/platform');
  const orig = platform.getLargeScanRoots;
  platform.getLargeScanRoots = () => [dir];

  const { scanLargeFiles } = require('../src/scanner');
  const result = await scanLargeFiles(500, [], undefined);

  platform.getLargeScanRoots = orig;

  assert.ok(result.files.some(f => f.path === big), 'big file should be found');
  assert.ok(!result.files.some(f => f.path.endsWith('tiny.txt')), 'tiny file should be excluded');
  assert.ok(result.totalSize >= 600);
});

test('scanLargeFiles skips paths in skipPaths', async () => {
  const dir = tmpDir();
  const big = writeFile(dir, 'skip-me.bin', 'x'.repeat(600));

  const platform = require('../src/platform');
  const orig = platform.getLargeScanRoots;
  platform.getLargeScanRoots = () => [dir];

  const { scanLargeFiles } = require('../src/scanner');
  const result = await scanLargeFiles(500, [big], undefined);

  platform.getLargeScanRoots = orig;

  assert.equal(result.files.length, 0, 'skipped path should not appear');
});

// ── scanOldDownloads ──────────────────────────────────────────

test('scanOldDownloads finds files older than cutoff', async () => {
  const dir = tmpDir();
  const oldFile = writeFile(dir, 'old.zip', 'data');

  // Back-date the mtime by 90 days
  const ninetyDaysAgo = new Date(Date.now() - 90 * 86400 * 1000);
  fs.utimesSync(oldFile, ninetyDaysAgo, ninetyDaysAgo);

  const platform = require('../src/platform');
  const orig = platform.getDownloadsPath;
  platform.getDownloadsPath = () => dir;

  const { scanOldDownloads } = require('../src/scanner');
  const result = await scanOldDownloads(60, undefined);

  platform.getDownloadsPath = orig;

  assert.ok(result.files.some(f => f.path === oldFile), 'old file should be found');
});

test('scanOldDownloads ignores recent files', async () => {
  const dir = tmpDir();
  writeFile(dir, 'fresh.zip', 'data');

  const platform = require('../src/platform');
  const orig = platform.getDownloadsPath;
  platform.getDownloadsPath = () => dir;

  const { scanOldDownloads } = require('../src/scanner');
  const result = await scanOldDownloads(60, undefined);

  platform.getDownloadsPath = orig;

  assert.equal(result.files.length, 0, 'recent file should not appear');
});

test('scanOldDownloads returns empty when downloads dir missing', async () => {
  const platform = require('../src/platform');
  const orig = platform.getDownloadsPath;
  platform.getDownloadsPath = () => path.join(os.tmpdir(), 'no-such-downloads-' + Date.now());

  const { scanOldDownloads } = require('../src/scanner');
  const result = await scanOldDownloads(60, undefined);

  platform.getDownloadsPath = orig;

  assert.deepEqual(result, { files: [], totalSize: 0 });
});

// ── scanLargeMedia ────────────────────────────────────────────

test('scanLargeMedia finds large video files', async () => {
  const dir = tmpDir();
  const bigMp4 = writeFile(dir, 'movie.mp4', 'x'.repeat(600));
  writeFile(dir, 'small.mp4', 'tiny');

  const platform = require('../src/platform');
  const orig = platform.getLargeScanRoots;
  platform.getLargeScanRoots = () => [dir];

  const { scanLargeMedia } = require('../src/scanner');
  const result = await scanLargeMedia(500, undefined);

  platform.getLargeScanRoots = orig;

  assert.ok(result.files.some(f => f.path === bigMp4));
  assert.ok(!result.files.some(f => f.path.endsWith('small.mp4')));
});

test('scanLargeMedia ignores non-media files', async () => {
  const dir = tmpDir();
  writeFile(dir, 'document.pdf', 'x'.repeat(600));

  const platform = require('../src/platform');
  const orig = platform.getLargeScanRoots;
  platform.getLargeScanRoots = () => [dir];

  const { scanLargeMedia } = require('../src/scanner');
  const result = await scanLargeMedia(500, undefined);

  platform.getLargeScanRoots = orig;

  assert.equal(result.files.length, 0, 'PDF should not be flagged as media');
});

// ── scanDevArtifacts ──────────────────────────────────────────

test('scanDevArtifacts finds node_modules directories', async () => {
  const dir = tmpDir();
  const nm = path.join(dir, 'myproject', 'node_modules');
  fs.mkdirSync(nm, { recursive: true });
  writeFile(nm, 'index.js', 'x'.repeat(100));

  const platform = require('../src/platform');
  const orig = platform.getScanRoots;
  platform.getScanRoots = () => [dir];

  const { scanDevArtifacts } = require('../src/scanner');
  const result = await scanDevArtifacts(undefined);

  platform.getScanRoots = orig;

  assert.ok(result.folders.some(f => f.path === nm), 'node_modules should be found');
  assert.ok(result.totalSize > 0);
});

// ── scanWorkspace ───────────────────────────────────────────────
// The unified scanner that replaces scanDevArtifacts + scanLargeMedia +
// scanLargeFiles + scanOldDownloads with one pass over the same roots.

function withScanRoots(scanRoots, downloadsPath, fn) {
  const platform = require('../src/platform');
  const origScanRoots = platform.getScanRoots;
  const origDownloads = platform.getDownloadsPath;
  platform.getScanRoots = () => scanRoots;
  platform.getDownloadsPath = () => downloadsPath;
  return Promise.resolve().then(fn).finally(() => {
    platform.getScanRoots = origScanRoots;
    platform.getDownloadsPath = origDownloads;
  });
}

test('scanWorkspace finds dev artifact folders', async () => {
  const dir = tmpDir();
  const noDownloads = path.join(os.tmpdir(), 'vazr-no-downloads-' + Date.now());
  const nm = path.join(dir, 'myproject', 'node_modules');
  fs.mkdirSync(nm, { recursive: true });
  writeFile(nm, 'index.js', 'x'.repeat(100));
  writeFile(path.join(dir, 'myproject'), 'package.json', '{}');

  await withScanRoots([dir], noDownloads, async () => {
    const { scanWorkspace } = require('../src/scanner');
    const result = await scanWorkspace({
      minMediaBytes: 500, minLargeBytes: 500, oldDownloadsCutoffMs: 0, excludePaths: [],
    }, undefined);

    assert.ok(result.devArtifacts.folders.some(f => f.path === nm), 'node_modules should be found');
  });
});

test('scanWorkspace finds media and large files, and does not double-count files inside dev artifacts', async () => {
  const dir = tmpDir();
  const noDownloads = path.join(os.tmpdir(), 'vazr-no-downloads-' + Date.now());
  const movie = writeFile(dir, 'movie.mp4', 'x'.repeat(600));
  const bigFile = writeFile(dir, 'archive.zip', 'x'.repeat(700));

  const nm = path.join(dir, 'myproject', 'node_modules');
  const bigInsideNodeModules = writeFile(nm, 'huge.bin', 'x'.repeat(900));
  writeFile(path.join(dir, 'myproject'), 'package.json', '{}');

  await withScanRoots([dir], noDownloads, async () => {
    const { scanWorkspace } = require('../src/scanner');
    const result = await scanWorkspace({
      minMediaBytes: 500, minLargeBytes: 500, oldDownloadsCutoffMs: 0, excludePaths: [],
    }, undefined);

    assert.ok(result.media.files.some(f => f.path === movie), 'large mp4 should be classified as media');
    assert.ok(result.large.files.some(f => f.path === bigFile), 'large zip should be classified as catch-all');
    assert.ok(
      !result.large.files.some(f => f.path === bigInsideNodeModules),
      'a large file inside a matched dev-artifact folder should not also appear in catch-all'
    );
    assert.ok(result.devArtifacts.folders.some(f => f.path === nm));
  });
});

test('scanWorkspace excludePaths prunes an entire subtree', async () => {
  const dir = tmpDir();
  const noDownloads = path.join(os.tmpdir(), 'vazr-no-downloads-' + Date.now());
  const excludedDir = path.join(dir, 'skip-me');
  const excludedFile = writeFile(excludedDir, 'big.zip', 'x'.repeat(700));
  const keptFile = writeFile(dir, 'keep.zip', 'x'.repeat(700));

  await withScanRoots([dir], noDownloads, async () => {
    const { scanWorkspace } = require('../src/scanner');
    const result = await scanWorkspace({
      minMediaBytes: 500, minLargeBytes: 500, oldDownloadsCutoffMs: 0, excludePaths: [excludedDir],
    }, undefined);

    assert.ok(!result.large.files.some(f => f.path === excludedFile), 'file under excluded path should be skipped');
    assert.ok(result.large.files.some(f => f.path === keptFile), 'file outside excluded path should still be found');
  });
});

test('scanWorkspace finds old downloads by age, independent of size', async () => {
  const noScanRoots = [];
  const downloadsDir = tmpDir();
  const oldFile = writeFile(downloadsDir, 'old.zip', 'data');
  const ninetyDaysAgo = new Date(Date.now() - 90 * 86400 * 1000);
  fs.utimesSync(oldFile, ninetyDaysAgo, ninetyDaysAgo);
  writeFile(downloadsDir, 'fresh.zip', 'data');

  await withScanRoots(noScanRoots, downloadsDir, async () => {
    const { scanWorkspace } = require('../src/scanner');
    const cutoff = Date.now() - 60 * 86400 * 1000;
    const result = await scanWorkspace({
      minMediaBytes: 1e9, minLargeBytes: 1e9, oldDownloadsCutoffMs: cutoff, excludePaths: [],
    }, undefined);

    assert.ok(result.oldDownloads.files.some(f => f.path === oldFile), 'old file should be found');
    assert.ok(!result.oldDownloads.files.some(f => f.path.endsWith('fresh.zip')), 'fresh file should not be flagged');
  });
});

// ── project-aware artifact detection ───────────────────────────

const LOOSE = { minMediaBytes: 500, minLargeBytes: 500, oldDownloadsCutoffMs: 0, excludePaths: [] };
const noDownloads = () => path.join(os.tmpdir(), 'vazr-no-downloads-' + Date.now());

function scanDir(dir, opts = LOOSE) {
  return withScanRoots([dir], noDownloads(), () => require('../src/scanner').scanWorkspace(opts, undefined));
}

test('scanWorkspace ignores an artifact-named folder with no project marker beside it', async () => {
  const dir = tmpDir();
  const userBuild = path.join(dir, 'Taxes', 'build');
  const keepsake = writeFile(userBuild, 'return-2025.pdf', 'x'.repeat(700));
  const stray = path.join(dir, 'notes', 'node_modules');
  writeFile(stray, 'a.js', 'x');

  const result = await scanDir(dir);
  const flagged = result.devArtifacts.folders.map(f => f.path);
  assert.ok(!flagged.includes(userBuild), 'a plain build/ folder must not be flagged');
  assert.ok(!flagged.includes(stray), 'node_modules without package.json must not be flagged');
  assert.ok(result.large.files.some(f => f.path === keepsake), 'files inside it are still walked normally');
});

test('scanWorkspace does not flag packages inside an unproven node_modules', async () => {
  const dir = tmpDir();
  const pkg = path.join(dir, 'scripts', 'node_modules', 'pako');
  writeFile(pkg, 'package.json', '{}');
  writeFile(path.join(pkg, 'dist'), 'pako.js', 'x');

  const flagged = (await scanDir(dir)).devArtifacts.folders.map(f => f.path);
  assert.ok(!flagged.includes(path.join(pkg, 'dist')), "a package's own dist/ must never be flagged");
});

test('scanWorkspace tags each artifact with the ecosystem its marker proves', async () => {
  const dir = tmpDir();
  writeFile(path.join(dir, 'app'), 'build.gradle', '');
  writeFile(path.join(dir, 'app', 'build'), 'classes.jar', 'x');
  writeFile(path.join(dir, 'crate'), 'Cargo.toml', '');
  writeFile(path.join(dir, 'crate', 'target'), 'bin', 'x');
  writeFile(path.join(dir, 'svc'), 'Api.csproj', '');
  writeFile(path.join(dir, 'svc', 'bin'), 'Api.dll', 'x');

  const result = await scanDir(dir);
  const eco = Object.fromEntries(result.devArtifacts.folders.map(f => [path.relative(dir, f.path), f.ecosystem]));
  assert.equal(eco[path.join('app', 'build')], 'Gradle');
  assert.equal(eco[path.join('crate', 'target')], 'Rust');
  assert.equal(eco[path.join('svc', 'bin')], '.NET');
});

test('scanWorkspace only flags a virtualenv that contains pyvenv.cfg', async () => {
  const dir = tmpDir();
  const realVenv = path.join(dir, 'api', '.venv');
  writeFile(realVenv, 'pyvenv.cfg', 'home = /usr/bin');
  const fakeVenv = path.join(dir, 'music', 'venv');
  writeFile(fakeVenv, 'song.txt', 'x');

  const flagged = (await scanDir(dir)).devArtifacts.folders.map(f => f.path);
  assert.ok(flagged.includes(realVenv));
  assert.ok(!flagged.includes(fakeVenv));
});

test('scanWorkspace never descends into .git', async () => {
  const dir = tmpDir();
  const pack = writeFile(path.join(dir, 'repo', '.git', 'objects', 'pack'), 'pack-1.pack', 'x'.repeat(700));
  const result = await scanDir(dir);
  assert.ok(!result.large.files.some(f => f.path === pack), 'git pack files must never be offered for removal');
});

test('scanWorkspace records project activity from top-level files and the git index', async () => {
  const dir = tmpDir();
  const old = new Date(Date.now() - 200 * 86400 * 1000);

  const idle = path.join(dir, 'idle');
  writeFile(path.join(idle, 'node_modules'), 'x.js', 'x');
  const idlePkg = writeFile(idle, 'package.json', '{}');
  fs.utimesSync(idlePkg, old, old);

  const busy = path.join(dir, 'busy');
  writeFile(path.join(busy, 'node_modules'), 'x.js', 'x');
  const busyPkg = writeFile(busy, 'package.json', '{}');
  fs.utimesSync(busyPkg, old, old);
  writeFile(path.join(busy, '.git'), 'index', 'fresh'); // e.g. a commit today

  const folders = (await scanDir(dir)).devArtifacts.folders;
  const byProject = Object.fromEntries(folders.map(f => [f.project, f.lastActivityMs]));
  const cutoff = Date.now() - 30 * 86400 * 1000;
  assert.ok(byProject[idle] < cutoff, 'idle project should look idle');
  assert.ok(byProject[busy] >= cutoff, 'recent git activity should mark the project active');
});
