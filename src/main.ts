import './style.css';
import { GENRES, getGenreLabel, getPrompt, bestPrefixLength, hasPotentialPrefix, isAnswerCorrect, normalizeTyping, type Genre, type TypingPrompt } from './data';
import { GameEngine, type EndReason, type GamePhase, type GameSnapshot } from './engine';
import { AudioSystem } from './audio';
import { clearEndlessSave, exportTransferCode, importTransferCode, loadEndlessSave, loadStats, loadUserProfile, saveEndless, saveUserProfile, updateStats, verifyProfilePasscode } from './persistence';

const app = document.querySelector<HTMLDivElement>('#app');
if (!app) throw new Error('App root not found.');

app.innerHTML = `
  <div class="shell">
    <header class="topbar">
      <a class="brand" href="#top" aria-label="KEY BULLET home">
        <span class="brand-mark"><i></i><i></i><i></i></span>
        <span class="brand-name">KEY <b>BULLET</b></span>
        <span class="build-tag">BETA 0.1</span>
      </a>
      <div class="top-status"><span class="status-dot"></span><span id="system-status">SYSTEM STANDBY</span><span class="status-divider"></span><span>NO EXTERNAL ASSETS</span></div>
      <div class="top-actions">
        <button class="icon-button" id="sound-toggle" type="button" aria-label="Toggle sound"><span id="sound-icon">♪</span><span class="button-caption">SOUND</span></button>
        <button class="icon-button" id="profile-open" type="button" aria-label="Profile settings"><span>◎</span><span class="button-caption" id="profile-label">PROFILE</span></button><button class="icon-button" id="stats-open" type="button" aria-label="Open stats"><span>▤</span><span class="button-caption">RECORD</span></button>
      </div>
    </header>

    <main id="top">
      <section class="intro-row">
        <div>
          <div class="eyebrow"><span class="eyebrow-line"></span> TYPE. DODGE. SURVIVE.</div>
          <h1>KEY <span>BULLET</span></h1>
          <p class="intro-copy">指先で弾幕を撃ち抜け。タイピング詠唱と弾幕回避、2つのフェーズを切り替えてボスを撃破する。</p>
        </div>
        <div class="intro-meta"><span class="meta-label">INPUT DEVICE</span><strong>PHYSICAL KEYBOARD</strong><small>※物理キーボード必須</small></div>
      </section>

      <section class="game-layout">
        <div class="game-column">
          <div class="panel game-panel">
            <div class="panel-topline"><span class="panel-id">01 / COMBAT VIEW</span><span class="live-label"><i></i> <span id="phase-label">STANDBY</span></span></div>
            <div class="canvas-wrap" id="canvas-wrap">
              <canvas id="game-canvas" aria-label="KEY BULLET 2D bullet-hell game area"></canvas>
              <div id="welcome-overlay" class="welcome-overlay">
                <div class="welcome-kicker">SYSTEM // READY</div>
                <div class="welcome-title">BREAK THE<br><span>GRAIL.</span></div>
                <div class="welcome-rule"></div>
                <p>TYPE TO ATTACK<br>DODGE TO SURVIVE</p>
                <div class="welcome-hint">SELECT A MODE TO BEGIN</div>
              </div>
            </div>
            <div class="combat-footer">
              <div class="footer-stat"><span>PLAYER</span><strong id="player-lives">— — —</strong></div>
              <div class="footer-stat"><span>GRAZE</span><strong id="player-graze">0000</strong></div>
              <div class="footer-stat"><span>SCORE</span><strong id="player-score">000000</strong></div>
              <div class="footer-stat footer-phase"><span>PHASE</span><strong id="player-phase">STANDBY</strong></div>
            </div>
          </div>

          <div class="panel typing-panel" id="typing-panel">
            <div class="typing-header">
              <div><div class="panel-id">02 / SPELL INPUT</div><div class="typing-headline" id="prompt-title">AWAITING SIGNAL</div></div>
              <div class="typing-meta"><span id="prompt-genre">NO PROMPT</span><span class="meta-divider"></span><span id="prompt-clock">00.00s</span></div>
            </div>
            <div class="prompt-display" id="prompt-display">モードを選択すると、ここにタイピングのお題が表示される。</div>
            <div class="prompt-note" id="prompt-note">5つのジャンルから出題。日本語はローマ字で入力。</div>
            <form id="typing-form" autocomplete="off">
              <label class="sr-only" for="typing-input">Type the prompt</label>
              <div class="input-wrap"><span class="input-prefix">&gt;_</span><input id="typing-input" type="text" autocapitalize="off" spellcheck="false" placeholder="ここに入力して Enter で発射" disabled /><span class="input-ready" id="input-ready">LOCKED</span></div>
              <div class="typing-bottom"><span id="typing-feedback">PHASE 01 では時間制限なし。正確に入力してショットを強化。</span><button class="fire-button" id="fire-button" type="submit" disabled>FIRE <span>↗</span></button></div>
            </form>
            <div class="typing-metrics"><div><span>WPM</span><strong id="metric-wpm">—</strong></div><div><span>ACCURACY</span><strong id="metric-accuracy">—</strong></div><div><span>POWER</span><strong id="metric-power">—</strong></div><div><span>MISSES</span><strong id="metric-misses">00</strong></div></div>
          </div>
        </div>

        <aside class="side-column">
          <div class="panel mode-panel" id="mode-panel">
            <div class="panel-heading"><span class="panel-id">03 / SELECT MODE</span><span class="tiny-state">READY</span></div>
            <button class="mode-card" id="story-start" type="button">
              <span class="mode-index">A</span><span class="mode-main"><strong>STORY</strong><small>3 STAGES / FINAL BOSS</small></span><span class="mode-arrow">↗</span>
            </button>
            <button class="mode-card endless-card" id="endless-start" type="button">
              <span class="mode-index">B</span><span class="mode-main"><strong>ENDLESS</strong><small>INFINITE WAVES / AUTO SAVE</small></span><span class="mode-arrow">↗</span>
            </button>
            <button class="continue-row" id="endless-continue" type="button" hidden><span>↻ CONTINUE FROM WAVE <b id="continue-wave">01</b></span><span>RESUME →</span></button>
          </div>

          <div class="panel genre-panel">
            <div class="panel-heading"><span class="panel-id">04 / SPELL CATEGORY</span><span class="tiny-state" id="genre-state">RANDOM</span></div>
            <div class="genre-grid" id="genre-grid">
              ${GENRES.map((g) => `<button class="genre-chip ${g.id === 'random' ? 'selected' : ''}" type="button" data-genre="${g.id}"><span>${g.code}</span><strong>${g.label}</strong><small>${g.sub}</small></button>`).join('')}
            </div>
          </div>

          <div class="panel controls-panel">
            <div class="panel-heading"><span class="panel-id">05 / CONTROL MAP</span><span class="tiny-state">KEYBOARD</span></div>
            <div class="control-line"><kbd>W</kbd><kbd>A</kbd><kbd>S</kbd><kbd>D</kbd><span>移動</span></div>
            <div class="control-line"><kbd>↑</kbd><kbd>←</kbd><kbd>↓</kbd><kbd>→</kbd><span>移動</span></div>
            <div class="control-line"><kbd>SHIFT</kbd><span>低速移動 / コア表示</span></div>
            <div class="control-line"><kbd>CTRL</kbd><b>+</b><kbd>C</kbd><span>ボム / 全弾消去</span></div>
            <div class="control-line"><kbd>DRAG</kbd><span>画面内をドラッグして移動</span></div>
            <div class="control-foot">PHASE 01: TYPE + ENTER　/　PHASE 02: DODGE</div>
          </div>

          <div class="panel mini-record-panel">
            <div class="panel-heading"><span class="panel-id">06 / CAREER RECORD</span><button class="text-link" id="transfer-open" type="button">TRANSFER CODE ↗</button></div>
            <div class="record-grid"><div><span>RUNS</span><strong id="record-runs">00</strong></div><div><span>STORY CLEAR</span><strong id="record-clears">00</strong></div><div><span>BEST WAVE</span><strong id="record-wave">00</strong></div></div>
          </div>
        </aside>
      </section>

      <footer class="site-footer"><span>KEY BULLET <b>© 2026</b></span><span>RENDERED WITH HTML5 CANVAS / WEB AUDIO API</span><span>ALL SYSTEMS LOCAL</span></footer>
    </main>
  </div>

  <div class="modal-backdrop" id="result-modal" hidden>
    <div class="modal-card">
      <div class="modal-overline" id="result-overline">RUN COMPLETE</div>
      <h2 id="result-title">SYSTEM CLEAR</h2>
      <p id="result-description">戦闘結果を記録しました。</p>
      <div class="result-stats"><div><span>SCORE</span><strong id="result-score">000000</strong></div><div><span>GRAZE</span><strong id="result-graze">0000</strong></div><div><span>STAGE / WAVE</span><strong id="result-stage">—</strong></div></div>
      <div class="modal-actions"><button class="primary-button" id="result-retry" type="button">RETRY ↗</button><button class="secondary-button" id="result-menu" type="button">BACK TO MENU</button></div>
    </div>
  </div>

  <div class="modal-backdrop" id="record-modal" hidden>
    <div class="modal-card modal-wide">
      <div class="modal-overline">CAREER DATA / LOCAL STORAGE</div>
      <h2>RECORD <span>ARCHIVE</span></h2>
      <p>この端末に保存されている戦績。引き継ぎコードで別端末へ移行できます。</p>
      <div class="archive-grid" id="archive-grid"></div>
      <div class="modal-actions"><button class="primary-button" id="archive-copy" type="button">COPY STATS ↗</button><button class="secondary-button" id="archive-close" type="button">CLOSE</button></div>
    </div>
  </div>

  <div class="modal-backdrop" id="transfer-modal" hidden>
    <div class="modal-card modal-wide">
      <div class="modal-overline">DATA MIGRATION / BETA</div>
      <h2>TRANSFER <span>CODE</span></h2>
      <p>暗号化した引き継ぎコードを作成・復元します。復元時は登録したユーザー名かパスコードのどちらか一つでOK。</p>
      <div class="transfer-tabs"><button class="transfer-tab active" data-tab="export" type="button">EXPORT</button><button class="transfer-tab" data-tab="import" type="button">IMPORT</button></div>
      <div id="transfer-export-fields" class="transfer-fields"><label for="transfer-passcode">登録したパスコード</label><input id="transfer-passcode" type="password" autocomplete="current-password" placeholder="パスコードを入力" /></div>
      <div id="transfer-import-fields" class="transfer-fields" hidden><label for="transfer-credential">ユーザー名 または パスコード</label><input id="transfer-credential" type="text" autocomplete="off" placeholder="どちらか一つを入力" /><small>2つとも入力する必要はありません。</small></div>
      <textarea id="transfer-text" rows="4" spellcheck="false" placeholder="KB-BETA-... のコードを貼り付け"></textarea>
      <div class="transfer-message" id="transfer-message">EXPORT で現在の戦績コードを生成できます。</div>
      <div class="modal-actions"><button class="primary-button" id="transfer-action" type="button">GENERATE CODE ↗</button><button class="secondary-button" id="transfer-close" type="button">CLOSE</button></div>
    </div>
  </div>

  <div class="modal-backdrop" id="profile-modal" hidden>
    <div class="modal-card modal-wide profile-card">
      <div class="modal-overline">PLAYER PROFILE / LOCAL</div>
      <h2>PLAYER <span>PROFILE</span></h2>
      <p>ユーザー名とパスコードを登録します。パスコードそのものはこの端末に保存せず、照合用データだけを保存します。</p>
      <div class="profile-fields">
        <label for="profile-username">ユーザー名 <small>2〜20文字</small></label>
        <input id="profile-username" type="text" maxlength="20" autocomplete="username" placeholder="プレイヤー名" />
        <label for="profile-passcode">パスコード <small>4〜64文字</small></label>
        <input id="profile-passcode" type="password" minlength="4" maxlength="64" autocomplete="new-password" placeholder="パスコードを設定" />
        <label for="profile-confirm">パスコード（確認）</label>
        <input id="profile-confirm" type="password" minlength="4" maxlength="64" autocomplete="new-password" placeholder="もう一度入力" />
      </div>
      <div class="transfer-message" id="profile-message">引き継ぎ時はユーザー名かパスコードのどちらか一つを使えます。</div>
      <div class="modal-actions"><button class="primary-button" id="profile-save" type="button">SAVE PROFILE</button><button class="secondary-button" id="profile-close" type="button">CLOSE</button></div>
    </div>
  </div>
`;

