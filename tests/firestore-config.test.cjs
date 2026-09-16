'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const rules = fs.readFileSync(path.join(root, 'firestore.rules'), 'utf8');
const firebaseConfig = JSON.parse(fs.readFileSync(path.join(root, 'firebase.json'), 'utf8'));
const indexes = JSON.parse(fs.readFileSync(path.join(root, 'firestore.indexes.json'), 'utf8'));
const packageJson = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
const authPolicy = require(path.join(root, 'dist', 'auth-config.js'));

function compact(value) {
  return value.replace(/\s+/g, ' ');
}

const normalizedRules = compact(rules);
const ruleHashes = [...rules.matchAll(/'([a-f0-9]{64})'/g)].map((match) => match[1]);

assert.match(rules, /^rules_version\s*=\s*'2';/);
assert.match(normalizedRules, /hashing\.sha256\(request\.auth\.token\.email\.lower\(\)\.toUtf8\(\)\)/);
assert.deepEqual(ruleHashes.sort(), [...authPolicy.allowedEmailHashes].sort());
assert.doesNotMatch(rules, /[\w.+-]+@[\w.-]+/i, 'Firestore rules must not expose member email addresses');

assert.match(normalizedRules, /request\.auth != null/);
assert.match(normalizedRules, /request\.auth\.token\.email_verified == true/);
assert.match(normalizedRules, /request\.auth\.uid == uid/);
assert.match(normalizedRules, /match \/users\/\{uid\}/);
assert.match(normalizedRules, /allow list: if false;/);
assert.match(normalizedRules, /allow delete: if false;/);
assert.match(normalizedRules, /match \/\{document=\*\*\} \{ allow read, write: if false;/);

assert.match(normalizedRules, /request\.resource\.data\.keys\(\)\.hasOnly\(\[/);
for (const field of ['app', 'schemaVersion', 'ownerUid', 'payload', 'revision', 'updatedAt']) {
  assert.match(rules, new RegExp(`'${field}'`));
}
assert.match(normalizedRules, /request\.resource\.data\.app == 'mh-wilds'/);
assert.match(normalizedRules, /request\.resource\.data\.schemaVersion == 1/);
assert.match(normalizedRules, /request\.resource\.data\.ownerUid == uid/);
assert.match(normalizedRules, /request\.resource\.data\.payload is string/);
assert.match(normalizedRules, /request\.resource\.data\.payload\.toUtf8\(\)\.size\(\) <= 700000/);
assert.match(normalizedRules, /request\.resource\.data\.revision is int/);
assert.match(normalizedRules, /request\.resource\.data\.updatedAt is timestamp/);
assert.match(normalizedRules, /request\.resource\.data\.updatedAt == request\.time/);
assert.match(normalizedRules, /allow create:.*request\.resource\.data\.revision == 1;/);
assert.match(normalizedRules, /allow update:.*request\.resource\.data\.revision == resource\.data\.revision \+ 1;/);

assert.deepEqual(firebaseConfig.firestore, {
  rules: 'firestore.rules',
  indexes: 'firestore.indexes.json'
});
assert.match(packageJson.scripts['deploy:firebase'], /--only auth,firestore,hosting$/);

assert.deepEqual(indexes.indexes, []);
assert.deepEqual(indexes.fieldOverrides, [{
  collectionGroup: 'users',
  fieldPath: 'payload',
  indexes: []
}]);

console.log('Firestore rules and configuration checks passed.');
