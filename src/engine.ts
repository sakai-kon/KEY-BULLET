import { PLAYER_SPRITE, drawPixelSprite } from './pixel';
import type { Genre } from './data';

export type GameMode = 'STORY' | 'ENDLESS';
export type GamePhase = 'typing' | 'bullet' | 'ended';
export type GameDifficulty = 'normal' | 'easy';
export type EndReason = 'clear' | 'gameover';

export interface GameSnapshot {
  active: boolean;
  mode: GameMode;
  phase: GamePhase;
  stage: number;
  wave: number;
  segment: number;
  segments: number;
  hp: number;
  hpMax: number;
  lives: number;
  bombs: number;
  score: number;
  grazes: number;
  danger: number;
  timeLeft: number;
  power: number;
  form: number;
  reason: EndReason | null;
}

interface Bullet {
  x: number;
  y: number;
  vx: number;
  vy: number;
  r: number;
  grazed: boolean;
}
interface Particle { x: number; y: number; vx: number; vy: number; life: number; maxLife: number; color: string; size: number; }
interface Star { x: number; y: number; speed: number; alpha: number; size: number; }

const WIDTH = 960;
const HEIGHT = 540;
const SEGMENTS = 3;
const SEGMENT_HP = 100;

export class GameEngine {
  private ctx: CanvasRenderingContext2D;
  private frame = 0;
  private lastTime = 0;
  private raf = 0;
  private uiTimer = 0;
  private active = false;
  private mode: GameMode = 'STORY';
  private difficulty: GameDifficulty = 'normal';
  private phase: GamePhase = 'typing';
  private stage = 1;
  private wave = 1;
  private segment = 1;
  private segments = SEGMENTS;
  private hp = SEGMENT_HP;
  private hpMax = SEGMENT_HP;
  private lives = 3;
  private bombs = 2;
  private score = 0;
  private grazes = 0;
  private danger = 0;
  private phaseElapsed = 0;
  private power = 1.4;
  private accuracy = 100;
  private typingChars = 0;
  private spawnTimer = 0;
  private barrageIndex = 0;
  private shotTimer = 0;
  private invulnerable = 0;
  private bombFlash = 0;
  private clearFlash = 0;
  private hitFlash = 0;
  private screenShake = 0;
  private reason: EndReason | null = null;
  private bullets: Bullet[] = [];
  private particles: Particle[] = [];
  private stars: Star[] = [];
  private keys = new Set<string>();
  private player = { x: WIDTH / 2, y: HEIGHT - 92, radius: 5 };
  private dragActive = false;
  private onlineMode: 'pvp' | 'raid' | null = null;
  private autoDodgeEnabled = false;
  private autoDodgeDecisionTimer = 0;
  private autoDodgeDirection = { x: 0, y: 0 };
  private onChange: (snapshot: GameSnapshot) => void;
  private onPhase: (phase: GamePhase) => void;
  private onEnd: (reason: EndReason) => void;
  private onWaveClear: (snapshot: GameSnapshot) => void;
  private onSegmentClear: () => void;

  constructor(
    private canvas: HTMLCanvasElement,
    callbacks: {
      onChange: (snapshot: GameSnapshot) => void;
      onPhase: (phase: GamePhase) => void;
      onEnd: (reason: EndReason) => void;
      onWaveClear: (snapshot: GameSnapshot) => void;
      onSegmentClear: () => void;
    },
  ) {
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Canvas 2D context is not available.');
    this.ctx = ctx;
    this.onChange = callbacks.onChange;
    this.onPhase = callbacks.onPhase;
    this.onEnd = callbacks.onEnd;
    this.onWaveClear = callbacks.onWaveClear;
    this.onSegmentClear = callbacks.onSegmentClear;
    canvas.width = WIDTH;
    canvas.height = HEIGHT;
    this.ctx.imageSmoothingEnabled = false;
    // A much denser starfield, with a few larger points for depth.
    this.stars = Array.from({ length: 210 }, () => ({
      x: Math.random() * WIDTH, y: Math.random() * HEIGHT,
      speed: 7 + Math.random() * 22,
      alpha: 0.09 + Math.random() * 0.43,
      size: Math.random() > 0.978 ? 3 : Math.random() > 0.76 ? 2 : 1,
    }));
    this.raf = requestAnimationFrame(this.loop);
  }

  private get isEasyMode(): boolean { return this.difficulty === 'easy' && this.onlineMode === null; }
  private get phaseDuration(): number { return this.isEasyMode ? 12 : 20; }
  private get maxLives(): number { return this.isEasyMode ? 9 : 3; }
  private get maxBombs(): number { return this.isEasyMode ? 6 : 3; }

  getSnapshot(): GameSnapshot {
    return {
      active: this.active, mode: this.mode, phase: this.phase, stage: this.stage,
      wave: this.wave, segment: this.segment, segments: this.segments,
      hp: this.hp, hpMax: this.hpMax, lives: this.lives, bombs: this.bombs,
      score: this.score, grazes: this.grazes, danger: this.danger,
      timeLeft: Math.max(0, this.phaseDuration - this.phaseElapsed), power: this.power,
      form: this.hp <= 34 ? 2 : this.hp <= 67 ? 1 : 0, reason: this.reason,
    };
  }

  start(mode: GameMode, resume?: { wave: number; score: number; lives: number; bombs: number }): void {
    this.mode = mode;
    this.active = true;
    this.phase = 'typing';
    this.stage = 1;
    this.wave = resume?.wave ?? 1;
    this.segment = 1;
    this.segments = this.onlineMode === 'raid' ? 1 : mode === 'STORY' ? 3 : 2;
    this.hpMax = SEGMENT_HP;
    this.hp = SEGMENT_HP;
    this.lives = this.isEasyMode ? this.maxLives : resume?.lives ?? 3;
    this.bombs = this.isEasyMode ? this.maxBombs : resume?.bombs ?? 2;
    this.score = resume?.score ?? 0;
    this.grazes = 0;
    this.danger = 0;
    this.phaseElapsed = 0;
    this.power = 1.4;
    this.accuracy = 100;
    this.typingChars = 0;
    this.spawnTimer = this.isEasyMode ? 1.5 : 0.25;
    this.barrageIndex = 0;
    this.shotTimer = 0;
    this.invulnerable = 0;
    this.reason = null;
    this.bullets = [];
    this.particles = [];
    this.player = { x: WIDTH / 2, y: HEIGHT - 92, radius: 5 };
    this.setPhase('typing');
    this.notify();
  }

