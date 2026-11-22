import type { SupabaseClient } from '@supabase/supabase-js';
import { setCustomPrompts } from './data';

type AnnouncementKind = 'info' | 'warning' | 'maintenance';
type PromptGenre = 'anime' | 'short' | 'long';

type Announcement = {
  id: string;
  title: string;
  body: string;
  kind: AnnouncementKind;
  is_published: boolean;
  created_at: string;
};

type AdminPrompt = {
  id: string;
  genre: PromptGenre;
  title: string;
  display: string;
  note: string;
  is_active: boolean;
  created_at: string;
};

export type GlobalGameSettings = {
  id: 'global';
  maintenance_mode: boolean;
  maintenance_message: string;
  story_enabled: boolean;
  endless_enabled: boolean;
  online_enabled: boolean;
  difficulty_override: 'off' | 'normal' | 'easy';
};

const DEFAULT_SETTINGS: GlobalGameSettings = {
  id: 'global',
  maintenance_mode: false,
  maintenance_message: 'ただいまメンテナンス中です。しばらくしてから再度アクセスしてください。',
  story_enabled: true,
  endless_enabled: true,
  online_enabled: true,
  difficulty_override: 'off',
};

export type AdminPanelController = {
  setAdminEnabled: (enabled: boolean) => void;
  refreshPublicData: () => Promise<void>;
};

function emitPublicSettings(settings: GlobalGameSettings): void {
  window.dispatchEvent(new CustomEvent('key-bullet:public-game-settings', { detail: settings }));
}

export async function refreshPublicGameData(supabase: SupabaseClient): Promise<void> {
  const [settingsResult, promptsResult] = await Promise.all([
    supabase.from('game_settings')
      .select('id, maintenance_mode, maintenance_message, story_enabled, endless_enabled, online_enabled, difficulty_override')
      .eq('id', 'global')
      .maybeSingle(),
    supabase.from('game_custom_prompts')
      .select('id, genre, title, display, note')
      .eq('is_active', true)
      .limit(250),
  ]);

  if (!settingsResult.error && settingsResult.data) {
    const row = settingsResult.data as GlobalGameSettings;
    const settings: GlobalGameSettings = {
      id: 'global',
      maintenance_mode: row.maintenance_mode === true,
      maintenance_message: typeof row.maintenance_message === 'string' ? row.maintenance_message : DEFAULT_SETTINGS.maintenance_message,
      story_enabled: row.story_enabled !== false,
      endless_enabled: row.endless_enabled !== false,
      online_enabled: row.online_enabled !== false,
      difficulty_override: ['off', 'normal', 'easy'].includes(row.difficulty_override) ? row.difficulty_override : 'off',
    };
    emitPublicSettings(settings);
    let maintenanceBanner = document.querySelector<HTMLElement>('#kb-global-maintenance-banner');
    if (settings.maintenance_mode) {
      if (!maintenanceBanner) {
        maintenanceBanner = document.createElement('section');
        maintenanceBanner.id = 'kb-global-maintenance-banner';
        maintenanceBanner.className = 'kb-global-maintenance';
        const title = document.createElement('strong');
        title.textContent = 'MAINTENANCE MODE';
        const message = document.createElement('p');
        message.id = 'kb-global-maintenance-message';
        maintenanceBanner.append(title, message);
        document.querySelector('.topbar')?.insertAdjacentElement('afterend', maintenanceBanner);
      }
      const message = maintenanceBanner.querySelector<HTMLElement>('#kb-global-maintenance-message');
      if (message) message.textContent = settings.maintenance_message;
      maintenanceBanner.hidden = false;
    } else if (maintenanceBanner) {
      maintenanceBanner.hidden = true;
    }
  }

  if (!promptsResult.error) {
    const rows = (promptsResult.data ?? []) as Array<{
      id: string; genre: string; title: string; display: string; note: string;
    }>;
    setCustomPrompts(rows);
    window.dispatchEvent(new CustomEvent('key-bullet:custom-prompts-updated', {
      detail: { count: rows.length },
    }));
  }
}

