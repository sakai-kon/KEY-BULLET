import { BOSS_SPRITES, PLAYER_SPRITE, drawPixelSprite } from './pixel';
import type { Genre } from './data';

export type GameMode = 'STORY' | 'ENDLESS';
export type GamePhase = 'typing' | 'bullet' | 'ended';
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
    this.stars = Array.from({ length: 72 }, () => ({
      x: Math.random() * WIDTH, y: Math.random() * HEIGHT,
      speed: 12 + Math.random() * 28, alpha: 0.12 + Math.random() * 0.55,
      size: Math.random() > 0.8 ? 2 : 1,
    }));
    this.raf = requestAnimationFrame(this.loop);
  }

  getSnapshot(): GameSnapshot {
    return {
      active: this.active, mode: this.mode, phase: this.phase, stage: this.stage,
      wave: this.wave, segment: this.segment, segments: this.segments,
      hp: this.hp, hpMax: this.hpMax, lives: this.lives, bombs: this.bombs,
      score: this.score, grazes: this.grazes, danger: this.danger,
      timeLeft: Math.max(0, 20 - this.phaseElapsed), power: this.power,
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
    this.lives = resume?.lives ?? 3;
    this.bombs = resume?.bombs ?? 2;
    this.score = resume?.score ?? 0;
    this.grazes = 0;
    this.danger = 0;
    this.phaseElapsed = 0;
    this.power = 1.4;
    this.accuracy = 100;
    this.typingChars = 0;
    this.spawnTimer = 0;
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
    if (mode !== null) this.setAutoDodgeEnabled(false);
  }

  setAutoDodgeEnabled(enabled: boolean): void {
    this.autoDodgeEnabled = enabled && this.onlineMode === null;
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
    this.spawnParticles(this.player.x, this.player.y, 18, '#FF2A5F');
    if (this.lives <= 0) {
      this.finish('gameover');
      return;
    }
    this.notify();
  }

  addMistake(): void {
    if (!this.active || this.phase !== 'typing') return;
    this.danger = Math.min(12, this.danger + 1);
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
    this.spawnTimer = 0.25;
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
    this.bombFlash = 0.65;
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
    if (this.phase !== 'bullet') return;

    this.phaseElapsed += dt;
    const slow = this.keys.has('shift');
    let speed = slow ? 118 : 275;
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
      this.spawnTimer = Math.max(0.32, 0.7 - this.danger * 0.025);
    }

    // The typing result controls the automatic shot rate, impact, and beam width.
    this.shotTimer += dt;
    const fireInterval = Math.max(0.075, 0.2 - this.power * 0.027);
    while (this.shotTimer >= fireInterval) {
      this.shotTimer -= fireInterval;
      if (this.onlineMode === null) this.hp -= (1.3 + this.power * 1.6) * fireInterval;
      this.score += 1;
      this.particles.push({ x: WIDTH / 2 + (Math.random() - 0.5) * 16, y: 186 + Math.random() * 15, vx: 0, vy: -130, life: 0.23, maxLife: 0.23, color: '#00F0FF', size: 3 + this.power });
    }

    this.updateBullets(dt);
    if (this.hp <= 0) {
      this.hp = 0;
      this.completeSegment();
      return;
    }
    if (this.phaseElapsed >= 20) {
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
      const hitDistance = bullet.r + this.player.radius;
      if (distance < hitDistance && this.invulnerable <= 0) {
        this.lives--;
        this.invulnerable = 1.25;
        this.hitFlash = 0.28;
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
    const extra = Math.min(9, this.danger);
    const pattern = this.barrageIndex++;
    const progression = this.mode === 'STORY' ? this.stage - 1 : Math.min(5, this.wave - 1);
    const count = 8 + extra + Math.min(3, progression);
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
      const velocity = 126 + (i % 3) * 15 + Math.min(40, extra * 3) + progression * 4;
      this.bullets.push({ x: bx, y: by, vx: Math.cos(angle) * velocity, vy: Math.sin(angle) * velocity, r: i % 4 === 0 ? 6 : 4.4, grazed: false });
    }

    // Alternating flank shots pass through the outer lanes to discourage static corner camping.
    if (pattern % 2 === 1) {
      const laneY = 190 + ((pattern * 47) % 125);
      const flankSpeed = 150 + progression * 5 + Math.min(24, extra * 2);
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
        this.lives = Math.min(3, this.lives + 1);
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
      this.lives = Math.min(3, this.lives + 1);
      this.bombs = Math.min(3, this.bombs + 1);
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
    this.drawBoss();
    this.drawDangerOrbs();
    this.drawBullets();
    this.drawShots();
    this.drawPlayer();
    this.drawParticles();
    this.drawCanvasHud();
    if (this.bombFlash > 0) {
      ctx.fillStyle = `rgba(131,187,192,${this.bombFlash * 0.09})`;
      ctx.fillRect(0, 0, WIDTH, HEIGHT);
      ctx.strokeStyle = `rgba(174,215,216,${this.bombFlash * 0.52})`;
      ctx.lineWidth = 3;
      ctx.beginPath(); ctx.arc(this.player.x, this.player.y, (1 - this.bombFlash) * 340, 0, Math.PI * 2); ctx.stroke();
    }
    if (this.hitFlash > 0) {
      ctx.fillStyle = `rgba(199,124,141,${this.hitFlash * 0.08})`;
      ctx.fillRect(0, 0, WIDTH, HEIGHT);
    }
  }

  private drawBackground(): void {
    const ctx = this.ctx;
    const gradient = ctx.createLinearGradient(0, 0, 0, HEIGHT);
    gradient.addColorStop(0, '#10182A'); gradient.addColorStop(1, '#080C14');
    ctx.fillStyle = gradient; ctx.fillRect(0, 0, WIDTH, HEIGHT);
    ctx.save();
    ctx.strokeStyle = 'rgba(131,187,192,0.028)'; ctx.lineWidth = 1;
    for (let x = 0; x <= WIDTH; x += 48) { ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, HEIGHT); ctx.stroke(); }
    for (let y = 0; y <= HEIGHT; y += 48) { ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(WIDTH, y); ctx.stroke(); }
    for (const star of this.stars) {
      ctx.fillStyle = `rgba(194,246,255,${star.alpha})`;
      ctx.fillRect(star.x, star.y, star.size, star.size);
    }
    ctx.restore();
    ctx.fillStyle = 'rgba(131,187,192,0.012)';
    for (let y = 0; y < HEIGHT; y += 4) ctx.fillRect(0, y, WIDTH, 1);
    ctx.strokeStyle = 'rgba(131,187,192,0.11)'; ctx.lineWidth = 1;
    ctx.strokeRect(14, 14, WIDTH - 28, HEIGHT - 28);
  }

  private drawBoss(): void {
    if (!this.active && this.reason === 'clear') return;
    const hpRatio = this.hpMax > 100 ? this.hp / this.hpMax : this.hp / 100;
    const form = hpRatio <= 0.34 ? 2 : hpRatio <= 0.67 ? 1 : 0;
    const sprite = BOSS_SPRITES[form] ?? BOSS_SPRITES[0];
    const size = 112 + Math.sin(this.frame * 3) * 3;
    this.ctx.save();
    this.ctx.shadowBlur = 9;
    this.ctx.shadowColor = form === 0 ? '#83BBC0' : '#C77C8D';
    drawPixelSprite(this.ctx, sprite, this.bossX(), this.bossY(), size, this.frame);
    this.ctx.restore();
    this.ctx.save();
    this.ctx.strokeStyle = form === 0 ? 'rgba(131,187,192,.24)' : 'rgba(199,124,141,.27)';
    this.ctx.lineWidth = 1;
    this.ctx.beginPath(); this.ctx.ellipse(this.bossX(), this.bossY(), 84 + Math.sin(this.frame * 1.4) * 5, 58 + Math.cos(this.frame * 1.4) * 4, 0, 0, Math.PI * 2); this.ctx.stroke();
    this.ctx.restore();
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
    for (const bullet of this.bullets) {
      ctx.save();
      ctx.shadowColor = '#C77C8D'; ctx.shadowBlur = 5;
      ctx.fillStyle = '#C77C8D'; ctx.beginPath(); ctx.arc(bullet.x, bullet.y, bullet.r, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#F0DFE3'; ctx.beginPath(); ctx.arc(bullet.x - 1, bullet.y - 1, Math.max(1, bullet.r * 0.33), 0, Math.PI * 2); ctx.fill();
      ctx.restore();
    }
  }

  private drawShots(): void {
    if (this.phase !== 'bullet') return;
    const ctx = this.ctx;
    const beamWidth = 2 + this.power * 2.1;
    const alpha = 0.14 + this.power * 0.055;
    ctx.save();
    const beam = ctx.createLinearGradient(this.player.x - beamWidth, 0, this.player.x + beamWidth, 0);
    beam.addColorStop(0, 'rgba(0,240,255,0)'); beam.addColorStop(0.5, `rgba(0,240,255,${alpha})`); beam.addColorStop(1, 'rgba(0,240,255,0)');
    ctx.fillStyle = beam; ctx.fillRect(this.player.x - beamWidth * 3, 188, beamWidth * 6, this.player.y - 188);
    ctx.restore();
  }

  private drawPlayer(): void {
    const ctx = this.ctx;
    if (this.invulnerable > 0 && Math.floor(this.frame * 18) % 2 === 0) return;
    ctx.save(); ctx.shadowColor = '#83BBC0'; ctx.shadowBlur = 7;
    drawPixelSprite(ctx, PLAYER_SPRITE, this.player.x, this.player.y, 30, this.frame);
    ctx.restore();
    if (this.keys.has('shift')) {
      ctx.strokeStyle = 'rgba(131,187,192,.52)'; ctx.lineWidth = 1.2;
      ctx.beginPath(); ctx.arc(this.player.x, this.player.y, 6.4, 0, Math.PI * 2); ctx.stroke();
      ctx.fillStyle = '#DDEBEC'; ctx.beginPath(); ctx.arc(this.player.x, this.player.y, 1.7, 0, Math.PI * 2); ctx.fill();
    }
  }

  private drawParticles(): void {
    const ctx = this.ctx;
    for (const p of this.particles) {
      ctx.globalAlpha = Math.max(0, p.life / p.maxLife);
      ctx.fillStyle = p.color; ctx.fillRect(p.x, p.y, p.size, p.size);
    }
    ctx.globalAlpha = 1;
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
    ctx.fillText(this.phase === 'typing' ? 'PHASE 01  /  TYPE' : `PHASE 02  /  DODGE  ${Math.ceil(Math.max(0, 20 - this.phaseElapsed))}s`, WIDTH - 30, 36);
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
