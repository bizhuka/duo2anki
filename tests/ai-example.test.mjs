import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { parse, compileScript, compileTemplate } from '@vue/compiler-sfc';
import { computed, reactive, ref, nextTick, watch } from 'vue';
import { util } from '../src/lib/util.js';
import { translationLanguageName, wordLanguage } from '../src/lib/translationLanguages.js';

const readComponent = name => parse(readFileSync(new URL(`../src/components/${name}.vue`, import.meta.url), 'utf8')).descriptor;
const generator = readComponent('small/GenerateExampleButton');
const editor = readComponent('EditDialog');
const initialWord = () => ({ id: 7, front: 'bonjour', back: 'old translation', context: 'old example', targetLang: 'fr', hasTranslation: false, image: 'keep.png' });
const result = [{ id: 7, back: 'new translation', context: 'new example' }];
function instance(request = async () => result) {
  const props = reactive({ word: initialWord(), soundMode: util.SOUND_MODE.OFF, optionsData: { translation_to: 'en', ai_model: 'ChatGPT' } });
  const emitted = [];
  const played = [];
  const speechUtil = { ...util, playSound: (word, mode) => played.push({ word, mode }) };
  let unmount;
  const state = new Function('computed', 'onBeforeUnmount', 'reactive', 'ref', 'watch', 'util', 'process_with_GROQ', 'translationLanguageName', 'wordLanguage', 'defineProps', 'defineEmits',
    generator.scriptSetup.content.replace(/^import .*;$/gm, '') + '\nreturn { generate, save, review, loading, canSave, errorVisible };'
  )(computed, callback => { unmount = callback; }, reactive, ref, watch, speechUtil, request, translationLanguageName, wordLanguage, () => props, () => (...args) => emitted.push(args));
  return { ...state, props, emitted, played, unmount: () => unmount() };
}
function editState(word) {
  const emitted = [];
  const component = new Function('reactive', 'ref', 'watch', 'nextTick', 'computed', 'onBeforeUnmount', 'util', 'ReplaySoundButton', 'GenerateExampleButton',
    editor.script.content.replace(/^import .*;$/gm, '').replace('export default', 'return')
  )(reactive, ref, () => {}, nextTick, computed, () => {}, util, {}, {});
  const state = component.setup({ filteredWords: [word], optionsData: {}, onArchiveWord() {} }, { emit: (...args) => emitted.push(args) });
  state.dialog.show = true;
  state.dialog.editingWord = word;
  return { ...state, emitted };
}

test('AI example button starts immediately and keeps the word unchanged until Save', async () => {
  let finish;
  let calls = 0;
  const vm = instance((words, options) => {
    calls++;
    assert.equal(words.length, 1);
    assert.equal(words[0].id, 7);
    assert.match(options.prompt_prefix, /French/);
    assert.match(options.prompt_prefix, /English/);
    assert.match(options.prompt_prefix, /old example/);
    return new Promise(resolve => { finish = resolve; });
  });
  const before = { ...vm.props.word };
  const pending = vm.generate();
  assert.equal(calls, 1);
  assert.equal(vm.loading.value, true);
  assert.equal(vm.review.show, false);
  await vm.generate();
  assert.equal(calls, 1);
  finish(result);
  await pending;
  assert.deepEqual({ ...vm.props.word }, before);
  assert.equal(vm.emitted.length, 0);
  assert.equal(vm.review.show, true);
  assert.equal(vm.review.replaceTranslation, true);
  assert.equal(vm.review.replaceContext, true);
  assert.equal(vm.props.optionsData.ai_model, 'ChatGPT');
  vm.save();
  assert.equal(vm.emitted.length, 1);
});