  stop(): void {
    this.active = false;
    this.phase = 'ended';
    this.bullets = [];
    this.setPhase('ended');
  }

  setOnlineMode(mode: 'pvp' | 'raid' | null): void {
    this.onlineMode = mode;
    if (mode !== null) {
      this.difficulty = 'normal';
      this.setAutoDodgeEnabled(false);
    }
  }

  setDifficulty(difficulty: GameDifficulty): void {
    this.difficulty = this.onlineMode === null ? difficulty : 'normal';
  }

  setAutoDodgeEnabled(enabled: boolean): void {
    this.autoDodgeEnabled = enabled;
    this.autoDodgeDecisionTimer = 0;
    this.autoDodgeDirection = { x: 0, y: 0 };
  }

  setOnlineBossHp(hp: number, hpMax = 1400): void {
    if (this.onlineMode !== 'raid' || !this.active) return;
    this.hpMax = Math.max(1, hpMax);
    this.hp = Math.max(0, Math.min(this.hpMax, hp));
    if (this.hp <= 0) {
      this.finish('clear');
      return;
    }
    this.notify();
  }

  applyOnlineHit(): void {
    if (this.onlineMode !== 'pvp' || !this.active) return;
    this.lives = Math.max(0, this.lives - 1);
    this.invulnerable = 0.65;
    this.hitFlash = 0.28;
    this.screenShake = Math.max(this.screenShake, 7);
    this.spawnParticles(this.player.x, this.player.y, 18, '#FF2A5F');
    if (this.lives <= 0) {
      this.finish('gameover');
      return;
    }
    this.notify();
  }

  addMistake(): void {
    if (!this.active || this.phase !== 'typing') return;
    this.danger = Math.min(this.isEasyMode ? 2 : 12, this.danger + 1);
    this.spawnParticles(this.bossX(), this.bossY(), 4, '#FF2A5F');
    this.notify();
  }

  fire(power: number, chars: number, accuracy: number): void {
    if (!this.active || this.phase !== 'typing') return;
    this.power = Math.max(0.65, Math.min(3.4, power));
    this.typingChars = chars;
    this.accuracy = accuracy;
    this.score += Math.round(chars * 8 * (accuracy / 100) * this.power);
    this.phaseElapsed = 0;
    this.spawnTimer = this.isEasyMode ? 1.5 : 0.25;
    this.shotTimer = 0;
    this.setPhase('bullet');
    this.spawnParticles(this.player.x, this.player.y - 20, 12, '#00F0FF');
    this.notify();
  }

  handleKey(key: string, down: boolean): void {
    const normalized = key.toLowerCase();
    if (down) this.keys.add(normalized);
    else this.keys.delete(normalized);
  }

  useBomb(): boolean {
    if (!this.active || this.phase !== 'bullet' || this.bombs <= 0) return false;
    this.bombs--;
    this.bullets = [];
    this.bombFlash = 0.78;
    this.screenShake = Math.max(this.screenShake, 10);
    this.invulnerable = Math.max(this.invulnerable, 1.25);
    this.score += 250;
    this.spawnParticles(this.player.x, this.player.y, 34, '#00F0FF');
    this.notify();
    return true;
  }

  setDragActive(active: boolean): void { this.dragActive = active; }

  moveBy(dx: number, dy: number): void {
    if (!this.active || this.phase !== 'bullet' || !this.dragActive) return;
    this.player.x = Math.max(18, Math.min(WIDTH - 18, this.player.x + dx));
    this.player.y = Math.max(170, Math.min(HEIGHT - 20, this.player.y + dy));
  }

  destroy(): void {
    cancelAnimationFrame(this.raf);
    cancelAnimationFrame(this.uiTimer);
  }

  private loop = (time: number): void => {
    const dt = this.lastTime ? Math.min(0.034, (time - this.lastTime) / 1000) : 0;
    this.lastTime = time;
    this.frame += dt;
    if (this.active) this.update(dt);
    this.render();
    if (time - this.uiTimer > 120) {
      this.uiTimer = time;
      this.notify();
    }
    this.raf = requestAnimationFrame(this.loop);
  };

  private update(dt: number): void {
    this.stars.forEach((star) => {
      star.y += star.speed * dt;
      if (star.y > HEIGHT) { star.y = -4; star.x = Math.random() * WIDTH; }
    });
    this.particles = this.particles.filter((p) => {
      p.x += p.vx * dt; p.y += p.vy * dt; p.life -= dt;
      return p.life > 0;
    });
    this.bombFlash = Math.max(0, this.bombFlash - dt);
    this.clearFlash = Math.max(0, this.clearFlash - dt);
    this.hitFlash = Math.max(0, this.hitFlash - dt);
    this.invulnerable = Math.max(0, this.invulnerable - dt);
    this.screenShake = Math.max(0, this.screenShake - dt * 22);
    if (this.phase !== 'bullet') return;

    this.phaseElapsed += dt;
    const slow = this.keys.has('shift');
    let speed = this.isEasyMode ? (slow ? 125 : 250) : (slow ? 118 : 275);
    let dx = 0; let dy = 0;

    if (this.autoDodgeEnabled && this.onlineMode === null) {
      this.autoDodgeDecisionTimer -= dt;
      if (this.autoDodgeDecisionTimer <= 0) {
        this.autoDodgeDirection = this.chooseAutoDodgeDirection();
        this.autoDodgeDecisionTimer = 0.14;
      }
      dx = this.autoDodgeDirection.x;
      dy = this.autoDodgeDirection.y;
      speed = 275;
    } else {
      if (this.keys.has('arrowleft') || this.keys.has('a')) dx--;
      if (this.keys.has('arrowright') || this.keys.has('d')) dx++;
      if (this.keys.has('arrowup') || this.keys.has('w')) dy--;
      if (this.keys.has('arrowdown') || this.keys.has('s')) dy++;
    }

    if (dx !== 0 && dy !== 0) { dx *= 0.707; dy *= 0.707; }
    this.player.x = Math.max(18, Math.min(WIDTH - 18, this.player.x + dx * speed * dt));
    this.player.y = Math.max(170, Math.min(HEIGHT - 20, this.player.y + dy * speed * dt));

    this.spawnTimer -= dt;
    if (this.spawnTimer <= 0) {
      this.spawnBarrage();
      this.spawnTimer = this.isEasyMode
        ? Math.max(1.35, 1.8 - this.danger * 0.08)
        : Math.max(0.32, 0.7 - this.danger * 0.025);
    }

    // Fire visible projectiles from the player's ship toward the boss.
    this.shotTimer += dt;
    const fireInterval = Math.max(0.075, 0.2 - this.power * 0.027);
    while (this.shotTimer >= fireInterval) {
      this.shotTimer -= fireInterval;
      if (this.onlineMode === null) this.hp -= (1.3 + this.power * 1.6) * fireInterval * (this.isEasyMode ? 1.7 : 1);
      this.score += 1;

      const originX = this.player.x;
      const originY = this.player.y - 13;
      const targetX = this.bossX();
      const targetY = this.bossY() + 28;
      const aim = Math.atan2(targetY - originY, targetX - originX);
      const shotSpeed = 660;
      for (const spread of [-0.035, 0.035]) {
        const angle = aim + spread;
        this.particles.push({
          x: originX + Math.cos(angle) * 8,
          y: originY + Math.sin(angle) * 8,
          vx: Math.cos(angle) * shotSpeed,
          vy: Math.sin(angle) * shotSpeed,
          life: 0.42,
          maxLife: 0.42,
          color: '#00F0FF',
          size: 3 + this.power,
        });
      }
    }

    this.updateBullets(dt);
    if (this.hp <= 0) {
      this.hp = 0;
      this.completeSegment();
      return;
    }
    if (this.phaseElapsed >= this.phaseDuration) {
      this.danger = Math.max(0, this.danger - 1);
      this.bullets = [];
      this.setPhase('typing');
    }
  }

