'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const policy = require('../dist/auth-config.js');

assert.equal(policy.FIREBASE_CONFIG.projectId, 'mh-wilds');
assert.equal(policy.FIREBASE_CONFIG.authDomain, 'mh-wilds.firebaseapp.com');
(async () => {
  assert.equal(policy.allowedEmailHashes.length, 3);
  assert.equal(policy.masterEmailHashes.length, 1);
  assert.equal(policy.roleForHash(policy.masterEmailHashes[0]), 'master');
  assert.equal(policy.roleForHash(policy.allowedEmailHashes[1]), 'member');
  assert.equal(policy.roleForHash('0'.repeat(64)), null);
  assert.equal(policy.normalizeEmail('  USER@EXAMPLE.INVALID '), 'user@example.invalid');
  assert.equal(
    await policy.hashNormalizedEmail('  USER@EXAMPLE.INVALID '),
    await policy.hashNormalizedEmail('user@example.invalid')
  );

  assert.equal((await policy.evaluateUser({ email: 'user@example.invalid', emailVerified: false })).reason, 'email-unverified');
  assert.equal((await policy.evaluateUser({ email: 'outsider@example.invalid', emailVerified: true })).reason, 'not-allowed');
  assert.equal((await policy.evaluateUser(null)).reason, 'signed-out');

  assert.equal(policy.isLocalDevelopment({ protocol: 'file:', hostname: '' }), true);
  assert.equal(policy.isLocalDevelopment({ protocol: 'http:', hostname: 'localhost' }), true);
  assert.equal(policy.isLocalDevelopment({ protocol: 'http:', hostname: '127.0.0.1' }), true);
  assert.equal(policy.isLocalDevelopment({ protocol: 'https:', hostname: 'mh-wilds.web.app' }), false);

  const dist = path.join(__dirname, '..', 'dist');
  const html = fs.readFileSync(path.join(dist, 'index.html'), 'utf8');
  const authConfig = fs.readFileSync(path.join(dist, 'auth-config.js'), 'utf8');
  const authJs = fs.readFileSync(path.join(dist, 'auth.js'), 'utf8');
  const authCss = fs.readFileSync(path.join(dist, 'auth.css'), 'utf8');
  assert.doesNotMatch(authConfig, /[\w.+-]+@gmail\.com/i);
  assert.doesNotMatch(fs.readFileSync(__filename, 'utf8'), /[\w.+-]+@gmail\.com/i);
  assert.match(html, /<html lang="ko" class="auth-pending">/);
  assert.ok(html.indexOf('auth-config.js') < html.indexOf('auth.js'));
  assert.match(html, /id="auth-account-role"/);
  assert.match(authJs, /gstatic\.com\/firebasejs\/\$\{SDK_VERSION\}\/firebase-auth\.js/);
  assert.match(authJs, /prompt: 'select_account'/);
  assert.match(authJs, /signInWithPopup/);
  assert.match(authJs, /signInWithRedirect/);
  assert.match(authCss, /html\.auth-locked body>:not\(#auth-gate\)/);

  console.log('PASS auth policy: hashed allowlist, verified emails, roles, local bypass, Firebase popup/redirect gate');
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
