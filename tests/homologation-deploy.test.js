const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { execFileSync } = require('node:child_process');

test('deploy encontra candidato em checkout que acompanha uma única branch antiga', () => {
  const folder = fs.mkdtempSync(path.join(os.tmpdir(), 'pdv-homol-fetch-'));
  const origin = path.join(folder, 'origin');
  const checkout = path.join(folder, 'checkout');
  const git = (cwd, ...args) => execFileSync('git', args, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
  try {
    fs.mkdirSync(origin);
    git(origin, 'init', '-b', 'main');
    const commit = message => git(origin, '-c', 'user.name=Fixture', '-c', 'user.email=fixture@example.invalid', 'commit', '--allow-empty', '-m', message);
    commit('base');
    git(origin, 'checkout', '-b', 'production');
    commit('candidate');
    const candidate = git(origin, 'rev-parse', 'HEAD');
    git(folder, 'clone', '--no-local', '--single-branch', '--branch', 'main', origin, checkout);
    assert.throws(() => git(checkout, 'cat-file', '-e', `${candidate}^{commit}`));
    const fetch = fs.readFileSync('scripts/deploy-homologation.sh', 'utf8').split('\n').find(line => line.startsWith('git fetch '));
    execFileSync('bash', ['-c', fetch], { cwd: checkout, stdio: 'pipe' });
    git(checkout, 'cat-file', '-e', `${candidate}^{commit}`);
    assert.match(git(checkout, 'for-each-ref', '--contains', candidate, '--format=%(refname)', 'refs/remotes/origin/'), /refs\/remotes\/origin\/production/);
  } finally {
    fs.rmSync(folder, { recursive: true, force: true });
  }
});
