const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const { execFileSync } = require('node:child_process');

// A deliberately bounded, offline detector. Report locations, never values.
function findings(file, content) {
  const hits = [];
  const disposable = value => /^[\w.-]*test-only$/.test(value);
  const placeholder = value => !value || /^(?:\$|\{)/.test(value);
  // Exact pre-existing non-operational fixtures, not blanket test-file exclusions.
  const fixtures = {
    'backend/tests/conftest.py': ['test-password-123'],
    'backend/tests/test_api.py': ['test-password-123', 'wrong'],
    'backend/tests/test_product_spreadsheet.py': ['test-password-123', 'wrong'],
    'backend/pdv/cli.py': ['local-recovery'], // Schema validation placeholder, never used to authenticate.
  };
  const exempt = value => disposable(value) || placeholder(value) || (fixtures[file] || []).includes(value);
  const rules = [
    ['private-key', /-----BEGIN (?:RSA |EC |OPENSSH |ENCRYPTED )?PRIVATE KEY-----/g],
    ['age-identity', /AGE-SECRET-KEY-1[0-9A-Z]+/g],
    ['provider-token', /\b(?:AKIA[0-9A-Z]{16}|gh[pousr]_[A-Za-z0-9]{36,}|github_pat_[A-Za-z0-9_]{40,}|AIza[0-9A-Za-z_-]{35}|sk-(?:proj-)?[A-Za-z0-9_-]{32,})\b/g],
  ];
  if (/(?:^|\/)(?:\.env(?:\..+)?|credentials[^/]*\.json|token[^/]*\.json|[^/]+\.(?:pem|key))$/.test(file)
      && !file.endsWith('.example')) hits.push(`${file}: sensitive file`);
  const assignments = [
    /["']?\b[\w-]*(?:password|passwd|secret|api[_-]?key|token|private[_-]?key)["']?\s*[:=]\s*(["'])([^\r\n]*?)\1/gi,
    /\bPASSWORD\s+(')([^']+)'/gi,
    /(?:^|\s)[A-Z_]*(?:PASSWORD|SECRET|TOKEN|API_KEY)\s*[:=]\s*()([A-Za-z0-9_-]+)(?=\s|$)/g,
  ];
  const url = /\b[a-z][a-z0-9+.-]*:\/\/[^\s/:"']+:([^\s@"']+)@/gi;
  content.split(/\r?\n/).forEach((line, index) => {
    for (const [kind, pattern] of rules) {
      pattern.lastIndex = 0;
      if (pattern.test(line)) hits.push(`${file}:${index + 1}: ${kind}`);
    }
    for (const assignment of assignments) {
      for (const match of line.replace(/\bPASSWORD\s+:'[A-Za-z_][A-Za-z0-9_]*'/gi, "PASSWORD [psql variable]").matchAll(assignment)) {
        if (!exempt(match[2])) hits.push(`${file}:${index + 1}: credential literal`);
      }
    }
    for (const match of line.matchAll(url)) {
      if (!exempt(match[1])) hits.push(`${file}:${index + 1}: URL credential`);
    }
  });
  return hits;
}

test('secret detector rejects credentials and only exempts disposable values', () => {
  const credential = 'operational' + '-credential';
  for (const content of [
    `password = '${credential}'`, `API_TOKEN: ${credential}`, `TELEGRAM_BOT_TOKEN="${credential}"`,
    `{"refresh_token": "${credential}"}`, `CREATE ROLE x PASSWORD '${credential}'`,
    `postgresql://user:${credential}@localhost/db`,
    ['-----BEGIN ', 'PRIVATE KEY-----'].join(''),
    'ghp_' + 'a'.repeat(36),
    `password='${credential}' # test-only`,
  ]) assert.ok(findings('fixture.txt', content).length);
  for (const content of [
    'POSTGRES_PASSWORD: pdv-test-only', 'password="fixture-test-only"',
    'postgresql://user:pdv-test-only@db/pdv_test',
    'API_TOKEN: ${API_TOKEN}',
    "CREATE ROLE pdv_api PASSWORD :'api_password';",
    'password = os.environ.get("PASSWORD")',
  ]) assert.deepEqual(findings('fixture.txt', content), []);
});

test('@principle:P-002 tracked files contain no detected operational secrets', () => {
  // Inspect both staged blobs and working copies; an unstaged deletion must not hide a staged secret.
  const files = execFileSync('git', ['ls-files', '-z'], { encoding: 'utf8' }).split('\0').filter(Boolean);
  assert.ok(files.length, 'The repository must be available; never silently skip scanning');
  const untracked = execFileSync('git', ['ls-files', '--others', '--exclude-standard', '-z'], { encoding: 'utf8' }).split('\0').filter(Boolean);
  const hits = [];
  // Also inspect prospective files without staging them on the user's behalf.
  for (const file of untracked) {
    if (fs.lstatSync(file).isFile()) hits.push(...findings(file, fs.readFileSync(file, 'utf8')));
  }
  for (const file of files) {
    hits.push(...findings(file, execFileSync('git', ['show', `:${file}`], { encoding: 'utf8' })));
    if (fs.existsSync(file) && fs.lstatSync(file).isFile()) hits.push(...findings(file, fs.readFileSync(file, 'utf8')));
  }
  assert.deepEqual([...new Set(hits)], [], 'Potential credentials require review (values redacted)');
});
