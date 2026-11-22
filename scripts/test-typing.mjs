import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import ts from 'typescript';

const source = await readFile(new URL('../src/data.ts', import.meta.url), 'utf8');
const compiled = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.ES2022, target: ts.ScriptTarget.ES2022 },
}).outputText;
const moduleUrl = `data:text/javascript;base64,${Buffer.from(compiled).toString('base64')}`;
const { normalizeTyping, hasPotentialPrefix, isAnswerCorrect, countNewMistakes, PROMPT_COUNT, getPrompt } = await import(moduleUrl);

const japanese = '静かな夜に、遠くの電車の音が聞こえた。';
assert.equal(normalizeTyping(japanese), japanese);
assert.equal(normalizeTyping('ＡＢＣ１２３'), 'ABC123', 'NFKC should unify full-width compatible characters');
assert.equal(isAnswerCorrect(japanese, [japanese]), true, 'the exact displayed Japanese prompt should pass');
assert.equal(isAnswerCorrect(japanese.slice(0, -1), [japanese]), false, 'missing punctuation should not pass');
assert.equal(isAnswerCorrect(japanese + '！', [japanese]), false, 'extra characters should not pass');
assert.equal(hasPotentialPrefix('静かな夜に', [japanese]), true, 'a valid Japanese prefix should pass');
assert.equal(hasPotentialPrefix('静かな朝', [japanese]), false, 'a wrong committed character should fail');
assert.equal(hasPotentialPrefix(japanese + '！', [japanese]), false, 'a longer-than-answer input should fail');
assert.equal(hasPotentialPrefix('🚀', ['🚀を使う']), true, 'supplementary Unicode characters should be handled as whole characters');

assert.equal(countNewMistakes('静かな', '静かな朝', [japanese]), 1, 'the first invalid commit should add one mistake');
assert.equal(countNewMistakes('静かな朝', '静かな朝に', [japanese]), 0, 'continuing while already invalid should not cascade mistakes');
assert.equal(countNewMistakes('静かな朝', '静かな', [japanese]), 0, 'backspacing should not add mistakes');
assert.equal(countNewMistakes('静かな朝', '静かな夜', [japanese]), 0, 'correcting an invalid string should not add another mistake');
assert.equal(countNewMistakes('静かな夜', '静かな朝', [japanese]), 1, 'a new typo after returning to a valid prefix should count');

const code = 'const doubled = values.map((value) => value * 2);';
assert.equal(normalizeTyping('const   doubled = values.map((value) => value * 2);', true), code);
assert.equal(isAnswerCorrect('const   doubled = values.map((value) => value * 2);', [code], true), true);
assert.equal(hasPotentialPrefix('const doubled = values.map', [code], true), true);

process.stdout.write('Typing logic tests passed.\n');

assert.equal(PROMPT_COUNT, 517, 'total prompt count should be 517');
for (const genre of ['code', 'anime', 'short', 'long', 'random']) {
  const prompt = getPrompt(genre);
  assert.ok(prompt, `a prompt should exist for ${genre}`);
}
