import { createClient, type User } from '@supabase/supabase-js';
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

// Publishable keys are designed for browser use. Row access is protected by RLS.
const SUPABASE_URL = 'https://mlpgmsdcgddbpzmjmjvw.supabase.co';
const SUPABASE_PUBLISHABLE_KEY = 'sb_publishable_w8TLRzk_eUvYjFHBoU8KQQ_bk6sSbZL';
const ACCOUNT_LINK_KEY = 'key-bullet:cloud-user:v1';

const supabase = createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
  auth: {
    autoRefreshToken: true,
    detectSessionInUrl: true,
    persistSession: true,
  },
});

let activeUser: User | null = null;
let cloudReady = false;
let restoringCloudData = false;
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
  getElement<HTMLElement>('#cloud-signed-out').hidden = signedIn;
  getElement<HTMLElement>('#cloud-signed-in').hidden = !signedIn;
  getElement<HTMLElement>('#cloud-user-email').textContent = activeUser?.email ?? '';
  const button = getElement<HTMLButtonElement>('#cloud-account-open');
  button.querySelector('.button-caption')!.textContent = signedIn ? 'ONLINE' : 'ACCOUNT';
  button.setAttribute('aria-label', signedIn ? 'Online account settings' : 'Sign in to online account');
  setCloudStatus(cloudStatus);
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

async function syncAfterSignIn(user: User): Promise<void> {
  cloudReady = false;
  try {
    const previousOwner = localStorage.getItem(ACCOUNT_LINK_KEY);
    const { data, error } = await supabase
      .from('player_cloud_saves')
      .select('stats, endless, updated_at')
      .eq('user_id', user.id)
      .maybeSingle();

    if (error) throw error;

    if (!data) {
      // Import guest progress for the first account on this browser, but never
      // copy another signed-in user's local data into a different account.
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

export function initializeCloudAccount(): void {
  const topActions = document.querySelector<HTMLElement>('.top-actions');
  if (!topActions) return;

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
        <p>メールアドレスとパスワードで登録・ログインできます。ゲストプレイも引き続き利用できます。</p>
        <div class="cloud-auth-fields">
          <label for="cloud-email">メールアドレス</label>
          <input id="cloud-email" type="email" autocomplete="email" maxlength="254" placeholder="you@example.com" />
          <label for="cloud-password">パスワード <small>8文字以上</small></label>
          <input id="cloud-password" type="password" autocomplete="new-password" minlength="8" />
          <label for="cloud-password-confirm">パスワード（新規登録時の確認）</label>
          <input id="cloud-password-confirm" type="password" autocomplete="new-password" minlength="8" />
        </div>
        <div class="modal-actions cloud-auth-actions">
          <button class="primary-button" id="cloud-signup" type="button">CREATE ACCOUNT</button>
          <button class="secondary-button" id="cloud-login" type="button">LOGIN</button>
        </div>
      </div>
      <div id="cloud-signed-in" hidden>
        <div class="cloud-user-panel">
          <span class="cloud-state-label">SIGNED IN</span>
          <strong id="cloud-user-email"></strong>
          <p>戦績とENDLESSの進行状況をこのアカウントに保存します。</p>
        </div>
        <div class="modal-actions cloud-auth-actions">
          <button class="primary-button" id="cloud-sync" type="button">SYNC NOW</button>
          <button class="secondary-button" id="cloud-signout" type="button">SIGN OUT</button>
        </div>
      </div>
      <div class="transfer-message cloud-status" id="cloud-auth-message" aria-live="polite"></div>
      <p class="cloud-privacy-note">メールアドレスは認証に使用され、ゲーム内には公開されません。登録前に保護者とも確認してください。</p>
      <div class="modal-actions"><button class="secondary-button" id="cloud-close" type="button">CLOSE</button></div>
    </section>
  `;
  document.body.append(modal);

  accountButton.addEventListener('click', () => {
    renderAccountState();
    modal.hidden = false;
  });
  getElement<HTMLButtonElement>('#cloud-close').addEventListener('click', () => { modal.hidden = true; });
  modal.addEventListener('click', (event) => {
    if (event.target === modal) modal.hidden = true;
  });

  getElement<HTMLButtonElement>('#cloud-signup').addEventListener('click', async () => {
    const email = getElement<HTMLInputElement>('#cloud-email').value.trim();
    const password = getElement<HTMLInputElement>('#cloud-password').value;
    const confirmation = getElement<HTMLInputElement>('#cloud-password-confirm').value;
    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      setCloudStatus('有効なメールアドレスを入力してください。', true);
      return;
    }
    if (password.length < 8) {
      setCloudStatus('パスワードは8文字以上にしてください。', true);
      return;
    }
    if (password !== confirmation) {
      setCloudStatus('確認用パスワードが一致しません。', true);
      return;
    }
    const button = getElement<HTMLButtonElement>('#cloud-signup');
    button.disabled = true;
    try {
      const emailRedirectTo = new URL('/KEY-BULLET/', window.location.origin).toString();
      const { data, error } = await supabase.auth.signUp({
        email,
        password,
        options: { emailRedirectTo },
      });
      if (error) throw error;
      if (!data.session) {
        setCloudStatus('確認メールを送信しました。メール内のリンクを開くと登録が完了します。');
      } else {
        setCloudStatus('アカウントを作成しました。クラウド同期を開始します。');
      }
    } catch (error) {
      setCloudStatus(error instanceof Error ? error.message : 'アカウントを作成できませんでした。', true);
    } finally {
      button.disabled = false;
    }
  });

  getElement<HTMLButtonElement>('#cloud-login').addEventListener('click', async () => {
    const email = getElement<HTMLInputElement>('#cloud-email').value.trim();
    const password = getElement<HTMLInputElement>('#cloud-password').value;
    if (!email || !password) {
      setCloudStatus('メールアドレスとパスワードを入力してください。', true);
      return;
    }
    const button = getElement<HTMLButtonElement>('#cloud-login');
    button.disabled = true;
    try {
      const { error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) throw error;
      setCloudStatus('ログインしました。クラウドデータを同期しています。');
    } catch (error) {
      setCloudStatus(error instanceof Error ? error.message : 'ログインできませんでした。', true);
    } finally {
      button.disabled = false;
    }
  });

  getElement<HTMLButtonElement>('#cloud-signout').addEventListener('click', async () => {
    const button = getElement<HTMLButtonElement>('#cloud-signout');
    button.disabled = true;
    try {
      const { error } = await supabase.auth.signOut();
      if (error) throw error;
      setCloudStatus('ログアウトしました。ゲストプレイは引き続き利用できます。');
    } catch (error) {
      setCloudStatus(error instanceof Error ? error.message : 'ログアウトできませんでした。', true);
    } finally {
      button.disabled = false;
    }
  });

  getElement<HTMLButtonElement>('#cloud-sync').addEventListener('click', async () => {
    if (!activeUser) return;
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
  supabase.auth.onAuthStateChange((_event, session) => {
    activeUser = session?.user ?? null;
    cloudReady = false;
    renderAccountState();
    if (activeUser) {
      const user = activeUser;
      queueMicrotask(() => { void syncAfterSignIn(user); });
    } else {
      cloudReady = false;
      setCloudStatus('ログインすると、この端末の戦績をクラウドに保存できます。');
    }
  });

  renderAccountState();
}