  private chooseAutoDodgeDirection(): { x: number; y: number } {
    if (this.bullets.length === 0) return { x: 0, y: 0 };

    const directions: { x: number; y: number }[] = [
      { x: 0, y: 0 },
      ...Array.from({ length: 16 }, (_, index) => {
        const angle = (Math.PI * 2 * index) / 16;
        return { x: Math.cos(angle), y: Math.sin(angle) };
      }),
    ];
    const horizonSteps = 6;
    const stepTime = 0.12;
    const moveSpeed = 275;
    const safeDistance = 52;
    let bestDirection = directions[0];
    let bestRisk = Number.POSITIVE_INFINITY;

    for (const direction of directions) {
      let risk = 0;

      for (let step = 1; step <= horizonSteps; step++) {
        const time = step * stepTime;
        const candidateX = Math.max(18, Math.min(WIDTH - 18, this.player.x + direction.x * moveSpeed * time));
        const candidateY = Math.max(170, Math.min(HEIGHT - 20, this.player.y + direction.y * moveSpeed * time));
        const futureWeight = 1 / (0.65 + time);

        for (const bullet of this.bullets) {
          const bulletX = bullet.x + bullet.vx * time;
          const bulletY = bullet.y + bullet.vy * time;
          const distance = Math.hypot(candidateX - bulletX, candidateY - bulletY);
          const danger = Math.max(0, safeDistance - distance);
          if (danger > 0) risk += danger * danger * futureWeight;
        }
      }

      const edgeX = Math.min(this.player.x + direction.x * moveSpeed * 0.45, WIDTH - 18 - (this.player.x + direction.x * moveSpeed * 0.45));
      const edgeY = Math.min(this.player.y + direction.y * moveSpeed * 0.45 - 170, HEIGHT - 20 - (this.player.y + direction.y * moveSpeed * 0.45));
      risk += Math.max(0, 42 - edgeX) ** 2 * 0.08;
      risk += Math.max(0, 42 - edgeY) ** 2 * 0.08;

      // Prefer staying still unless another path meaningfully reduces predicted danger.
      if (direction.x !== 0 || direction.y !== 0) risk += 2;

      if (risk < bestRisk) {
        bestRisk = risk;
        bestDirection = direction;
      }
    }

    return bestDirection;
  }

  private updateBullets(dt: number): void {
    const next: Bullet[] = [];
    for (const bullet of this.bullets) {
      bullet.x += bullet.vx * dt;
      bullet.y += bullet.vy * dt;
      if (bullet.x < -30 || bullet.x > WIDTH + 30 || bullet.y < -30 || bullet.y > HEIGHT + 30) continue;
      const distance = Math.hypot(bullet.x - this.player.x, bullet.y - this.player.y);
      const hitDistance = bullet.r + this.player.radius - (this.isEasyMode ? 3.2 : 0);
      if (distance < hitDistance && this.invulnerable <= 0) {
        this.lives--;
        this.invulnerable = this.isEasyMode ? 2.8 : 1.25;
        this.hitFlash = 0.28;
        this.screenShake = Math.max(this.screenShake, 7);
        this.spawnParticles(this.player.x, this.player.y, 18, '#FF2A5F');
        if (this.lives <= 0) { this.finish('gameover'); return; }
      } else if (distance < hitDistance + 13 && !bullet.grazed) {
        bullet.grazed = true;
        this.grazes++;
        this.score += 25;
      }
      next.push(bullet);
    }
    this.bullets = next;
  }