const $ = <T extends HTMLElement>(selector: string): T => {
  const element = document.querySelector<T>(selector);
  if (!element) throw new Error(`Missing UI element: ${selector}`);
  return element;
};


function showScreen(screen: 'home' | 'menu' | 'game' | 'result'): void {
  document.querySelectorAll<HTMLElement>('[data-screen]').forEach((page) => {
    page.toggleAttribute('hidden', page.dataset.screen !== screen);
  });
  window.scrollTo({ top: 0, behavior: 'auto' });
}

// Split the original dashboard into separate screens while preserving the game UI and IDs.
const pageMain = $('#top');
const introRow = pageMain.querySelector<HTMLElement>('.intro-row');
const originalLayout = pageMain.querySelector<HTMLElement>('.game-layout');
const gameColumn = originalLayout?.querySelector<HTMLElement>('.game-column');
const modePanel = $('#mode-panel');
const genrePanel = document.querySelector<HTMLElement>('.genre-panel');
const controlsPanel = document.querySelector<HTMLElement>('.controls-panel');
const recordPanel = document.querySelector<HTMLElement>('.mini-record-panel');
const siteFooter = pageMain.querySelector<HTMLElement>('.site-footer');
if (!introRow || !originalLayout || !gameColumn || !genrePanel || !controlsPanel || !recordPanel || !siteFooter) {
  throw new Error('Could not assemble KEY BULLET screens.');
}

