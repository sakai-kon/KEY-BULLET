export interface CareerStats {
  version: 1;
  totalRuns: number;
  storyClears: number;
  endlessBestWave: number;
  totalScore: number;
  totalGrazes: number;
  bestAccuracy: number;
  lastPlayedAt: string | null;
}

export interface EndlessSave {
  wave: number;
  score: number;
  lives: number;
  bombs: number;
  savedAt: string;
}

interface TransferPayload {
  app: 'KEY-BULLET';
  version: 1;
  exportedAt: string;
  stats: CareerStats;
}

const STATS_KEY = 'key-bullet:stats:v1';
const ENDLESS_KEY = 'key-bullet:endless:v1';

export const EMPTY_STATS: CareerStats = {
  version: 1,
  totalRuns: 0,
  storyClears: 0,
  endlessBestWave: 0,
  totalScore: 0,
  totalGrazes: 0,
  bestAccuracy: 0,
  lastPlayedAt: null,
};

export function loadStats(): CareerStats {
  try {
    const parsed = JSON.parse(localStorage.getItem(STATS_KEY) ?? 'null') as Partial<CareerStats> | null;
    if (!parsed || parsed.version !== 1) return { ...EMPTY_STATS };
    return { ...EMPTY_STATS, ...parsed };
  } catch {
    return { ...EMPTY_STATS };
  }
}

export function saveStats(stats: CareerStats): void {
  localStorage.setItem(STATS_KEY, JSON.stringify(stats));
}

export function updateStats(patch: Partial<CareerStats>): CareerStats {
  const updated = { ...loadStats(), ...patch, version: 1 as const };
  saveStats(updated);
  return updated;
}

export function loadEndlessSave(): EndlessSave | null {
  try {
    const parsed = JSON.parse(localStorage.getItem(ENDLESS_KEY) ?? 'null') as EndlessSave | null;
    if (!parsed || !Number.isFinite(parsed.wave) || parsed.wave < 1) return null;
    return parsed;
  } catch {
    return null;
  }
}

export function saveEndless(value: EndlessSave): void {
  localStorage.setItem(ENDLESS_KEY, JSON.stringify(value));
}

export function clearEndlessSave(): void {
  localStorage.removeItem(ENDLESS_KEY);
}

function encodeUtf8ToBase64(value: string): string {
  const bytes = new TextEncoder().encode(value);
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}

function decodeBase64ToUtf8(value: string): string {
  const binary = atob(value);
  const bytes = Uint8Array.from(binary, (char) => char.charCodeAt(0));
  return new TextDecoder().decode(bytes);
}

export function exportTransferCode(stats: CareerStats): string {
  const payload: TransferPayload = {
    app: 'KEY-BULLET',
    version: 1,
    exportedAt: new Date().toISOString(),
    stats,
  };
  return `KB-BETA-${encodeUtf8ToBase64(JSON.stringify(payload))}`;
}

export function importTransferCode(code: string): CareerStats {
  const trimmed = code.trim();
  if (!trimmed.startsWith('KB-BETA-')) throw new Error('引き継ぎコードの形式が違います。');
  const decoded = decodeBase64ToUtf8(trimmed.slice('KB-BETA-'.length));
  const payload = JSON.parse(decoded) as Partial<TransferPayload>;
  if (payload.app !== 'KEY-BULLET' || payload.version !== 1 || !payload.stats) {
    throw new Error('この引き継ぎコードには対応していません。');
  }
  const s = payload.stats as Partial<CareerStats>;
  const numbers = ['totalRuns', 'storyClears', 'endlessBestWave', 'totalScore', 'totalGrazes', 'bestAccuracy'];
  for (const key of numbers) {
    const value = s[key as keyof CareerStats];
    if (typeof value !== 'number' || !Number.isFinite(value) || value < 0) throw new Error('戦績データが不正です。');
  }
  const restored: CareerStats = {
    version: 1,
    totalRuns: Math.floor(s.totalRuns ?? 0),
    storyClears: Math.floor(s.storyClears ?? 0),
    endlessBestWave: Math.floor(s.endlessBestWave ?? 0),
    totalScore: Math.floor(s.totalScore ?? 0),
    totalGrazes: Math.floor(s.totalGrazes ?? 0),
    bestAccuracy: Math.min(100, s.bestAccuracy ?? 0),
    lastPlayedAt: typeof s.lastPlayedAt === 'string' ? s.lastPlayedAt : null,
  };
  saveStats(restored);
  return restored;
}