test('AI review replaces and saves only selected fields on this word', async () => {
  for (const [replaceTranslation, replaceContext] of [[true, true], [true, false], [false, true]]) {
    const vm = instance();
    await vm.generate();
    const edit = editState(vm.props.word);
    vm.review.replaceTranslation = replaceTranslation;
    vm.review.replaceContext = replaceContext;
    vm.save();
    edit.methods.saveGeneratedExample(vm.emitted[0][1]);
    assert.equal(edit.emitted.length, 1);
    assert.equal(edit.emitted[0][0], 'save');
    assert.equal(edit.emitted[0][1].id, 7);
    assert.equal(vm.props.word.back, replaceTranslation ? 'new translation' : 'old translation');
    assert.equal(vm.props.word.context, replaceContext ? 'new example' : 'old example');
    assert.equal(vm.props.word.hasTranslation, replaceTranslation);
    assert.equal(vm.props.word.image, 'keep.png');
  }
});

test('cancel and no selected fields leave the word untouched', async () => {
  const vm = instance();
  await vm.generate();
  vm.review.replaceTranslation = false;
  vm.review.replaceContext = false;
  assert.equal(vm.canSave.value, false);
  vm.save();
  assert.equal(vm.emitted.length, 0);
  vm.review.replaceTranslation = true;
  vm.review.show = false;
  vm.save();
  assert.equal(vm.emitted.length, 0);
  assert.equal(vm.props.word.back, 'old translation');
});

test('failed and stale AI results cannot replace a word', async () => {
  for (const request of [async () => { throw new Error('Network failed'); }, async () => [{ id: 8, back: 'wrong', context: 'wrong' }]]) {
    const vm = instance(request);
    await vm.generate();
    assert.equal(vm.errorVisible.value, true);
    assert.equal(vm.review.show, false);
    assert.equal(vm.loading.value, false);
    assert.equal(vm.props.word.back, 'old translation');
  }
  for (const leave of [vm => { vm.props.word = { ...initialWord(), id: 8 }; }, vm => vm.unmount()]) {
    let finish;
    const vm = instance(() => new Promise(resolve => { finish = resolve; }));
    const pending = vm.generate();
    leave(vm);
    finish(result);
    await pending;
    assert.equal(vm.review.show, false);
    assert.equal(vm.emitted.length, 0);
  }
});

test('example review and toolbar compile with read-only previews', () => {
  for (const name of ['small/GenerateExampleButton', 'small/RichTextEditor', 'EditDialog']) {
    const descriptor = readComponent(name);
    const script = compileScript(descriptor, { id: name });
    const compiled = compileTemplate({ source: descriptor.template.content, filename: `${name}.vue`, id: name, compilerOptions: { bindingMetadata: script.bindings } });
    assert.deepEqual(compiled.errors, []);
  }
  assert.equal((generator.template.content.match(/readonly/g) || []).length, 2);
  assert.match(generator.template.content, /:disabled="!canSave"/);
});
test('new AI context uses the EditDialog sound mode for Off rather than the global setting', async () => {
  const original = util.options.soundMode;
  try {
    for (const mode of Object.values(util.SOUND_MODE)) {
      util.options.soundMode = mode === util.SOUND_MODE.OFF ? util.SOUND_MODE.FRONT_WORD : util.SOUND_MODE.OFF;
      const vm = instance();
      vm.props.soundMode = mode;
      await vm.generate();
      assert.equal(vm.emitted.length, 0);
      assert.equal(vm.review.show, true);
      assert.equal(vm.props.word.context, 'old example');
      if (mode === util.SOUND_MODE.OFF) {
        assert.deepEqual(vm.played, []);
      } else {
        assert.equal(vm.played.length, 1);
        assert.equal(vm.played[0].mode, util.SOUND_MODE.CONTEXT_ONLY);
        assert.equal(vm.played[0].word.context, 'new example');
        assert.equal(vm.played[0].word.front, 'bonjour');
      }
      vm.save();
      assert.equal(vm.played.length, mode === util.SOUND_MODE.OFF ? 0 : 1);
    }
  } finally { util.options.soundMode = original; }
});