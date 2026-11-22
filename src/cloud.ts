import { Clerk } from '@clerk/clerk-js';
import { initializeAdminPanel, type AdminPanelController } from './admin';
import { initializeMultiplayer, type MultiplayerController } from './multiplayer';
import { createClient } from '@supabase/supabase-js';
import {
  clearEndlessSave,
  EMPTY_STATS,
  loadEndlessSave,
  loadStats,
  saveEndless,
  saveStats,
  type CareerStats,
  type EndlessSave,
} from './persistence';

// Both keys are public browser keys. Database access is restricted by RLS.
const CLERK_PUBLISHABLE_KEY = 'pk_test_c3BlY2lhbC1nYW5uZXQtOTAyLmNsZXJrLmFjY291bnRzLmRldiQ';
const SUPABASE_URL = 'https://mlpgmsdcgddbpzmjmjvw.supabase.co';
const SUPABASE_PUBLISHABLE_KEY = 'sb_publishable_w8TLRzk_eUvYjFHBoU8KQQ_bk6sSbZL';
const ACCOUNT_LINK_KEY = 'key-bullet:cloud-user:v1';

declare global {
  interface Window {
    __internal_ClerkUICtor?: unknown;
  }
}

type CloudUser = {
  id: string;
  primaryEmailAddress?: { emailAddress: string } | null;
  publicMetadata?: { role?: string } | null;
  username?: string | null;
};

const clerk = new Clerk(CLERK_PUBLISHABLE_KEY);
const supabase = createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
  accessToken: async () => clerk.session?.getToken() ?? null,
});
let adminPanel: AdminPanelController | null = null;
let multiplayerPanel: MultiplayerController | null = null;

let activeUser: { id: string; email: string | null } | null = null;
let clerkReady = false;
let cloudReady = false;
let restoringCloudData = false;
let signInMounted = false;
let userButtonMounted = false;
let lastSyncedUserId: string | null = null;
let writeQueue: Promise<void> = Promise.resolve();
let cloudStatus = 'ログインすると、この端末の戦績をクラウドに保存できます。';

function getElement<T extends HTMLElement>(selector: string): T {
  const element = document.querySelector<T>(selector);
  if (!element) throw new Error(`Missing account UI element: ${selector}`);
  return element;
}

function setCloudStatus(message: string, isError = false): void {
  cloudStatus = message;
  const messageElement = document.querySelector<HTMLElement>('#cloud-auth-message');
  if (messageElement) {
    messageElement.textContent = message;
    messageElement.classList.toggle('is-error', isError);
  }
  const syncMessage = document.querySelector<HTMLElement>('#cloud-sync-message');
  if (syncMessage) syncMessage.textContent = message;
}

function renderAccountState(): void {
  const signedIn = Boolean(activeUser);
  const signedOutPanel = document.querySelector<HTMLElement>('#cloud-signed-out');
  const signedInPanel = document.querySelector<HTMLElement>('#cloud-signed-in');
  const accountButton = document.querySelector<HTMLButtonElement>('#cloud-account-open');
  const syncButton = document.querySelector<HTMLButtonElement>('#cloud-sync');

  if (signedOutPanel) signedOutPanel.hidden = signedIn;
  if (signedInPanel) signedInPanel.hidden = !signedIn;
  const email = document.querySelector<HTMLElement>('#cloud-user-email');
  if (email) email.textContent = activeUser?.email ?? 'Clerk account';
  if (accountButton) {
    const caption = accountButton.querySelector<HTMLElement>('.button-caption');
    if (caption) caption.textContent = signedIn ? 'ONLINE' : 'ACCOUNT';
    accountButton.setAttribute('aria-label', signedIn ? 'Online account settings' : 'Sign in to online account');
  }
  if (syncButton) syncButton.disabled = !signedIn || !cloudReady;
  setCloudStatus(cloudStatus);
}

