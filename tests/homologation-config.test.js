const test = require('node:test');
const { execFileSync } = require('node:child_process');

test('@spec:AC-066 provisionamento e Compose isolam o sandbox', () => {
  execFileSync('python3', ['scripts/test-homologation-config.py'], { stdio: 'pipe' });
});
