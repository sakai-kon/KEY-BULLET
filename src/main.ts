import './style.css';

declare const __APP_VERSION__: string;
import { GENRES, getGenreLabel, getPrompt, hasPotentialPrefix, countNewMistakes, isAnswerCorrect, normalizeTyping, type Genre, type TypingPrompt } from './data';
import { GameEngine, type EndReason, type GameDifficulty, type GamePhase, type GameSnapshot } from './engine';
import { renderPromptWithFurigana } from './furigana';
import { AudioSystem } from './audio';
import { initializeCloudAccount } from './cloud';
import { clearEndlessSave, exportTransferCode, importTransferCode, loadEndlessSave, loadStats, loadUserProfile, saveEndless, saveUserProfile, updateStats } from './persistence';

const app = document.querySelector<HTMLDivElement>('#app');
if (!app) throw new Error('App root not found.');

app.innerHTML = `
  <div class="shell">
    <header class="topbar">
      <a class="brand" href="#top" aria-label="KEY BULLET home">
        <span class="brand-mark"><i></i><i></i><i></i></span>
        <span class="brand-name">KEY <b>BULLET</b></span>
        <span class="build-tag" aria-label="アプリのバージョン">BETA v${__APP_VERSION__}</span>
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
              <div class="typing-meta"><span id="prompt-genre">NO PROMPT</span><span class="meta-divider"></span><span id="prompt-clock">00.00s</span><button class="furigana-toggle" id="furigana-toggle" type="button" aria-pressed="true">ふりがな ON</button></div>
            </div>
            <div class="prompt-display" id="prompt-display">モードを選択すると、ここにタイピングのお題が表示される。</div>
            <div class="prompt-note" id="prompt-note">全617件のお題から出題。日本語はIMEで変換して入力。</div>
            <form id="typing-form" autocomplete="off">
              <label class="sr-only" for="typing-input">Type the prompt</label>
              <div class="input-wrap"><span class="input-prefix">&gt;_</span><input id="typing-input" type="text" autocapitalize="off" spellcheck="false" placeholder="ここに入力して Enter で発射" disabled /><span class="input-ready" id="input-ready">LOCKED</span></div>
              <div class="typing-bottom"><span id="typing-feedback" aria-live="polite">PHASE 01 では時間制限なし。正確に入力してショットを強化。</span><button class="fire-button" id="fire-button" type="submit" disabled>FIRE <span>↗</span></button></div>
            </form>
            <div class="typing-metrics"><div><span>WPM</span><strong id="metric-wpm">—</strong></div><div><span>ACCURACY</span><strong id="metric-accuracy">—</strong></div><div><span>POWER</span><strong id="metric-power">—</strong></div><div><span>MISSES</span><strong id="metric-misses">00</strong></div></div>
          </div>
        </div>

        <aside class="side-column">
          <div class="panel mode-panel" id="mode-panel">
            <div class="panel-heading"><span class="panel-id">03 / SELECT MODE</span><span class="tiny-state">READY</span></div>
            <div class="difficulty-picker">
              <div class="difficulty-title"><span>DIFFICULTY</span><strong>難易度</strong></div>
              <div class="difficulty-options" role="group" aria-label="難易度">
                <button class="difficulty-option selected" id="difficulty-normal" type="button" aria-pressed="true"><strong>NORMAL</strong><small>標準</small></button>
                <button class="difficulty-option" id="difficulty-easy" type="button" aria-pressed="false"><strong>EASY</strong><small>超かんたん</small></button>
              </div>
              <p class="difficulty-description" id="difficulty-description">通常の難易度でプレイします。</p>
            </div>
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

      <footer class="site-footer"><span>KEY BULLET <b>© 2026</b></span><span>RENDERED WITH HTML5 CANVAS / WEB AUDIO API</span><span>ONLINE RELAY / PRIVATE ROOMS</span></footer>
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


function showScreen(screen: 'tutorial' | 'home' | 'menu' | 'game' | 'result'): void {
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
homeActions.innerHTML = '<button class="primary-button home-play" id="home-play" type="button">ゲームスタート <span>→</span></button><button class="secondary-button" id="home-tutorial-open" type="button">遊び方・チュートリアル</button><button class="secondary-button" id="home-record-open" type="button">戦績を見る</button>';
introRow.querySelector('div')?.append(homeActions);
recordPanel.classList.add('home-record-panel');

homeScreen.append(introRow, recordPanel);

const tutorialScreen = document.createElement('section');
tutorialScreen.id = 'tutorial-screen';
tutorialScreen.className = 'page-screen tutorial-screen';
tutorialScreen.dataset.screen = 'tutorial';
tutorialScreen.innerHTML = `
  <div class="tutorial-top">
    <div class="eyebrow"><span class="eyebrow-line"></span> FIRST TIME GUIDE</div>
    <h2>KEY BULLETの遊び方</h2>
    <p>4つのステップで、基本の流れと操作を確認しよう。お題は全617件。</p>
  </div>
  <div class="tutorial-progress">
    <span id="tutorial-step-count">01 / 04</span>
    <div class="tutorial-progress-track"><span id="tutorial-progress-fill"></span></div>
    <span id="tutorial-step-label">BASICS</span>
  </div>
  <div class="tutorial-pages">
    <article class="tutorial-page panel" data-tutorial-step="0">
      <div class="tutorial-visual tutorial-visual-flow"><span class="tutorial-number">01</span><div class="tutorial-flow-row"><span>TYPE</span><b>→</b><span>ATTACK</span><b>→</b><span>DODGE</span></div></div>
      <div class="tutorial-copy">
        <div class="modal-overline">STEP 01 / GAME FLOW</div>
        <h3>タイピングで攻撃、弾幕を避ける</h3>
        <p>KEY BULLETは「入力フェーズ」と「弾幕フェーズ」をくり返すゲーム。</p>
        <ul><li>日本語のお題はIMEで漢字・かなに変換して入力する（CODEは表示どおり入力）</li><li>敵の攻撃が始まったら、弾を避ける</li><li>敵のHPをすべて削ると次へ進む</li></ul>
      </div>
    </article>
    <article class="tutorial-page panel" data-tutorial-step="1" hidden>
      <div class="tutorial-visual tutorial-visual-type"><span class="tutorial-prompt">お題：静かな夜に、星を見る。</span><span class="tutorial-input">&gt;_ 静かな夜に、星を見る。 <i>│</i></span><span class="tutorial-tip">ENTER で発射</span></div>
      <div class="tutorial-copy">
        <div class="modal-overline">STEP 02 / TYPE TO ATTACK</div>
        <h3>表示された文章を入力しよう</h3>
        <p>画面下に表示された日本語を、IMEで漢字・かなに変換しながら入力してEnterキーを押すとショットを発射する。CODEのお題は表示どおりに直接入力する。</p>
        <ul><li>最後まで正しく入力すると攻撃できる</li><li>速さと正確さがショットの威力に影響する</li><li>ミスをすると危険度が上がるので、あわてず正確に</li></ul>
      </div>
    </article>
    <article class="tutorial-page panel" data-tutorial-step="2" hidden>
      <div class="tutorial-visual tutorial-visual-dodge"><span class="tutorial-dodge-player">▲</span><span class="tutorial-dodge-bullet bullet-a">●</span><span class="tutorial-dodge-bullet bullet-b">●</span><span class="tutorial-dodge-bullet bullet-c">●</span><span class="tutorial-dodge-label">DODGE THE BULLETS</span></div>
      <div class="tutorial-copy">
        <div class="modal-overline">STEP 03 / DODGE</div>
        <h3>弾幕フェーズは移動して回避</h3>
        <p>攻撃中はプレイヤーを動かして、飛んでくる弾に当たらないようにしよう。</p>
        <ul><li>W・A・S・D または矢印キーで移動</li><li>SHIFTを押すと低速移動になり、細かく避けやすい</li><li>CTRL + Cでボムを使い、ピンチを切り抜ける</li></ul>
      </div>
    </article>
    <article class="tutorial-page panel" data-tutorial-step="3" hidden>
      <div class="tutorial-visual tutorial-visual-modes"><div><strong>STORY</strong><small>物語を進める</small></div><div><strong>ENDLESS</strong><small>WAVEに挑戦</small></div></div>
      <div class="tutorial-copy">
        <div class="modal-overline">STEP 04 / MODES & TIPS</div>
        <h3>好きなモードとお題を選ぼう</h3>
        <p>はじめてならSTORYがおすすめ。慣れてきたらENDLESSにも挑戦してみよう。</p>
        <ul><li>STORY：ステージを進めてクリアを目指す</li><li>ENDLESS：続くWAVEに挑戦。進行状況は自動保存</li><li>ジャンルはRANDOM／CODE／DIALOGUE／SHORT／LONGから選べる</li></ul>
        <p class="tutorial-note">物理キーボードが必要です。スマホやタブレットでは外付けキーボードを使ってね。</p>
      </div>
    </article>
  </div>
  <div class="tutorial-navigation">
    <button class="secondary-button" id="tutorial-prev" type="button" disabled>← もどる</button>
    <div class="tutorial-dots" id="tutorial-dots" aria-label="チュートリアルの進行状況"><span class="active"></span><span></span><span></span><span></span></div>
    <button class="primary-button" id="tutorial-next" type="button">次へ →</button>
  </div>
  <button class="tutorial-skip" id="tutorial-skip" type="button">スキップしてホームへ</button>