const homeScreen = document.createElement('section');
homeScreen.id = 'home-screen';
homeScreen.className = 'page-screen home-screen';
homeScreen.dataset.screen = 'home';
const homeActions = document.createElement('div');
homeActions.className = 'home-actions';
homeActions.innerHTML = '<button class="primary-button home-play" id="home-play" type="button">ゲームスタート <span>→</span></button><button class="secondary-button" id="home-record-open" type="button">戦績を見る</button>';
introRow.querySelector('div')?.append(homeActions);
recordPanel.classList.add('home-record-panel');
homeScreen.append(introRow, recordPanel);

const menuScreen = document.createElement('section');
menuScreen.id = 'menu-screen';
menuScreen.className = 'page-screen menu-screen';
menuScreen.dataset.screen = 'menu';
menuScreen.hidden = true;
const menuHeading = document.createElement('div');
menuHeading.className = 'page-heading';
menuHeading.innerHTML = '<button class="back-link" id="menu-home" type="button">← HOME</button><div class="eyebrow"><span class="eyebrow-line"></span> SELECT YOUR RUN</div><h2>モードを選択</h2><p>遊び方とタイピングのお題を選ぼう。</p>';
const menuLayout = document.createElement('div');
menuLayout.className = 'menu-layout';
menuLayout.append(modePanel, genrePanel);
menuScreen.append(menuHeading, menuLayout, controlsPanel);