async function loadClerkUiBundle(): Promise<void> {
  if (window.__internal_ClerkUICtor) return;
  const encodedDomain = CLERK_PUBLISHABLE_KEY.split('_')[2];
  if (!encodedDomain) throw new Error('Clerk Publishable Keyの形式を確認してください。');
  const clerkDomain = atob(encodedDomain).slice(0, -1);

  await new Promise<void>((resolve, reject) => {
    const script = document.createElement('script');
    script.src = `https://${clerkDomain}/npm/@clerk/ui@1/dist/ui.browser.js`;
    script.async = true;
    script.crossOrigin = 'anonymous';
    script.onload = () => resolve();
    script.onerror = () => reject(new Error('Clerkの標準UIを読み込めませんでした。'));
    document.head.append(script);
  });

  if (!window.__internal_ClerkUICtor) {
    throw new Error('Clerk UIの初期化に失敗しました。');
  }
}

function mountClerkControls(): void {
  if (!clerkReady) return;
  if (activeUser && !userButtonMounted) {
    const root = getElement<HTMLDivElement>('#clerk-user-button');
    clerk.mountUserButton(root);
    userButtonMounted = true;
  }
  if (!activeUser && !signInMounted) {
    const root = getElement<HTMLDivElement>('#clerk-sign-in');
    clerk.mountSignIn(root);
    signInMounted = true;
  }
}

function parseCareerStats(value: unknown): CareerStats | null {
  if (!value || typeof value !== 'object') return null;
  const candidate = value as Partial<CareerStats>;
  const numericFields: (keyof CareerStats)[] = [
    'totalRuns',
    'storyClears',
    'endlessBestWave',
    'totalScore',
    'totalGrazes',
    'bestAccuracy',
  ];
  for (const field of numericFields) {
    const item = candidate[field];
    if (typeof item !== 'number' || !Number.isFinite(item) || item < 0) return null;
  }
  if ((candidate.bestAccuracy ?? 0) > 100) return null;
  if (candidate.lastPlayedAt !== null && typeof candidate.lastPlayedAt !== 'string') return null;
  return {
    version: 1,
    totalRuns: Math.floor(candidate.totalRuns ?? 0),
    storyClears: Math.floor(candidate.storyClears ?? 0),
    endlessBestWave: Math.floor(candidate.endlessBestWave ?? 0),
    totalScore: Math.floor(candidate.totalScore ?? 0),
    totalGrazes: Math.floor(candidate.totalGrazes ?? 0),
    bestAccuracy: Math.min(100, candidate.bestAccuracy ?? 0),
    lastPlayedAt: candidate.lastPlayedAt ?? null,
  };
}

function parseEndlessSave(value: unknown): EndlessSave | null | undefined {
  if (value === null) return null;
  if (!value || typeof value !== 'object') return undefined;
  const candidate = value as Partial<EndlessSave>;
  if (
    typeof candidate.wave !== 'number' || !Number.isFinite(candidate.wave) || candidate.wave < 1 ||
    typeof candidate.score !== 'number' || !Number.isFinite(candidate.score) || candidate.score < 0 ||
    typeof candidate.lives !== 'number' || !Number.isFinite(candidate.lives) || candidate.lives < 0 ||
    typeof candidate.bombs !== 'number' || !Number.isFinite(candidate.bombs) || candidate.bombs < 0 ||
    typeof candidate.savedAt !== 'string'
  ) return undefined;
  return {
    wave: Math.floor(candidate.wave),
    score: Math.floor(candidate.score),
    lives: Math.floor(candidate.lives),
    bombs: Math.floor(candidate.bombs),
    savedAt: candidate.savedAt,
  };
}

function getLocalTimestamp(): number {
  const statsTime = Date.parse(loadStats().lastPlayedAt ?? '');
  const endlessTime = Date.parse(loadEndlessSave()?.savedAt ?? '');
  return Math.max(Number.isFinite(statsTime) ? statsTime : 0, Number.isFinite(endlessTime) ? endlessTime : 0);
}

