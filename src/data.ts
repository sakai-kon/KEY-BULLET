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
  { id: 'a01', genre: 'anime', title: 'LAST SIGNAL', display: '諦める理由を探すより、進む理由を一つ見つけよう。', answers: ['akirameru riyuu wo sagasu yori susumu riyuu wo hitotsu mitsukeyou', 'akirameru riyuu o sagasu yori susumu riyuu o hitotsu mitsukeyou'], note: 'オリジナルのアニメ風セリフ。', },
  { id: 'a02', genre: 'anime', title: 'BLUE HORIZON', display: 'この一秒に懸けた想いは、きっと未来まで届く。', answers: ['kono ichibyou ni kaketa omoi wa kitto mirai made todoku'], note: 'オリジナルのアニメ風セリフ。' },
  { id: 'a03', genre: 'anime', title: 'ZERO POINT', display: '失敗した数だけ、僕らは答えに近づいている。', answers: ['shippai shita kazu dake bokura wa kotae ni chikazuite iru', 'sippai sita kazu dake bokura wa kotae ni tikazuite iru'], note: 'オリジナルのアニメ風セリフ。' },
  { id: 'a04', genre: 'anime', title: 'AFTERGLOW', display: '守りたいものがあるなら、もう一度立ち上がれる。', answers: ['mamoritai mono ga aru nara mou ichido tachiagareru', 'mamoritai mono ga aru nara mou ichido tatiagareru'], note: 'オリジナルのアニメ風セリフ。' },
  { id: 'a05', genre: 'anime', title: 'RESONANCE', display: '君が信じた可能性を、誰にも決めさせない。', answers: ['kimi ga shinjita kanousei wo dare ni mo kimesasenai', 'kimi ga sinjita kanousei wo dare ni mo kimesasenai'], note: 'オリジナルのアニメ風セリフ。' },
  { id: 's01', genre: 'short', title: 'DAILY / 01', display: '静かな夜に、遠くの電車の音が聞こえた。', answers: ['shizuka na yoru ni tooku no densha no oto ga kikoeta', 'sizuka na yoru ni tooku no densya no oto ga kikoeta'], note: '短文・ローマ字入力。' },
  { id: 's02', genre: 'short', title: 'DAILY / 02', display: '小さな一歩でも、昨日より前に進んでいる。', answers: ['chiisana ippo demo kinou yori mae ni susunde iru', 'tiisana ippo demo kinou yori mae ni susunde iru'], note: '短文・ローマ字入力。' },
  { id: 's03', genre: 'short', title: 'DAILY / 03', display: '新しい技術を学ぶ時間は、とても楽しい。', answers: ['atarashii gijutsu wo manabu jikan wa totemo tanoshii', 'atarasii gijutu wo manabu jikan wa totemo tanosii'], note: '短文・ローマ字入力。' },
  { id: 's04', genre: 'short', title: 'DAILY / 04', display: '星の光は、長い旅をしてここに届く。', answers: ['hoshi no hikari wa nagai tabi wo shite koko ni todoku', 'hosi no hikari wa nagai tabi wo site koko ni todoku'], note: '短文・ローマ字入力。' },
  { id: 'l01', genre: 'long', title: 'LONG / 01', display: '遠くに見える小さな光を目印にして、僕たちは暗い道を歩き続けた。途中で何度も迷いそうになったけれど、隣にいる仲間の声が、もう一歩だけ進む勇気をくれた。', answers: ['tooku ni mieru chiisana hikari wo mejirushi ni shite bokutachi wa kurai michi wo aruki tsuzuketa tochuu de nando mo mayoi sou ni natta keredo tonari ni iru nakama no koe ga mou ippo dake susumu yuuki wo kureta'], note: '長文・集中力チャレンジ。' },
  { id: 'l02', genre: 'long', title: 'LONG / 02', display: 'プログラムを書くときに大切なのは、最初から完璧な答えを出すことではない。小さく作り、実際に動かし、結果を確かめながら少しずつ改善していくことだ。', answers: ['puroguramu wo kaku toki ni taisetsu na no wa saisho kara kanpeki na kotae wo dasu koto dewa nai chiisaku tsukuri jissai ni ugokashi kekka wo tashikame nagara sukoshi zutsu kaizen shite iku koto da'], note: '長文・集中力チャレンジ。' },
  { id: 'l03', genre: 'long', title: 'LONG / 03', display: '夜空を見上げると、無数の星がそれぞれ違う強さで輝いている。目立つ星だけが特別なのではない。小さくても確かに光る星が集まって、一つの美しい景色を作っている。', answers: ['yozora wo miageru to musuu no hoshi ga sorezore chigau tsuyosa de kagayaite iru medatsu hoshi dake ga tokubetsu na no dewa nai chiisakute mo tashika ni hikaru hoshi ga atsumatte hitotsu no utsukushii keshiki wo tsukutte iru'], note: '長文・集中力チャレンジ。' },
];

export function getPrompt(genre: Genre): TypingPrompt {
  const pool = genre === 'random' ? PROMPTS : PROMPTS.filter((p) => p.genre === genre);
  return pool[Math.floor(Math.random() * pool.length)] ?? PROMPTS[0];
}

export function getGenreLabel(genre: Genre): string {
  return GENRES.find((item) => item.id === genre)?.label ?? 'RANDOM';
}

/** Canonicalizes common Japanese romaji variants without changing the visible prompt. */
export function normalizeTyping(value: string, isCode = false): string {
  if (isCode) return value.replace(/\s+/g, ' ').trim();
  return value
    .toLowerCase()
    .normalize('NFKC')
    .replace(/[’']/g, '')
    .replace(/shi/g, 'si')
    .replace(/chi/g, 'ti')
    .replace(/tsu/g, 'tu')
    .replace(/fu/g, 'hu')
    .replace(/ji/g, 'zi')
    .replace(/nn/g, 'n')
    .replace(/n(?=[bcdfghjklmnpqrstvwxyz])/g, 'n')
    .replace(/\s+/g, ' ')
    .trim();
}

export function bestPrefixLength(input: string, answers: string[], isCode = false): number {
  const typed = normalizeTyping(input, isCode);
  return Math.max(0, ...answers.map((answer) => {
    const target = normalizeTyping(answer, isCode);
    let i = 0;
    while (i < typed.length && i < target.length && typed[i] === target[i]) i++;
    return i;
  }));
}


export function hasPotentialPrefix(input: string, answers: string[], isCode = false): boolean {
  const raw = isCode ? input.replace(/\s+/g, ' ') : input.toLowerCase().replace(/[’']/g, '');
  if (!raw) return true;
  if (isCode) return answers.some((answer) => answer.startsWith(raw));
  const pairs: [string, string][] = [
    ['si', 'shi'], ['ti', 'chi'], ['tu', 'tsu'], ['hu', 'fu'], ['zi', 'ji'],
    ['n', 'nn'],
  ];
  const variants = new Set(answers.map((answer) => answer.toLowerCase()));
  for (const [shortForm, longForm] of pairs) {
    for (const value of [...variants]) {
      if (value.includes(shortForm)) variants.add(value.replaceAll(shortForm, longForm));
      if (value.includes(longForm)) variants.add(value.replaceAll(longForm, shortForm));
      if (variants.size > 160) break;
    }
  }
  return [...variants].some((answer) => answer.startsWith(raw));
}

export function isAnswerCorrect(input: string, answers: string[], isCode = false): boolean {
  const typed = normalizeTyping(input, isCode);
  return answers.some((answer) => normalizeTyping(answer, isCode) === typed);
}