const gameScreen = document.createElement('section');
gameScreen.id = 'game-screen';
gameScreen.className = 'page-screen game-screen';
gameScreen.dataset.screen = 'game';
gameScreen.hidden = true;
const gameHeading = document.createElement('div');
gameHeading.className = 'game-page-heading';
gameHeading.innerHTML = '<div><div class="eyebrow"><span class="eyebrow-line"></span> COMBAT AREA</div><h2>戦闘中</h2></div><button class="back-link" id="game-menu" type="button">ホームへ戻る</button>';
const gameLayout = document.createElement('section');
gameLayout.className = 'game-layout';
gameLayout.append(gameColumn);
gameScreen.append(gameHeading, gameLayout);
originalLayout.remove();

const resultPage = $('#result-modal');
resultPage.classList.remove('modal-backdrop');
resultPage.classList.add('page-screen', 'result-screen');
resultPage.dataset.screen = 'result';
resultPage.hidden = true;
const resultCard = resultPage.querySelector<HTMLElement>('.modal-card');
if (resultCard) {
  resultCard.classList.remove('modal-card');
  resultCard.classList.add('result-page', 'panel');
}
pageMain.insertBefore(homeScreen, siteFooter);
pageMain.insertBefore(menuScreen, siteFooter);
pageMain.insertBefore(gameScreen, siteFooter);
pageMain.insertBefore(resultPage, siteFooter);

