(function () {
  'use strict';

  const SDK_VERSION = '12.19.0';
  const SAVE_DELAY = 450;
  const RETRY_DELAY = 2500;
  const MAX_PAYLOAD_BYTES = 700000;
  const CLOUD_OWNER_KEY = 'wilds-forge-v1-cloud-owner';
  const statusElement = document.getElementById('cloud-sync-status');
  const statusLabel = document.getElementById('cloud-sync-label');

  let firestoreSdkPromise = null;
  let firestoreDb = null;
  let stateDoc = null;
  let unsubscribe = null;
  let subscriptionRetryTimer = 0;
  let saveTimer = 0;
  let sessionEpoch = 0;
  let activeSession = null;
  let pendingPayload = '';
  let writeInFlight = false;
  let applyingRemoteState = false;
  let emptyDocumentHandled = false;
  let cancelSessionReady = null;
  let memoryCloudOwner = '';
  let syncState = 'idle';
  let lastErrorMessage = '';

  const labels = {
    idle: 'Firebase 연결 대기',
    loading: 'Firebase 불러오는 중',
    saving: 'Firebase 저장 중',
    synced: 'Firebase 동기화됨',
    offline: '오프라인 · 재연결 대기',
    error: 'Firebase 동기화 오류',
    local: '로컬 저장'
  };

  function setStatus(next, detail) {
    syncState = next;
    const label = labels[next] || labels.idle;
    if (statusElement) {
      statusElement.dataset.state = next;
      statusElement.title = detail || label;
    }
    if (statusLabel) statusLabel.textContent = label;
  }

  function loadFirestoreSdk() {
    if (!firestoreSdkPromise) {
      firestoreSdkPromise = import(`https://www.gstatic.com/firebasejs/${SDK_VERSION}/firebase-firestore.js`).catch((error) => {
        firestoreSdkPromise = null;
        const retryableError = new Error('Firebase Firestore 모듈을 불러오지 못했습니다.');
        retryableError.code = 'firestore/unavailable';
        retryableError.cause = error;
        throw retryableError;
      });
    }
    return firestoreSdkPromise;
  }

  function waitForRetry(epoch) {
    return new Promise((resolve) => {
      if (epoch !== sessionEpoch) {
        resolve();
        return;
      }
      let timer = 0;
      const finish = () => {
        window.clearTimeout(timer);
        window.removeEventListener('online', finish);
        resolve();
      };
      window.addEventListener('online', finish, { once: true });
      timer = window.setTimeout(finish, RETRY_DELAY);
    });
  }

  function normalizedPayload(state) {
    const serializable = JSON.parse(JSON.stringify(state));
    const normalized = window.WildsApp.validateState(serializable);
    const payload = JSON.stringify(normalized);
    const bytes = new TextEncoder().encode(payload).byteLength;
    if (bytes > MAX_PAYLOAD_BYTES) {
      throw new Error(`클라우드 저장 한도(${Math.floor(MAX_PAYLOAD_BYTES / 1000)}KB)를 넘었습니다. JSON 백업을 남겨 주세요.`);
    }
    return payload;
  }

  function currentPayload() {
    return normalizedPayload(window.WildsApp.getState());
  }

  function describeSyncError(error) {
    const code = String(error && error.code || '');
    if (code.includes('unavailable') || !navigator.onLine) return '네트워크가 복구되면 Firebase 저장을 다시 시도합니다.';
    if (code.includes('permission-denied')) return '현재 계정의 Firestore 저장 권한을 확인해 주세요.';
    return error && error.message ? error.message : 'Firebase 동기화에 실패했습니다.';
  }

  function isRetryableSyncError(error) {
    if (!navigator.onLine) return true;
    const code = String(error && error.code || '').replace(/^firestore\//, '');
    return ['aborted', 'cancelled', 'deadline-exceeded', 'internal', 'resource-exhausted', 'unavailable', 'unknown'].includes(code);
  }

  function reportError(error, notify) {
    const message = describeSyncError(error);
    setStatus(navigator.onLine ? 'error' : 'offline', message);
    if (notify && message !== lastErrorMessage) window.WildsApp.notify(message);
    lastErrorMessage = message;
  }

  function stopSubscription() {
    sessionEpoch += 1;
    if (cancelSessionReady) cancelSessionReady();
    cancelSessionReady = null;
    window.clearTimeout(saveTimer);
    window.clearTimeout(subscriptionRetryTimer);
    saveTimer = 0;
    subscriptionRetryTimer = 0;
    if (unsubscribe) unsubscribe();
    unsubscribe = null;
    firestoreDb = null;
    stateDoc = null;
    activeSession = null;
    pendingPayload = '';
    writeInFlight = false;
    emptyDocumentHandled = false;
  }

  function applyRemotePayload(payload) {
    const parsed = JSON.parse(payload);
    const normalized = window.WildsApp.validateState(parsed);
    applyingRemoteState = true;
    try {
      window.WildsApp.replaceState(normalized, { localOnly: true });
    } finally {
      applyingRemoteState = false;
    }
  }

  function markCloudOwner(uid) {
    memoryCloudOwner = uid;
    try { localStorage.setItem(CLOUD_OWNER_KEY, uid); } catch {}
  }

  function previousCloudOwner() {
    try { return localStorage.getItem(CLOUD_OWNER_KEY) || memoryCloudOwner; } catch { return memoryCloudOwner; }
  }

  function prepareFirstUpload(uid) {
    const previousOwner = previousCloudOwner();
    if (previousOwner && previousOwner !== uid) {
      applyingRemoteState = true;
      try {
        window.WildsApp.replaceState(window.WildsApp.getDefaultState(), { localOnly: true });
      } finally {
        applyingRemoteState = false;
      }
    }
    return currentPayload();
  }

  function scheduleSave() {
    if (applyingRemoteState || !activeSession || !stateDoc) return;
    try {
      pendingPayload = currentPayload();
      setStatus('saving');
      window.clearTimeout(saveTimer);
      saveTimer = window.setTimeout(() => {
        saveTimer = 0;
        flushPendingSave().catch(() => {});
      }, SAVE_DELAY);
    } catch (error) {
      reportError(error, true);
    }
  }

  async function flushPendingSave() {
    if (writeInFlight || !pendingPayload || !activeSession || !stateDoc) return;
    const epoch = sessionEpoch;
    const uid = activeSession.user.uid;
    const db = firestoreDb;
    const docRef = stateDoc;
    let retryDelay = null;
    writeInFlight = true;
    lastErrorMessage = '';

    try {
      const sdk = await loadFirestoreSdk();
      while (pendingPayload && epoch === sessionEpoch && activeSession?.user?.uid === uid) {
        const payload = pendingPayload;
        setStatus('saving');
        await sdk.runTransaction(db, async (transaction) => {
          const snapshot = await transaction.get(docRef);
          const data = snapshot.exists() ? snapshot.data() : null;
          const revision = data && Number.isInteger(data.revision) ? data.revision + 1 : 1;
          transaction.set(docRef, {
            app: 'mh-wilds',
            schemaVersion: 1,
            ownerUid: uid,
            payload,
            revision,
            updatedAt: sdk.serverTimestamp()
          });
        });
        if (epoch !== sessionEpoch || activeSession?.user?.uid !== uid) return;
        if (pendingPayload === payload) pendingPayload = '';
        markCloudOwner(uid);
      }
      if (epoch === sessionEpoch) setStatus('synced');
    } catch (error) {
      if (epoch === sessionEpoch) {
        retryDelay = isRetryableSyncError(error) ? RETRY_DELAY : null;
        reportError(error, true);
      }
      throw error;
    } finally {
      if (epoch === sessionEpoch) {
        writeInFlight = false;
        if (pendingPayload && navigator.onLine && (retryDelay !== null || syncState !== 'error')) {
          window.clearTimeout(saveTimer);
          saveTimer = window.setTimeout(
            () => flushPendingSave().catch(() => {}),
            retryDelay === null ? SAVE_DELAY : retryDelay
          );
        }
      }
    }
  }

  async function handleSnapshot(snapshot, epoch, uid) {
    if (epoch !== sessionEpoch || activeSession?.user?.uid !== uid) return;

    if (!snapshot.exists()) {
      if (snapshot.metadata.fromCache) {
        setStatus(navigator.onLine ? 'loading' : 'offline');
        return;
      }
      if (!emptyDocumentHandled) {
        emptyDocumentHandled = true;
        pendingPayload = prepareFirstUpload(uid);
        setStatus('saving');
        await flushPendingSave();
      }
      return;
    }

    const data = snapshot.data();
    if (data.app !== 'mh-wilds' || data.schemaVersion !== 1 || data.ownerUid !== uid || typeof data.payload !== 'string') {
      throw new Error('서버 저장 데이터 형식이 올바르지 않습니다.');
    }

    if (pendingPayload && data.payload !== pendingPayload) {
      setStatus('saving');
      return;
    }

    if (data.payload !== currentPayload()) applyRemotePayload(data.payload);
    if (pendingPayload === data.payload && !snapshot.metadata.hasPendingWrites) pendingPayload = '';
    markCloudOwner(uid);
    setStatus(snapshot.metadata.fromCache ? 'offline' : (pendingPayload ? 'saving' : 'synced'));
    lastErrorMessage = '';
  }

  async function startSession(session) {
    stopSubscription();
    if (!session || session.mode !== 'firebase' || !session.app || !session.user?.uid) {
      setStatus(session?.mode === 'local' ? 'local' : 'idle');
      return;
    }

    activeSession = session;
    const epoch = sessionEpoch;
    const uid = session.user.uid;
    setStatus('loading');

    try {
      let sdk = null;
      while (epoch === sessionEpoch && !sdk) {
        try {
          sdk = await loadFirestoreSdk();
        } catch (error) {
          if (!isRetryableSyncError(error)) throw error;
          reportError(error, true);
          await waitForRetry(epoch);
          if (epoch === sessionEpoch) setStatus(navigator.onLine ? 'loading' : 'offline');
        }
      }
      if (epoch !== sessionEpoch) return;
      firestoreDb = sdk.getFirestore(session.app);
      stateDoc = sdk.doc(firestoreDb, 'users', uid);
      await new Promise((resolve, reject) => {
        let ready = false;
        const settleReady = (callback, value) => {
          if (ready) return;
          ready = true;
          cancelSessionReady = null;
          callback(value);
        };
        cancelSessionReady = () => settleReady(resolve);

        const subscribe = () => {
          if (epoch !== sessionEpoch) {
            settleReady(resolve);
            return;
          }
          unsubscribe = sdk.onSnapshot(
            stateDoc,
            { includeMetadataChanges: true },
            (snapshot) => {
              Promise.resolve(handleSnapshot(snapshot, epoch, uid)).then(() => {
                if (epoch !== sessionEpoch) return;
                const initialCreatePending = !snapshot.exists() && Boolean(pendingPayload || writeInFlight);
                if (!snapshot.metadata.fromCache && !snapshot.metadata.hasPendingWrites && !initialCreatePending) settleReady(resolve);
              }).catch((error) => {
                if (epoch !== sessionEpoch) return;
                reportError(error, true);
                if (!isRetryableSyncError(error)) settleReady(reject, error);
              });
            },
            (error) => {
              if (epoch !== sessionEpoch) return;
              reportError(error, true);
              if (!isRetryableSyncError(error)) {
                settleReady(reject, error);
                return;
              }
              unsubscribe = null;
              window.clearTimeout(subscriptionRetryTimer);
              subscriptionRetryTimer = window.setTimeout(subscribe, RETRY_DELAY);
            }
          );
        };

        subscribe();
      });
      if (epoch !== sessionEpoch) return;
    } catch (error) {
      if (epoch === sessionEpoch) {
        reportError(error, true);
        stopSubscription();
        setStatus(navigator.onLine ? 'error' : 'offline', describeSyncError(error));
      }
      throw error;
    }
  }

  window.addEventListener('mhw-state-changed', scheduleSave);
  window.addEventListener('mhw-auth-session', (event) => {
    if (event.detail?.mode !== 'firebase') startSession(event.detail).catch((error) => reportError(error, true));
  });
  window.addEventListener('online', () => {
    if (pendingPayload) flushPendingSave().catch(() => {});
    else if (activeSession) setStatus('loading');
  });
  window.addEventListener('offline', () => {
    if (activeSession) setStatus('offline');
  });

  window.MHWildsCloudSync = Object.freeze({
    getStatus: () => ({ state: syncState, uid: activeSession?.user?.uid || '', pending: Boolean(pendingPayload || writeInFlight) }),
    assertCanSave: (state) => Boolean(normalizedPayload(state)),
    flush: () => flushPendingSave()
  });

  window.MHWildsAuth?.registerCloudSyncInitializer?.(startSession);

  const initialSession = window.MHWildsAuth?.getSession?.();
  if (initialSession && initialSession.mode !== 'pending' && initialSession.mode !== 'firebase') {
    startSession(initialSession).catch((error) => reportError(error, true));
  }
  else setStatus('idle');
})();
