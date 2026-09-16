(function () {
  'use strict';

  const SDK_VERSION = '12.19.0';
  const policy = window.MHWildsAuthPolicy;
  const root = document.documentElement;
  const gate = document.getElementById('auth-gate');
  const gateTitle = document.getElementById('auth-gate-title');
  const gateStatus = document.getElementById('auth-gate-status');
  const gateError = document.getElementById('auth-gate-error');
  const signInButton = document.getElementById('auth-sign-in');
  const gateSignOutButton = document.getElementById('auth-gate-sign-out');
  const account = document.getElementById('auth-account');
  const accountName = document.getElementById('auth-account-name');
  const accountEmail = document.getElementById('auth-account-email');
  const accountRole = document.getElementById('auth-account-role');
  const accountAvatar = document.getElementById('auth-account-avatar');
  const headerSignOutButton = document.getElementById('auth-sign-out');
  const localMode = document.getElementById('auth-local-mode');
  const gatedContent = Array.from(document.body.children).filter((element) => element !== gate && element.tagName !== 'SCRIPT');

  let auth = null;
  let firebaseApp = null;
  let provider = null;
  let authSdk = null;
  let bootFailed = false;
  let activeUser = null;
  let currentSession = Object.freeze({ mode: 'pending', app: null, user: null, access: null });
  let cloudSyncInitializer = null;
  let resolveCloudSyncRegistration = null;
  const cloudSyncRegistration = new Promise((resolve) => { resolveCloudSyncRegistration = resolve; });

  function publishSession(session) {
    currentSession = Object.freeze(session);
    window.dispatchEvent(new CustomEvent('mhw-auth-session', { detail: currentSession }));
  }

  window.MHWildsAuth = Object.freeze({
    getSession: () => currentSession,
    registerCloudSyncInitializer(initializer) {
      if (typeof initializer !== 'function') throw new TypeError('Cloud sync initializer must be a function.');
      cloudSyncInitializer = initializer;
      resolveCloudSyncRegistration();
    }
  });

  async function prepareCloudSession(session) {
    await cloudSyncRegistration;
    if (!cloudSyncInitializer) throw new Error('Firebase 동기화 모듈을 불러오지 못했습니다.');
    await cloudSyncInitializer(session);
  }

  function setBusy(button, busy, busyLabel) {
    if (!button) return;
    if (busy) {
      button.dataset.label = button.textContent;
      button.textContent = busyLabel;
    } else if (button.dataset.label) {
      button.textContent = button.dataset.label;
      delete button.dataset.label;
    }
    button.disabled = busy;
    button.setAttribute('aria-busy', String(busy));
  }

  function setContentAvailable(available) {
    for (const element of gatedContent) {
      element.inert = !available;
      if (available) element.removeAttribute('aria-hidden');
      else element.setAttribute('aria-hidden', 'true');
    }
  }

  function showGate(options) {
    const { title, status, error = '', allowSignIn = true, allowSignOut = false, signInLabel = 'Google로 로그인' } = options;
    root.classList.remove('auth-ready');
    root.classList.add('auth-locked');
    root.dataset.authMode = 'locked';
    setContentAvailable(false);
    gate.hidden = false;
    gate.setAttribute('aria-hidden', 'false');
    gateTitle.textContent = title;
    gateStatus.textContent = status;
    gateError.textContent = error;
    gateError.hidden = !error;
    signInButton.hidden = !allowSignIn;
    signInButton.textContent = signInLabel;
    gateSignOutButton.hidden = !allowSignOut;
    account.hidden = true;
    const focusTarget = allowSignIn ? signInButton : allowSignOut ? gateSignOutButton : null;
    window.requestAnimationFrame(() => (focusTarget || gate).focus());
  }

  function unlockApp(user, access) {
    activeUser = user;
    root.classList.remove('auth-pending', 'auth-locked');
    root.classList.add('auth-ready');
    root.dataset.authMode = 'firebase';
    setContentAvailable(true);
    gate.hidden = true;
    gate.setAttribute('aria-hidden', 'true');
    localMode.hidden = true;
    account.hidden = false;
    const displayName = String(user.displayName || '').trim() || access.email.split('@')[0];
    accountName.textContent = displayName;
    accountEmail.textContent = access.email;
    accountRole.textContent = access.role === 'master' ? '마스터' : '멤버';
    accountRole.dataset.role = access.role;
    accountAvatar.textContent = displayName.slice(0, 1).toLocaleUpperCase('ko-KR');
    publishSession({ mode: 'firebase', app: firebaseApp, user, access });
  }

  function unlockLocalMode() {
    root.classList.remove('auth-pending', 'auth-locked');
    root.classList.add('auth-ready', 'auth-local');
    root.dataset.authMode = 'local';
    setContentAvailable(true);
    gate.hidden = true;
    gate.setAttribute('aria-hidden', 'true');
    account.hidden = true;
    localMode.hidden = false;
    publishSession({ mode: 'local', app: null, user: null, access: null });
  }

  function describeError(error) {
    const code = String(error && error.code || '');
    if (code === 'auth/popup-closed-by-user' || code === 'auth/cancelled-popup-request') return '로그인이 취소되었습니다. 다시 시도해 주세요.';
    if (code === 'auth/network-request-failed') return '네트워크에 연결할 수 없습니다. 연결 상태를 확인해 주세요.';
    if (code === 'auth/unauthorized-domain') return '이 도메인이 Firebase 로그인 허용 목록에 없습니다.';
    if (code === 'auth/operation-not-allowed') return 'Firebase Console에서 Google 로그인을 활성화해야 합니다.';
    return '로그인 중 오류가 발생했습니다. 잠시 후 다시 시도해 주세요.';
  }

  function shouldUseRedirect(error) {
    const code = String(error && error.code || '');
    return code === 'auth/popup-blocked'
      || code === 'auth/operation-not-supported-in-this-environment';
  }

  let authStateRevision = 0;

  async function handleUser(user) {
    const revision = ++authStateRevision;
    showGate({
      title: '계정 데이터 준비 중',
      status: 'Firebase에서 로그인과 저장 데이터를 확인하고 있습니다.',
      allowSignIn: false,
      allowSignOut: false
    });
    publishSession({ mode: 'transition', app: firebaseApp, user: null, access: null });
    activeUser = user;
    const access = await policy.evaluateUser(user);
    if (revision !== authStateRevision) return;
    if (access.authorized) {
      gateStatus.textContent = 'Firebase에서 계정 데이터를 불러오고 있습니다.';
      try {
        await prepareCloudSession({ mode: 'firebase', app: firebaseApp, user, access });
      } catch (error) {
        if (revision !== authStateRevision) return;
        throw error;
      }
      if (revision !== authStateRevision) return;
      unlockApp(user, access);
      return;
    }

    publishSession({ mode: 'signed-out', app: firebaseApp, user: null, access });

    if (!user) {
      showGate({
        title: '멤버 로그인',
        status: '등록된 Google 계정으로 로그인해 주세요.'
      });
      return;
    }

    if (access.reason === 'email-unverified') {
      showGate({
        title: '이메일 확인이 필요합니다',
        status: 'Google 계정의 이메일 확인 상태를 확인한 뒤 다시 로그인해 주세요.',
        error: access.email || '확인되지 않은 계정',
        allowSignOut: true,
        signInLabel: '다른 Google 계정으로 로그인'
      });
      return;
    }

    showGate({
      title: '접근 권한이 없습니다',
      status: '이 앱은 등록된 멤버만 사용할 수 있습니다.',
      error: `${access.email || '현재 계정'}은 허용된 계정이 아닙니다.`,
      allowSignOut: true,
      signInLabel: '다른 Google 계정으로 로그인'
    });
  }

  async function signIn() {
    if (bootFailed) {
      window.location.reload();
      return;
    }
    if (!auth || !provider || !authSdk) return;

    setBusy(signInButton, true, 'Google 계정 여는 중…');
    gateError.hidden = true;
    try {
      if (activeUser) await authSdk.signOut(auth);
      await authSdk.signInWithPopup(auth, provider);
    } catch (error) {
      let finalError = error;
      if (shouldUseRedirect(error)) {
        gateStatus.textContent = '팝업을 열 수 없어 Google 로그인 화면으로 이동합니다.';
        try {
          await authSdk.signInWithRedirect(auth, provider);
          return;
        } catch (redirectError) {
          finalError = redirectError;
        }
      }
      gateError.textContent = describeError(finalError);
      gateError.hidden = false;
    } finally {
      setBusy(signInButton, false);
    }
  }

  async function signOutCurrent(button) {
    if (!auth || !authSdk) return;
    setBusy(button, true, '로그아웃 중…');
    try {
      await authSdk.signOut(auth);
    } catch (error) {
      showGate({
        title: '로그아웃하지 못했습니다',
        status: '네트워크 연결을 확인한 뒤 다시 시도해 주세요.',
        error: describeError(error),
        allowSignOut: true
      });
    } finally {
      setBusy(button, false);
    }
  }

  async function startFirebaseAuth() {
    showGate({
      title: '로그인 확인 중',
      status: 'Firebase에서 멤버 정보를 확인하고 있습니다.',
      allowSignIn: false,
      allowSignOut: false
    });

    try {
      const [appSdk, loadedAuthSdk] = await Promise.all([
        import(`https://www.gstatic.com/firebasejs/${SDK_VERSION}/firebase-app.js`),
        import(`https://www.gstatic.com/firebasejs/${SDK_VERSION}/firebase-auth.js`)
      ]);
      authSdk = loadedAuthSdk;
      firebaseApp = appSdk.initializeApp(policy.FIREBASE_CONFIG);
      auth = authSdk.getAuth(firebaseApp);
      provider = new authSdk.GoogleAuthProvider();
      provider.setCustomParameters({ prompt: 'select_account' });

      await authSdk.getRedirectResult(auth);
      authSdk.onAuthStateChanged(auth, (user) => {
        handleUser(user).catch((error) => {
          showGate({
            title: '멤버 정보를 확인하지 못했습니다',
            status: '안전한 로그인 환경인지 확인한 뒤 다시 시도해 주세요.',
            error: describeError(error),
            signInLabel: '다시 시도'
          });
        });
      }, (error) => {
        showGate({
          title: '로그인 상태를 확인하지 못했습니다',
          status: '네트워크 연결을 확인한 뒤 다시 시도해 주세요.',
          error: describeError(error),
          signInLabel: '다시 시도'
        });
      });
    } catch (error) {
      bootFailed = true;
      showGate({
        title: '로그인을 준비하지 못했습니다',
        status: 'Firebase 연결에 실패했습니다. 네트워크 연결을 확인해 주세요.',
        error: describeError(error),
        signInLabel: '페이지 다시 불러오기'
      });
    } finally {
      root.classList.remove('auth-pending');
    }
  }

  signInButton.addEventListener('click', signIn);
  gateSignOutButton.addEventListener('click', () => signOutCurrent(gateSignOutButton));
  headerSignOutButton.addEventListener('click', () => signOutCurrent(headerSignOutButton));
  gate.addEventListener('keydown', (event) => {
    if (event.key !== 'Tab') return;
    const controls = [signInButton, gateSignOutButton].filter((button) => !button.hidden && !button.disabled);
    if (!controls.length) {
      event.preventDefault();
      gate.focus();
      return;
    }
    const first = controls[0];
    const last = controls[controls.length - 1];
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  });

  if (!policy || typeof policy.evaluateUser !== 'function') {
    bootFailed = true;
    showGate({
      title: '로그인 설정 오류',
      status: '인증 설정을 불러오지 못했습니다.',
      error: '페이지를 새로 고친 뒤에도 문제가 계속되면 관리자에게 알려 주세요.',
      signInLabel: '페이지 다시 불러오기'
    });
    root.classList.remove('auth-pending');
  } else if (policy.isLocalDevelopment(window.location)) {
    unlockLocalMode();
  } else {
    startFirebaseAuth();
  }
})();