const canvas = $('#game-canvas') as HTMLCanvasElement;
const audio = new AudioSystem();
let selectedGenre: Genre = 'random';
let prompt: TypingPrompt | null = null;
let currentPhase: GamePhase = 'ended';
let currentMode: 'STORY' | 'ENDLESS' = 'STORY';
let phaseStartedAt = 0;
let clockFrame = 0;
let previousInputValue = '';
let missCount = 0;
let bestAccuracy = 0;
let lastSnapshot: GameSnapshot | null = null;
let transferMode: 'export' | 'import' = 'export';
let latestStats = loadStats();

const game = new GameEngine(canvas, {
  onChange: (snapshot) => { lastSnapshot = snapshot; renderSnapshot(snapshot); updateTypingPanelState(); },
  onPhase: (phase) => {
    currentPhase = phase;
    if (phase === 'typing') {
      audio.setPhase('typing');
      setupNewPrompt();
      $('#phase-label').textContent = 'PHASE 01 / TYPE';
      $('#player-phase').textContent = 'TYPE';
      $('#typing-feedback').textContent = '時間制限なし。正確率と速度で次のショットを強化。';
    } else if (phase === 'bullet') {
      audio.setPhase('bullet');
      $('#phase-label').textContent = 'PHASE 02 / DODGE';
      $('#player-phase').textContent = 'DODGE';
      $('#typing-input').setAttribute('disabled', 'true');
      $('#fire-button').setAttribute('disabled', 'true');
      $('#input-ready').textContent = 'LOCKED';
      $('#typing-feedback').textContent = '弾幕フェーズ！ 20秒以内にボスの区切りHPを削り切れ。';
    } else {
      $('#phase-label').textContent = 'RUN ENDED';
      $('#player-phase').textContent = 'END';
    }
    updateTypingPanelState();
  },
  onEnd: (reason) => finishRun(reason),
  onWaveClear: (snapshot) => {
    saveEndless({ wave: snapshot.wave, score: snapshot.score, lives: snapshot.lives, bombs: snapshot.bombs, savedAt: new Date().toISOString() });
    $('#typing-feedback').textContent = `WAVE CLEAR — WAVE ${snapshot.wave - 1} の戦績を自動保存しました。`;
    audio.play('clear');
    updateContinueButton();
  },
  onSegmentClear: () => {
    audio.play('clear');
    $('#typing-feedback').textContent = 'SEGMENT BREAK — 次の詠唱を入力。';
  },
});

function setupNewPrompt(): void {
  prompt = getPrompt(selectedGenre);
  phaseStartedAt = performance.now();
  previousInputValue = '';
  missCount = 0;
  $('#prompt-title').textContent = prompt.title;
  $('#prompt-genre').textContent = getGenreLabel(prompt.genre);
  const display = $('#prompt-display');
  display.textContent = prompt.display;
  display.classList.toggle('code-prompt', Boolean(prompt.isCode));
  $('#prompt-note').textContent = prompt.note;
  ($('#typing-input') as HTMLInputElement).value = '';
  $('#typing-input').removeAttribute('disabled');
  $('#fire-button').removeAttribute('disabled');
  $('#input-ready').textContent = 'READY';
  $('#metric-wpm').textContent = '—';
  $('#metric-accuracy').textContent = '—';
  $('#metric-power').textContent = '—';
  $('#metric-misses').textContent = '00';
  updateTypingPanelState();
  requestAnimationFrame(() => $('#typing-input').focus());
}

function updateTypingPanelState(): void {
  const input = $('#typing-input') as HTMLInputElement;
  const enabled = currentPhase === 'typing' && Boolean(lastSnapshot?.active);
  input.disabled = !enabled;
  $('#fire-button').toggleAttribute('disabled', !enabled);
  $('#input-ready').textContent = enabled ? 'READY' : 'LOCKED';
  $('#typing-panel').classList.toggle('phase-active', currentPhase === 'typing' && enabled);
}

