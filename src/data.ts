export type Genre = 'code' | 'anime' | 'random' | 'short' | 'long';

export const GENRES: { id: Genre; label: string; sub: string; code: string }[] = [
  { id: 'code', label: 'CODE', sub: 'Syntax / Logic', code: '01' },
  { id: 'anime', label: 'ANIME LINE', sub: 'Original anime-style lines', code: '02' },
  { id: 'random', label: 'RANDOM', sub: 'Mixed challenge', code: '03' },
  { id: 'short', label: 'SHORT TEXT', sub: 'Everyday Japanese', code: '04' },
  { id: 'long', label: 'LONG TEXT', sub: 'Long-form typing', code: '05' },
];

export interface TypingPrompt {
  id: string;
  genre: Genre;
  title: string;
  display: string;
  answers: string[];
  note: string;
  isCode?: boolean;
}

const PROMPTS: TypingPrompt[] = [
  { id: 'c01', genre: 'code', title: 'ARRAY / MAP', display: 'const doubled = values.map((value) => value * 2);', answers: ['const doubled = values.map((value) => value * 2);'], note: '配列 values の各要素を2倍にして、新しい配列を作る。', isCode: true },
  { id: 'c02', genre: 'code', title: 'FUNCTION', display: 'function clamp(value, min, max) { return Math.min(max, Math.max(min, value)); }', answers: ['function clamp(value, min, max) { return Math.min(max, Math.max(min, value)); }'], note: '値を min〜max の範囲に収める関数。', isCode: true },
  { id: 'c03', genre: 'code', title: 'OBJECT', display: 'const player = { hp: 100, speed: 4, active: true };', answers: ['const player = { hp: 100, speed: 4, active: true };'], note: 'プレイヤーの状態をオブジェクトで定義する。', isCode: true },
  { id: 'c04', genre: 'code', title: 'CONDITION', display: 'if (score >= 1000 && lives > 0) { levelUp(); }', answers: ['if (score >= 1000 && lives > 0) { levelUp(); }'], note: 'スコアと残機の条件を同時に判定する。', isCode: true },
  { id: 'c05', genre: 'code', title: 'ASYNC', display: 'const response = await fetch("/api/status");', answers: ['const response = await fetch("/api/status");'], note: 'API からステータスを取得する。', isCode: true },
  { id: 'a01', genre: 'anime', title: 'LAST SIGNAL', display: '諦める理由を探すより、進む理由を一つ見つけよう。', answers: ['諦める理由を探すより、進む理由を一つ見つけよう。'], note: 'オリジナルのアニメ風セリフ。', },
  { id: 'a02', genre: 'anime', title: 'BLUE HORIZON', display: 'この一秒に懸けた想いは、きっと未来まで届く。', answers: ['この一秒に懸けた想いは、きっと未来まで届く。'], note: 'オリジナルのアニメ風セリフ。' },
  { id: 'a03', genre: 'anime', title: 'ZERO POINT', display: '失敗した数だけ、僕らは答えに近づいている。', answers: ['失敗した数だけ、僕らは答えに近づいている。'], note: 'オリジナルのアニメ風セリフ。' },
  { id: 'a04', genre: 'anime', title: 'AFTERGLOW', display: '守りたいものがあるなら、もう一度立ち上がれる。', answers: ['守りたいものがあるなら、もう一度立ち上がれる。'], note: 'オリジナルのアニメ風セリフ。' },
  { id: 'a05', genre: 'anime', title: 'RESONANCE', display: '君が信じた可能性を、誰にも決めさせない。', answers: ['君が信じた可能性を、誰にも決めさせない。'], note: 'オリジナルのアニメ風セリフ。' },
  { id: 's01', genre: 'short', title: 'DAILY / 01', display: '静かな夜に、遠くの電車の音が聞こえた。', answers: ['静かな夜に、遠くの電車の音が聞こえた。'], note: '短文・日本語IME入力。' },
  { id: 's02', genre: 'short', title: 'DAILY / 02', display: '小さな一歩でも、昨日より前に進んでいる。', answers: ['小さな一歩でも、昨日より前に進んでいる。'], note: '短文・日本語IME入力。' },
  { id: 's03', genre: 'short', title: 'DAILY / 03', display: '新しい技術を学ぶ時間は、とても楽しい。', answers: ['新しい技術を学ぶ時間は、とても楽しい。'], note: '短文・日本語IME入力。' },
  { id: 's04', genre: 'short', title: 'DAILY / 04', display: '星の光は、長い旅をしてここに届く。', answers: ['星の光は、長い旅をしてここに届く。'], note: '短文・日本語IME入力。' },
  { id: 'l01', genre: 'long', title: 'LONG / 01', display: '遠くに見える小さな光を目印にして、僕たちは暗い道を歩き続けた。途中で何度も迷いそうになったけれど、隣にいる仲間の声が、もう一歩だけ進む勇気をくれた。', answers: ['遠くに見える小さな光を目印にして、僕たちは暗い道を歩き続けた。途中で何度も迷いそうになったけれど、隣にいる仲間の声が、もう一歩だけ進む勇気をくれた。'], note: '長文・集中力チャレンジ。' },
  { id: 'l02', genre: 'long', title: 'LONG / 02', display: 'プログラムを書くときに大切なのは、最初から完璧な答えを出すことではない。小さく作り、実際に動かし、結果を確かめながら少しずつ改善していくことだ。', answers: ['プログラムを書くときに大切なのは、最初から完璧な答えを出すことではない。小さく作り、実際に動かし、結果を確かめながら少しずつ改善していくことだ。'], note: '長文・集中力チャレンジ。' },
  { id: 'l03', genre: 'long', title: 'LONG / 03', display: '夜空を見上げると、無数の星がそれぞれ違う強さで輝いている。目立つ星だけが特別なのではない。小さくても確かに光る星が集まって、一つの美しい景色を作っている。', answers: ['夜空を見上げると、無数の星がそれぞれ違う強さで輝いている。目立つ星だけが特別なのではない。小さくても確かに光る星が集まって、一つの美しい景色を作っている。'], note: '長文・集中力チャレンジ。' },
];