`;
let tutorialStep = 0;
const tutorialLabels = ['BASICS', 'TYPE', 'DODGE', 'MODES'];
function renderTutorialStep(): void {
  document.querySelectorAll<HTMLElement>('[data-tutorial-step]').forEach((page) => {
    page.toggleAttribute('hidden', Number(page.dataset.tutorialStep) !== tutorialStep);
  });
  $('#tutorial-step-count').textContent = `${String(tutorialStep + 1).padStart(2, '0')} / 04`;
  $('#tutorial-step-label').textContent = tutorialLabels[tutorialStep];
  ($('#tutorial-progress-fill') as HTMLSpanElement).style.width = `${((tutorialStep + 1) / 4) * 100}%`;
  document.querySelectorAll<HTMLElement>('#tutorial-dots span').forEach((dot, index) => {
    dot.classList.toggle('active', index === tutorialStep);
    dot.classList.toggle('complete', index < tutorialStep);
  });
  ($('#tutorial-prev') as HTMLButtonElement).disabled = tutorialStep === 0;
  $('#tutorial-next').textContent = tutorialStep === 3 ? 'ホームへ進む →' : '次へ →';
}
function finishTutorial(): void {
  try { localStorage.setItem('key-bullet:tutorial-seen:v1', '1'); } catch { /* The guide remains available from Home. */ }
  showScreen('home');
}

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
pageMain.insertBefore(tutorialScreen, homeScreen);
pageMain.insertBefore(menuScreen, siteFooter);
pageMain.insertBefore(gameScreen, siteFooter);
pageMain.insertBefore(resultPage, siteFooter);

const canvas = $('#game-canvas') as HTMLCanvasElement;
const audio = new AudioSystem();
let selectedGenre: Genre = 'random';
let prompt: TypingPrompt | null = null;
let currentPhase: GamePhase = 'ended';
let currentMode: 'STORY' | 'ENDLESS' = 'STORY';
let currentDifficulty: GameDifficulty = (() => {
  try { return localStorage.getItem('key-bullet:difficulty') === 'easy' ? 'easy' : 'normal'; }
  catch { return 'normal'; }
})();
let furiganaEnabled = (() => {
  try { return localStorage.getItem('key-bullet:furigana') !== 'off'; }
  catch { return true; }
})();
let onlineMatchMode: 'pvp' | 'raid' | null = null;
let adminAssistAccess = false;
let adminAutoTyping = false;
let adminAutoDodge = false;
let autoTypingInterval = 0;
let autoTypingSubmitTimer = 0;
let autoTypingInProgress = false;
let phaseStartedAt = 0;
let clockFrame = 0;
let previousInputValue = '';
let isImeComposing = false;
let suppressImeEnterSubmit = false;
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


function renderDifficultySelection(): void {
  const normal = $('#difficulty-normal');
  const easy = $('#difficulty-easy');
  normal.classList.toggle('selected', currentDifficulty === 'normal');
  easy.classList.toggle('selected', currentDifficulty === 'easy');
  normal.setAttribute('aria-pressed', String(currentDifficulty === 'normal'));
  easy.setAttribute('aria-pressed', String(currentDifficulty === 'easy'));
  $('#difficulty-description').textContent = currentDifficulty === 'easy'
    ? '敵弾が少なく遅い、残機5・ボム4の超かんたん設定。'
    : '通常の難易度でプレイします。';
}

function renderPromptDisplay(): void {
  if (!prompt) return;
  const display = $('#prompt-display');
  renderPromptWithFurigana(display, prompt.display, furiganaEnabled && !prompt.isCode);
  display.classList.toggle('code-prompt', Boolean(prompt.isCode));
  const toggle = $('#furigana-toggle') as HTMLButtonElement;
  toggle.hidden = Boolean(prompt.isCode);
  toggle.textContent = furiganaEnabled ? 'ふりがな ON' : 'ふりがな OFF';
  toggle.setAttribute('aria-pressed', String(furiganaEnabled));
}

function stopAutoTyping(): void {
  if (autoTypingInterval) window.clearInterval(autoTypingInterval);
  if (autoTypingSubmitTimer) window.clearTimeout(autoTypingSubmitTimer);
  autoTypingInterval = 0;
  autoTypingSubmitTimer = 0;
  autoTypingInProgress = false;
}

function startAutoTyping(): void {
  stopAutoTyping();
  if (!adminAssistAccess || !adminAutoTyping || onlineMatchMode || !prompt || currentPhase !== 'typing') return;

  const targetPrompt = prompt;
  const characters = Array.from(targetPrompt.answers[0] ?? '');
  if (characters.length === 0) return;
  const input = $('#typing-input') as HTMLInputElement;
  if (input.value.length > 0) return;
  $('#typing-feedback').textContent = 'ADMIN AUTO INPUT / 正解を自動入力しています。';
  let position = 0;
  autoTypingInProgress = true;

  autoTypingInterval = window.setInterval(() => {
    if (
      !adminAssistAccess ||
      !adminAutoTyping ||
      onlineMatchMode ||
      prompt !== targetPrompt ||
      currentPhase !== 'typing' ||
      !lastSnapshot?.active
    ) {
      stopAutoTyping();
      return;
    }

    position = Math.min(characters.length, position + 1);
    input.value = characters.slice(0, position).join('');
    input.dispatchEvent(new Event('input', { bubbles: true }));

    if (position >= characters.length) {
      if (autoTypingInterval) window.clearInterval(autoTypingInterval);
      autoTypingInterval = 0;
      autoTypingInProgress = false;
      autoTypingSubmitTimer = window.setTimeout(() => {
        autoTypingSubmitTimer = 0;
        if (adminAssistAccess && adminAutoTyping && !onlineMatchMode && prompt === targetPrompt && currentPhase === 'typing') {
          ($('#typing-form') as HTMLFormElement).requestSubmit();
        }
      }, 120);
    }
  }, 42);
}

function setupNewPrompt(): void {
  stopAutoTyping();
  prompt = getPrompt(selectedGenre);
  phaseStartedAt = performance.now();
  previousInputValue = '';
  isImeComposing = false;
  suppressImeEnterSubmit = false;
  missCount = 0;
  $('#prompt-title').textContent = prompt.title;
  $('#prompt-genre').textContent = getGenreLabel(prompt.genre);
  renderPromptDisplay();
  $('#prompt-note').textContent = prompt.note;
  const typingInput = $('#typing-input') as HTMLInputElement;
  typingInput.value = '';
  typingInput.lang = prompt.isCode ? 'en' : 'ja';
  typingInput.placeholder = prompt.isCode ? 'コードを入力して Enter で発射' : '表示された日本語を入力して Enter で発射';
  typingInput.closest<HTMLElement>('.input-wrap')?.classList.remove('has-error');
  $('#typing-feedback').classList.remove('is-error');
  $('#prompt-note').textContent = prompt.isCode ? prompt.note : `${prompt.note} 日本語IMEで漢字・かなに変換して入力。`;
  typingInput.removeAttribute('disabled');
  $('#fire-button').removeAttribute('disabled');
  $('#input-ready').textContent = 'READY';
  $('#metric-wpm').textContent = '—';
  $('#metric-accuracy').textContent = '—';
  $('#metric-power').textContent = '—';
  $('#metric-misses').textContent = '00';
  updateTypingPanelState();
  requestAnimationFrame(() => $('#typing-input').focus());
  if (adminAssistAccess && adminAutoTyping && !onlineMatchMode) {
    window.setTimeout(startAutoTyping, 280);
  }
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
  const typedLength = Array.from(normalizeTyping(inputValue, Boolean(prompt.isCode))).length;
  const accuracy = typedLength === 0 ? 100 : Math.max(0, Math.min(100, ((typedLength - missCount) / typedLength) * 100));
  const speed = typedLength / elapsed;
  const power = Math.max(0.65, Math.min(3.4, 0.65 + speed * 0.34 + (accuracy / 100) * 1.55));
  return { accuracy, speed, power, correct: isAnswerCorrect(inputValue, prompt.answers, Boolean(prompt.isCode)) };
}

function updateTypingInput(): void {
  if (!prompt || currentPhase !== 'typing' || isImeComposing) return;
  const input = $('#typing-input') as HTMLInputElement;
  const value = input.value;
  const isCode = Boolean(prompt.isCode);
  const newMistakes = countNewMistakes(previousInputValue, value, prompt.answers, isCode);

  // A committed typo adds one mistake when the input first leaves the valid-prefix path.
  // Keep the field red until the player edits it back to a valid prefix.
  if (newMistakes > 0) {
    missCount += newMistakes;
    game.addMistake();
    audio.play('error');
  } else if (value !== previousInputValue) {
    audio.play('type');
  }
  previousInputValue = value;

  // Calculate after updating the mistake count so the displayed accuracy is current.
  const metrics = calculateTyping(value);
  const prefixOk = hasPotentialPrefix(value, prompt.answers, isCode);

  $('#metric-wpm').textContent = String(Math.round(metrics.speed * 12));
  $('#metric-accuracy').textContent = `${Math.round(metrics.accuracy)}%`;
  $('#metric-power').textContent = `${metrics.power.toFixed(2)}x`;
  $('#metric-misses').textContent = String(missCount).padStart(2, '0');

  input.closest<HTMLElement>('.input-wrap')?.classList.toggle('has-error', !prefixOk);
  const feedback = $('#typing-feedback');
  feedback.classList.toggle('is-error', !prefixOk);
  feedback.textContent = !prefixOk
    ? '入力ミス：お題と違う文字があります。Backspaceで正しい位置まで戻して修正してください。'
    : metrics.correct
      ? 'INPUT COMPLETE — ENTER でショットを発射。'
      : '入力中… 日本語は変換を確定して続けてください。';
  $('#fire-button').classList.toggle('ready-to-fire', metrics.correct);
}

const typingInput = $('#typing-input') as HTMLInputElement;
typingInput.addEventListener('compositionstart', () => {
  isImeComposing = true;
  typingInput.closest<HTMLElement>('.input-wrap')?.classList.remove('has-error');
  const feedback = $('#typing-feedback');
  feedback.classList.remove('is-error');
  feedback.textContent = 'IME変換中…';
});
typingInput.addEventListener('compositionend', () => {
  isImeComposing = false;
  requestAnimationFrame(updateTypingInput);
});
typingInput.addEventListener('input', (event) => {
  const inputEvent = event as InputEvent;
  if (inputEvent.isTrusted && autoTypingInProgress) stopAutoTyping();
  if (isImeComposing || inputEvent.isComposing || inputEvent.inputType === 'insertCompositionText') return;
  updateTypingInput();
});

// Enter used to accept an IME candidate must never fire the in-game shot.
typingInput.addEventListener('keydown', (event) => {
  if (event.key === 'Enter' && (event.isComposing || isImeComposing || event.keyCode === 229)) {
    suppressImeEnterSubmit = true;
    requestAnimationFrame(() => { suppressImeEnterSubmit = false; });
  }
});

$('#typing-form').addEventListener('submit', (event) => {
  event.preventDefault();
  if (!prompt || currentPhase !== 'typing' || !lastSnapshot?.active) return;
  if (isImeComposing || suppressImeEnterSubmit) {
    suppressImeEnterSubmit = false;
    $('#typing-feedback').textContent = 'IME変換を確定してから、もう一度Enterを押してください。';
    return;
  }
  const value = ($('#typing-input') as HTMLInputElement).value;
  const metrics = calculateTyping(value);
  if (!metrics.correct) {
    const feedback = $('#typing-feedback');
    feedback.classList.add('is-error');
    feedback.textContent = '入力エラー：お題を最後まで正確に入力してください。';
    audio.play('error');
    return;
  }
  $('#typing-feedback').classList.remove('is-error');
  ($('#typing-input') as HTMLInputElement).closest<HTMLElement>('.input-wrap')?.classList.remove('has-error');
  const chars = Array.from(normalizeTyping(value, Boolean(prompt.isCode))).length;
  bestAccuracy = Math.max(bestAccuracy, metrics.accuracy);
  $('#metric-wpm').textContent = String(Math.round(metrics.speed * 12));
  $('#metric-accuracy').textContent = `${Math.round(metrics.accuracy)}%`;
  $('#metric-power').textContent = `${metrics.power.toFixed(2)}x`;
  game.fire(metrics.power, chars, metrics.accuracy);
  if (onlineMatchMode) {
    window.dispatchEvent(new CustomEvent('key-bullet:online-local-attack', {
      detail: { power: metrics.power, chars, accuracy: metrics.accuracy },
    }));
  }
  audio.play('shot');
});

function beginRun(mode: 'STORY' | 'ENDLESS', resume = false): void {
  currentMode = mode;
  stopAutoTyping();
  game.setOnlineMode(onlineMatchMode);
  game.setDifficulty(onlineMatchMode === null ? currentDifficulty : 'normal');
  game.setAutoDodgeEnabled(adminAssistAccess && adminAutoDodge && onlineMatchMode === null);
  $('#result-retry').toggleAttribute('hidden', onlineMatchMode !== null);
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
  if (onlineMatchMode) {
    const isRaidClear = onlineMatchMode === 'raid' && reason === 'clear';
    $('#result-overline').textContent = onlineMatchMode === 'raid' ? 'LINK RAID / RESULT' : 'PVP / RESULT';
    $('#result-title').textContent = isRaidClear ? 'RAID CLEAR' : reason === 'clear' ? 'SYSTEM CLEAR' : 'SIGNAL LOST';
    $('#result-description').textContent = isRaidClear
      ? '参加者全員でボスを撃破しました。βテストのご協力ありがとう！'
      : onlineMatchMode === 'pvp'
        ? '対戦が終了しました。次のテストではバランスを調整します。'
        : '戦闘不能になりました。チームの戦闘は続行できます。';
    $('#result-score').textContent = String(snapshot.score).padStart(6, '0');
    $('#result-graze').textContent = String(snapshot.grazes).padStart(4, '0');
    $('#result-stage').textContent = onlineMatchMode === 'raid' ? 'LINK RAID' : 'PVP';
    $('#result-retry').setAttribute('hidden', 'true');
    $('#result-menu').textContent = 'BACK TO MENU';
    showScreen('result');
    audio.play(isRaidClear ? 'clear' : 'hit');
    if (onlineMatchMode === 'pvp' && reason === 'gameover') {
      window.dispatchEvent(new Event('key-bullet:online-player-out'));
    }
    return;
  }
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
  $('#result-description').textContent = reason === 'clear' ? '全セグメントを突破。戦績を保存しました。' : '被弾回数が上限に到達。戦績を保存しました。';
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
  document.querySelectorAll<HTMLButtonElement>('.transfer-tab').forEach((tab) => tab.classList.toggle('active', tab.dataset.tab === mode));
  $('#transfer-export-fields').toggleAttribute('hidden', mode !== 'export');
  $('#transfer-import-fields').toggleAttribute('hidden', mode !== 'import');
  $('#transfer-action').textContent = mode === 'export' ? 'GENERATE CODE ↗' : 'RESTORE RECORD ↗';
  ($('#transfer-text') as HTMLTextAreaElement).value = '';
  $('#transfer-message').textContent = mode === 'export'
    ? (loadUserProfile() ? 'パスコードを入力して暗号化コードを作成してください。' : '先にPROFILEからユーザー名とパスコードを設定してください。')
    : '引き継ぎコードと、ユーザー名またはパスコードのどちらか一つを入力してください。';
}

function openTransfer(): void {
  $('#transfer-modal').removeAttribute('hidden');
  setTransferMode('export');
}

function renderProfile(): void {
  const profile = loadUserProfile();
  $('#profile-label').textContent = profile ? profile.username.slice(0, 9) : 'PROFILE';
  $('#profile-username').setAttribute('placeholder', profile ? profile.username : 'プレイヤー名');
}

function openProfile(): void {
  const profile = loadUserProfile();
  ($('#profile-username') as HTMLInputElement).value = profile?.username ?? '';
  ($('#profile-passcode') as HTMLInputElement).value = '';
  ($('#profile-confirm') as HTMLInputElement).value = '';
  $('#profile-message').textContent = profile
    ? '新しいユーザー名とパスコードを入力して更新できます。'
    : 'ユーザー名とパスコードを設定してください。';
  $('#profile-modal').removeAttribute('hidden');
}

$('#profile-open').addEventListener('click', openProfile);
$('#profile-close').addEventListener('click', () => $('#profile-modal').setAttribute('hidden', 'true'));
$('#profile-save').addEventListener('click', async () => {
  const username = ($('#profile-username') as HTMLInputElement).value.trim();
  const passcode = ($('#profile-passcode') as HTMLInputElement).value;
  const confirm = ($('#profile-confirm') as HTMLInputElement).value;
  if (passcode !== confirm) {
    $('#profile-message').textContent = '確認用パスコードが一致しません。';
    return;
  }
  try {
    await saveUserProfile(username, passcode);
    renderProfile();
    $('#profile-message').textContent = 'プロフィールを保存しました。パスコードそのものは端末に保存していません。';
    ($('#profile-passcode') as HTMLInputElement).value = '';
    ($('#profile-confirm') as HTMLInputElement).value = '';
  } catch (error) {
    $('#profile-message').textContent = error instanceof Error ? error.message : 'プロフィールを保存できませんでした。';
  }
});

$('#tutorial-prev').addEventListener('click', () => {
  tutorialStep = Math.max(0, tutorialStep - 1);
  renderTutorialStep();
});
$('#tutorial-next').addEventListener('click', () => {
  if (tutorialStep >= 3) {
    finishTutorial();
    return;
  }
  tutorialStep += 1;
  renderTutorialStep();
});
$('#tutorial-skip').addEventListener('click', finishTutorial);
$('#home-tutorial-open').addEventListener('click', () => {
  tutorialStep = 0;
  renderTutorialStep();
  showScreen('tutorial');
});
$('#home-play').addEventListener('click', () => showScreen('menu'));
$('#home-record-open').addEventListener('click', openRecordModal);
$('#menu-home').addEventListener('click', () => showScreen('home'));
$('#game-menu').addEventListener('click', () => {
  stopAutoTyping();
  window.dispatchEvent(new Event('key-bullet:online-match-exit'));
  onlineMatchMode = null;
  game.setOnlineMode(null);
  game.stop();
  currentPhase = 'ended';
  updateTypingPanelState();
  $('#system-status').textContent = 'SYSTEM STANDBY';
  showScreen('home');
});
$('#difficulty-normal').addEventListener('click', () => {
  currentDifficulty = 'normal';
  try { localStorage.setItem('key-bullet:difficulty', currentDifficulty); } catch { /* Setting remains active for this session. */ }
  renderDifficultySelection();
});
$('#difficulty-easy').addEventListener('click', () => {
  currentDifficulty = 'easy';
  try { localStorage.setItem('key-bullet:difficulty', currentDifficulty); } catch { /* Setting remains active for this session. */ }
  renderDifficultySelection();
});
$('#furigana-toggle').addEventListener('click', () => {
  furiganaEnabled = !furiganaEnabled;
  try { localStorage.setItem('key-bullet:furigana', furiganaEnabled ? 'on' : 'off'); } catch { /* Setting remains active for this session. */ }
  renderPromptDisplay();
});
renderDifficultySelection();

$('#story-start').addEventListener('click', () => beginRun('STORY'));
$('#endless-start').addEventListener('click', () => beginRun('ENDLESS'));
$('#endless-continue').addEventListener('click', () => beginRun('ENDLESS', true));
$('#result-retry').addEventListener('click', () => beginRun(currentMode));
$('#result-menu').addEventListener('click', () => {
  stopAutoTyping();
  window.dispatchEvent(new Event('key-bullet:online-match-exit'));
  onlineMatchMode = null;
  game.setOnlineMode(null);
  $('#result-retry').removeAttribute('hidden');
  $('#result-menu').textContent = 'BACK TO MENU';
  game.stop();
  $('#system-status').textContent = 'SYSTEM STANDBY';
  currentPhase = 'ended';
  updateTypingPanelState();
  showScreen('home');
});

document.querySelectorAll<HTMLButtonElement>('.genre-chip').forEach((button) => {
  button.addEventListener('click', () => {
    selectedGenre = button.dataset.genre as Genre;
    document.querySelectorAll('.genre-chip').forEach((chip) => chip.classList.remove('selected'));
    button.classList.add('selected');
    $('#genre-state').textContent = getGenreLabel(selectedGenre);
    if (currentPhase === 'typing' && lastSnapshot?.active) setupNewPrompt();
  });
});

$('#sound-toggle').addEventListener('click', () => {
  audio.setMuted(!audio.isMuted);
  $('#sound-icon').textContent = audio.isMuted ? '×' : '♪';
  $('#sound-toggle').classList.toggle('muted', audio.isMuted);
});
$('#stats-open').addEventListener('click', openRecordModal);
$('#archive-close').addEventListener('click', () => $('#record-modal').setAttribute('hidden', 'true'));
$('#transfer-open').addEventListener('click', openTransfer);
$('#transfer-close').addEventListener('click', () => $('#transfer-modal').setAttribute('hidden', 'true'));
$('#archive-copy').addEventListener('click', async () => {
  const s = loadStats();
  const text = `KEY BULLET CAREER RECORD\nRuns: ${s.totalRuns}\nStory Clears: ${s.storyClears}\nEndless Best Wave: ${s.endlessBestWave}\nTotal Score: ${s.totalScore}\nTotal Graze: ${s.totalGrazes}\nBest Accuracy: ${s.bestAccuracy.toFixed(1)}%`;
  try {
    await navigator.clipboard.writeText(text);
    $('#archive-copy').textContent = 'COPIED ✓';
  } catch {
    $('#archive-copy').textContent = 'COPY BLOCKED';
  }
});

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

window.addEventListener('key-bullet:online-start', (event) => {
  const detail = (event as CustomEvent<{ mode: 'pvp' | 'raid' }>).detail;
  if (!detail || !['pvp', 'raid'].includes(detail.mode)) return;
  stopAutoTyping();
  game.setAutoDodgeEnabled(false);
  onlineMatchMode = detail.mode;
  beginRun('STORY');
  if (detail.mode === 'raid') game.setOnlineBossHp(1400, 1400);
  $('#typing-feedback').textContent = detail.mode === 'pvp'
    ? 'PVP開始！ お題を正確に入力して攻撃。相手の攻撃を3回受けると敗北。'
    : 'LINK RAID開始！ 全員のタイピング攻撃で共有ボスHPを削ろう。';
});

window.addEventListener('key-bullet:online-pvp-hit', () => {
  if (onlineMatchMode === 'pvp') game.applyOnlineHit();
});

window.addEventListener('key-bullet:online-raid-state', (event) => {
  if (onlineMatchMode !== 'raid') return;
  const detail = (event as CustomEvent<{ hp: number; maxHp: number }>).detail;
  if (detail && Number.isFinite(detail.hp)) game.setOnlineBossHp(detail.hp, detail.maxHp);
});

window.addEventListener('key-bullet:online-result', (event) => {
  const detail = (event as CustomEvent<{ result: string; mode?: string }>).detail;
  if (!detail || !['win', 'lose', 'raid-clear'].includes(detail.result)) return;
  if (detail.result === 'raid-clear' && onlineMatchMode === 'raid' && lastSnapshot?.active) {
    game.setOnlineBossHp(0, 1400);
  } else if (detail.result !== 'raid-clear') {
    game.stop();
  }
  const snapshot = game.getSnapshot();
  $('#result-overline').textContent = detail.result === 'raid-clear' ? 'LINK RAID / RESULT' : 'PVP / RESULT';
  $('#result-title').textContent = detail.result === 'raid-clear' ? 'RAID CLEAR' : detail.result === 'win' ? 'VICTORY' : 'DEFEAT';
  $('#result-description').textContent = detail.result === 'raid-clear'
    ? 'チーム全員でボスを撃破しました。'
    : detail.result === 'win' ? '対戦相手のライフがなくなりました。' : 'ライフがなくなりました。次の対戦で再挑戦しよう。';
  $('#result-score').textContent = String(snapshot.score).padStart(6, '0');
  $('#result-graze').textContent = String(snapshot.grazes).padStart(4, '0');
  $('#result-stage').textContent = detail.result === 'raid-clear' ? 'LINK RAID' : 'PVP';
  $('#result-retry').setAttribute('hidden', 'true');
  $('#result-menu').textContent = 'BACK TO MENU';
  currentPhase = 'ended';
  updateTypingPanelState();
  showScreen('result');
  onlineMatchMode = null;
  game.setOnlineMode(null);
  game.setAutoDodgeEnabled(adminAssistAccess && adminAutoDodge);
});

window.addEventListener('key-bullet:admin-access', (event) => {
  const detail = (event as CustomEvent<{ enabled?: boolean }>).detail;
  adminAssistAccess = detail?.enabled === true;
  if (!adminAssistAccess) {
    adminAutoTyping = false;
    adminAutoDodge = false;
    stopAutoTyping();
  }
  game.setAutoDodgeEnabled(adminAssistAccess && adminAutoDodge && onlineMatchMode === null);
});

window.addEventListener('key-bullet:admin-assist', (event) => {
  if (!adminAssistAccess) return;
  const detail = (event as CustomEvent<{ autoTyping?: boolean; autoDodge?: boolean }>).detail;
  adminAutoTyping = detail?.autoTyping === true;
  adminAutoDodge = detail?.autoDodge === true;
  if (onlineMatchMode) {
    stopAutoTyping();
    game.setAutoDodgeEnabled(false);
    return;
  }
  game.setAutoDodgeEnabled(adminAutoDodge);
  if (adminAutoTyping && currentPhase === 'typing' && lastSnapshot?.active) {
    startAutoTyping();
  } else if (!adminAutoTyping) {
    stopAutoTyping();
  }
});

initializeCloudAccount();
renderCareer();
renderProfile();
updateContinueButton();
updateTypingPanelState();
updateClock();
renderTutorialStep();
try {
  showScreen(localStorage.getItem('key-bullet:tutorial-seen:v1') === '1' ? 'home' : 'tutorial');
} catch {
  showScreen('tutorial');
}

window.addEventListener('beforeunload', () => {
  cancelAnimationFrame(clockFrame);
  game.destroy();
  audio.destroy();
});
