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

export interface UserProfile {
  username: string;
  passcodeSalt: string;
  passcodeVerifier: string;
}

interface EncryptedBlob {
  salt: string;
  iv: string;
  data: string;
}

interface TransferPayloadV1 {
  app: 'KEY-BULLET';
  version: 1;
  exportedAt: string;
  stats: CareerStats;
}

interface TransferPayloadV2 {
  app: 'KEY-BULLET';
  version: 2;
  exportedAt: string;
  username: string;
  byUsername: EncryptedBlob;
  byPasscode: EncryptedBlob;
}

const STATS_KEY = 'key-bullet:stats:v1';
const ENDLESS_KEY = 'key-bullet:endless:v1';
const PROFILE_KEY = 'key-bullet:profile:v1';
const PBKDF2_ITERATIONS = 180_000;

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

export function loadUserProfile(): UserProfile | null {
  try {
    const parsed = JSON.parse(localStorage.getItem(PROFILE_KEY) ?? 'null') as Partial<UserProfile> | null;
    if (!parsed || typeof parsed.username !== 'string' || typeof parsed.passcodeSalt !== 'string' || typeof parsed.passcodeVerifier !== 'string') return null;
    return { username: parsed.username, passcodeSalt: parsed.passcodeSalt, passcodeVerifier: parsed.passcodeVerifier };
  } catch {
    return null;
  }
}

function toBase64(bytes: Uint8Array): string {
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}

function fromBase64(value: string): Uint8Array {
  const binary = atob(value);
  return Uint8Array.from(binary, (char) => char.charCodeAt(0));
}

async function deriveAesKey(secret: string, salt: Uint8Array): Promise<CryptoKey> {
  const material = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    'PBKDF2',
    false,
    ['deriveKey'],
  );
  return crypto.subtle.deriveKey(
    { name: 'PBKDF2', salt, iterations: PBKDF2_ITERATIONS, hash: 'SHA-256' },
    material,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt'],
  );
}

async function deriveVerifier(secret: string, salt: Uint8Array): Promise<string> {
  const material = await crypto.subtle.importKey('raw', new TextEncoder().encode(secret), 'PBKDF2', false, ['deriveBits']);
  const bits = await crypto.subtle.deriveBits(
    { name: 'PBKDF2', salt, iterations: PBKDF2_ITERATIONS, hash: 'SHA-256' },
    material,
    256,
  );
  return toBase64(new Uint8Array(bits));
}

export async function saveUserProfile(username: string, passcode: string): Promise<void> {
  const normalizedName = username.trim();
  if (normalizedName.length < 2 || normalizedName.length > 20) throw new Error('ユーザー名は2〜20文字で設定してください。');
  if (passcode.length < 4 || passcode.length > 64) throw new Error('パスコードは4〜64文字で設定してください。');
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const profile: UserProfile = {
    username: normalizedName,
    passcodeSalt: toBase64(salt),
    passcodeVerifier: await deriveVerifier(passcode, salt),
  };
  localStorage.setItem(PROFILE_KEY, JSON.stringify(profile));
}

export async function verifyProfilePasscode(passcode: string, profile = loadUserProfile()): Promise<boolean> {
  if (!profile || !passcode) return false;
  const actual = await deriveVerifier(passcode, fromBase64(profile.passcodeSalt));
  return actual === profile.passcodeVerifier;
}

async function encryptWithSecret(value: string, secret: string): Promise<EncryptedBlob> {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const key = await deriveAesKey(secret, salt);
  const encrypted = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, new TextEncoder().encode(value));
  return { salt: toBase64(salt), iv: toBase64(iv), data: toBase64(new Uint8Array(encrypted)) };
}

async function decryptWithSecret(blob: EncryptedBlob, secret: string): Promise<string> {
  const key = await deriveAesKey(secret, fromBase64(blob.salt));
  const decrypted = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv: fromBase64(blob.iv) },
    key,
    fromBase64(blob.data),
  );
  return new TextDecoder().decode(decrypted);
}