function renderSnapshot(snapshot: GameSnapshot): void {
  $('#player-lives').textContent = '◆ '.repeat(Math.max(0, snapshot.lives)).trim() || '—';
  $('#player-graze').textContent = String(snapshot.grazes).padStart(4, '0');
  $('#player-score').textContent = String(snapshot.score).padStart(6, '0');
  $('#player-phase').textContent = snapshot.phase === 'typing' ? 'TYPE' : snapshot.phase === 'bullet' ? 'DODGE' : 'END';
  $('#phase-label').textContent = snapshot.phase === 'typing' ? 'PHASE 01 / TYPE' : snapshot.phase === 'bullet' ? `PHASE 02 / ${Math.ceil(snapshot.timeLeft)}s` : 'RUN ENDED';
  $('#system-status').textContent = snapshot.active ? 'COMBAT LINK ACTIVE' : 'SYSTEM STANDBY';
  $('#system-status').parentElement?.classList.toggle('is-live', snapshot.active);
  if (snapshot.phase === 'bullet') {
    $('#typing-feedback').textContent = `弾幕展開中 — 残り ${Math.ceil(snapshot.timeLeft)} 秒。SHIFT で低速移動。`;
  }
}

function calculateTyping(inputValue: string): { accuracy: number; speed: number; power: number; correct: boolean } {
  if (!prompt) return { accuracy: 0, speed: 0, power: 0.65, correct: false };
  const elapsed = Math.max(0.2, (performance.now() - phaseStartedAt) / 1000);
  const typedLength = normalizeTyping(inputValue, Boolean(prompt.isCode)).length;
  const accuracy = typedLength === 0 ? 100 : Math.max(0, Math.min(100, ((typedLength - missCount) / typedLength) * 100));
  const speed = typedLength / elapsed;
  const power = Math.max(0.65, Math.min(3.4, 0.65 + speed * 0.34 + (accuracy / 100) * 1.55));
  return { accuracy, speed, power, correct: isAnswerCorrect(inputValue, prompt.answers, Boolean(prompt.isCode)) };
}

$('#typing-input').addEventListener('input', () => {
  if (!prompt || currentPhase !== 'typing') return;
  const value = ($('#typing-input') as HTMLInputElement).value;
  const metrics = calculateTyping(value);
  const length = normalizeTyping(value, Boolean(prompt.isCode)).length;
  if (value.length > previousInputValue.length && value.startsWith(previousInputValue)) {
    let candidate = previousInputValue;
    for (const char of value.slice(previousInputValue.length)) {
      candidate += char;
      if (!hasPotentialPrefix(candidate, prompt.answers, Boolean(prompt.isCode))) {
        missCount++;
        game.addMistake();
        audio.play('error');
      } else {
        audio.play('type');
      }
    }
  }
  previousInputValue = value;
  $('#metric-wpm').textContent = String(Math.round(metrics.speed * 12));
  $('#metric-accuracy').textContent = `${Math.round(metrics.accuracy)}%`;
  $('#metric-power').textContent = `${metrics.power.toFixed(2)}x`;
  $('#metric-misses').textContent = String(missCount).padStart(2, '0');
  $('#typing-feedback').textContent = metrics.correct ? 'INPUT COMPLETE — ENTER でショットを発射。' : '入力中… 正確率を維持してショットを強化。';
  $('#fire-button').classList.toggle('ready-to-fire', metrics.correct);
});

$('#typing-form').addEventListener('submit', (event) => {
  event.preventDefault();
  if (!prompt || currentPhase !== 'typing' || !lastSnapshot?.active) return;
  const value = ($('#typing-input') as HTMLInputElement).value;
  const metrics = calculateTyping(value);
  if (!metrics.correct) {
    $('#typing-feedback').textContent = 'INPUT ERROR — お題を最後まで正確に入力してください。';
    audio.play('error');
    return;
  }
  const chars = normalizeTyping(value, Boolean(prompt.isCode)).length;
  bestAccuracy = Math.max(bestAccuracy, metrics.accuracy);
  $('#metric-wpm').textContent = String(Math.round(metrics.speed * 12));
  $('#metric-accuracy').textContent = `${Math.round(metrics.accuracy)}%`;
  $('#metric-power').textContent = `${metrics.power.toFixed(2)}x`;
  game.fire(metrics.power, chars, metrics.accuracy);
  audio.play('shot');
});

