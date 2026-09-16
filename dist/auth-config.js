(function (root, factory) {
  'use strict';
  const policy = factory();
  if (typeof module === 'object' && module.exports) module.exports = policy;
  if (root) root.MHWildsAuthPolicy = policy;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  const FIREBASE_CONFIG = Object.freeze({
    apiKey: 'AIzaSyBaqQ9vSpkPbwuKBLq7lRrYQanFP5o40E8',
    authDomain: 'mh-wilds.firebaseapp.com',
    projectId: 'mh-wilds',
    storageBucket: 'mh-wilds.firebasestorage.app',
    messagingSenderId: '477074194070',
    appId: '1:477074194070:web:44c7c61ad2e8dab43e8cb7',
    measurementId: 'G-ELKT5WD0Q6'
  });

  // Keep the private membership list out of this public repository. These are
  // SHA-256 digests of normalized (trimmed, lowercase) email addresses.
  const allowedEmailHashes = Object.freeze([
    '3cccc5cf887c593c941c757aa59a2e6f3bb8a9012a8cfa079e1c6582707b5a5f',
    'a97be25f686894c681c95dc4066f338f88c511138fbbc67e631294bcf1208367',
    '9ee4585cada95cdfaf40fc8783f24cd47e94d6ec8fa7e2e4ecce4bbb1d9940ea'
  ]);
  const masterEmailHashes = Object.freeze([allowedEmailHashes[0]]);

  function normalizeEmail(value) {
    return String(value || '').trim().toLocaleLowerCase('en-US');
  }

  async function hashNormalizedEmail(value) {
    const cryptoApi = typeof globalThis !== 'undefined' ? globalThis.crypto : null;
    if (!cryptoApi || !cryptoApi.subtle) throw new Error('Web Crypto is unavailable.');
    const bytes = new TextEncoder().encode(normalizeEmail(value));
    const digest = await cryptoApi.subtle.digest('SHA-256', bytes);
    return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('');
  }

  function roleForHash(emailHash) {
    if (!allowedEmailHashes.includes(emailHash)) return null;
    return masterEmailHashes.includes(emailHash) ? 'master' : 'member';
  }

  async function roleForEmail(value) {
    return roleForHash(await hashNormalizedEmail(value));
  }

  async function evaluateUser(user) {
    if (!user) {
      return Object.freeze({ authorized: false, email: '', role: null, reason: 'signed-out' });
    }

    const email = normalizeEmail(user.email);
    if (user.emailVerified !== true) {
      return Object.freeze({ authorized: false, email, role: null, reason: 'email-unverified' });
    }

    const role = await roleForEmail(email);
    return Object.freeze({
      authorized: Boolean(role),
      email,
      role,
      reason: role ? '' : 'not-allowed'
    });
  }

  function isLocalDevelopment(locationLike) {
    const protocol = String(locationLike && locationLike.protocol || '').toLowerCase();
    const hostname = String(locationLike && locationLike.hostname || '').toLowerCase();
    return protocol === 'file:'
      || hostname === 'localhost'
      || hostname.endsWith('.localhost')
      || hostname === '127.0.0.1'
      || hostname === '::1'
      || hostname === '[::1]';
  }

  return Object.freeze({
    FIREBASE_CONFIG,
    allowedEmailHashes,
    masterEmailHashes,
    normalizeEmail,
    hashNormalizedEmail,
    roleForHash,
    roleForEmail,
    evaluateUser,
    isLocalDevelopment
  });
});
