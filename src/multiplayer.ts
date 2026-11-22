import type { RealtimeChannel, SupabaseClient } from '@supabase/supabase-js';

type OnlineMode = 'pvp' | 'raid';

type Room = {
  id: string;
  code: string;
  mode: OnlineMode;
  status: 'waiting' | 'playing' | 'finished';
  host_user_id: string;
  max_players: number;
  finish_reason: 'pvp-out' | 'raid-clear' | null;
  result_user_id: string | null;
  finished_at: string | null;
};

type RoomMember = {
  user_id: string;
  display_name: string;
  is_ready: boolean;
};

type Identity = {
  id: string;
  displayName: string;
};

export type MultiplayerController = {
  setIdentity: (identity: Identity | null) => void;
};

const RAID_HP_MAX = 1400;
const ROOM_TOPIC_PREFIX = 'keybullet-room:';

function emit(name: string, detail: Record<string, unknown>): void {
  window.dispatchEvent(new CustomEvent(name, { detail }));
}

function errorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  if (error && typeof error === 'object' && 'message' in error) {
    return String((error as { message?: unknown }).message ?? '通信エラー');
  }
  return '通信エラーが発生しました。';
}

export function initializeMultiplayer(
  supabase: SupabaseClient,
  getAccessToken: () => Promise<string | null>,
): MultiplayerController {
  const topActions = document.querySelector<HTMLElement>('.top-actions');
  if (!topActions) return { setIdentity: () => undefined };

  const style = document.createElement('style');
  style.textContent = `
    .kb-online-button { border-color:rgba(0,240,255,.34); color:#9EDDE1; }
    .kb-online-backdrop { position:fixed; inset:0; z-index:70; display:flex; align-items:center; justify-content:center; padding:14px; background:rgba(1,5,10,.82); backdrop-filter:blur(8px); }
    .kb-online-backdrop[hidden] { display:none; }
    .kb-online-card { width:min(100%,560px); max-height:calc(100dvh - 28px); overflow:auto; padding:22px; border:1px solid rgba(0,240,255,.22); background:#101923; box-shadow:0 24px 80px rgba(0,0,0,.48); }
    .kb-online-kicker { color:#71C8CF; font:700 9px ui-monospace,monospace; letter-spacing:.2em; }
    .kb-online-card h2 { margin:7px 0 8px; color:#EAFBFF; font-size:23px; letter-spacing:.12em; }
    .kb-online-card p { color:#8DA4B4; font-size:11px; line-height:1.75; }
    .kb-online-tabs { display:grid; grid-template-columns:1fr 1fr; gap:8px; margin:17px 0; }
    .kb-online-tabs button,.kb-online-actions button { min-height:40px; padding:9px 12px; border:1px solid rgba(126,182,199,.22); background:rgba(126,182,199,.055); color:#BBD0D5; font-size:10px; cursor:pointer; }
    .kb-online-tabs button.selected { border-color:rgba(0,240,255,.5); color:#00F0FF; background:rgba(0,240,255,.06); }
    .kb-online-code-row { display:flex; gap:8px; margin:9px 0; }
    .kb-online-code-row input { flex:1; min-width:0; min-height:42px; padding:0 12px; border:1px solid rgba(126,182,199,.23); background:#07101A; color:#EAFBFF; font:700 17px ui-monospace,monospace; letter-spacing:.18em; text-transform:uppercase; }
    .kb-online-mode-help { min-height:35px; margin:8px 0 12px; color:#7F98A8; font-size:10px; line-height:1.7; }
    .kb-online-room { margin-top:15px; padding:15px; border:1px solid rgba(0,240,255,.19); background:rgba(0,240,255,.035); }
    .kb-online-room-code { color:#00F0FF; font:800 27px ui-monospace,monospace; letter-spacing:.24em; }
    .kb-online-members { display:grid; gap:7px; margin:13px 0; }
    .kb-online-member { display:flex; justify-content:space-between; align-items:center; gap:10px; padding:9px 10px; background:rgba(3,10,17,.68); color:#D8E8EA; font-size:11px; }
    .kb-online-member small { color:#8DA4B4; font-size:9px; }
    .kb-online-actions { display:flex; flex-wrap:wrap; gap:8px; margin-top:12px; }
    .kb-online-actions button { flex:1 1 120px; }
    .kb-online-actions .primary { border-color:rgba(0,240,255,.45); color:#00F0FF; }
    .kb-online-actions button:disabled { opacity:.42; cursor:not-allowed; }
    .kb-online-status { min-height:26px; margin-top:12px; color:#8DBDC1; font-size:10px; line-height:1.6; overflow-wrap:anywhere; }
    .kb-online-status.error { color:#FF8798; }
    .kb-online-disclaimer { margin:12px 0 0 !important; color:#718A98 !important; font-size:9px !important; }
    .kb-online-hud { position:fixed; z-index:25; top:82px; right:12px; width:min(280px,calc(100vw - 24px)); padding:10px 12px; border:1px solid rgba(0,240,255,.25); background:rgba(7,14,22,.92); box-shadow:0 12px 35px rgba(0,0,0,.28); pointer-events:none; }
    .kb-online-hud[hidden] { display:none; }
    .kb-online-hud strong { display:block; color:#00F0FF; font:700 9px ui-monospace,monospace; letter-spacing:.13em; }
    .kb-online-hud span { display:block; margin-top:4px; color:#B8CDD0; font-size:10px; }
    .kb-online-bar { height:5px; margin-top:7px; overflow:hidden; background:rgba(255,255,255,.1); }
    .kb-online-bar i { display:block; height:100%; width:100%; background:#00D9E6; transition:width .18s linear; }
    @media(max-width:560px){ .kb-online-card{padding:17px;} .kb-online-hud{top:auto;bottom:10px;right:10px;width:190px;} }
  `;
  document.head.append(style);

  const trigger = document.createElement('button');
  trigger.type = 'button';
  trigger.className = 'icon-button kb-online-button';
  trigger.textContent = 'ONLINE';
  trigger.setAttribute('aria-label', 'オンラインロビーを開く');
  topActions.append(trigger);

  const backdrop = document.createElement('div');
  backdrop.className = 'kb-online-backdrop';
  backdrop.hidden = true;
  backdrop.innerHTML = `
    <section class="kb-online-card" role="dialog" aria-modal="true" aria-labelledby="kb-online-title">
      <div class="kb-online-kicker">KEY BULLET / NETWORK BETA</div>
      <h2 id="kb-online-title">ONLINE <span>LOBBY</span></h2>
      <p>ルームコードを共有して友達と遊べます。PVPは1対1、リンクレイドは最大4人です。</p>
      <div id="kb-online-menu">
        <div class="kb-online-tabs">
          <button type="button" data-mode="pvp" class="selected">PVP / 1 VS 1</button>
          <button type="button" data-mode="raid">LINK RAID / 2–4</button>
        </div>
        <div class="kb-online-mode-help" id="kb-online-mode-help">1対1のタイピング対戦。相手から3回攻撃を受けると敗北。</div>
        <div class="kb-online-actions">
          <button type="button" id="kb-online-create" class="primary">ルームを作成</button>
        </div>
        <div class="kb-online-code-row">
          <input id="kb-online-code-input" maxlength="6" inputmode="text" autocomplete="off" placeholder="ROOM CODE" aria-label="ルームコード" />
          <button type="button" id="kb-online-join">参加</button>
        </div>
      </div>
      <div id="kb-online-room" class="kb-online-room" hidden>
        <div class="kb-online-kicker" id="kb-online-room-mode">WAITING ROOM</div>
        <div class="kb-online-room-code" id="kb-online-room-code">------</div>
        <div class="kb-online-actions"><button type="button" id="kb-online-copy">コードをコピー</button></div>
        <div class="kb-online-members" id="kb-online-members"></div>
        <div class="kb-online-actions">
          <button type="button" id="kb-online-ready" class="primary">準備完了</button>
          <button type="button" id="kb-online-start" class="primary" hidden disabled>ゲーム開始</button>
          <button type="button" id="kb-online-leave">退出</button>
        </div>
      </div>
      <div class="kb-online-status" id="kb-online-status" role="status" aria-live="polite">オンライン機能はβテスト中です。</div>
      <p class="kb-online-disclaimer">通信はSupabase Realtime中継方式です。途中切断・同期ズレ・試合バランスはβテストで調整します。ログインが必要です。</p>
      <div class="kb-online-actions"><button type="button" id="kb-online-close">閉じる</button></div>
    </section>
  `;
  document.body.append(backdrop);

  const hud = document.createElement('div');
  hud.className = 'kb-online-hud';
  hud.hidden = true;
  hud.innerHTML = '<strong id="kb-online-hud-title">ONLINE MATCH</strong><span id="kb-online-hud-text">Connecting...</span><div class="kb-online-bar"><i id="kb-online-hud-bar"></i></div>';
  document.body.append(hud);

  const $ = <T extends HTMLElement>(selector: string): T => {
    const el = backdrop.querySelector<T>(selector);
    if (!el) throw new Error('Missing multiplayer UI: ' + selector);
    return el;
  };

  let identity: Identity | null = null;
  let selectedMode: OnlineMode = 'pvp';
  let room: Room | null = null;
  let members: RoomMember[] = [];
  let channel: RealtimeChannel | null = null;
  let ready = false;
  let matchActive = false;
  let raidHp = RAID_HP_MAX;
  let lastAttackAt = 0;
  const lastIncomingPvpAttackAt = new Map<string, number>();
  const lastRaidAttackAt = new Map<string, number>();
  let globalOnlineEnabled = true;
  let adminPanelEnabled = false;
  let roomGeneration = 0;
  let roomPollTimer: number | null = null;
  let restoringRoom = false;
  let resultHandled = false;
  const roomRefreshes = new Set<string>();
  const rosterRefreshes = new Set<string>();
  let onlineUserIds = new Set<string>();

  function isCurrentRoom(roomId: string, generation: number): boolean {
    return Boolean(room && room.id === roomId && roomGeneration === generation);
  }

  function syncOnlinePresence(source: RealtimeChannel, roomId: string, generation: number): void {
    if (!isCurrentRoom(roomId, generation) || channel !== source) return;
    const presence = source.presenceState() as Record<string, Array<Record<string, unknown>>>;
    const nextOnline = new Set<string>();
    for (const [presenceKey, records] of Object.entries(presence)) {
      for (const record of records ?? []) {
        const userId = typeof record.user_id === 'string' ? record.user_id : presenceKey;
        nextOnline.add(userId);
      }
    }
    onlineUserIds = nextOnline;
    renderRoom();
  }

  function startRoomPolling(roomId: string, generation: number): void {
    if (roomPollTimer !== null) window.clearInterval(roomPollTimer);
    roomPollTimer = window.setInterval(() => {
      if (isCurrentRoom(roomId, generation)) void refreshRoom(roomId, generation);
    }, 5000);
  }

  function finishFromDatabase(): void {
    if (!room || !matchActive || resultHandled || room.status !== 'finished') return;
    resultHandled = true;
    matchActive = false;
    let result: string = 'disconnect';
    if (room.finish_reason === 'raid-clear') result = 'raid-clear';
    else if (room.finish_reason === 'pvp-out' && room.result_user_id) {
      result = room.result_user_id === identity?.id ? 'lose' : 'win';
    }
    emit('key-bullet:online-result', { result, mode: room.mode });
  }

  function applyOnlineAvailability(): void {
    const blocked = !globalOnlineEnabled && !adminPanelEnabled;
    trigger.disabled = blocked;
    trigger.title = blocked ? '管理者がオンライン機能を停止しています。' : '';
    const createButton = backdrop.querySelector<HTMLButtonElement>('#kb-online-create');
    const joinButton = backdrop.querySelector<HTMLButtonElement>('#kb-online-join');
    const codeInput = backdrop.querySelector<HTMLInputElement>('#kb-online-code-input');
    if (createButton) createButton.disabled = blocked;
    if (joinButton) joinButton.disabled = blocked;
    if (codeInput) codeInput.disabled = blocked;
  }

  window.addEventListener('key-bullet:public-game-settings', (event) => {
    const detail = (event as CustomEvent<{ online_enabled?: boolean }>).detail;
    if (!detail) return;
    globalOnlineEnabled = detail.online_enabled !== false;
    applyOnlineAvailability();
  });
  window.addEventListener('key-bullet:admin-access', (event) => {
    const detail = (event as CustomEvent<{ enabled?: boolean }>).detail;
    adminPanelEnabled = detail?.enabled === true;
    applyOnlineAvailability();
  });

  const setStatus = (message: string, isError = false): void => {
    const status = $('#kb-online-status');
    status.textContent = message;
    status.classList.toggle('error', isError);
  };

  function displayName(): string {
    return (identity?.displayName ?? 'PLAYER').trim().slice(0, 20) || 'PLAYER';
  }

  function updateHud(title: string, description: string, ratio?: number): void {
    hud.hidden = false;
    hud.querySelector<HTMLElement>('#kb-online-hud-title')!.textContent = title;
    hud.querySelector<HTMLElement>('#kb-online-hud-text')!.textContent = description;
    const bar = hud.querySelector<HTMLElement>('#kb-online-hud-bar')!;
    if (ratio === undefined) bar.parentElement!.hidden = true;
    else {
      bar.parentElement!.hidden = false;
      bar.style.width = `${Math.max(0, Math.min(1, ratio)) * 100}%`;
    }
  }

  async function send(event: string, payload: Record<string, unknown>): Promise<boolean> {
    const activeChannel = channel;
    const activeRoomId = room?.id;
    const generation = roomGeneration;
    if (!activeChannel || !activeRoomId) return false;
    try {
      const result = await activeChannel.send({ type: 'broadcast', event, payload });
      if (!isCurrentRoom(activeRoomId, generation) || channel !== activeChannel) return false;
      if (result !== 'ok') throw new Error('Realtimeがメッセージを受け付けませんでした。');
      return true;
    } catch (error) {
      if (isCurrentRoom(activeRoomId, generation)) {
        setStatus('通信できませんでした：' + errorMessage(error), true);
      }
      return false;
    }
  }

  async function refreshRoster(
    expectedRoomId = room?.id,
    expectedGeneration = roomGeneration,
  ): Promise<void> {
    if (!expectedRoomId || !isCurrentRoom(expectedRoomId, expectedGeneration)) return;
    if (rosterRefreshes.has(expectedRoomId)) return;
    rosterRefreshes.add(expectedRoomId);
    try {
      const { data, error } = await supabase
        .from('game_room_members')
        .select('user_id, display_name, is_ready')
        .eq('room_id', expectedRoomId)
        .order('joined_at', { ascending: true });
      if (!isCurrentRoom(expectedRoomId, expectedGeneration)) return;
      if (error) {
        setStatus('参加者一覧を取得できません：' + errorMessage(error), true);
        return;
      }
      members = (data ?? []) as RoomMember[];
      renderRoom();
    } finally {
      rosterRefreshes.delete(expectedRoomId);
    }
  }

  function renderRoom(): void {
    if (!room) return;
    $('#kb-online-room').hidden = false;
    $('#kb-online-menu').hidden = true;
    $('#kb-online-room-code').textContent = room.code;
    $('#kb-online-room-mode').textContent = room.mode === 'pvp' ? 'PVP / 1 VS 1' : 'LINK RAID / 2–4 PLAYERS';
    const roster = $('#kb-online-members');
    roster.replaceChildren();
    for (const member of members) {
      const item = document.createElement('div');
      item.className = 'kb-online-member';
      const name = document.createElement('span');
      name.textContent = member.display_name + (member.user_id === room.host_user_id ? ' / HOST' : '');
      const state = document.createElement('small');
      const connection = onlineUserIds.has(member.user_id) ? 'ONLINE' : 'OFFLINE';
      state.textContent = `${member.is_ready ? 'READY' : 'NOT READY'} · ${connection}`;
      item.append(name, state);
      roster.append(item);
    }
    const isHost = identity?.id === room.host_user_id;
    const me = members.find((member) => member.user_id === identity?.id);
    ready = Boolean(me?.is_ready);
    $('#kb-online-ready').textContent = ready ? '準備を解除' : '準備完了';
    $('#kb-online-ready').hidden = room.status !== 'waiting';
    const startButton = $('#kb-online-start') as HTMLButtonElement;
    startButton.hidden = !isHost || room.status !== 'waiting';
    const allReadyAndConnected = members.length >= 2
      && members.every((member) => member.is_ready && onlineUserIds.has(member.user_id));
    startButton.disabled = !allReadyAndConnected;
    startButton.title = allReadyAndConnected
      ? ''
      : '全員がオンラインで準備完了になると開始できます。';
    if (room.status === 'playing' && !matchActive) enterGame();
  }

  async function refreshRoom(
    expectedRoomId = room?.id,
    expectedGeneration = roomGeneration,
  ): Promise<void> {
    if (!expectedRoomId || !isCurrentRoom(expectedRoomId, expectedGeneration)) return;
    if (roomRefreshes.has(expectedRoomId)) return;
    roomRefreshes.add(expectedRoomId);
    try {
      const { data, error } = await supabase
        .from('game_rooms')
        .select('id, code, mode, status, host_user_id, max_players, finish_reason, result_user_id, finished_at')
        .eq('id', expectedRoomId)
        .maybeSingle();
      if (!isCurrentRoom(expectedRoomId, expectedGeneration)) return;
      if (error) {
        // A temporary request failure must not discard a valid local room.
        setStatus('ルーム状態を再確認しています：' + errorMessage(error), true);
        return;
      }
      if (!data) {
        setStatus('ルームが終了または削除されました。', true);
        await resetRoom(false, true);
        return;
      }
      room = data as Room;
      await refreshRoster(expectedRoomId, expectedGeneration);
      if (isCurrentRoom(expectedRoomId, expectedGeneration)) finishFromDatabase();
    } finally {
      roomRefreshes.delete(expectedRoomId);
    }
  }

  function dispatchGameStart(): void {
    if (!room || room.status !== 'playing' || matchActive) return;
    matchActive = true;
    resultHandled = false;
    backdrop.hidden = true;
    updateHud(room.mode === 'pvp' ? 'PVP / LIVE' : 'LINK RAID / LIVE',
      room.mode === 'pvp' ? '相手の攻撃を3回受けると敗北' : '共有ボスHPを全員で削ろう',
      room.mode === 'raid' ? 1 : undefined);
    emit('key-bullet:online-start', {
      mode: room.mode,
      roomId: room.id,
      roomCode: room.code,
      userId: identity?.id,
      hostUserId: room.host_user_id,
      players: members,
    });
  }

  function enterGame(): void {
    if (!room || room.status !== 'playing') return;
    dispatchGameStart();
  }

  async function subscribeToRoom(roomId: string, generation: number): Promise<void> {
    if (!identity || !isCurrentRoom(roomId, generation)) return;

    const previousChannel = channel;
    channel = null;
    if (previousChannel) await supabase.removeChannel(previousChannel);
    if (!isCurrentRoom(roomId, generation) || !identity) return;

    // Realtime does not reliably inherit the third-party token from the REST client.
    // Pass the current Clerk JWT explicitly so private-channel RLS sees the real user.
    const accessToken = await getAccessToken();
    if (!accessToken) {
      throw new Error('Clerkの認証トークンを取得できません。ログイン状態を確認して再試行してください。');
    }
    await supabase.realtime.setAuth(accessToken);
    if (!isCurrentRoom(roomId, generation) || !identity) return;

    const userId = identity.id;
    const nextChannel = supabase.channel(ROOM_TOPIC_PREFIX + roomId, {
      config: {
        private: true,
        broadcast: { ack: true, self: false },
        presence: { key: userId },
      },
    });
    const isActive = () => isCurrentRoom(roomId, generation) && channel === nextChannel;

    nextChannel
      .on('presence', { event: 'sync' }, () => {
        if (!isActive()) return;
        syncOnlinePresence(nextChannel, roomId, generation);
        void refreshRoom(roomId, generation);
      })
      .on('broadcast', { event: 'room-refresh' }, () => {
        if (isActive()) void refreshRoom(roomId, generation);
      })
      .on('broadcast', { event: 'room-closed' }, ({ payload }) => {
        if (!isActive() || payload?.closed_by !== room?.host_user_id) return;
        void refreshRoom(roomId, generation);
      })
      .on('broadcast', { event: 'game-start' }, () => {
        // The database start state is authoritative.
        if (isActive()) void refreshRoom(roomId, generation);
      })
      .on('broadcast', { event: 'pvp-attack' }, ({ payload }) => {
        if (!isActive() || !room || room.mode !== 'pvp' || room.status !== 'playing' || !matchActive) return;
        const attackerId = typeof payload?.user_id === 'string' ? payload.user_id : '';
        if (!attackerId || attackerId === userId || !members.some((member) => member.user_id === attackerId)) return;
        const now = Date.now();
        if (now - (lastIncomingPvpAttackAt.get(attackerId) ?? 0) < 300) return;
        lastIncomingPvpAttackAt.set(attackerId, now);
        emit('key-bullet:online-pvp-hit', { attackerId });
      })
      .on('broadcast', { event: 'player-out' }, ({ payload }) => {
        if (!isActive() || !room || room.mode !== 'pvp' || room.status !== 'playing' || !matchActive || resultHandled) return;
        const loserId = typeof payload?.user_id === 'string' ? payload.user_id : '';
        if (!loserId || !members.some((member) => member.user_id === loserId)) return;
        resultHandled = true;
        matchActive = false;
        emit('key-bullet:online-result', {
          result: loserId === userId ? 'lose' : 'win',
          mode: 'pvp',
        });
      })
      .on('broadcast', { event: 'raid-attack' }, ({ payload }) => {
        if (!isActive() || !room || room.mode !== 'raid' || room.status !== 'playing'
          || !matchActive || room.host_user_id !== userId) return;
        const attackerId = typeof payload?.user_id === 'string' ? payload.user_id : '';
        if (!attackerId || !members.some((member) => member.user_id === attackerId)) return;
        void processRaidAttack(payload);
      })
      .on('broadcast', { event: 'raid-state' }, ({ payload }) => {
        if (!isActive() || !room || room.mode !== 'raid' || room.status !== 'playing' || !matchActive
          || payload?.host_user_id !== room.host_user_id) return;
        const hp = Number(payload?.hp);
        if (!Number.isFinite(hp)) return;
        raidHp = Math.max(0, Math.min(RAID_HP_MAX, hp));
        updateHud('LINK RAID / LIVE', `BOSS HP ${Math.ceil(raidHp)} / ${RAID_HP_MAX}`, raidHp / RAID_HP_MAX);
        emit('key-bullet:online-raid-state', { hp: raidHp, maxHp: RAID_HP_MAX });
      })
      .on('broadcast', { event: 'raid-clear' }, ({ payload }) => {
        if (!isActive() || !room || room.mode !== 'raid' || room.status !== 'playing'
          || payload?.host_user_id !== room.host_user_id || resultHandled) return;
        resultHandled = true;
        matchActive = false;
        emit('key-bullet:online-result', { result: 'raid-clear', mode: 'raid' });
      });

    channel = nextChannel;
    await new Promise<void>((resolve, reject) => {
      let initiallyConnected = false;
      const timeout = window.setTimeout(() => {
        if (!initiallyConnected) {
          initiallyConnected = true;
          reject(new Error('ルームへの接続がタイムアウトしました。'));
        }
      }, 12000);

      nextChannel.subscribe((status, error) => {
        if (!isActive()) return;
        if (status === 'SUBSCRIBED') {
          const firstConnection = !initiallyConnected;
          initiallyConnected = true;
          window.clearTimeout(timeout);
          void nextChannel.track({
            user_id: userId,
            display_name: displayName(),
            is_ready: ready,
            connected_at: new Date().toISOString(),
          }).then((trackStatus) => {
            if (!isActive()) return;
            if (trackStatus !== 'ok') {
              setStatus('ルームへの参加状態を同期できませんでした。再接続を試してください。', true);
              return;
            }
            syncOnlinePresence(nextChannel, roomId, generation);
            void refreshRoster(roomId, generation);
          }).catch((trackError: unknown) => {
            if (isActive()) setStatus('参加状態の同期に失敗しました：' + errorMessage(trackError), true);
          });
          if (firstConnection) resolve();
        } else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT' || status === 'CLOSED') {
          const detail = error ? errorMessage(error) : 'Realtimeチャンネルに接続できませんでした。';
          setStatus('ルーム接続エラー：' + detail, true);
          if (!initiallyConnected) {
            initiallyConnected = true;
            window.clearTimeout(timeout);
            reject(new Error(detail));
          }
        }
      });
    });
  }

  async function openRoom(roomId: string, code?: string): Promise<void> {
    const { data, error } = await supabase
      .from('game_rooms')
      .select('id, code, mode, status, host_user_id, max_players, finish_reason, result_user_id, finished_at')
      .eq('id', roomId)
      .single();
    if (error || !data) throw error ?? new Error('ルームが見つかりません。');

    const generation = ++roomGeneration;
    room = data as Room;
    if (code) room.code = code;
    matchActive = false;
    resultHandled = false;
    ready = false;
    raidHp = RAID_HP_MAX;
    onlineUserIds = new Set<string>();
    $('#kb-online-menu').hidden = true;
    $('#kb-online-room').hidden = false;

    try {
      await subscribeToRoom(roomId, generation);
      if (!isCurrentRoom(roomId, generation)) return;
      await refreshRoom(roomId, generation);
      if (!isCurrentRoom(roomId, generation)) return;
      startRoomPolling(roomId, generation);
      if (room?.status === 'playing') {
        setStatus('試合に再接続しました。');
      } else if (room?.status === 'waiting') {
        setStatus('ルームに接続しました。参加者全員がオンラインで準備完了になると開始できます。');
      }
    } catch (connectionError) {
      if (isCurrentRoom(roomId, generation)) {
        await resetRoom(true, false);
      }
      throw new Error('ルーム接続に失敗したため、参加状態を解除しました：' + errorMessage(connectionError));
    }
  }

  async function resetRoom(removeMembership: boolean, notifyMatch = false): Promise<void> {
    const previousRoom = room;
    const previousChannel = channel;
    const hadActiveMatch = matchActive;
    const previousMode = previousRoom?.mode;
    roomGeneration += 1;
    if (roomPollTimer !== null) {
      window.clearInterval(roomPollTimer);
      roomPollTimer = null;
    }
    channel = null;
    room = null;
    members = [];
    onlineUserIds = new Set<string>();
    ready = false;
    matchActive = false;
    resultHandled = false;
    raidHp = RAID_HP_MAX;
    $('#kb-online-room').hidden = true;
    $('#kb-online-menu').hidden = false;
    hud.hidden = true;

    if (previousChannel) await supabase.removeChannel(previousChannel);
    if (removeMembership && previousRoom) {
      const { error } = await supabase.rpc('leave_game_room', { p_room_id: previousRoom.id });
      if (error) setStatus('退出処理に失敗しました：' + errorMessage(error), true);
    }
    if (notifyMatch && hadActiveMatch) {
      emit('key-bullet:online-result', { result: 'disconnect', mode: previousMode });
    }
  }

  async function processRaidAttack(payload: Record<string, unknown>): Promise<void> {
    if (!room || !identity || room.mode !== 'raid' || room.status !== 'playing'
      || !matchActive || room.host_user_id !== identity.id) return;
    const attackerId = typeof payload.user_id === 'string' ? payload.user_id : '';
    if (!attackerId || !members.some((member) => member.user_id === attackerId)) return;
    const now = Date.now();
    if (now - (lastRaidAttackAt.get(attackerId) ?? 0) < 300) return;
    lastRaidAttackAt.set(attackerId, now);
    const powerValue = Number(payload.power);
    const charsValue = Math.floor(Number(payload.chars));
    const power = Math.max(0.65, Math.min(3.4, Number.isFinite(powerValue) ? powerValue : 0.65));
    const chars = Math.max(1, Math.min(80, Number.isFinite(charsValue) ? charsValue : 1));
    const damage = Math.round(8 + power * 18 + chars * 0.3);
    raidHp = Math.max(0, raidHp - damage);
    const isClear = raidHp <= 0 && !resultHandled;

    if (isClear) {
      resultHandled = true;
      const { error } = await supabase.rpc('finish_game_room', {
        p_room_id: room.id,
        p_reason: 'raid-clear',
        p_result_user_id: attackerId,
      });
      if (error) setStatus('レイド結果を保存できません：' + errorMessage(error), true);
      if (room) {
        room.status = 'finished';
        room.finish_reason = 'raid-clear';
        room.result_user_id = attackerId;
        room.finished_at = new Date().toISOString();
      }
    }

    updateHud('LINK RAID / LIVE', `BOSS HP ${Math.ceil(raidHp)} / ${RAID_HP_MAX}`, raidHp / RAID_HP_MAX);
    emit('key-bullet:online-raid-state', { hp: raidHp, maxHp: RAID_HP_MAX });
    await send('raid-state', { hp: raidHp, damage, host_user_id: identity.id });
    if (isClear) {
      matchActive = false;
      await send('raid-clear', { host_user_id: identity.id, cleared_by: attackerId });
      emit('key-bullet:online-result', { result: 'raid-clear', mode: 'raid' });
    }
  }

  async function createRoom(): Promise<void> {
    if (!globalOnlineEnabled && !adminPanelEnabled) {
      setStatus('管理者がオンライン機能を停止しています。', true);
      return;
    }
    if (!identity) {
      setStatus('オンライン対戦にはClerkログインが必要です。', true);
      return;
    }
    if (restoringRoom) {
      setStatus('前回のルーム情報を確認しています。少し待ってから再試行してください。', true);
      return;
    }
    if (room) await resetRoom(true, false);
    const button = $('#kb-online-create') as HTMLButtonElement;
    button.disabled = true;
    try {
      const { data, error } = await supabase.rpc('create_game_room', {
        p_mode: selectedMode,
        p_display_name: displayName(),
      });
      if (error) throw error;
      const created = Array.isArray(data) ? data[0] as { room_id: string; room_code: string } : data as { room_id: string; room_code: string };
      if (!created?.room_id || !created?.room_code) throw new Error('ルーム情報を取得できませんでした。');
      await openRoom(created.room_id, created.room_code);
      setStatus('ルームを作成しました。コードを共有して参加者を待ってください。');
    } catch (error) {
      setStatus('ルームを作成できません：' + errorMessage(error), true);
    } finally {
      button.disabled = false;
    }
  }

  async function joinRoom(): Promise<void> {
    if (!globalOnlineEnabled && !adminPanelEnabled) {
      setStatus('管理者がオンライン機能を停止しています。', true);
      return;
    }
    if (!identity) {
      setStatus('オンライン対戦にはClerkログインが必要です。', true);
      return;
    }
    if (restoringRoom) {
      setStatus('前回のルーム情報を確認しています。少し待ってから再試行してください。', true);
      return;
    }
    if (room) await resetRoom(true, false);
    const input = $('#kb-online-code-input') as HTMLInputElement;
    const code = input.value.trim().toUpperCase();
    if (!/^[A-F0-9]{6}$/.test(code)) {
      setStatus('6桁のルームコードを入力してください。', true);
      return;
    }
    const button = $('#kb-online-join') as HTMLButtonElement;
    button.disabled = true;
    try {
      const { data, error } = await supabase.rpc('join_game_room', {
        p_code: code,
        p_display_name: displayName(),
      });
      if (error) throw error;
      const roomId = String(data ?? '');
      if (!roomId) throw new Error('参加したルームIDを受け取れませんでした。');
      await openRoom(roomId, code);
      await send('room-refresh', { changed_by: identity.id });
    } catch (error) {
      setStatus('参加できません：' + errorMessage(error), true);
    } finally {
      button.disabled = false;
    }
  }

  async function toggleReady(): Promise<void> {
    if (!room || !identity || room.status !== 'waiting') return;
    const roomId = room.id;
    const generation = roomGeneration;
    const button = $('#kb-online-ready') as HTMLButtonElement;
    button.disabled = true;
    const next = !ready;
    try {
      const { error } = await supabase.rpc('set_game_room_ready', {
        p_room_id: roomId,
        p_ready: next,
      });
      if (error) throw error;
      if (!isCurrentRoom(roomId, generation)) return;
      ready = next;
      const trackResult = await channel?.track({
        user_id: identity.id,
        display_name: displayName(),
        is_ready: ready,
      });
      if (trackResult && trackResult !== 'ok') {
        setStatus('準備状態の同期が遅れています。再確認します。', true);
      }
      await send('room-refresh', { changed_by: identity.id });
      await refreshRoster(roomId, generation);
    } catch (error) {
      if (isCurrentRoom(roomId, generation)) setStatus('準備状態を更新できません：' + errorMessage(error), true);
    } finally {
      if (isCurrentRoom(roomId, generation)) button.disabled = false;
    }
  }

  async function startGame(): Promise<void> {
    if (!room || !identity || room.host_user_id !== identity.id || room.status !== 'waiting') return;
    const roomId = room.id;
    const generation = roomGeneration;
    const button = $('#kb-online-start') as HTMLButtonElement;
    button.disabled = true;
    try {
      const { error } = await supabase.rpc('start_game_room', { p_room_id: roomId });
      if (error) throw error;
      if (!isCurrentRoom(roomId, generation) || !room) return;
      room.status = 'playing';
      room.finish_reason = null;
      room.result_user_id = null;
      room.finished_at = null;
      await send('game-start', { started_by: identity.id });
      await refreshRoom(roomId, generation);
      if (isCurrentRoom(roomId, generation) && room?.status === 'playing') dispatchGameStart();
    } catch (error) {
      if (!isCurrentRoom(roomId, generation)) return;
      setStatus('開始できません：' + errorMessage(error), true);
      await refreshRoom(roomId, generation);
    } finally {
      if (isCurrentRoom(roomId, generation)) button.disabled = false;
    }
  }

  applyOnlineAvailability();
  trigger.addEventListener('click', () => {
    if (!globalOnlineEnabled && !adminPanelEnabled) return;
    backdrop.hidden = false;
    if (!identity) setStatus('オンライン機能を使うには、先にACCOUNTからログインしてください。', true);
  });
  backdrop.querySelectorAll<HTMLButtonElement>('[data-mode]').forEach((button) => {
    button.addEventListener('click', () => {
      selectedMode = button.dataset.mode as OnlineMode;
      backdrop.querySelectorAll('[data-mode]').forEach((item) => item.classList.toggle('selected', item === button));
      $('#kb-online-mode-help').textContent = selectedMode === 'pvp'
        ? '1対1のタイピング対戦。相手から3回攻撃を受けると敗北。'
        : '最大4人で共有ボスに挑戦。全員の攻撃でボスHPを削る。';
    });
  });
  ($('#kb-online-create') as HTMLButtonElement).addEventListener('click', () => { void createRoom(); });
  ($('#kb-online-join') as HTMLButtonElement).addEventListener('click', () => { void joinRoom(); });
  ($('#kb-online-code-input') as HTMLInputElement).addEventListener('input', (event) => {
    const input = event.currentTarget as HTMLInputElement;
    input.value = input.value.toUpperCase().replace(/[^A-F0-9]/g, '').slice(0, 6);
  });
  ($('#kb-online-copy') as HTMLButtonElement).addEventListener('click', async () => {
    if (!room) return;
    try {
      await navigator.clipboard.writeText(room.code);
      setStatus('ルームコードをコピーしました。');
    } catch {
      setStatus('コピーできませんでした。コードを手動で共有してください。');
    }
  });
  ($('#kb-online-ready') as HTMLButtonElement).addEventListener('click', () => { void toggleReady(); });
  ($('#kb-online-start') as HTMLButtonElement).addEventListener('click', () => { void startGame(); });
  ($('#kb-online-leave') as HTMLButtonElement).addEventListener('click', async () => {
    const leavingRoom = room;
    if (!leavingRoom || !identity) return;
    if (identity.id === leavingRoom.host_user_id) {
      await send('room-closed', { closed_by: identity.id });
    } else {
      await send('room-refresh', { changed_by: identity.id, leaving: true });
    }
    await resetRoom(true, false);
    setStatus('ルームから退出しました。');
  });
  ($('#kb-online-close') as HTMLButtonElement).addEventListener('click', () => { backdrop.hidden = true; });
  backdrop.addEventListener('click', (event) => {
    if (event.target === backdrop) backdrop.hidden = true;
  });

  window.addEventListener('key-bullet:online-local-attack', (event) => {
    const detail = (event as CustomEvent<{ power: number; chars: number; accuracy: number }>).detail;
    if (!room || room.status !== 'playing' || !channel || !identity || !matchActive || !detail) return;
    const now = Date.now();
    if (now - lastAttackAt < 350) return;
    lastAttackAt = now;
    const payload = {
      user_id: identity.id,
      power: Math.max(0.65, Math.min(3.4, detail.power)),
      chars: Math.max(1, Math.min(80, Math.floor(detail.chars))),
      accuracy: Math.max(0, Math.min(100, detail.accuracy)),
    };
    if (room.mode === 'pvp') {
      void send('pvp-attack', payload);
    } else if (room.host_user_id === identity.id) {
      void processRaidAttack(payload);
    } else {
      void send('raid-attack', payload);
    }
  });

  window.addEventListener('key-bullet:online-match-exit', () => {
    void (async () => {
      if (!room || !identity) return;
      if (identity.id === room.host_user_id) await send('room-closed', { closed_by: identity.id });
      else await send('room-refresh', { changed_by: identity.id, leaving: true });
      await resetRoom(true, false);
    })();
  });

  window.addEventListener('key-bullet:online-player-out', () => {
    if (!room || !identity || !channel || !matchActive || room.status !== 'playing'
      || room.mode !== 'pvp' || resultHandled) return;
    const roomId = room.id;
    const generation = roomGeneration;
    const loserId = identity.id;
    resultHandled = true;
    void (async () => {
      const { error } = await supabase.rpc('finish_game_room', {
        p_room_id: roomId,
        p_reason: 'pvp-out',
        p_result_user_id: loserId,
      });
      if (error && isCurrentRoom(roomId, generation)) {
        setStatus('敗北結果を保存できません：' + errorMessage(error), true);
      }
      if (!isCurrentRoom(roomId, generation)) return;
      if (room) {
        room.status = 'finished';
        room.finish_reason = 'pvp-out';
        room.result_user_id = loserId;
        room.finished_at = new Date().toISOString();
      }
      matchActive = false;
      await send('player-out', { user_id: loserId });
      emit('key-bullet:online-result', { result: 'lose', mode: 'pvp' });
    })();
  });

  window.addEventListener('key-bullet:online-result', (event) => {
    const detail = (event as CustomEvent<{ result: string }>).detail;
    if (detail?.result === 'raid-clear' || detail?.result === 'win'
      || detail?.result === 'lose' || detail?.result === 'disconnect') {
      matchActive = false;
      resultHandled = true;
      const text = detail.result === 'raid-clear' ? 'レイドボス撃破！'
        : detail.result === 'win' ? 'WIN / VICTORY'
          : detail.result === 'lose' ? 'LOSE / TRY AGAIN' : '接続が切断されました';
      updateHud(detail.result === 'disconnect' ? 'CONNECTION LOST' : 'MATCH COMPLETE', text);
    }
  });

  backdrop.querySelector<HTMLInputElement>('#kb-online-code-input')?.addEventListener('keydown', (event) => {
    if (event.key === 'Enter') void joinRoom();
  });

  async function restoreWaitingRoom(userId: string): Promise<void> {
    if (restoringRoom || room || identity?.id !== userId) return;
    restoringRoom = true;
    try {
      const { data: memberships, error } = await supabase
        .from('game_room_members')
        .select('room_id')
        .eq('user_id', userId)
        .order('joined_at', { ascending: false })
        .limit(5);
      if (error) throw error;

      for (const membership of memberships ?? []) {
        if (identity?.id !== userId || room) return;
        const { data: candidate, error: roomError } = await supabase
          .from('game_rooms')
          .select('id, code, mode, status, host_user_id, max_players, finish_reason, result_user_id, finished_at')
          .eq('id', membership.room_id)
          .eq('status', 'waiting')
          .maybeSingle();
        if (roomError) continue;
        if (!candidate) continue;
        await openRoom(candidate.id);
        if (isCurrentRoom(candidate.id, roomGeneration)) {
          setStatus('前回の待機ルームを復元しました。コードを共有して続けられます。');
        }
        return;
      }
    } catch (error) {
      if (identity?.id === userId) {
        setStatus('前回のルームを復元できませんでした：' + errorMessage(error), true);
      }
    } finally {
      restoringRoom = false;
    }
  }

  return {
    setIdentity(nextIdentity): void {
      const previousId = identity?.id ?? null;
      const nextId = nextIdentity?.id ?? null;
      if (previousId && nextId !== previousId && room) {
        void resetRoom(false, true).finally(() => {
          identity = nextIdentity;
          applyOnlineAvailability();
          trigger.title = identity ? 'オンラインロビー' : 'ACCOUNTからログインするとオンライン対戦できます';
          if (identity) void restoreWaitingRoom(identity.id);
        });
        return;
      }

      identity = nextIdentity;
      applyOnlineAvailability();
      trigger.title = identity ? 'オンラインロビー' : 'ACCOUNTからログインするとオンライン対戦できます';
      if (identity && previousId !== identity.id) void restoreWaitingRoom(identity.id);
    },
  };
}
