import type { SupabaseClient } from '@supabase/supabase-js';

type AnnouncementKind = 'info' | 'warning' | 'maintenance';

type Announcement = {
  id: string;
  title: string;
  body: string;
  kind: AnnouncementKind;
  is_published: boolean;
  created_at: string;
};

export type AdminPanelController = {
  setAdminEnabled: (enabled: boolean) => void;
};

export function initializeAdminPanel(supabase: SupabaseClient): AdminPanelController {
  const topActions = document.querySelector<HTMLElement>('.top-actions');
  if (!topActions) return { setAdminEnabled: () => undefined };

  const styles = document.createElement('style');
  styles.textContent = [
    '.kb-admin-trigger { border-color: rgba(255,190,90,.38); color: #F2C47C; }',
    '.kb-admin-banner { margin: 10px 0 0; padding: 12px 15px; border: 1px solid rgba(0,240,255,.25); background: rgba(0,240,255,.055); }',
    '.kb-admin-banner--warning { border-color: rgba(255,190,90,.42); background: rgba(255,190,90,.07); }',
    '.kb-admin-banner--maintenance { border-color: rgba(255,105,125,.42); background: rgba(255,105,125,.07); }',
    '.kb-admin-banner strong { display:block; margin-bottom:4px; color:#EAFBFF; font-size:12px; }',
    '.kb-admin-banner p { margin:0; color:#A9BBC2; font-size:11px; line-height:1.65; white-space:pre-wrap; overflow-wrap:anywhere; }',
    '.kb-admin-backdrop { position:fixed; inset:0; z-index:90; display:flex; align-items:center; justify-content:center; padding:16px; background:rgba(1,5,10,.82); backdrop-filter:blur(8px); }',
    '.kb-admin-backdrop[hidden] { display:none; }',
    '.kb-admin-card { width:min(100%,680px); max-height:min(92dvh,820px); overflow:auto; padding:22px; border:1px solid rgba(255,190,90,.3); background:#101923; box-shadow:0 24px 80px rgba(0,0,0,.5); }',
    '.kb-admin-card h2 { margin:5px 0 7px; color:#F4D4A0; font-size:22px; letter-spacing:.12em; }',
    '.kb-admin-card p { color:#8DA4B4; font-size:11px; line-height:1.7; }',
    '.kb-admin-kicker { color:#C69A5F; font:700 9px ui-monospace,monospace; letter-spacing:.18em; }',
    '.kb-admin-form { display:grid; gap:9px; margin:16px 0; }',
    '.kb-admin-form label { display:grid; gap:6px; color:#A9BDC2; font-size:10px; font-weight:700; }',
    '.kb-admin-form input:not([type=checkbox]), .kb-admin-form textarea, .kb-admin-form select { width:100%; min-height:40px; padding:9px 10px; border:1px solid rgba(145,178,187,.24); border-radius:0; background:#07101A; color:#EAFBFF; font:12px ui-sans-serif,system-ui,sans-serif; }',
    '.kb-admin-form textarea { min-height:100px; resize:vertical; }',
    '.kb-admin-publish { display:flex !important; grid-template-columns:auto 1fr; align-items:center; gap:9px !important; }',
    '.kb-admin-publish input { accent-color:#C69A5F; }',
    '.kb-admin-actions { display:flex; flex-wrap:wrap; gap:8px; }',
    '.kb-admin-actions button, .kb-admin-item button { min-height:36px; padding:7px 12px; border:1px solid rgba(145,178,187,.25); background:rgba(131,187,192,.06); color:#D7E6E8; font-size:10px; cursor:pointer; }',
    '.kb-admin-actions .kb-admin-save { border-color:rgba(198,154,95,.55); color:#F4D4A0; }',
    '.kb-admin-list { display:grid; gap:8px; margin:15px 0; }',
    '.kb-admin-item { display:grid; grid-template-columns:minmax(0,1fr) auto; gap:10px; align-items:center; padding:11px; border:1px solid rgba(145,178,187,.14); background:rgba(4,10,17,.55); }',
    '.kb-admin-item strong { display:block; color:#DDE9EA; font-size:11px; overflow-wrap:anywhere; }',
    '.kb-admin-item small { display:block; margin-top:4px; color:#718A98; font-size:9px; }',
    '.kb-admin-item-actions { display:flex; gap:6px; }',
    '.kb-admin-status { min-height:20px; color:#9CB5B9; font-size:10px; overflow-wrap:anywhere; }',
    '.kb-admin-close { display:flex; justify-content:flex-end; margin-top:12px; }',
    '.kb-admin-assist { display:grid; gap:9px; margin:15px 0 20px; padding:13px; border:1px solid rgba(198,154,95,.28); background:rgba(198,154,95,.045); }',
    '.kb-admin-assist > p { margin:0; }',
    '.kb-admin-assist-toggle { display:flex !important; align-items:center; gap:10px !important; padding:9px 10px; border:1px solid rgba(198,154,95,.17); background:rgba(3,10,17,.56); cursor:pointer; }',
    '.kb-admin-assist-toggle input { width:16px; height:16px; accent-color:#C69A5F; }',
    '.kb-admin-assist-toggle span { display:grid; gap:3px; }',
    '.kb-admin-assist-toggle strong { color:#EED4AC; font-size:11px; }',
    '.kb-admin-assist-toggle small { color:#8195A0; font-size:9px; font-weight:400; }',
    '.kb-admin-assist-status { color:#9CB5B9; font-size:9px; line-height:1.6; }',
    '@media(max-width:560px){ .kb-admin-card{padding:17px;} .kb-admin-item{grid-template-columns:1fr;} .kb-admin-item-actions button{flex:1;} .kb-admin-actions button{flex:1;} }'
  ].join('\n');
  document.head.append(styles);

  const trigger = document.createElement('button');
  trigger.type = 'button';
  trigger.className = 'icon-button kb-admin-trigger';
  trigger.textContent = 'ADMIN';
  trigger.setAttribute('aria-label', '管理者パネルを開く');
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
  backdrop.innerHTML = [
    '<section class="kb-admin-card" role="dialog" aria-modal="true" aria-labelledby="kb-admin-title">',
    '<div class="kb-admin-kicker">KEY BULLET / CONTROL ROOM</div>',
    '<h2 id="kb-admin-title">ADMIN CONTROL</h2>',
    '<p>全プレイヤー向けのお知らせとメンテナンス告知を管理します。公開前に内容を確認してください。</p>',
    '<section class="kb-admin-assist" aria-label="管理者専用ゲーム補助">',
    '<div class="kb-admin-kicker">ADMIN ONLY / AUTO PILOT</div>',
    '<p>自動入力と自動回避を切り替えます。オンライン対戦中は公平性のため自動停止します。</p>',
    '<label class="kb-admin-assist-toggle"><input id="kb-admin-auto-type" type="checkbox" /> <span><strong>自動入力</strong><small>お題を自動で入力して攻撃</small></span></label>',
    '<label class="kb-admin-assist-toggle"><input id="kb-admin-auto-dodge" type="checkbox" /> <span><strong>自動回避</strong><small>弾道を予測して安全な方向へ移動</small></span></label>',
    '<div class="kb-admin-assist-status" id="kb-admin-assist-status">STORY / ENDLESSで利用できます。</div>',
    '</section>',
    '<form class="kb-admin-form" id="kb-admin-form">',
    '<label>タイトル（60文字以内）<input id="kb-admin-heading" maxlength="60" required /></label>',
    '<label>本文（1,000文字以内）<textarea id="kb-admin-body" maxlength="1000" required></textarea></label>',
    '<label>種類<select id="kb-admin-kind"><option value="info">通常のお知らせ</option><option value="warning">重要なお知らせ</option><option value="maintenance">メンテナンス</option></select></label>',
    '<label class="kb-admin-publish"><input id="kb-admin-published" type="checkbox" /> 全プレイヤーに公開する</label>',
    '<div class="kb-admin-actions"><button class="kb-admin-save" type="submit">保存</button><button id="kb-admin-new" type="button">新規作成に切替</button></div>',
    '</form>',
    '<div class="kb-admin-kicker">SAVED ANNOUNCEMENTS</div>',
    '<div class="kb-admin-list" id="kb-admin-list"></div>',
    '<div class="kb-admin-status" id="kb-admin-status" role="status" aria-live="polite"></div>',
    '<div class="kb-admin-close"><button id="kb-admin-close" type="button">閉じる</button></div>',
    '</section>'
  ].join('');
  document.body.append(backdrop);

  let adminEnabled = false;
  let selectedId: string | null = null;
  const form = backdrop.querySelector<HTMLFormElement>('#kb-admin-form')!;
  const headingInput = backdrop.querySelector<HTMLInputElement>('#kb-admin-heading')!;
  const bodyInput = backdrop.querySelector<HTMLTextAreaElement>('#kb-admin-body')!;
  const kindInput = backdrop.querySelector<HTMLSelectElement>('#kb-admin-kind')!;
  const publishedInput = backdrop.querySelector<HTMLInputElement>('#kb-admin-published')!;
  const list = backdrop.querySelector<HTMLDivElement>('#kb-admin-list')!;
  const status = backdrop.querySelector<HTMLDivElement>('#kb-admin-status')!;
  const autoType = backdrop.querySelector<HTMLInputElement>('#kb-admin-auto-type')!;
  const autoDodge = backdrop.querySelector<HTMLInputElement>('#kb-admin-auto-dodge')!;
  const assistStatus = backdrop.querySelector<HTMLDivElement>('#kb-admin-assist-status')!;

  function dispatchAssistSettings(): void {
    window.dispatchEvent(new CustomEvent('key-bullet:admin-assist', {
      detail: {
        autoTyping: autoType.checked,
        autoDodge: autoDodge.checked,
      },
    }));
    assistStatus.textContent = autoType.checked || autoDodge.checked
      ? '有効：通常のSTORY / ENDLESSで動作します。オンライン対戦では自動停止します。'
      : '自動入力・自動回避はOFFです。';
  }

  autoType.addEventListener('change', dispatchAssistSettings);
  autoDodge.addEventListener('change', dispatchAssistSettings);

  function setStatus(message: string): void {
    status.textContent = message;
  }

  function resetForm(): void {
    selectedId = null;
    form.reset();
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

  async function loadAdminList(): Promise<void> {
    const { data, error } = await supabase
      .from('game_announcements')
      .select('id, title, body, kind, is_published, created_at')
      .order('created_at', { ascending: false })
      .limit(50);

    if (error) {
      setStatus('一覧を読み込めませんでした。Clerkの管理者ロールとセッショントークン設定を確認してください。');
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
      meta.textContent = (announcement.is_published ? '公開中' : '下書き') + ' / ' + announcement.kind;
      info.append(title, meta);

      const actions = document.createElement('div');
      actions.className = 'kb-admin-item-actions';
      const edit = document.createElement('button');
      edit.type = 'button';
      edit.textContent = '編集';
      edit.addEventListener('click', () => {
        selectedId = announcement.id;
        headingInput.value = announcement.title;
        bodyInput.value = announcement.body;
        kindInput.value = announcement.kind;
        publishedInput.checked = announcement.is_published;
        setStatus('編集中：' + announcement.title);
        headingInput.focus();
      });

      const remove = document.createElement('button');
      remove.type = 'button';
      remove.textContent = '削除';
      remove.addEventListener('click', async () => {
        if (!adminEnabled || !window.confirm('このお知らせを削除しますか？')) return;
        const { error: deleteError } = await supabase
          .from('game_announcements')
          .delete()
          .eq('id', announcement.id);
        if (deleteError) {
          setStatus('削除できませんでした。管理者権限を確認してください。');
          return;
        }
        if (selectedId === announcement.id) resetForm();
        setStatus('お知らせを削除しました。');
        await Promise.all([loadAdminList(), refreshPublicBanner()]);
      });
      actions.append(edit, remove);
      item.append(info, actions);
      list.append(item);
    }
  }

  trigger.addEventListener('click', async () => {
    if (!adminEnabled) return;
    backdrop.hidden = false;
    resetForm();
    setStatus('管理データを読み込んでいます。');
    await loadAdminList();
  });

  backdrop.querySelector<HTMLButtonElement>('#kb-admin-new')!.addEventListener('click', () => {
    resetForm();
    setStatus('新しいお知らせを作成できます。');
  });
  backdrop.querySelector<HTMLButtonElement>('#kb-admin-close')!.addEventListener('click', () => {
    backdrop.hidden = true;
  });
  backdrop.addEventListener('click', (event) => {
    if (event.target === backdrop) backdrop.hidden = true;
  });

  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    if (!adminEnabled) return;

    const title = headingInput.value.trim();
    const body = bodyInput.value.trim();
    if (!title || !body) {
      setStatus('タイトルと本文を入力してください。');
      return;
    }

    const payload = {
      title,
      body,
      kind: kindInput.value as AnnouncementKind,
      is_published: publishedInput.checked,
      updated_at: new Date().toISOString()
    };

    const saveButton = form.querySelector<HTMLButtonElement>('[type="submit"]')!;
    saveButton.disabled = true;
    try {
      const result = selectedId
        ? await supabase.from('game_announcements').update(payload).eq('id', selectedId)
        : await supabase.from('game_announcements').insert(payload);

      if (result.error) throw result.error;
      setStatus(selectedId ? 'お知らせを更新しました。' : 'お知らせを作成しました。');
      resetForm();
      await Promise.all([loadAdminList(), refreshPublicBanner()]);
    } catch {
      setStatus('保存できませんでした。Clerkの管理者ロールとSupabaseの権限設定を確認してください。');
    } finally {
      saveButton.disabled = false;
    }
  });

  trigger.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') backdrop.hidden = true;
  });

  void refreshPublicBanner();

  return {
    setAdminEnabled(enabled: boolean): void {
      adminEnabled = enabled;
      trigger.hidden = !enabled;
      if (!enabled) {
        backdrop.hidden = true;
        autoType.checked = false;
        autoDodge.checked = false;
      }
      window.dispatchEvent(new CustomEvent('key-bullet:admin-access', {
        detail: { enabled },
      }));
      dispatchAssistSettings();
    }
  };
}