async function uploadLocalSnapshot(userId: string): Promise<void> {
  const { error } = await supabase
    .from('player_cloud_saves')
    .upsert({
      user_id: userId,
      stats: loadStats(),
      endless: loadEndlessSave(),
      updated_at: new Date().toISOString(),
    }, { onConflict: 'user_id' });
  if (error) throw error;
  setCloudStatus('クラウドに戦績と進行状況を保存しました。');
}

async function applyRemoteSnapshot(stats: CareerStats, endless: EndlessSave | null): Promise<void> {
  restoringCloudData = true;
  try {
    saveStats(stats);
    if (endless) saveEndless(endless);
    else clearEndlessSave();
  } finally {
    restoringCloudData = false;
  }
}

async function syncAfterSignIn(user: { id: string }): Promise<void> {
  cloudReady = false;
  renderAccountState();
  try {
    const previousOwner = localStorage.getItem(ACCOUNT_LINK_KEY);
    const { data, error } = await supabase
      .from('player_cloud_saves')
      .select('stats, endless, updated_at')
      .eq('user_id', user.id)
      .maybeSingle();

    if (error) throw error;

    if (!data) {
      // Import guest progress on first sign-in, but never copy another
      // signed-in user's local data into a different account.
      if (previousOwner && previousOwner !== user.id) {
        await applyRemoteSnapshot(EMPTY_STATS, null);
      }
      await uploadLocalSnapshot(user.id);
    } else {
      const remoteStats = parseCareerStats(data.stats);
      const remoteEndless = parseEndlessSave(data.endless);
      if (!remoteStats || remoteEndless === undefined) {
        throw new Error('クラウドの保存データ形式が正しくありません。');
      }

      const remoteUpdatedAt = Date.parse(data.updated_at);
      const localIsNewer = previousOwner === user.id && getLocalTimestamp() > (Number.isFinite(remoteUpdatedAt) ? remoteUpdatedAt : 0);
      if (localIsNewer) {
        await uploadLocalSnapshot(user.id);
      } else {
        await applyRemoteSnapshot(remoteStats, remoteEndless);
        setCloudStatus('クラウドの最新データを読み込みました。');
      }
    }

    localStorage.setItem(ACCOUNT_LINK_KEY, user.id);
  } catch (error) {
    setCloudStatus(error instanceof Error ? `同期できませんでした：${error.message}` : 'クラウド同期に失敗しました。', true);
  } finally {
    cloudReady = true;
    renderAccountState();
  }
}

function queueLocalUpload(): void {
  if (!activeUser || !cloudReady || restoringCloudData) return;
  const userId = activeUser.id;
  writeQueue = writeQueue
    .then(async () => {
      if (activeUser?.id !== userId || !cloudReady) return;
      await uploadLocalSnapshot(userId);
    })
    .catch((error: unknown) => {
      setCloudStatus(error instanceof Error ? `クラウド保存に失敗しました：${error.message}` : 'クラウド保存に失敗しました。', true);
    });
}