function validateStats(value: unknown): CareerStats {
  if (!value || typeof value !== 'object') throw new Error('引き継ぎデータが見つかりません。');
  const s = value as Partial<CareerStats>;
  const numbers: (keyof CareerStats)[] = ['totalRuns', 'storyClears', 'endlessBestWave', 'totalScore', 'totalGrazes', 'bestAccuracy'];
  for (const key of numbers) {
    const item = s[key];
    if (typeof item !== 'number' || !Number.isFinite(item) || item < 0) throw new Error('戦績データが不正です。');
  }
  if ((s.bestAccuracy ?? 0) > 100) throw new Error('戦績データが不正です。');
  return {
    version: 1,
    totalRuns: Math.floor(s.totalRuns ?? 0),
    storyClears: Math.floor(s.storyClears ?? 0),
    endlessBestWave: Math.floor(s.endlessBestWave ?? 0),
    totalScore: Math.floor(s.totalScore ?? 0),
    totalGrazes: Math.floor(s.totalGrazes ?? 0),
    bestAccuracy: Math.min(100, s.bestAccuracy ?? 0),
    lastPlayedAt: typeof s.lastPlayedAt === 'string' ? s.lastPlayedAt : null,
  };
}

function encodeUtf8ToBase64(value: string): string {
  return toBase64(new TextEncoder().encode(value));
}

function decodeBase64ToUtf8(value: string): string {
  return new TextDecoder().decode(fromBase64(value));
}

export async function exportTransferCode(stats: CareerStats, profile = loadUserProfile(), passcode = ''): Promise<string> {
  if (!profile) throw new Error('先にユーザー名とパスコードを設定してください。');
  if (!await verifyProfilePasscode(passcode, profile)) throw new Error('登録したパスコードが一致しません。');
  const secretPayload = JSON.stringify({ stats, profile });
  const payload: TransferPayloadV2 = {
    app: 'KEY-BULLET',
    version: 2,
    exportedAt: new Date().toISOString(),
    username: profile.username,
    byUsername: await encryptWithSecret(secretPayload, profile.username),
    byPasscode: await encryptWithSecret(secretPayload, passcode),
  };
  return `KB-BETA-${encodeUtf8ToBase64(JSON.stringify(payload))}`;
}

export async function importTransferCode(code: string, credential = ''): Promise<CareerStats> {
  const trimmed = code.trim();
  if (!trimmed.startsWith('KB-BETA-')) throw new Error('引き継ぎコードの形式が違います。');
  let payload: Partial<TransferPayloadV1 & TransferPayloadV2>;
  try {
    payload = JSON.parse(decodeBase64ToUtf8(trimmed.slice('KB-BETA-'.length))) as Partial<TransferPayloadV1 & TransferPayloadV2>;
  } catch {
    throw new Error('引き継ぎコードを読み取れません。');
  }
  if (payload.app !== 'KEY-BULLET') throw new Error('この引き継ぎコードには対応していません。');

  // Older, unencrypted v1 transfer codes remain importable.
  if (payload.version === 1 && payload.stats) {
    const restored = validateStats(payload.stats);
    saveStats(restored);
    return restored;
  }

  if (payload.version !== 2 || !payload.byUsername || !payload.byPasscode) {
    throw new Error('この引き継ぎコードには対応していません。');
  }
  if (!credential.trim()) throw new Error('ユーザー名またはパスコードを入力してください。');

  let decoded: { stats?: unknown; profile?: unknown } | null = null;
  for (const blob of [payload.byUsername, payload.byPasscode]) {
    try {
      decoded = JSON.parse(await decryptWithSecret(blob, credential.trim())) as { stats?: unknown; profile?: unknown };
      break;
    } catch {
      // Try the other credential type. Only one matching value is required.
    }
  }
  if (!decoded) throw new Error('ユーザー名またはパスコードが一致しません。');

  const restored = validateStats(decoded.stats);
  const profile = decoded.profile as Partial<UserProfile> | undefined;
  if (profile && typeof profile.username === 'string' && typeof profile.passcodeSalt === 'string' && typeof profile.passcodeVerifier === 'string') {
    localStorage.setItem(PROFILE_KEY, JSON.stringify(profile));
  }
  saveStats(restored);
  return restored;
}