export function initializeAdminPanel(supabase: SupabaseClient): AdminPanelController {
  const topActions = document.querySelector<HTMLElement>('.top-actions');
  if (!topActions) {
    return { setAdminEnabled: () => undefined, refreshPublicData: async () => undefined };
  }

  const style = document.createElement('style');
  style.textContent = `
    .kb-admin-trigger { border-color:rgba(255,190,90,.38); color:#F2C47C; }
    .kb-admin-banner { margin:10px 0 0; padding:12px 15px; border:1px solid rgba(0,240,255,.25); background:rgba(0,240,255,.055); }
    .kb-admin-banner--warning { border-color:rgba(255,190,90,.42); background:rgba(255,190,90,.07); }
    .kb-admin-banner--maintenance { border-color:rgba(255,105,125,.42); background:rgba(255,105,125,.07); }
    .kb-admin-banner strong { display:block; margin-bottom:4px; color:#EAFBFF; font-size:12px; }
    .kb-admin-banner p { margin:0; color:#A9BBC2; font-size:11px; line-height:1.65; white-space:pre-wrap; overflow-wrap:anywhere; }
    .kb-global-maintenance { margin:10px 0 0; padding:12px 15px; border:1px solid rgba(255,105,125,.5); background:rgba(255,105,125,.08); }
    .kb-global-maintenance strong { display:block; margin-bottom:4px; color:#FFD4D9; font-size:11px; letter-spacing:.1em; }
    .kb-global-maintenance p { margin:0; color:#E6BFC5; font-size:11px; line-height:1.65; white-space:pre-wrap; overflow-wrap:anywhere; }
    .kb-admin-backdrop { position:fixed; inset:0; z-index:90; display:flex; align-items:center; justify-content:center; padding:12px; background:rgba(1,5,10,.86); backdrop-filter:blur(8px); }
    .kb-admin-backdrop[hidden] { display:none; }
    .kb-admin-card { width:min(100%,940px); max-height:min(94dvh,900px); overflow:auto; padding:22px; border:1px solid rgba(255,190,90,.3); background:#101923; box-shadow:0 24px 80px rgba(0,0,0,.5); color:#D7E6E8; }
    .kb-admin-head { display:flex; justify-content:space-between; align-items:flex-start; gap:12px; }
    .kb-admin-card h2 { margin:5px 0 7px; color:#F4D4A0; font-size:22px; letter-spacing:.12em; }
    .kb-admin-card h3 { margin:0; color:#E7D4B8; font-size:13px; letter-spacing:.04em; }
    .kb-admin-card p { color:#8DA4B4; font-size:11px; line-height:1.7; }
    .kb-admin-kicker { color:#C69A5F; font:700 9px ui-monospace,monospace; letter-spacing:.18em; }
    .kb-admin-close-icon { flex:0 0 auto; min-width:36px; min-height:36px; border:1px solid rgba(145,178,187,.25); background:#07101A; color:#C9DADC; font-size:18px; cursor:pointer; }
    .kb-admin-tabs { display:flex; gap:6px; overflow-x:auto; padding:12px 0; margin:10px 0 14px; border-top:1px solid rgba(145,178,187,.13); border-bottom:1px solid rgba(145,178,187,.13); }
    .kb-admin-tab { flex:0 0 auto; min-height:36px; padding:7px 12px; border:1px solid rgba(145,178,187,.2); background:rgba(4,10,17,.55); color:#9FB4BC; font-size:10px; cursor:pointer; }
    .kb-admin-tab[aria-selected="true"] { border-color:rgba(198,154,95,.62); color:#F4D4A0; background:rgba(198,154,95,.09); }
    .kb-admin-pane[hidden] { display:none; }
    .kb-admin-pane { min-height:250px; }
    .kb-admin-grid { display:grid; grid-template-columns:repeat(4,minmax(0,1fr)); gap:9px; margin:12px 0 18px; }
    .kb-admin-metric { min-width:0; padding:13px; border:1px solid rgba(145,178,187,.15); background:rgba(4,10,17,.55); }
    .kb-admin-metric span { display:block; color:#7E98A5; font:700 8px ui-monospace,monospace; letter-spacing:.12em; }
    .kb-admin-metric strong { display:block; margin-top:8px; color:#F0D4A7; font:800 22px ui-monospace,monospace; overflow-wrap:anywhere; }
    .kb-admin-overview-row { display:flex; flex-wrap:wrap; gap:8px; align-items:center; padding:12px; margin:10px 0; border:1px solid rgba(145,178,187,.15); background:rgba(4,10,17,.42); }
    .kb-admin-pill { display:inline-flex; align-items:center; padding:5px 8px; border:1px solid rgba(145,178,187,.22); color:#B8C9CE; font:700 8px ui-monospace,monospace; letter-spacing:.08em; }
    .kb-admin-pill.good { border-color:rgba(115,195,155,.35); color:#9FD8B7; }
    .kb-admin-pill.warn { border-color:rgba(255,150,120,.38); color:#FFC0A6; }
    .kb-admin-section { padding:14px; margin:12px 0; border:1px solid rgba(145,178,187,.14); background:rgba(4,10,17,.36); }
    .kb-admin-form { display:grid; gap:11px; margin:12px 0; }
    .kb-admin-form label { display:grid; gap:6px; color:#A9BDC2; font-size:10px; font-weight:700; }
    .kb-admin-form input:not([type=checkbox]), .kb-admin-form textarea, .kb-admin-form select { width:100%; min-height:40px; padding:9px 10px; border:1px solid rgba(145,178,187,.24); border-radius:0; background:#07101A; color:#EAFBFF; font:12px ui-sans-serif,system-ui,sans-serif; }
    .kb-admin-form textarea { min-height:90px; resize:vertical; line-height:1.65; }
    .kb-admin-inline { display:grid; grid-template-columns:repeat(2,minmax(0,1fr)); gap:10px; }
    .kb-admin-checks { display:grid; grid-template-columns:repeat(2,minmax(0,1fr)); gap:8px; margin:10px 0; }
    .kb-admin-check { display:flex !important; grid-template-columns:auto 1fr; align-items:center; gap:9px !important; min-height:42px; padding:9px 10px; border:1px solid rgba(145,178,187,.17); background:rgba(2,9,16,.55); cursor:pointer; }
    .kb-admin-check input { width:16px; height:16px; accent-color:#C69A5F; }
    .kb-admin-check span { display:grid; gap:3px; }
    .kb-admin-check strong { color:#DCE7E8; font-size:10px; }
    .kb-admin-check small { color:#7F96A1; font-size:9px; font-weight:400; }
    .kb-admin-actions { display:flex; flex-wrap:wrap; gap:8px; margin-top:10px; }
    .kb-admin-actions button, .kb-admin-item button, .kb-admin-room button { min-height:36px; padding:7px 12px; border:1px solid rgba(145,178,187,.25); background:rgba(131,187,192,.06); color:#D7E6E8; font-size:10px; cursor:pointer; }
    .kb-admin-actions .kb-admin-save { border-color:rgba(198,154,95,.55); color:#F4D4A0; }
    .kb-admin-actions button:disabled, .kb-admin-item button:disabled, .kb-admin-room button:disabled { opacity:.45; cursor:wait; }
    .kb-admin-list { display:grid; gap:8px; margin:12px 0; }
    .kb-admin-item { display:grid; grid-template-columns:minmax(0,1fr) auto; gap:10px; align-items:center; padding:11px; border:1px solid rgba(145,178,187,.14); background:rgba(4,10,17,.55); }
    .kb-admin-item strong { display:block; color:#DDE9EA; font-size:11px; overflow-wrap:anywhere; }
    .kb-admin-item small { display:block; margin-top:4px; color:#8299A4; font-size:9px; line-height:1.5; }
    .kb-admin-item-actions { display:flex; flex-wrap:wrap; gap:6px; }
    .kb-admin-room { display:grid; grid-template-columns:minmax(0,1fr) auto; align-items:center; gap:10px; padding:11px; border:1px solid rgba(145,178,187,.14); background:rgba(4,10,17,.55); }
    .kb-admin-room strong { display:block; color:#E7D9C5; font:700 11px ui-monospace,monospace; }
    .kb-admin-room small { display:block; margin-top:4px; color:#849AA4; font-size:9px; }
    .kb-admin-status { min-height:22px; padding-top:7px; color:#9CB5B9; font-size:10px; overflow-wrap:anywhere; }
    .kb-admin-status.error { color:#FF9BA7; }
    .kb-admin-muted { color:#778F9B !important; font-size:9px !important; }
    .kb-admin-assist { display:grid; gap:9px; margin:10px 0; }
    .kb-admin-assist-toggle { display:flex !important; align-items:center; gap:10px !important; padding:10px; border:1px solid rgba(198,154,95,.17); background:rgba(3,10,17,.56); cursor:pointer; }
    .kb-admin-assist-toggle input { width:16px; height:16px; accent-color:#C69A5F; }
    .kb-admin-assist-toggle span { display:grid; gap:3px; }
    .kb-admin-assist-toggle strong { color:#EED4AC; font-size:11px; }
    .kb-admin-assist-toggle small { color:#8195A0; font-size:9px; font-weight:400; }
    @media(max-width:700px){ .kb-admin-grid{grid-template-columns:repeat(2,minmax(0,1fr));} .kb-admin-inline,.kb-admin-checks{grid-template-columns:1fr;} }
    @media(max-width:560px){ .kb-admin-card{padding:15px;} .kb-admin-item,.kb-admin-room{grid-template-columns:1fr;} .kb-admin-item-actions button,.kb-admin-room button{flex:1;} .kb-admin-actions button{flex:1;} }
  `;
  document.head.append(style);

  const trigger = document.createElement('button');
  trigger.type = 'button';
  trigger.className = 'icon-button kb-admin-trigger';
  trigger.textContent = 'ADMIN';
  trigger.setAttribute('aria-label', '管理者コントロールセンターを開く');
  trigger.hidden = true;
  topActions.append(trigger);

  const banner = document.createElement('section');
  banner.className = 'kb-admin-banner';
  banner.hidden = true;
  const bannerTitle = document.createElement('strong');
  const bannerBody = document.createElement('p');
  banner.append(bannerTitle, bannerBody);
  document.querySelector('.topbar')?.insertAdjacentElement('afterend', banner);

  const backdrop = document.createElement('div');
  backdrop.className = 'kb-admin-backdrop';
  backdrop.id = 'kb-admin-backdrop';
  backdrop.hidden = true;
  backdrop.innerHTML = `
    <section class="kb-admin-card" role="dialog" aria-modal="true" aria-labelledby="kb-admin-title">
      <header class="kb-admin-head">
        <div><div class="kb-admin-kicker">KEY BULLET / OPERATIONS</div><h2 id="kb-admin-title">ADMIN CONTROL CENTER</h2><p>ゲーム運営に必要な設定・コンテンツ・告知・ルームをここで管理します。</p></div>
        <button class="kb-admin-close-icon" id="kb-admin-close" type="button" aria-label="閉じる">×</button>
      </header>
      <nav class="kb-admin-tabs" role="tablist" aria-label="管理メニュー">
        <button class="kb-admin-tab" type="button" data-admin-tab="overview" role="tab" aria-selected="true">概要</button>
        <button class="kb-admin-tab" type="button" data-admin-tab="game" role="tab" aria-selected="false">ゲーム設定</button>
        <button class="kb-admin-tab" type="button" data-admin-tab="prompts" role="tab" aria-selected="false">問題管理</button>
        <button class="kb-admin-tab" type="button" data-admin-tab="announcements" role="tab" aria-selected="false">お知らせ</button>
        <button class="kb-admin-tab" type="button" data-admin-tab="rooms" role="tab" aria-selected="false">ルーム監視</button>
        <button class="kb-admin-tab" type="button" data-admin-tab="assist" role="tab" aria-selected="false">管理者補助</button>
      </nav>

      <section class="kb-admin-pane" data-admin-pane="overview">
        <div class="kb-admin-kicker">LIVE OVERVIEW</div>
        <div class="kb-admin-grid">
          <article class="kb-admin-metric"><span>CUSTOM PROMPTS</span><strong id="kb-admin-metric-prompts">—</strong></article>
          <article class="kb-admin-metric"><span>ANNOUNCEMENTS</span><strong id="kb-admin-metric-news">—</strong></article>
          <article class="kb-admin-metric"><span>ACTIVE ROOMS</span><strong id="kb-admin-metric-rooms">—</strong></article>
          <article class="kb-admin-metric"><span>MAINTENANCE</span><strong id="kb-admin-metric-maintenance">—</strong></article>
        </div>
        <div class="kb-admin-section"><h3>現在の運営状態</h3><div class="kb-admin-overview-row" id="kb-admin-overview-state"></div><p class="kb-admin-muted">数値はSupabaseから取得した公開ゲームデータの集計です。プレイヤーのメールアドレスや個人セーブ内容は表示しません。</p></div>
        <div class="kb-admin-actions"><button type="button" data-open-tab="game">ゲーム設定を開く</button><button type="button" data-open-tab="prompts">問題を管理する</button><button type="button" id="kb-admin-refresh">最新情報に更新</button></div>
      </section>

      <section class="kb-admin-pane" data-admin-pane="game" hidden>
        <div class="kb-admin-kicker">GLOBAL GAME SETTINGS</div>
        <p>ここで変更した設定は、ゲームを開いたプレイヤー全員に適用されます。設定は公開領域に保存し、変更権限は管理者だけに制限しています。</p>
        <form class="kb-admin-form" id="kb-admin-settings-form">
          <div class="kb-admin-section">
            <h3>サービス・ゲームモード</h3>
            <div class="kb-admin-checks">
              <label class="kb-admin-check"><input id="kb-admin-maintenance" type="checkbox"><span><strong>メンテナンスモード</strong><small>一般プレイヤーの新規プレイを停止</small></span></label>
              <label class="kb-admin-check"><input id="kb-admin-story" type="checkbox" checked><span><strong>STORYを有効化</strong><small>STORYの開始を許可</small></span></label>
              <label class="kb-admin-check"><input id="kb-admin-endless" type="checkbox" checked><span><strong>ENDLESSを有効化</strong><small>ENDLESSの開始・再開を許可</small></span></label>
              <label class="kb-admin-check"><input id="kb-admin-online" type="checkbox" checked><span><strong>ONLINEを有効化</strong><small>新しいオンラインルームへの参加を許可</small></span></label>
            </div>
            <label>メンテナンス時の案内<textarea id="kb-admin-maintenance-message" maxlength="500" required></textarea></label>
          </div>
          <div class="kb-admin-section">
            <h3>難易度コントロール</h3>
            <label>全プレイヤーへの難易度指定<select id="kb-admin-difficulty"><option value="off">強制しない（プレイヤー設定を優先）</option><option value="normal">NORMALを指定</option><option value="easy">EASYを指定</option></select></label>
            <p class="kb-admin-muted">強制指定を解除すると、各プレイヤーが保存した難易度に戻ります。オンライン対戦は公平性のためNORMAL固定です。</p>
          </div>
          <div class="kb-admin-actions"><button class="kb-admin-save" type="submit">全体設定を保存</button><button type="button" id="kb-admin-settings-reset">標準設定に戻す</button></div>
        </form>
      </section>

      <section class="kb-admin-pane" data-admin-pane="prompts" hidden>
        <div class="kb-admin-kicker">CUSTOM PROMPT MANAGER</div>
        <p>管理者が追加した問題は、公開状態にすると全プレイヤーの出題候補に加わります。CODE形式ではなく、日本語の文章カテゴリ用です。</p>
        <form class="kb-admin-form" id="kb-admin-prompt-form">
          <div class="kb-admin-inline">
            <label>カテゴリ<select id="kb-admin-prompt-genre"><option value="short">SHORT TEXT</option><option value="anime">DIALOGUE</option><option value="long">LONG TEXT</option></select></label>
            <label>問題名（60文字以内）<input id="kb-admin-prompt-title" maxlength="60" required></label>
          </div>
          <label>出題する文章（500文字以内）<textarea id="kb-admin-prompt-display" maxlength="500" required></textarea></label>
          <label>補足（240文字以内）<input id="kb-admin-prompt-note" maxlength="240" value="管理者が追加したお題"></label>
          <label class="kb-admin-check"><input id="kb-admin-prompt-active" type="checkbox" checked><span><strong>出題に使用する</strong><small>OFFにするとプレイヤーには出題されません</small></span></label>
          <div class="kb-admin-actions"><button class="kb-admin-save" type="submit">問題を保存</button><button type="button" id="kb-admin-prompt-new">新規作成</button></div>
        </form>
        <div class="kb-admin-kicker">SAVED CUSTOM PROMPTS</div>
        <div class="kb-admin-list" id="kb-admin-prompt-list"></div>
      </section>

      <section class="kb-admin-pane" data-admin-pane="announcements" hidden>
        <div class="kb-admin-kicker">ANNOUNCEMENT & MAINTENANCE NEWS</div>
        <form class="kb-admin-form" id="kb-admin-news-form">
          <label>タイトル（60文字以内）<input id="kb-admin-heading" maxlength="60" required></label>
          <label>本文（1,000文字以内）<textarea id="kb-admin-body" maxlength="1000" required></textarea></label>
          <div class="kb-admin-inline">
            <label>種類<select id="kb-admin-kind"><option value="info">通常のお知らせ</option><option value="warning">重要なお知らせ</option><option value="maintenance">メンテナンス</option></select></label>
            <label class="kb-admin-check"><input id="kb-admin-published" type="checkbox"><span><strong>全プレイヤーに公開する</strong><small>OFFなら下書きとして保存</small></span></label>
          </div>
          <div class="kb-admin-actions"><button class="kb-admin-save" type="submit">お知らせを保存</button><button id="kb-admin-new" type="button">新規作成に切替</button></div>
        </form>
        <div class="kb-admin-kicker">SAVED ANNOUNCEMENTS</div>
        <div class="kb-admin-list" id="kb-admin-list"></div>
      </section>

      <section class="kb-admin-pane" data-admin-pane="rooms" hidden>
        <div class="kb-admin-kicker">MULTIPLAYER ROOM MONITOR</div>
        <p>ルームコード、モード、状態、作成時刻を確認できます。待機中・終了済みの古いルームだけ削除できます。プレイ中のルームはここから削除できません。</p>
        <div class="kb-admin-actions"><button type="button" id="kb-admin-rooms-refresh">ルーム一覧を更新</button></div>
        <div class="kb-admin-list" id="kb-admin-room-list"></div>
      </section>

      <section class="kb-admin-pane" data-admin-pane="assist" hidden>
        <div class="kb-admin-kicker">ADMIN ONLY / AUTO PILOT</div>
        <p>管理者アカウントでのSTORY / ENDLESS検証用です。オンライン対戦中は自動的に停止します。</p>
        <div class="kb-admin-assist">
          <label class="kb-admin-assist-toggle"><input id="kb-admin-auto-type" type="checkbox"><span><strong>自動入力</strong><small>お題を自動入力して攻撃</small></span></label>
          <label class="kb-admin-assist-toggle"><input id="kb-admin-auto-dodge" type="checkbox"><span><strong>自動回避</strong><small>弾道を予測して安全な方向へ移動</small></span></label>
          <div class="kb-admin-status" id="kb-admin-assist-status">STORY / ENDLESSで利用できます。</div>
        </div>
      </section>

      <div class="kb-admin-status" id="kb-admin-status" role="status" aria-live="polite"></div>
      <p class="kb-admin-muted">アカウントの削除やパスワード変更はClerkの認証管理で行います。この画面からパスワードや秘密鍵を表示することはありません。</p>
    </section>
  `;
  document.body.append(backdrop);

  let adminEnabled = false;
  let selectedAnnouncementId: string | null = null;
  let selectedPromptId: string | null = null;
  let currentSettings: GlobalGameSettings = { ...DEFAULT_SETTINGS };

  const $ = <T extends HTMLElement>(selector: string): T => {
    const element = backdrop.querySelector<T>(selector);
    if (!element) throw new Error('Missing admin UI element: ' + selector);
    return element;
  };
  const status = $('#kb-admin-status');

  function setStatus(message: string, isError = false): void {
    status.textContent = message;
    status.classList.toggle('error', isError);
  }

  function showTab(name: string): void {
    backdrop.querySelectorAll<HTMLElement>('[data-admin-pane]').forEach((pane) => {
      pane.hidden = pane.dataset.adminPane !== name;
    });
    backdrop.querySelectorAll<HTMLButtonElement>('[data-admin-tab]').forEach((tab) => {
      tab.setAttribute('aria-selected', String(tab.dataset.adminTab === name));
    });
    if (name === 'overview') void loadOverview();
    if (name === 'game') void loadSettingsForm();
    if (name === 'prompts') void loadCustomPromptList();
    if (name === 'announcements') void loadAnnouncementList();
    if (name === 'rooms') void loadRoomList();
  }

  async function refreshPublicData(): Promise<void> {
    await refreshPublicGameData(supabase);
    await refreshPublicBanner();
  }

  async function refreshPublicBanner(): Promise<void> {
    const { data, error } = await supabase
      .from('game_announcements')
      .select('id, title, body, kind, is_published, created_at')
      .eq('is_published', true)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (error || !data) {
      banner.hidden = true;
      return;
    }

    const announcement = data as Announcement;
    banner.className = 'kb-admin-banner kb-admin-banner--' + announcement.kind;
    bannerTitle.textContent = announcement.title;
    bannerBody.textContent = announcement.body;
    banner.hidden = false;
  }

  async function loadOverview(): Promise<void> {
    setStatus('運営データを集計しています。');
    const [promptResult, newsResult, roomResult, settingsResult] = await Promise.all([
      supabase.from('game_custom_prompts').select('id', { count: 'exact', head: true }).eq('is_active', true),
      supabase.from('game_announcements').select('id', { count: 'exact', head: true }),
      supabase.from('game_rooms').select('id', { count: 'exact', head: true }).in('status', ['waiting', 'playing']),
      supabase.from('game_settings').select('maintenance_mode, story_enabled, endless_enabled, online_enabled, difficulty_override').eq('id', 'global').maybeSingle(),
    ]);
    if (promptResult.error || newsResult.error || roomResult.error || settingsResult.error) {
      setStatus('概要を一部取得できませんでした。権限と通信状態を確認してください。', true);
    } else {
      $('#kb-admin-metric-prompts').textContent = String(promptResult.count ?? 0);
      $('#kb-admin-metric-news').textContent = String(newsResult.count ?? 0);
      $('#kb-admin-metric-rooms').textContent = String(roomResult.count ?? 0);
      const settings = (settingsResult.data ?? DEFAULT_SETTINGS) as GlobalGameSettings;
      $('#kb-admin-metric-maintenance').textContent = settings.maintenance_mode ? 'ON' : 'OFF';
      const state = $('#kb-admin-overview-state');
      state.replaceChildren();
      const pills: Array<[string, boolean]> = [
        ['STORY ' + (settings.story_enabled ? 'ON' : 'OFF'), settings.story_enabled],
        ['ENDLESS ' + (settings.endless_enabled ? 'ON' : 'OFF'), settings.endless_enabled],
        ['ONLINE ' + (settings.online_enabled ? 'ON' : 'OFF'), settings.online_enabled],
        ['MAINTENANCE ' + (settings.maintenance_mode ? 'ON' : 'OFF'), !settings.maintenance_mode],
      ];
      for (const [label, good] of pills) {
        const pill = document.createElement('span');
        pill.className = 'kb-admin-pill ' + (good ? 'good' : 'warn');
        pill.textContent = label;
        state.append(pill);
      }
    }
    setStatus('概要を更新しました。');
  }

  function resetAnnouncementForm(): void {
    selectedAnnouncementId = null;
    ($('#kb-admin-news-form') as HTMLFormElement).reset();
  }

  async function loadAnnouncementList(): Promise<void> {
    const list = $('#kb-admin-list');
    const { data, error } = await supabase
      .from('game_announcements')
      .select('id, title, body, kind, is_published, created_at')
      .order('created_at', { ascending: false })
      .limit(100);

    if (error) {
      setStatus('お知らせ一覧を読み込めませんでした。管理者ロールを確認してください。', true);
      return;
    }

    list.replaceChildren();
    const announcements = (data ?? []) as Announcement[];
    if (announcements.length === 0) {
      const empty = document.createElement('p');
      empty.textContent = 'お知らせはまだありません。';
      list.append(empty);
      return;
    }

    for (const announcement of announcements) {
      const item = document.createElement('article');
      item.className = 'kb-admin-item';
      const info = document.createElement('div');
      const title = document.createElement('strong');
      title.textContent = announcement.title;
      const meta = document.createElement('small');
      meta.textContent = (announcement.is_published ? '公開中' : '下書き') + ' / ' + announcement.kind + ' / ' + new Date(announcement.created_at).toLocaleString('ja-JP');
      info.append(title, meta);
      const actions = document.createElement('div');
      actions.className = 'kb-admin-item-actions';

      const edit = document.createElement('button');
      edit.type = 'button';
      edit.textContent = '編集';
      edit.addEventListener('click', () => {
        selectedAnnouncementId = announcement.id;
        ($('#kb-admin-heading') as HTMLInputElement).value = announcement.title;
        ($('#kb-admin-body') as HTMLTextAreaElement).value = announcement.body;
        ($('#kb-admin-kind') as HTMLSelectElement).value = announcement.kind;
        ($('#kb-admin-published') as HTMLInputElement).checked = announcement.is_published;
        setStatus('編集中：' + announcement.title);
        ($('#kb-admin-heading') as HTMLInputElement).focus();
      });

      const remove = document.createElement('button');
      remove.type = 'button';
      remove.textContent = '削除';
      remove.addEventListener('click', async () => {
        if (!adminEnabled || !window.confirm('このお知らせを削除しますか？')) return;
        remove.disabled = true;
        const { error: deleteError } = await supabase.from('game_announcements').delete().eq('id', announcement.id);
        if (deleteError) {
          setStatus('削除できませんでした。管理者権限を確認してください。', true);
          remove.disabled = false;
          return;
        }
        if (selectedAnnouncementId === announcement.id) resetAnnouncementForm();
        setStatus('お知らせを削除しました。');
        await Promise.all([loadAnnouncementList(), refreshPublicBanner(), loadOverview()]);
      });
      actions.append(edit, remove);
      item.append(info, actions);
      list.append(item);
    }
  }

  function resetPromptForm(): void {
    selectedPromptId = null;
    ($('#kb-admin-prompt-form') as HTMLFormElement).reset();
    ($('#kb-admin-prompt-note') as HTMLInputElement).value = '管理者が追加したお題';
    ($('#kb-admin-prompt-active') as HTMLInputElement).checked = true;
  }

  async function loadCustomPromptList(): Promise<void> {
    const list = $('#kb-admin-prompt-list');
    const { data, error } = await supabase
      .from('game_custom_prompts')
      .select('id, genre, title, display, note, is_active, created_at')
      .order('created_at', { ascending: false })
      .limit(250);
    if (error) {
      setStatus('問題一覧を読み込めませんでした。管理者ロールを確認してください。', true);
      return;
    }

    list.replaceChildren();
    const prompts = (data ?? []) as AdminPrompt[];
    if (prompts.length === 0) {
      const empty = document.createElement('p');
      empty.textContent = '追加した問題はまだありません。';
      list.append(empty);
      return;
    }

    for (const prompt of prompts) {
      const item = document.createElement('article');
      item.className = 'kb-admin-item';
      const info = document.createElement('div');
      const title = document.createElement('strong');
      title.textContent = prompt.title;
      const meta = document.createElement('small');
      const excerpt = prompt.display.length > 90 ? prompt.display.slice(0, 90) + '…' : prompt.display;
      meta.textContent = (prompt.is_active ? '出題中' : '停止中') + ' / ' + prompt.genre.toUpperCase() + ' / ' + excerpt;
      info.append(title, meta);
      const actions = document.createElement('div');
      actions.className = 'kb-admin-item-actions';

      const edit = document.createElement('button');
      edit.type = 'button';
      edit.textContent = '編集';
      edit.addEventListener('click', () => {
        selectedPromptId = prompt.id;
        ($('#kb-admin-prompt-genre') as HTMLSelectElement).value = prompt.genre;
        ($('#kb-admin-prompt-title') as HTMLInputElement).value = prompt.title;
        ($('#kb-admin-prompt-display') as HTMLTextAreaElement).value = prompt.display;
        ($('#kb-admin-prompt-note') as HTMLInputElement).value = prompt.note;
        ($('#kb-admin-prompt-active') as HTMLInputElement).checked = prompt.is_active;
        setStatus('編集中：' + prompt.title);
        ($('#kb-admin-prompt-title') as HTMLInputElement).focus();
      });

      const toggle = document.createElement('button');
      toggle.type = 'button';
      toggle.textContent = prompt.is_active ? '出題停止' : '再公開';
      toggle.addEventListener('click', async () => {
        if (!adminEnabled) return;
        toggle.disabled = true;
        const { error: updateError } = await supabase.from('game_custom_prompts')
          .update({ is_active: !prompt.is_active, updated_at: new Date().toISOString() })
          .eq('id', prompt.id);
        if (updateError) {
          setStatus('公開状態を変更できませんでした。', true);
          toggle.disabled = false;
          return;
        }
        await refreshPublicData();
        await Promise.all([loadCustomPromptList(), loadOverview()]);
        setStatus('問題の公開状態を更新しました。');
      });

      const remove = document.createElement('button');
      remove.type = 'button';
      remove.textContent = '削除';
      remove.addEventListener('click', async () => {
        if (!adminEnabled || !window.confirm('この問題を完全に削除しますか？')) return;
        remove.disabled = true;
        const { error: deleteError } = await supabase.from('game_custom_prompts').delete().eq('id', prompt.id);
        if (deleteError) {
          setStatus('問題を削除できませんでした。', true);
          remove.disabled = false;
          return;
        }
        if (selectedPromptId === prompt.id) resetPromptForm();
        await refreshPublicData();
        await Promise.all([loadCustomPromptList(), loadOverview()]);
        setStatus('問題を削除しました。');
      });
      actions.append(edit, toggle, remove);
      item.append(info, actions);
      list.append(item);
    }
  }

  async function loadSettingsForm(): Promise<void> {
    const { data, error } = await supabase.from('game_settings')
      .select('id, maintenance_mode, maintenance_message, story_enabled, endless_enabled, online_enabled, difficulty_override')
      .eq('id', 'global')
      .maybeSingle();
    if (error) {
      setStatus('全体設定を読み込めませんでした。', true);
      return;
    }
    currentSettings = { ...DEFAULT_SETTINGS, ...(data ?? {}) } as GlobalGameSettings;
    ($('#kb-admin-maintenance') as HTMLInputElement).checked = currentSettings.maintenance_mode;
    ($('#kb-admin-maintenance-message') as HTMLTextAreaElement).value = currentSettings.maintenance_message;
    ($('#kb-admin-story') as HTMLInputElement).checked = currentSettings.story_enabled;
    ($('#kb-admin-endless') as HTMLInputElement).checked = currentSettings.endless_enabled;
    ($('#kb-admin-online') as HTMLInputElement).checked = currentSettings.online_enabled;
    ($('#kb-admin-difficulty') as HTMLSelectElement).value = currentSettings.difficulty_override;
    setStatus('現在の全体設定を読み込みました。');
  }

  async function loadRoomList(): Promise<void> {
    const list = $('#kb-admin-room-list');
    const { data, error } = await supabase.from('game_rooms')
      .select('id, code, mode, status, max_players, created_at')
      .order('created_at', { ascending: false })
      .limit(50);
    if (error) {
      setStatus('ルーム一覧を読み込めませんでした。', true);
      return;
    }
    list.replaceChildren();
    const rooms = (data ?? []) as Array<{
      id: string; code: string; mode: string; status: string; max_players: number; created_at: string;
    }>;
    const activeCount = rooms.filter((room) => room.status === 'waiting' || room.status === 'playing').length;
    $('#kb-admin-metric-rooms').textContent = String(activeCount);
    if (rooms.length === 0) {
      const empty = document.createElement('p');
      empty.textContent = '現在、ルームはありません。';
      list.append(empty);
      setStatus('ルーム一覧を更新しました。');
      return;
    }

    for (const room of rooms) {
      const item = document.createElement('article');
      item.className = 'kb-admin-room';
      const info = document.createElement('div');
      const title = document.createElement('strong');
      title.textContent = room.code + ' / ' + (room.mode === 'pvp' ? 'PVP' : 'LINK RAID');
      const meta = document.createElement('small');
      const state = room.status === 'waiting' ? '待機中' : room.status === 'playing' ? 'プレイ中' : '終了';
      meta.textContent = state + ' / 最大' + room.max_players + '人 / ' + new Date(room.created_at).toLocaleString('ja-JP');
      info.append(title, meta);
      if (room.status !== 'playing') {
        const remove = document.createElement('button');
        remove.type = 'button';
        remove.textContent = 'ルームを削除';
        remove.addEventListener('click', async () => {
          if (!adminEnabled || !window.confirm('ルーム ' + room.code + ' を削除しますか？')) return;
          remove.disabled = true;
          const { error: deleteError } = await supabase.from('game_rooms').delete().eq('id', room.id);
          if (deleteError) {
            setStatus('ルームを削除できませんでした。', true);
            remove.disabled = false;
            return;
          }
          await Promise.all([loadRoomList(), loadOverview()]);
          setStatus('待機中または終了済みのルームを削除しました。');
        });
        item.append(info, remove);
      } else {
        const playing = document.createElement('span');
        playing.className = 'kb-admin-pill warn';
        playing.textContent = 'ACTIVE';
        item.append(info, playing);
      }
      list.append(item);
    }
    setStatus('ルーム一覧を更新しました。');
  }

  function dispatchAssistSettings(): void {
    const autoType = $('#kb-admin-auto-type') as HTMLInputElement;
    const autoDodge = $('#kb-admin-auto-dodge') as HTMLInputElement;
    window.dispatchEvent(new CustomEvent('key-bullet:admin-assist', {
      detail: { autoTyping: autoType.checked, autoDodge: autoDodge.checked },
    }));
    $('#kb-admin-assist-status').textContent = autoType.checked || autoDodge.checked
      ? '有効：通常のSTORY / ENDLESSで動作します。オンライン対戦では自動停止します。'
      : '自動入力・自動回避はOFFです。';
  }

  backdrop.querySelectorAll<HTMLButtonElement>('[data-admin-tab]').forEach((tab) => {
    tab.addEventListener('click', () => showTab(tab.dataset.adminTab ?? 'overview'));
  });
  backdrop.querySelectorAll<HTMLButtonElement>('[data-open-tab]').forEach((button) => {
    button.addEventListener('click', () => showTab(button.dataset.openTab ?? 'overview'));
  });

  trigger.addEventListener('click', async () => {
    if (!adminEnabled) return;
    backdrop.hidden = false;
    showTab('overview');
    setStatus('管理者データを読み込んでいます。');
    await Promise.all([refreshPublicData(), loadOverview()]);
  });

  $('#kb-admin-close').addEventListener('click', () => { backdrop.hidden = true; });
  backdrop.addEventListener('click', (event) => {
    if (event.target === backdrop) backdrop.hidden = true;
  });
  backdrop.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') backdrop.hidden = true;
  });
  $('#kb-admin-refresh').addEventListener('click', async () => {
    await refreshPublicData();
    await loadOverview();
    setStatus('管理データを再取得しました。');
  });

  ($('#kb-admin-news-form') as HTMLFormElement).addEventListener('submit', async (event) => {
    event.preventDefault();
    if (!adminEnabled) return;
    const title = ($('#kb-admin-heading') as HTMLInputElement).value.trim();
    const body = ($('#kb-admin-body') as HTMLTextAreaElement).value.trim();
    if (!title || !body) { setStatus('タイトルと本文を入力してください。', true); return; }
    const payload = {
      title, body,
      kind: ($('#kb-admin-kind') as HTMLSelectElement).value as AnnouncementKind,
      is_published: ($('#kb-admin-published') as HTMLInputElement).checked,
      updated_at: new Date().toISOString(),
    };
    const button = ($('#kb-admin-news-form') as HTMLFormElement).querySelector<HTMLButtonElement>('[type="submit"]')!;
    button.disabled = true;
    try {
      const result = selectedAnnouncementId
        ? await supabase.from('game_announcements').update(payload).eq('id', selectedAnnouncementId)
        : await supabase.from('game_announcements').insert(payload);
      if (result.error) throw result.error;
      setStatus(selectedAnnouncementId ? 'お知らせを更新しました。' : 'お知らせを作成しました。');
      resetAnnouncementForm();
      await Promise.all([loadAnnouncementList(), refreshPublicBanner(), loadOverview()]);
    } catch {
      setStatus('保存できませんでした。管理者ロールとデータベース権限を確認してください。', true);
    } finally {
      button.disabled = false;
    }
  });

  $('#kb-admin-new').addEventListener('click', () => {
    resetAnnouncementForm();
    setStatus('新しいお知らせを作成できます。');
  });

  ($('#kb-admin-prompt-form') as HTMLFormElement).addEventListener('submit', async (event) => {
    event.preventDefault();
    if (!adminEnabled) return;
    const genre = ($('#kb-admin-prompt-genre') as HTMLSelectElement).value as PromptGenre;
    const title = ($('#kb-admin-prompt-title') as HTMLInputElement).value.trim();
    const display = ($('#kb-admin-prompt-display') as HTMLTextAreaElement).value.trim();
    const note = ($('#kb-admin-prompt-note') as HTMLInputElement).value.trim() || '管理者が追加したお題';
    const is_active = ($('#kb-admin-prompt-active') as HTMLInputElement).checked;
    if (!title || !display || display.length > 500) { setStatus('問題名と500文字以内の文章を入力してください。', true); return; }
    const payload = { genre, title, display, note, is_active, updated_at: new Date().toISOString() };
    const button = ($('#kb-admin-prompt-form') as HTMLFormElement).querySelector<HTMLButtonElement>('[type="submit"]')!;
    button.disabled = true;
    try {
      const result = selectedPromptId
        ? await supabase.from('game_custom_prompts').update(payload).eq('id', selectedPromptId)
        : await supabase.from('game_custom_prompts').insert(payload);
      if (result.error) throw result.error;
      setStatus(selectedPromptId ? '問題を更新しました。' : '問題を追加しました。');
      resetPromptForm();
      await refreshPublicData();
      await Promise.all([loadCustomPromptList(), loadOverview()]);
    } catch {
      setStatus('問題を保存できませんでした。入力内容と管理者権限を確認してください。', true);
    } finally {
      button.disabled = false;
    }
  });

  $('#kb-admin-prompt-new').addEventListener('click', () => {
    resetPromptForm();
    setStatus('新しい問題を作成できます。');
  });

  ($('#kb-admin-settings-form') as HTMLFormElement).addEventListener('submit', async (event) => {
    event.preventDefault();
    if (!adminEnabled) return;
    const maintenanceMode = ($('#kb-admin-maintenance') as HTMLInputElement).checked;
    const maintenanceMessage = ($('#kb-admin-maintenance-message') as HTMLTextAreaElement).value.trim();
    if (!maintenanceMessage || maintenanceMessage.length > 500) {
      setStatus('メンテナンス時の案内を1〜500文字で入力してください。', true);
      return;
    }
    if (maintenanceMode && !currentSettings.maintenance_mode &&
      !window.confirm('メンテナンスモードを有効にします。一般プレイヤーは新しいゲームを開始できなくなります。続けますか？')) return;

    const payload = {
      id: 'global',
      maintenance_mode: maintenanceMode,
      maintenance_message: maintenanceMessage,
      story_enabled: ($('#kb-admin-story') as HTMLInputElement).checked,
      endless_enabled: ($('#kb-admin-endless') as HTMLInputElement).checked,
      online_enabled: ($('#kb-admin-online') as HTMLInputElement).checked,
      difficulty_override: ($('#kb-admin-difficulty') as HTMLSelectElement).value as GlobalGameSettings['difficulty_override'],
      updated_at: new Date().toISOString(),
    };
    const button = ($('#kb-admin-settings-form') as HTMLFormElement).querySelector<HTMLButtonElement>('[type="submit"]')!;
    button.disabled = true;
    try {
      const { error } = await supabase.from('game_settings').update(payload).eq('id', 'global');
      if (error) throw error;
      currentSettings = { ...payload, id: 'global' };
      await refreshPublicData();
      setStatus('全体設定を保存し、公開ゲームにも反映しました。');
      await loadOverview();
    } catch {
      setStatus('設定を保存できませんでした。管理者ロールを確認してください。', true);
    } finally {
      button.disabled = false;
    }
  });

  $('#kb-admin-settings-reset').addEventListener('click', () => {
    ($('#kb-admin-maintenance') as HTMLInputElement).checked = DEFAULT_SETTINGS.maintenance_mode;
    ($('#kb-admin-maintenance-message') as HTMLTextAreaElement).value = DEFAULT_SETTINGS.maintenance_message;
    ($('#kb-admin-story') as HTMLInputElement).checked = DEFAULT_SETTINGS.story_enabled;
    ($('#kb-admin-endless') as HTMLInputElement).checked = DEFAULT_SETTINGS.endless_enabled;
    ($('#kb-admin-online') as HTMLInputElement).checked = DEFAULT_SETTINGS.online_enabled;
    ($('#kb-admin-difficulty') as HTMLSelectElement).value = DEFAULT_SETTINGS.difficulty_override;
    setStatus('画面上の入力を標準値に戻しました。保存ボタンを押すまで適用されません。');
  });

  $('#kb-admin-rooms-refresh').addEventListener('click', () => { void loadRoomList(); });
  ($('#kb-admin-auto-type') as HTMLInputElement).addEventListener('change', dispatchAssistSettings);
  ($('#kb-admin-auto-dodge') as HTMLInputElement).addEventListener('change', dispatchAssistSettings);

  void refreshPublicData();
  window.setInterval(() => { void refreshPublicData(); }, 45_000);

  return {
    setAdminEnabled(enabled: boolean): void {
      adminEnabled = enabled;
      trigger.hidden = !enabled;
      if (!enabled) {
        backdrop.hidden = true;
        ($('#kb-admin-auto-type') as HTMLInputElement).checked = false;
        ($('#kb-admin-auto-dodge') as HTMLInputElement).checked = false;
      }
      window.dispatchEvent(new CustomEvent('key-bullet:admin-access', { detail: { enabled } }));
      dispatchAssistSettings();
    },
    refreshPublicData,
  };
}