  private spawnBarrage(): void {
    const extra = Math.min(this.isEasyMode ? 4 : 9, this.danger);
    const pattern = this.barrageIndex++;
    const progression = this.mode === 'STORY' ? this.stage - 1 : Math.min(5, this.wave - 1);
    const baseCount = 8 + extra + Math.min(3, progression);
    const count = this.isEasyMode ? 3 + Math.min(1, Math.floor(progression / 2)) : baseCount;
    const bx = this.bossX();
    const by = this.bossY() + 16;
    const aimed = Math.atan2(this.player.y - by, this.player.x - bx);
    // The fan sweeps side to side and widens over the run, so the same corner is not
    // a permanently safe place. It still leaves temporary gaps for deliberate dodging.
    const sweep = Math.sin(pattern * 0.72) * 0.34;
    const spread = Math.min(2.7, 2.2 + progression * 0.08 + extra * 0.025);
    for (let i = 0; i < count; i++) {
      const t = count === 1 ? 0 : i / (count - 1) - 0.5;
      const angle = aimed + sweep + t * spread + Math.sin(this.frame * 2 + i) * 0.025;
      const velocity = (126 + (i % 3) * 15 + Math.min(40, extra * 3) + progression * 4) * (this.isEasyMode ? 0.42 : 1);
      this.bullets.push({ x: bx, y: by, vx: Math.cos(angle) * velocity, vy: Math.sin(angle) * velocity, r: i % 4 === 0 ? 6 : 4.4, grazed: false });
    }

    // Alternating flank shots pass through the outer lanes to discourage static corner camping.
    if (this.isEasyMode ? pattern % 7 === 6 : pattern % 2 === 1) {
      const laneY = 190 + ((pattern * 47) % 125);
      const flankSpeed = (150 + progression * 5 + Math.min(24, extra * 2)) * (this.isEasyMode ? 0.48 : 1);
      const downSpeed = 72 + (pattern % 3) * 12;
      this.bullets.push(
        { x: 18, y: laneY, vx: flankSpeed, vy: downSpeed, r: 4.2, grazed: false },
        { x: WIDTH - 18, y: laneY + 24, vx: -flankSpeed, vy: downSpeed, r: 4.2, grazed: false },
      );
    }

    if (extra > 0) this.danger = Math.max(0, this.danger - Math.ceil(extra / 2));
    this.spawnParticles(bx, by, 3, '#FF2A5F');
  }

  private completeSegment(): void {
    this.clearFlash = 0.8;
    this.screenShake = Math.max(this.screenShake, 5);
    this.bullets = [];
    this.score += 500 + this.stage * 100 + this.wave * 50;
    this.spawnParticles(this.bossX(), this.bossY(), 48, '#00F0FF');
    if (this.segment < this.segments) {
      this.segment++;
      this.hp = SEGMENT_HP;
      this.hpMax = SEGMENT_HP;
      this.danger = 0;
      this.phaseElapsed = 0;
      this.setPhase('typing');
      this.onSegmentClear();
      return;
    }

    if (this.mode === 'STORY') {
      if (this.stage >= 3) {
        this.finish('clear');
      } else {
        this.stage++;
        this.segment = 1;
        this.hp = SEGMENT_HP;
        this.hpMax = SEGMENT_HP;
        this.danger = 0;
        this.phaseElapsed = 0;
        this.lives = Math.min(this.maxLives, this.lives + 1);
        this.setPhase('typing');
        this.onSegmentClear();
      }
    } else {
      this.wave++;
      this.segment = 1;
      this.hp = SEGMENT_HP;
      this.hpMax = SEGMENT_HP;
      this.danger = 0;
      this.phaseElapsed = 0;
      this.lives = Math.min(this.maxLives, this.lives + 1);
      this.bombs = Math.min(this.maxBombs, this.bombs + 1);
      this.setPhase('typing');
      this.onWaveClear(this.getSnapshot());
      this.onSegmentClear();
    }
  }

  private finish(reason: EndReason): void {
    this.active = false;
    this.phase = 'ended';
    this.reason = reason;
    this.bullets = [];
    this.setPhase('ended');
    this.notify();
    this.onEnd(reason);
  }

  private setPhase(phase: GamePhase): void {
    this.phase = phase;
    this.phaseElapsed = 0;
    this.onPhase(phase);
  }

  private notify(): void { this.onChange(this.getSnapshot()); }

  private spawnParticles(x: number, y: number, count: number, color: string): void {
    for (let i = 0; i < count; i++) {
      const angle = Math.random() * Math.PI * 2;
      const speed = 24 + Math.random() * 150;
      const life = 0.22 + Math.random() * 0.55;
      this.particles.push({ x, y, vx: Math.cos(angle) * speed, vy: Math.sin(angle) * speed, life, maxLife: life, color, size: 1 + Math.random() * 3 });
    }
  }

  private bossX(): number { return WIDTH / 2; }
  private bossY(): number { return 115; }

  private render(): void {
    const ctx = this.ctx;
    ctx.clearRect(0, 0, WIDTH, HEIGHT);
    ctx.fillStyle = '#080C14';
    ctx.fillRect(0, 0, WIDTH, HEIGHT);
    this.drawBackground();

    // Shake only the action field; keeping the HUD steady prevents visual fatigue.
    if (this.screenShake > 0.1) {
      const shakeX = Math.sin(this.frame * 83) * this.screenShake;
      const shakeY = Math.cos(this.frame * 71) * this.screenShake * 0.55;
      ctx.save();
      ctx.translate(shakeX, shakeY);
    } else {
      ctx.save();
    }
    this.drawBoss();
    this.drawBarrageTelegraph();
    this.drawDangerOrbs();
    this.drawBullets();
    this.drawShots();
    this.drawPlayer();
    this.drawParticles();
    if (this.bombFlash > 0) this.drawBombEffect();
    ctx.restore();

    this.drawCanvasHud();
    if (this.hitFlash > 0) {
      ctx.fillStyle = `rgba(199,124,141,${this.hitFlash * 0.08})`;
      ctx.fillRect(0, 0, WIDTH, HEIGHT);
    }
  }