function beginRun(mode: 'STORY' | 'ENDLESS', resume = false): void {
  currentMode = mode;
  bestAccuracy = 0;
  void audio.start('typing');
  showScreen('game');
  $('#welcome-overlay').classList.add('hidden');
  const save = resume && mode === 'ENDLESS' ? loadEndlessSave() : null;
  if (mode === 'ENDLESS' && !resume) clearEndlessSave();
  game.start(mode, save ? { wave: save.wave, score: save.score, lives: save.lives, bombs: save.bombs } : undefined);
  $('#phase-label').textContent = 'PHASE 01 / TYPE';
  updateContinueButton();
}

function finishRun(reason: EndReason): void {
  const snapshot = game.getSnapshot();
  const prev = loadStats();
  latestStats = updateStats({
    totalRuns: prev.totalRuns + 1,
    storyClears: prev.storyClears + (reason === 'clear' && currentMode === 'STORY' ? 1 : 0),
    endlessBestWave: Math.max(prev.endlessBestWave, snapshot.wave),
    totalScore: prev.totalScore + snapshot.score,
    totalGrazes: prev.totalGrazes + snapshot.grazes,
    bestAccuracy: Math.max(prev.bestAccuracy, bestAccuracy),
    lastPlayedAt: new Date().toISOString(),
  });
  $('#result-overline').textContent = reason === 'clear' ? 'MISSION COMPLETE' : 'SIGNAL LOST';
  $('#result-title').textContent = reason === 'clear' ? 'SYSTEM CLEAR' : 'GAME OVER';
  $('#result-description').textContent = reason === 'clear' ? '全セグメントを突破。戦績をローカルに保存しました。' : '被弾回数が上限に到達。戦績をローカルに保存しました。';
  $('#result-score').textContent = String(snapshot.score).padStart(6, '0');
  $('#result-graze').textContent = String(snapshot.grazes).padStart(4, '0');
  $('#result-stage').textContent = currentMode === 'STORY' ? `STAGE ${snapshot.stage}` : `WAVE ${snapshot.wave}`;
  showScreen('result');
  renderCareer();
  updateContinueButton();
  audio.play(reason === 'clear' ? 'clear' : 'hit');
}

function updateContinueButton(): void {
  const save = loadEndlessSave();
  const button = $('#endless-continue');
  button.toggleAttribute('hidden', !save);
  if (save) $('#continue-wave').textContent = String(save.wave).padStart(2, '0');
}

function renderCareer(): void {
  latestStats = loadStats();
  $('#record-runs').textContent = String(latestStats.totalRuns).padStart(2, '0');
  $('#record-clears').textContent = String(latestStats.storyClears).padStart(2, '0');
  $('#record-wave').textContent = String(latestStats.endlessBestWave).padStart(2, '0');
}

function openRecordModal(): void {
  const s = loadStats();
  $('#archive-grid').innerHTML = `
    <div><span>TOTAL RUNS</span><strong>${s.totalRuns}</strong></div>
    <div><span>STORY CLEARS</span><strong>${s.storyClears}</strong></div>
    <div><span>ENDLESS BEST</span><strong>WAVE ${s.endlessBestWave}</strong></div>
    <div><span>TOTAL SCORE</span><strong>${s.totalScore.toLocaleString('en-US')}</strong></div>
    <div><span>TOTAL GRAZE</span><strong>${s.totalGrazes.toLocaleString('en-US')}</strong></div>
    <div><span>BEST ACCURACY</span><strong>${s.bestAccuracy.toFixed(1)}%</strong></div>`;
  $('#record-modal').removeAttribute('hidden');
}

async function copyText(value: string): Promise<void> {
  try {
    await navigator.clipboard.writeText(value);
    $('#transfer-message').textContent = 'クリップボードにコピーしました。';
  } catch {
    const area = $('#transfer-text') as HTMLTextAreaElement;
    area.focus(); area.select();
    $('#transfer-message').textContent = '自動コピーできませんでした。テキストを選択してコピーしてください。';
  }
}

