'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const root = path.resolve(__dirname, '..');
const html = fs.readFileSync(path.join(root, 'dist', 'index.html'), 'utf8');
const app = fs.readFileSync(path.join(root, 'dist', 'app.js'), 'utf8');
const auth = fs.readFileSync(path.join(root, 'dist', 'auth.js'), 'utf8');
const sync = fs.readFileSync(path.join(root, 'dist', 'cloud-sync.js'), 'utf8');

new vm.Script(sync, { filename: 'cloud-sync.js' });

assert.ok(html.indexOf('app.js') < html.indexOf('cloud-sync.js'));
assert.match(html, /id="cloud-sync-status"/);
assert.match(html, /Firebase에 동기화/);

assert.match(auth, /mhw-auth-session/);
assert.match(auth, /mode: 'firebase'/);
assert.match(auth, /getSession/);
assert.match(auth, /registerCloudSyncInitializer/);
assert.match(auth, /await prepareCloudSession/);
assert.match(auth, /await prepareCloudSession\([\s\S]*?unlockApp\(user, access\)/);
assert.match(auth, /mode: 'transition'/);
assert.match(auth, /계정 데이터 준비 중/);

assert.match(app, /mhw-state-changed/);
assert.match(app, /replaceState/);
assert.match(app, /getDefaultState/);
assert.match(app, /localOnly:true/);

assert.match(sync, /const SAVE_DELAY = 450/);
assert.match(sync, /const RETRY_DELAY = 2500/);
assert.match(sync, /firestoreSdkPromise = null/);
assert.match(sync, /function waitForRetry\(epoch\)/);
assert.match(sync, /const MAX_PAYLOAD_BYTES = 700000/);
assert.match(sync, /sdk\.doc\(firestoreDb, 'users', uid\)/);
assert.match(sync, /sdk\.runTransaction/);
assert.match(sync, /const docRef = stateDoc/);
assert.match(sync, /activeSession\?\.user\?\.uid !== uid\) return/);
assert.match(sync, /revision \+ 1/);
assert.match(sync, /sdk\.serverTimestamp\(\)/);
assert.match(sync, /sdk\.onSnapshot/);
assert.match(sync, /includeMetadataChanges: true/);
assert.match(sync, /snapshot\.metadata\.fromCache/);
assert.match(sync, /window\.WildsApp\.validateState/);
assert.match(sync, /data\.payload !== currentPayload\(\)/);
assert.match(sync, /prepareFirstUpload/);
assert.match(sync, /await flushPendingSave\(\)/);
assert.match(sync, /registerCloudSyncInitializer\?\.\(startSession\)/);
assert.match(sync, /!snapshot\.metadata\.fromCache && !snapshot\.metadata\.hasPendingWrites/);
assert.match(sync, /initialCreatePending = !snapshot\.exists\(\) && Boolean\(pendingPayload \|\| writeInFlight\)/);
assert.match(sync, /isRetryableSyncError/);
assert.match(sync, /subscriptionRetryTimer/);
assert.match(sync, /memoryCloudOwner/);
assert.match(sync, /assertCanSave: \(state\) => Boolean\(normalizedPayload\(state\)\)/);
assert.match(app, /MHWildsCloudSync\?\.getStatus\?\.\(\)\.uid/);

console.log('PASS cloud sync: UID document, validated payload, first migration, realtime subscription, debounced transaction saves');