  private drawBackground(): void {
    const ctx = this.ctx;
    const space = ctx.createLinearGradient(0, 0, WIDTH * 0.18, HEIGHT);
    space.addColorStop(0, '#080D22');
    space.addColorStop(0.48, '#10102C');
    space.addColorStop(1, '#050916');
    ctx.fillStyle = space;
    ctx.fillRect(0, 0, WIDTH, HEIGHT);

    // Layered nebula clouds create depth while staying subtle behind gameplay.
    ctx.save();
    ctx.globalCompositeOperation = 'screen';
    const nebulae = [
      { x: 210, y: 150, rx: 290, ry: 180, color: 'rgba(66,87,174,.19)' },
      { x: 545, y: 115, rx: 260, ry: 145, color: 'rgba(103,54,151,.16)' },
      { x: 705, y: 400, rx: 310, ry: 170, color: 'rgba(31,104,139,.14)' },
      { x: 360, y: 430, rx: 270, ry: 120, color: 'rgba(49,67,133,.10)' },
    ];
    for (const cloud of nebulae) {
      ctx.save();
      ctx.translate(cloud.x, cloud.y);
      ctx.scale(1, cloud.ry / cloud.rx);
      const haze = ctx.createRadialGradient(0, 0, 0, 0, 0, cloud.rx);
      haze.addColorStop(0, cloud.color);
      haze.addColorStop(0.48, cloud.color.replace(/\.\d+\)$/, '.045)'));
      haze.addColorStop(1, 'rgba(10,16,38,0)');
      ctx.fillStyle = haze;
      ctx.beginPath();
      ctx.arc(0, 0, cloud.rx, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }
    ctx.restore();

    // A distant ringed planet gives the field a clear sense of scale.
    ctx.save();
    ctx.translate(806, 348);
    ctx.rotate(-0.24);
    ctx.strokeStyle = 'rgba(151,170,230,.13)';
    ctx.lineWidth = 10;
    ctx.beginPath();
    ctx.ellipse(0, 0, 180, 44, 0, Math.PI * 1.05, Math.PI * 1.95);
    ctx.stroke();
    const planet = ctx.createRadialGradient(-45, -55, 8, 0, 0, 145);
    planet.addColorStop(0, '#343B75');
    planet.addColorStop(0.52, '#1B2450');
    planet.addColorStop(1, '#0A102A');
    ctx.fillStyle = planet;
    ctx.beginPath();
    ctx.arc(0, 0, 118, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = 'rgba(166,183,239,.18)';
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    ctx.arc(0, 0, 118, -1.05, 1.2);
    ctx.stroke();
    ctx.strokeStyle = 'rgba(151,170,230,.18)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.ellipse(0, 0, 180, 44, 0, Math.PI * 0.04, Math.PI * 0.96);
    ctx.stroke();
    ctx.restore();

    // Fine star points and occasional cross-shaped stars.
    for (let i = 0; i < this.stars.length; i++) {
      const star = this.stars[i];
      const twinkle = 0.55 + Math.sin(this.frame * (1.7 + (i % 5) * 0.13) + star.x * 0.027) * 0.32;
      ctx.globalAlpha = star.alpha * twinkle;
      ctx.fillStyle = i % 9 === 0 ? '#D9E4FF' : '#B9D9F5';
      ctx.fillRect(star.x, star.y, star.size, star.size);
      if (i % 13 === 0) {
        ctx.globalAlpha *= 0.45;
        ctx.fillRect(star.x - 3, star.y + 0.5, star.size + 6, 1);
        ctx.fillRect(star.x + 0.5, star.y - 3, 1, star.size + 6);
      }
    }
    ctx.globalAlpha = 1;

    // A faint, slow-moving shooting star adds motion without resembling a bullet.
    const meteorCycle = (this.frame * 0.09) % 1;
    const meteorX = 110 + meteorCycle * 280;
    const meteorY = 70 + meteorCycle * 95;
    const meteor = ctx.createLinearGradient(meteorX - 34, meteorY - 18, meteorX, meteorY);
    meteor.addColorStop(0, 'rgba(190,205,255,0)');
    meteor.addColorStop(1, 'rgba(190,205,255,.28)');
    ctx.strokeStyle = meteor;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(meteorX - 34, meteorY - 18);
    ctx.lineTo(meteorX, meteorY);
    ctx.stroke();

    // Dark edge vignette preserves strong contrast for bullets and the player.
    const vignette = ctx.createRadialGradient(WIDTH / 2, HEIGHT / 2, 120, WIDTH / 2, HEIGHT / 2, 610);
    vignette.addColorStop(0, 'rgba(2,5,16,0)');
    vignette.addColorStop(1, 'rgba(2,5,16,.58)');
    ctx.fillStyle = vignette;
    ctx.fillRect(0, 0, WIDTH, HEIGHT);

    ctx.strokeStyle = 'rgba(146,173,221,.10)';
    ctx.lineWidth = 1;
    ctx.strokeRect(14, 14, WIDTH - 28, HEIGHT - 28);
  }

  private drawBoss(): void {
    if (!this.active && this.reason === 'clear') return;
    const hpRatio = this.hpMax > 100 ? this.hp / this.hpMax : this.hp / 100;
    const form = hpRatio <= 0.34 ? 2 : hpRatio <= 0.67 ? 1 : 0;
    const coreColor = form === 0 ? '#8DE4EA' : form === 1 ? '#B9A2FF' : '#FF8EAA';
    const edgeColor = form === 0 ? '#D6FAFF' : form === 1 ? '#E2D6FF' : '#FFD1DE';
    const deepColor = form === 0 ? '#244E70' : form === 1 ? '#49366F' : '#702F55';
    const pulse = 1 + Math.sin(this.frame * 3.4) * 0.045;
    const cx = this.bossX();
    const cy = this.bossY();
    const ctx = this.ctx;

    ctx.save();
    ctx.translate(cx, cy);

    // Slow orbital halo: an eerie geometric field surrounding the creature.
    ctx.save();
    ctx.rotate(this.frame * (form === 2 ? -0.19 : 0.13));
    ctx.strokeStyle = form === 0 ? 'rgba(141,228,234,.22)' : form === 1 ? 'rgba(185,162,255,.24)' : 'rgba(255,142,170,.24)';
    ctx.lineWidth = 1;
    ctx.setLineDash([13, 9, 3, 9]);
    ctx.beginPath();
    ctx.ellipse(0, 0, 117, 78, 0.08, 0, Math.PI * 2);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(0, 0, 89, this.frame * 0.22, this.frame * 0.22 + Math.PI * 1.32);
    ctx.stroke();
    for (let i = 0; i < 5; i++) {
      const angle = this.frame * (i % 2 === 0 ? 0.42 : -0.31) + (i / 5) * Math.PI * 2;
      const radiusX = 111 + (i % 2) * 10;
      const radiusY = 73 + (i % 2) * 8;
      const nodeX = Math.cos(angle) * radiusX;
      const nodeY = Math.sin(angle) * radiusY;
      ctx.globalAlpha = 0.55 + Math.sin(this.frame * 2.4 + i) * 0.2;
      ctx.fillStyle = edgeColor;
      ctx.shadowColor = coreColor;
      ctx.shadowBlur = 12;
      ctx.beginPath();
      ctx.arc(nodeX, nodeY, i === 0 ? 4 : 2.5, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();

    // Six blade-like organic limbs form an original, otherworldly silhouette.
    for (let i = 0; i < 6; i++) {
      ctx.save();
      const baseAngle = -Math.PI / 2 + (i / 6) * Math.PI * 2;
      const sway = Math.sin(this.frame * 1.8 + i * 1.7) * 0.075;
      ctx.rotate(baseAngle + sway);
      const reach = (form === 2 ? 1.12 : form === 1 ? 1.05 : 1) * pulse;
      ctx.scale(reach, reach);
      const limbGradient = ctx.createLinearGradient(0, -24, 0, -100);
      limbGradient.addColorStop(0, edgeColor);
      limbGradient.addColorStop(0.24, coreColor);
      limbGradient.addColorStop(1, deepColor);
      ctx.fillStyle = limbGradient;
      ctx.shadowColor = coreColor;
      ctx.shadowBlur = 13;
      ctx.beginPath();
      ctx.moveTo(-12, -25);
      ctx.bezierCurveTo(-32, -49, -25, -73, 0, -100);
      ctx.bezierCurveTo(25, -73, 32, -49, 12, -25);
      ctx.quadraticCurveTo(0, -34, -12, -25);
      ctx.closePath();
      ctx.fill();
      ctx.shadowBlur = 0;
      ctx.strokeStyle = 'rgba(237,250,255,.52)';
      ctx.lineWidth = 1.25;
      ctx.beginPath();
      ctx.moveTo(0, -34);
      ctx.quadraticCurveTo(Math.sin(this.frame * 1.5 + i) * 6, -65, 0, -91);
      ctx.stroke();
      ctx.restore();
    }

    // Central body: layered, asymmetrical shell around a luminous core.
    ctx.save();
    ctx.rotate(Math.sin(this.frame * 1.1) * 0.045);
    ctx.scale(1, pulse);
    const body = ctx.createRadialGradient(-12, -17, 4, 0, 4, 52);
    body.addColorStop(0, edgeColor);
    body.addColorStop(0.28, coreColor);
    body.addColorStop(0.72, deepColor);
    body.addColorStop(1, '#080D20');
    ctx.fillStyle = body;
    ctx.shadowColor = coreColor;
    ctx.shadowBlur = 23;
    ctx.beginPath();
    ctx.moveTo(0, -51);
    ctx.bezierCurveTo(35, -42, 43, -7, 27, 32);
    ctx.quadraticCurveTo(4, 56, -19, 34);
    ctx.bezierCurveTo(-45, 4, -31, -36, 0, -51);
    ctx.closePath();
    ctx.fill();
    ctx.shadowBlur = 0;

    // Inner ridges and a single, unmistakable glowing eye/core.
    ctx.strokeStyle = 'rgba(238,249,255,.55)';
    ctx.lineWidth = 1.3;
    ctx.beginPath();
    ctx.moveTo(-17, -26);
    ctx.quadraticCurveTo(-4, -5, -17, 19);
    ctx.moveTo(16, -27);
    ctx.quadraticCurveTo(3, -3, 17, 18);
    ctx.stroke();

    const coreRadius = 12 + Math.sin(this.frame * 5.2) * 1.8;
    const core = ctx.createRadialGradient(-3, -4, 1, 0, 0, coreRadius * 1.9);
    core.addColorStop(0, '#FFFFFF');
    core.addColorStop(0.22, edgeColor);
    core.addColorStop(0.62, coreColor);
    core.addColorStop(1, 'rgba(141,228,234,0)');
    ctx.fillStyle = core;
    ctx.shadowColor = coreColor;
    ctx.shadowBlur = 24;
    ctx.beginPath();
    ctx.arc(0, 0, coreRadius * 1.9, 0, Math.PI * 2);
    ctx.fill();
    ctx.shadowBlur = 0;
    ctx.fillStyle = '#10162A';
    ctx.beginPath();
    ctx.ellipse(0, 0, 3.2, 7.2, Math.sin(this.frame * 0.7) * 0.12, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#FFFFFF';
    ctx.beginPath();
    ctx.arc(-1.1, -2.2, 1.8, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();

    // Small detached shards orbit at different speeds to make the silhouette feel alive.
    for (let i = 0; i < 3; i++) {
      const angle = -this.frame * (0.34 + i * 0.08) + i * Math.PI * 2 / 3;
      const x = Math.cos(angle) * (70 + i * 7);
      const y = Math.sin(angle) * (48 + i * 5);
      ctx.save();
      ctx.translate(x, y);
      ctx.rotate(angle + Math.PI / 2);
      ctx.fillStyle = i === 1 ? edgeColor : coreColor;
      ctx.globalAlpha = 0.62;
      ctx.shadowColor = coreColor;
      ctx.shadowBlur = 10;
      ctx.beginPath();
      ctx.moveTo(0, -7);
      ctx.lineTo(4, 0);
      ctx.lineTo(0, 7);
      ctx.lineTo(-4, 0);
      ctx.closePath();
      ctx.fill();
      ctx.restore();
    }
    ctx.restore();
  }

  private drawBarrageTelegraph(): void {
    if (!this.active || this.phase !== 'bullet' || this.spawnTimer <= 0 || this.spawnTimer > 0.42) return;
    const ctx = this.ctx;
    const bx = this.bossX();
    const by = this.bossY() + 18;
    const aimed = Math.atan2(this.player.y - by, this.player.x - bx);
    const pattern = this.barrageIndex;
    const sweep = Math.sin(pattern * 0.72) * 0.34;
    const spread = Math.min(2.7, 2.2 + Math.min(5, this.wave - 1) * 0.08 + this.danger * 0.025);
    const alpha = (1 - this.spawnTimer / 0.42) * 0.12;
    ctx.save();
    ctx.lineWidth = 1;
    ctx.strokeStyle = `rgba(255,126,157,${alpha})`;
    for (let i = 0; i < 5; i++) {
      const t = i / 4 - 0.5;
      const angle = aimed + sweep + t * spread;
      const length = 520;
      ctx.beginPath();
      ctx.moveTo(bx, by);
      ctx.lineTo(bx + Math.cos(angle) * length, by + Math.sin(angle) * length);
      ctx.stroke();
    }
    ctx.restore();
  }

  private drawDangerOrbs(): void {
    if (this.danger <= 0 || this.phase !== 'typing') return;
    const ctx = this.ctx;
    for (let i = 0; i < Math.min(12, this.danger); i++) {
      const angle = this.frame * 0.8 + (i / Math.max(1, this.danger)) * Math.PI * 2;
      const x = this.bossX() + Math.cos(angle) * 76;
      const y = this.bossY() + Math.sin(angle) * 48;
      ctx.save(); ctx.shadowColor = '#C77C8D'; ctx.shadowBlur = 4;
      ctx.fillStyle = '#C77C8D'; ctx.beginPath(); ctx.arc(x, y, 3.5, 0, Math.PI * 2); ctx.fill(); ctx.restore();
    }
  }

  private drawBullets(): void {
    const ctx = this.ctx;
    // Draw directional trails first so the bright bullet heads remain crisp and readable.
    ctx.save();
    ctx.lineCap = 'round';
    for (const bullet of this.bullets) {
      const speed = Math.hypot(bullet.vx, bullet.vy);
      const tail = Math.min(23, 8 + speed * 0.045);
      const length = Math.max(0.001, speed);
      const dx = (bullet.vx / length) * tail;
      const dy = (bullet.vy / length) * tail;
      const gradient = ctx.createLinearGradient(bullet.x - dx, bullet.y - dy, bullet.x, bullet.y);
      gradient.addColorStop(0, 'rgba(199,124,141,0)');
      gradient.addColorStop(1, 'rgba(255,151,178,.58)');
      ctx.strokeStyle = gradient;
      ctx.lineWidth = Math.max(2, bullet.r * 1.15);
      ctx.beginPath();
      ctx.moveTo(bullet.x - dx, bullet.y - dy);
      ctx.lineTo(bullet.x, bullet.y);
      ctx.stroke();
    }
    ctx.restore();

    for (const bullet of this.bullets) {
      ctx.save();
      ctx.globalAlpha = 0.28;
      ctx.fillStyle = '#FF789E';
      ctx.beginPath(); ctx.arc(bullet.x, bullet.y, bullet.r * 1.75, 0, Math.PI * 2); ctx.fill();
      ctx.globalAlpha = 1;
      ctx.shadowColor = '#FF789E'; ctx.shadowBlur = 10;
      ctx.fillStyle = '#C77C8D';
      ctx.beginPath(); ctx.arc(bullet.x, bullet.y, bullet.r, 0, Math.PI * 2); ctx.fill();
      ctx.shadowBlur = 0;
      ctx.fillStyle = '#F0DFE3';
      ctx.beginPath(); ctx.arc(bullet.x - bullet.r * 0.22, bullet.y - bullet.r * 0.25, Math.max(1.2, bullet.r * 0.34), 0, Math.PI * 2); ctx.fill();
      ctx.restore();
    }
  }

  private drawShots(): void {
    if (this.phase !== 'bullet') return;
    const ctx = this.ctx;
    const startX = this.player.x;
    const startY = this.player.y - 12;
    const endX = this.bossX();
    const endY = this.bossY() + 28;
    const dx = endX - startX;
    const dy = endY - startY;
    const length = Math.hypot(dx, dy);
    const angle = Math.atan2(dy, dx);
    const pulse = 0.82 + Math.sin(this.frame * 18) * 0.18;
    const beamWidth = 2 + this.power * 2.1;
    const alpha = (0.14 + this.power * 0.055) * pulse;

    // The beam follows the player's position and always points at the boss.
    ctx.save();
    ctx.translate(startX, startY);
    ctx.rotate(angle);

    const glow = ctx.createLinearGradient(0, 0, length, 0);
    glow.addColorStop(0, `rgba(0,240,255,${alpha * 0.72})`);
    glow.addColorStop(0.78, `rgba(0,240,255,${alpha * 0.28})`);
    glow.addColorStop(1, 'rgba(0,240,255,0)');
    ctx.fillStyle = glow;
    ctx.fillRect(0, -beamWidth * 4, length, beamWidth * 8);

    ctx.shadowColor = '#00F0FF';
    ctx.shadowBlur = 13;
    ctx.fillStyle = `rgba(0,240,255,${alpha})`;
    ctx.fillRect(0, -beamWidth * 0.62, length, beamWidth * 1.24);
    ctx.shadowBlur = 0;
    ctx.fillStyle = 'rgba(225,255,255,.78)';
    ctx.fillRect(0, -0.65, length * 0.96, 1.3);

    for (const offset of [-beamWidth * 2.2, beamWidth * 2.2]) {
      ctx.fillStyle = `rgba(0,190,215,${alpha * 0.42})`;
      ctx.fillRect(0, offset - 0.8, length * 0.84, 1.6);
    }
    ctx.restore();
  }

  private drawPlayer(): void {
    const ctx = this.ctx;
    if (this.invulnerable > 0 && Math.floor(this.frame * 18) % 2 === 0) return;
    const enginePulse = 0.7 + Math.sin(this.frame * 25) * 0.3;
    ctx.save();
    const exhaust = ctx.createRadialGradient(this.player.x, this.player.y + 12, 1, this.player.x, this.player.y + 12, 22);
    exhaust.addColorStop(0, `rgba(201,255,255,${0.42 * enginePulse})`);
    exhaust.addColorStop(0.35, `rgba(0,210,230,${0.2 * enginePulse})`);
    exhaust.addColorStop(1, 'rgba(0,210,230,0)');
    ctx.fillStyle = exhaust;
    ctx.beginPath(); ctx.ellipse(this.player.x, this.player.y + 12, 13, 20 + enginePulse * 4, 0, 0, Math.PI * 2); ctx.fill();
    ctx.shadowColor = '#83BBC0'; ctx.shadowBlur = 14;
    drawPixelSprite(ctx, PLAYER_SPRITE, this.player.x, this.player.y, 32, this.frame);
    ctx.restore();

    const focused = this.keys.has('shift') || this.autoDodgeEnabled;
    if (focused) {
      const radius = 10 + Math.sin(this.frame * 8) * 0.8;
      ctx.save();
      ctx.strokeStyle = 'rgba(174,235,239,.58)'; ctx.lineWidth = 1;
      ctx.beginPath(); ctx.arc(this.player.x, this.player.y, radius, 0, Math.PI * 2); ctx.stroke();
      for (let i = 0; i < 4; i++) {
        const angle = this.frame * 0.55 + i * Math.PI / 2;
        const inner = radius + 3;
        const outer = radius + 7;
        ctx.beginPath();
        ctx.moveTo(this.player.x + Math.cos(angle) * inner, this.player.y + Math.sin(angle) * inner);
        ctx.lineTo(this.player.x + Math.cos(angle) * outer, this.player.y + Math.sin(angle) * outer);
        ctx.stroke();
      }
      ctx.fillStyle = '#E8FFFF';
      ctx.beginPath(); ctx.arc(this.player.x, this.player.y, 1.8, 0, Math.PI * 2); ctx.fill();
      ctx.restore();
    }
  }

  private drawParticles(): void {
    const ctx = this.ctx;
    ctx.save();
    ctx.lineCap = 'round';
    for (const p of this.particles) {
      const alpha = Math.max(0, p.life / p.maxLife);
      const speed = Math.hypot(p.vx, p.vy);
      ctx.globalAlpha = alpha * 0.48;
      ctx.strokeStyle = p.color;
      ctx.lineWidth = Math.max(1, p.size * 0.55);
      ctx.beginPath();
      ctx.moveTo(p.x - p.vx * 0.035, p.y - p.vy * 0.035);
      ctx.lineTo(p.x, p.y);
      ctx.stroke();
      ctx.globalAlpha = alpha;
      ctx.fillStyle = p.color;
      ctx.shadowColor = p.color;
      ctx.shadowBlur = Math.min(9, p.size * 2.2);
      ctx.beginPath();
      ctx.arc(p.x, p.y, Math.max(0.8, p.size * (0.55 + alpha * 0.2)), 0, Math.PI * 2);
      ctx.fill();
      ctx.shadowBlur = 0;
    }
    ctx.restore();
  }

  private drawBombEffect(): void {
    const ctx = this.ctx;
    const progress = 1 - this.bombFlash / 0.78;
    const radius = progress * 410;
    ctx.save();
    ctx.fillStyle = `rgba(131,187,192,${this.bombFlash * 0.07})`;
    ctx.fillRect(0, 0, WIDTH, HEIGHT);
    for (let i = 0; i < 3; i++) {
      const ringProgress = Math.max(0, Math.min(1, progress - i * 0.12));
      const ringRadius = ringProgress * 410;
      ctx.globalAlpha = Math.max(0, (1 - ringProgress) * 0.55);
      ctx.strokeStyle = i === 0 ? '#E8FFFF' : '#83BBC0';
      ctx.lineWidth = i === 0 ? 3 : 1.5;
      ctx.shadowColor = '#83BBC0'; ctx.shadowBlur = 12;
      ctx.beginPath();
      ctx.arc(this.player.x, this.player.y, ringRadius, 0, Math.PI * 2);
      ctx.stroke();
    }
    ctx.globalAlpha = 1;
    ctx.restore();
  }

  private drawCanvasHud(): void {
    const ctx = this.ctx;
    ctx.save();
    ctx.font = '600 11px ui-monospace, monospace';
    ctx.fillStyle = 'rgba(197,238,245,.78)';
    ctx.fillText(this.onlineMode === 'raid' ? 'ONLINE RAID / SHARED BOSS' : this.onlineMode === 'pvp' ? 'ONLINE PVP / DUEL' : this.mode === 'STORY' ? `STORY / STAGE 0${this.stage}` : `ENDLESS / WAVE ${String(this.wave).padStart(2, '0')}`, 30, 36);
    ctx.fillStyle = '#A3CBCD';
    ctx.fillText(
      this.onlineMode === 'raid'
        ? `SHARED BOSS HP ${Math.ceil(this.hp)}`
        : this.onlineMode === 'pvp'
          ? `LIVES ${this.lives} / 3`
          : `SEGMENT ${this.segment} / ${this.segments}`,
      30,
      54,
    );
    ctx.textAlign = 'right'; ctx.fillStyle = 'rgba(197,238,245,.7)';
    ctx.fillText(this.phase === 'typing' ? 'PHASE 01  /  TYPE' : `PHASE 02  /  DODGE  ${Math.ceil(Math.max(0, this.phaseDuration - this.phaseElapsed))}s`, WIDTH - 30, 36);
    ctx.fillText(`GRAZE ${String(this.grazes).padStart(4, '0')}`, WIDTH - 30, 54);
    const x = 260; const y = 25; const w = 440; const h = 5;
    ctx.fillStyle = 'rgba(255,255,255,.08)'; ctx.fillRect(x, y, w, h);
    ctx.fillStyle = '#83BBC0';
    const overallSegmentProgress = this.onlineMode === 'raid'
      ? this.hp / this.hpMax
      : this.onlineMode === 'pvp'
        ? this.lives / 3
        : ((this.segment - 1) + Math.max(0, this.hp / this.hpMax)) / this.segments;
    ctx.fillRect(x, y, w * Math.max(0, Math.min(1, overallSegmentProgress)), h);
    for (let i = 1; i < this.segments; i++) {
      ctx.fillStyle = '#080C14'; ctx.fillRect(x + (w / this.segments) * i - 1, y - 2, 2, h + 4);
    }
    ctx.textAlign = 'left'; ctx.font = '600 9px ui-monospace, monospace'; ctx.fillStyle = 'rgba(131,187,192,.72)';
    ctx.fillText(`BOMB × ${this.bombs}`, 30, HEIGHT - 24);
    ctx.fillStyle = 'rgba(210,230,238,.48)'; ctx.fillText(this.autoDodgeEnabled ? 'AUTO DODGE / ACTIVE' : 'SHIFT / FOCUS CORE', 112, HEIGHT - 24);
    if (this.clearFlash > 0) {
      ctx.textAlign = 'center'; ctx.font = '700 24px ui-monospace, monospace';
      ctx.fillStyle = `rgba(131,187,192,${this.clearFlash * 0.55})`; ctx.fillText('SEGMENT BREAK', WIDTH / 2, HEIGHT / 2 + 4);
    }
    if (!this.active && this.reason === 'clear') {
      ctx.textAlign = 'center'; ctx.font = '700 25px ui-monospace, monospace'; ctx.fillStyle = '#A3CBCD'; ctx.fillText('SYSTEM CLEAR', WIDTH / 2, HEIGHT / 2 + 5);
    }
    ctx.restore();
  }
}