export async function initializeCloudAccount(): Promise<void> {
  const topActions = document.querySelector<HTMLElement>('.top-actions');
  if (!topActions) return;
  adminPanel = initializeAdminPanel(supabase);
  multiplayerPanel = initializeMultiplayer(supabase);

  const accountButton = document.createElement('button');
  accountButton.className = 'icon-button cloud-account-button';
  accountButton.id = 'cloud-account-open';
  accountButton.type = 'button';
  accountButton.innerHTML = '<span>◎</span><span class="button-caption">ACCOUNT</span>';
  topActions.append(accountButton);

  const modal = document.createElement('div');
  modal.className = 'modal-backdrop cloud-modal';
  modal.id = 'cloud-account-modal';
  modal.hidden = true;
  modal.innerHTML = `
    <section class="modal-card cloud-account-card" role="dialog" aria-modal="true" aria-labelledby="cloud-account-title">
      <div class="modal-overline">ONLINE ACCOUNT / CLOUD SAVE</div>
      <h2 id="cloud-account-title">PLAYER <span>ACCOUNT</span></h2>
      <div id="cloud-signed-out">
        <p>Clerkの標準画面から登録・ログインできます。Discord、GitHub、メールに対応しています。ゲストプレイも引き続き利用できます。</p>
        <div id="clerk-sign-in" class="clerk-sign-in-root"></div>
      </div>
      <div id="cloud-signed-in" hidden>
        <div class="cloud-user-panel">
          <span class="cloud-state-label">SIGNED IN</span>
          <strong id="cloud-user-email"></strong>
          <div id="clerk-user-button" class="clerk-user-button-root"></div>
          <p>プロフィール管理とログアウトはClerkの標準メニューから行えます。</p>
          <p>戦績とENDLESSの進行状況はこのアカウントに保存されます。</p>
        </div>
        <div class="modal-actions cloud-auth-actions">
          <button class="primary-button" id="cloud-sync" type="button" disabled>SYNC NOW</button>
        </div>
      </div>
      <div class="transfer-message cloud-status" id="cloud-auth-message" aria-live="polite"></div>
      <p class="cloud-privacy-note">メールアドレスは認証に使用され、ゲーム内には公開されません。アカウント登録は保護者とも確認してください。</p>
      <div class="modal-actions"><button class="secondary-button" id="cloud-close" type="button">CLOSE</button></div>
    </section>
  `;
  document.body.append(modal);

  accountButton.addEventListener('click', () => {
    renderAccountState();
    modal.hidden = false;
    mountClerkControls();
  });
  getElement<HTMLButtonElement>('#cloud-close').addEventListener('click', () => { modal.hidden = true; });
  modal.addEventListener('click', (event) => {
    if (event.target === modal) modal.hidden = true;
  });

  getElement<HTMLButtonElement>('#cloud-sync').addEventListener('click', async () => {
    if (!activeUser || !cloudReady) return;
    const button = getElement<HTMLButtonElement>('#cloud-sync');
    button.disabled = true;
    try {
      await uploadLocalSnapshot(activeUser.id);
    } catch (error) {
      setCloudStatus(error instanceof Error ? error.message : 'クラウド保存に失敗しました。', true);
    } finally {
      button.disabled = false;
    }
  });

  window.addEventListener('key-bullet:local-data-changed', queueLocalUpload);

  try {
    await loadClerkUiBundle();
    await clerk.load({ ui: { ClerkUI: window.__internal_ClerkUICtor as never } });
    clerkReady = true;
    clerk.addListener(({ user }) => {
      const nextUser = user?.id
        ? { id: user.id, email: (user as CloudUser).primaryEmailAddress?.emailAddress ?? null }
        : null;
      const changed = nextUser?.id !== activeUser?.id;
      activeUser = nextUser;
      const clerkUser = user as CloudUser | null;
      adminPanel?.setAdminEnabled(clerkUser?.publicMetadata?.role === 'admin');
      multiplayerPanel?.setIdentity(nextUser && clerkUser ? {
        id: nextUser.id,
        displayName: clerkUser.username || nextUser.email?.split('@')[0] || 'PLAYER',
      } : null);

      if (!activeUser) {
        lastSyncedUserId = null;
        cloudReady = false;
        setCloudStatus('ログインすると、この端末の戦績をクラウドに保存できます。');
      } else if (changed || lastSyncedUserId !== activeUser.id) {
        lastSyncedUserId = activeUser.id;
        void syncAfterSignIn(activeUser);
      }

      renderAccountState();
      if (!modal.hidden) mountClerkControls();
    });
  } catch (error) {
    setCloudStatus(error instanceof Error ? error.message : 'Clerkを初期化できませんでした。', true);
  }

  renderAccountState();
}