function setTransferMode(mode: 'export' | 'import'): void {
  transferMode = mode;
  document.querySelectorAll<HTMLButtonElement>('.transfer-tab').forEach((button) => {
  button.addEventListener('click', () => setTransferMode(button.dataset.tab as 'export' | 'import'));
});
$('#transfer-action').addEventListener('click', async () => {
  const area = $('#transfer-text') as HTMLTextAreaElement;
  try {
    if (transferMode === 'export') {
      const profile = loadUserProfile();
      const passcode = ($('#transfer-passcode') as HTMLInputElement).value;
      if (!profile) throw new Error('先にPROFILEからユーザー名とパスコードを設定してください。');
      if (!await verifyProfilePasscode(passcode, profile)) throw new Error('登録したパスコードが一致しません。');
      area.value = await exportTransferCode(loadStats(), profile, passcode);
      $('#transfer-message').textContent = '暗号化した引き継ぎコードを作成しました。コピーして新しい端末へ移してください。';
      await copyText(area.value);
    } else {
      const credential = ($('#transfer-credential') as HTMLInputElement).value.trim();
      latestStats = await importTransferCode(area.value, credential);
      renderCareer();
      renderProfile();
      updateContinueButton();
      $('#transfer-message').textContent = '戦績とプロフィールを復元しました。次回の引き継ぎにも使えます。';
      audio.play('clear');
    }
  } catch (error) {
    $('#transfer-message').textContent = error instanceof Error ? error.message : '処理に失敗しました。';
    audio.play('error');
  }
});

window.addEventListener('keydown', (event) => {
  if (event.ctrlKey && event.key.toLowerCase() === 'c' && currentPhase === 'bullet' && !(event.target instanceof HTMLInputElement) && !(event.target instanceof HTMLTextAreaElement)) {
    event.preventDefault();
    if (game.useBomb()) audio.play('bomb');
    return;
  }
  if (currentPhase === 'bullet' && ['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Shift', 'w', 'a', 's', 'd', 'W', 'A', 'S', 'D'].includes(event.key)) {
    if (event.target instanceof HTMLInputElement || event.target instanceof HTMLTextAreaElement) return;
    event.preventDefault(); game.handleKey(event.key, true);
  }
});
window.addEventListener('keyup', (event) => game.handleKey(event.key, false));
window.addEventListener('blur', () => {
  ['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Shift', 'w', 'a', 's', 'd'].forEach((key) => game.handleKey(key, false));
});

let pointerDown = false;
let lastPointer = { x: 0, y: 0 };
canvas.addEventListener('pointerdown', (event) => {
  if (currentPhase !== 'bullet') return;
  pointerDown = true; game.setDragActive(true);
  const rect = canvas.getBoundingClientRect();
  lastPointer = { x: (event.clientX - rect.left) * (960 / rect.width), y: (event.clientY - rect.top) * (540 / rect.height) };
  canvas.setPointerCapture(event.pointerId);
});
canvas.addEventListener('pointermove', (event) => {
  if (!pointerDown) return;
  const rect = canvas.getBoundingClientRect();
  const pos = { x: (event.clientX - rect.left) * (960 / rect.width), y: (event.clientY - rect.top) * (540 / rect.height) };
  game.moveBy(pos.x - lastPointer.x, pos.y - lastPointer.y);
  lastPointer = pos;
});
const stopPointer = () => { pointerDown = false; game.setDragActive(false); };
canvas.addEventListener('pointerup', stopPointer);
canvas.addEventListener('pointercancel', stopPointer);

function updateClock(): void {
  if (currentPhase === 'typing' && lastSnapshot?.active) {
    const elapsed = Math.max(0, (performance.now() - phaseStartedAt) / 1000);
    $('#prompt-clock').textContent = `${elapsed.toFixed(2)}s`;
  }
  clockFrame = requestAnimationFrame(updateClock);
}

renderCareer();
renderProfile();
updateContinueButton();
updateTypingPanelState();
updateClock();

window.addEventListener('beforeunload', () => {
  cancelAnimationFrame(clockFrame);
  game.destroy();
  audio.destroy();
});