export function getPrompt(genre: Genre): TypingPrompt {
  const pool = genre === 'random' ? PROMPTS : PROMPTS.filter((p) => p.genre === genre);
  return pool[Math.floor(Math.random() * pool.length)] ?? PROMPTS[0];
}

export function getGenreLabel(genre: Genre): string {
  return GENRES.find((item) => item.id === genre)?.label ?? 'RANDOM';
}

/** Normalize text for comparison after IME composition has been committed. */
export function normalizeTyping(value: string, isCode = false): string {
  if (isCode) return value.replace(/\\s+/g, ' ').trim();
  // Keep Japanese spaces and punctuation significant; NFKC only unifies compatible forms.
  return value.normalize('NFKC').replace(/\\r\\n?/g, '\\n');
}

export function bestPrefixLength(input: string, answers: string[], isCode = false): number {
  const typed = Array.from(normalizeTyping(input, isCode));
  return Math.max(0, ...answers.map((answer) => {
    const target = Array.from(normalizeTyping(answer, isCode));
    let i = 0;
    while (i < typed.length && i < target.length && typed[i] === target[i]) i++;
    return i;
  }));
}

export function hasPotentialPrefix(input: string, answers: string[], isCode = false): boolean {
  const typed = Array.from(normalizeTyping(input, isCode));
  return answers.some((answer) => {
    const target = Array.from(normalizeTyping(answer, isCode));
    if (typed.length > target.length) return false;
    return typed.every((char, index) => char === target[index]);
  });
}

/** Count one new mistake only when a previously valid prefix first becomes invalid. */
export function countNewMistakes(
  previousInput: string,
  nextInput: string,
  answers: string[],
  isCode = false,
): number {
  const wasValid = hasPotentialPrefix(previousInput, answers, isCode);
  const isValid = hasPotentialPrefix(nextInput, answers, isCode);
  return wasValid && !isValid ? 1 : 0;
}

export function isAnswerCorrect(input: string, answers: string[], isCode = false): boolean {
  const typed = normalizeTyping(input, isCode);
  return answers.some((answer) => normalizeTyping(answer, isCode) === typed);
}
