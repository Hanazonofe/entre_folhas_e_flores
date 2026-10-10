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

test('migration não consome o restante do script recebido pelo SSH', () => {
  const folder = fs.mkdtempSync(path.join(os.tmpdir(), 'pdv-homol-stdin-'));
  try {
    const migration = fs.readFileSync('scripts/deploy-homologation.sh', 'utf8')
      .split('\n').find(line => line.startsWith('"${compose[@]}" run ') && /migrate/.test(line));
    // Simulate a container client reading stdin, under the real bash -s transport.
    const program = 'set -euo pipefail\ncompose=(cat)\n' +
      'cat() { command cat > "$CAPTURE"; }\n' + migration + '\n' +
      'printf "REMAINING_SCRIPT_EXECUTED\\n"\n';
    const capture = path.join(folder, 'stdin');
    const result = execFileSync('bash', ['-s'], { input: program, encoding: 'utf8', env: { ...process.env, CAPTURE: capture } });
    assert.equal(result.trim(), 'REMAINING_SCRIPT_EXECUTED');
    assert.equal(fs.readFileSync(capture, 'utf8'), '');
  } finally {
    fs.rmSync(folder, { recursive: true, force: true });
  }
});

test('fontes continuam legíveis pela API sem root e secrets permanecem restritos', () => {
  const folder = fs.mkdtempSync(path.join(os.tmpdir(), 'pdv-homol-modes-'));
  try {
    fs.mkdirSync(path.join(folder, 'backend'), { mode: 0o700 });
    fs.mkdirSync(path.join(folder, 'deployment'), { mode: 0o700 });
    for (const file of ['backend/app.py', 'deployment/start.py', 'login.html', 'api.js', 'style.css', '.env.homol-sandbox']) {
      fs.writeFileSync(path.join(folder, file), 'fixture', { mode: 0o600 });
    }
    const normalize = fs.readFileSync('scripts/deploy-homologation.sh', 'utf8')
      .split('\n').filter(line => line.startsWith('chmod ')).join('\n');
    execFileSync('bash', ['-c', normalize], { cwd: folder, stdio: 'pipe' });
    for (const file of ['backend/app.py', 'deployment/start.py', 'login.html', 'api.js', 'style.css']) {
      assert.equal(fs.statSync(path.join(folder, file)).mode & 0o444, 0o444);
    }
    assert.equal(fs.statSync(path.join(folder, 'backend')).mode & 0o555, 0o555);
    assert.equal(fs.statSync(path.join(folder, '.env.homol-sandbox')).mode & 0o777, 0o600);
  } finally {
    fs.rmSync(folder, { recursive: true, force: true });
  }
});
