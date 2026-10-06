import assert from 'node:assert/strict';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { basename } from 'node:path';
import test from 'node:test';
import { parse, compileScript, compileTemplate } from '@vue/compiler-sfc';
import { parse as parseVueTemplate } from '@vue/compiler-dom';
import { computed, reactive, ref, nextTick, watch } from 'vue';
import { util } from '../src/lib/util.js';
import { inferTranslationSource, translationLanguage, translationLanguageName, wordLanguage } from '../src/lib/translationLanguages.js';
import { processContexts } from '../src/lib/contextProcessor.js';
import { DbProxy } from '../src/lib/database.js';
import * as ai from '../src/lib/ai.js';

const readComponent = name => parse(readFileSync(new URL(`../src/components/${name}.vue`, import.meta.url), 'utf8')).descriptor;
const generator = readComponent('small/GenerateExampleButton');
const editor = readComponent('EditDialog');
const initialWord = () => ({ id: 7, front: 'bonjour', back: 'old translation', context: 'old example', hint: 'Existing book', targetLang: 'fr', hasTranslation: false, image: 'keep.png' });
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

function contextState(optionsData, db_words) {
  const descriptor = readComponent('ContextDialog');
  const calls = [];
  const component = new Function('computed', 'reactive', 'watch', 'util', 'processContexts', 'BatchRequestControls', 'TranslationLanguages',
    'inferTranslationSource', 'translationLanguage', 'translationLanguageName',
    descriptor.script.content.replace(/^import .*;.*$/gm, '').replace('export default', 'return')
  )(computed, reactive, watch, util, async (...args) => calls.push(args), {}, {}, inferTranslationSource, translationLanguage, translationLanguageName);
  const props = reactive({ optionsData, db_words, saveOptions: async () => {} });
  return { descriptor, calls, props, vm: component.setup(props, { emit() {} }) };
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
    assert.equal(vm.props.word.hint, 'Existing book');
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
  assert.match(editor.template.content, /v-html="dialog.editingWord.transcription"/);
  assert.match(editor.template.content, /class="word-front"/);
  assert.doesNotMatch(editor.template.content, /v-model="dialog.editingWord.transcription"/);
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

test('context hint defaults on, refreshes, resolves languages and keeps the five-field format', async () => {
  const { descriptor, calls, props, vm } = contextState({ current_course_id: 'fr_en', translation_to: 'en', request_count: 1, prompt_prefix: '',
    transcription_prompt: util.getText('context_legacyTranscriptionPrompt') }, [
      { id: 7, front: 'bonjour', context: '' },
      { id: 8, front: 'salut', context: 'existing context', hasTranslation: false },
      { id: 9, front: 'merci', context: 'existing context', hasTranslation: null },
      { id: 10, front: 'oui', context: 'existing context', hasTranslation: true },
      { id: 11, front: 'non', context: '', hasTranslation: null },
      { id: 12, front: 'bien', context: '', hasTranslation: true },
    ]);
  let pending = vm.context_popup({ action() {} });
  assert.equal(props.optionsData.include_transcription, true);
  assert.equal(props.optionsData.transcription_prompt, util.getText('context_transcriptionPrompt'));
  assert.equal(vm.canConfirm.value, true);
  props.optionsData.transcription_prompt = '';
  assert.equal(vm.canConfirm.value, false);
  vm.fillDefaultTranscriptionPrompt();
  props.optionsData.transcription_prompt += ' Custom pronunciation instruction.';
  await vm.confirm();
  await pending;
  assert.deepEqual(calls[0][0].map(word => word.id), [7, 8, 11, 12]);
  assert.equal(calls[0][1].replace_context_for_reader, true);
  const prompt = calls[0][1].prompt_prefix;
  const resolvedTranscriptionPrompt = util.getText('context_transcriptionPrompt')
    .replaceAll('{FROM_LANGUAGE}', 'French').replaceAll('{TO_LANGUAGE}', 'English');
  assert.ok(prompt.includes(resolvedTranscriptionPrompt));
  assert.ok(prompt.includes(util.getText('context_transcriptionFormat')));
  assert.match(prompt, /Custom pronunciation instruction/);
  assert.equal((prompt.match(/→/g) || []).length, (util.getText('context_defaultPrompt').match(/→/g) || []).length);
  assert.doesNotMatch(prompt, /\{(?:FROM|TO)_LANGUAGE\}/);
  assert.match(props.optionsData.transcription_prompt, /\{FROM_LANGUAGE\}/);
  pending = vm.context_popup({ action() {} });
  assert.match(props.optionsData.transcription_prompt, /Custom pronunciation instruction/);
  vm.cancel();
  await pending;
  props.optionsData.include_transcription = false;
  pending = vm.context_popup({ action() {} });
  await vm.confirm();
  await pending;
  assert.doesNotMatch(calls[1][1].prompt_prefix, /Custom pronunciation instruction|approximate pronunciation/);
  const script = compileScript(descriptor, { id: 'context' });
  assert.deepEqual(compileTemplate({ source: descriptor.template.content, filename: 'ContextDialog.vue', id: 'context', compilerOptions: { bindingMetadata: script.bindings } }).errors, []);
});

test('context responses save bracketed bold transcription for API, ChatGPT and Grok without changing the word', async () => {
  const originalChrome = globalThis.chrome;
  const originalFetch = globalThis.fetch;
  try {
    for (const ai_model of Object.values(util.AI_MODEL)) {
      for (const include_transcription of [true, false]) {
        const word = { id: 7, front: 'bonjour', back: '', context: '', transcription: 'keep hint', targetLang: 'fr' };
        const options = { ai_model, include_transcription, prompt_prefix: 'prompt', words_per_request: 10,
          request_count: 1, add_2_back: true, translation_to: 'en' };
        let listener;
        let saved;
        globalThis.chrome = {
          runtime: { id: 'test' },
          tabs: { create: async () => ({ id: 1 }), onUpdated: { addListener: callback => { listener = callback; }, removeListener() {} } },
          scripting: { executeScript: async () => [{ result: [['7', 'bonjour [bon**jour**]', 'hello', 'example.', 'translation.']] }] },
        };
        globalThis.fetch = async () => ({ ok: true, json: async () => ({ results: [{ id: 7, front: 'bonjour [bon**jour**]', back: 'hello', context: 'example. → translation.' }] }) });
        await processContexts([word], options, words => { saved = words; });
        if (listener) await listener(1, { status: 'complete' });
        assert.equal(saved[0].front, 'bonjour');
        assert.equal(saved[0].targetLang, 'fr');
        assert.equal(saved[0].sourceLang, 'en');
        assert.equal(saved[0].transcription, include_transcription ? '[bon<b>jour</b>]' : 'keep hint');
        assert.equal(saved[0].context, 'example. → translation.');
      }
    }
    const source = readFileSync(new URL('../src/lib/contextProcessor.js', import.meta.url), 'utf8');
    const update = new Function('util', source.slice(source.indexOf('function _update_context('), source.indexOf('async function _check_context_results(')) + 'return _update_context;')(util);
    const word = { id: util.WORD_IS_NEW, front: 'bonjour', transcription: 'keep hint' };
    update([{ id: 'new', front: 'bonjour [bon**jour**]', back: 'hello', context: 'example' }], [word], true, true);
    assert.equal(word.transcription, '[bon<b>jour</b>]');
    update([{ id: word.id, front: 'bonjour', transcription: '[<**stress**>]', back: 'hello', context: 'example' }], [word], true, true);
    assert.equal(word.transcription, '[&lt;<b>stress</b>&gt;]');
    update([{ id: word.id, front: 'bonjour', back: 'hello', context: 'example' }], [word], true, true);
    assert.equal(word.transcription, '[&lt;<b>stress</b>&gt;]');
    for (const transcription of ['[bon<b>jour</b>]', '[bon<strong>jour</strong>]', '[bon&lt;b&gt;jour&lt;/b&gt;]']) {
      update([{ id: word.id, front: 'bonjour', transcription, back: 'hello', context: 'example' }], [word], true, true);
      assert.equal(word.transcription, '[bon<b>jour</b>]');
    }
  } finally {
    globalThis.chrome = originalChrome;
    globalThis.fetch = originalFetch;
  }
});

test('word editor renders saved escaped bold transcriptions and keeps false distinct from the null default', async () => {
  for (const hasTranslation of [undefined, null, false, true]) {
    const word = { ...initialWord(), hasTranslation, transcription: '<p>[bon&lt;b&gt;jour&lt;/b&gt;]</p>' };
    const vm = editState(word);
    await vm.methods.set_word(word, false);
    assert.equal(vm.dialog.editingWord.transcription, '<p>[bon<b>jour</b>]</p>');
    assert.equal(vm.dialog.editingWord.hasTranslation, hasTranslation ?? null);
    assert.equal(word.transcription, '<p>[bon&lt;b&gt;jour&lt;/b&gt;]</p>');
  }
  assert.equal(util.normalizeTranscription('[bon<b>jour</b>]'), '[bon<b>jour</b>]');
  assert.equal(util.normalizeTranscription('existing hint'), 'existing hint');
  assert.equal(util.normalizeTranscription('[<img src=x onerror=alert(1)>]'), '[&lt;img src=x onerror=alert(1)&gt;]');
});

test('database defaults keep false translation flags rather than replacing them with null', async () => {
  for (const [id, hasTranslation] of [undefined, null, false, true].entries()) {
    const word = { id, front: 'bonjour', course_id: 'fr_en', targetLang: 'fr', image: 'keep.png', hasTranslation };
    await DbProxy.prototype._set_dafaults.call({}, word);
    assert.equal(word.hasTranslation, hasTranslation ?? null);
  }
});

test('retired Azure API and dialog are removed while shared language normalization still works', () => {
  assert.equal(Object.hasOwn(ai, 'translateWithAzure'), false);
  assert.equal(Object.hasOwn(ai, 'getAzureTranslateUrl'), false);
  assert.equal(ai.normalizeLanguage('FR_fr'), 'fr-fr');
  assert.equal(existsSync(new URL('../src/components/TranslateWordsDialog.vue', import.meta.url)), false);
  assert.doesNotMatch(readComponent('WordsTab').script.content, /TranslateWordsDialog/);
  const words = compileScript(readComponent('WordsTab'), { id: 'words-without-azure' });
  assert.equal(Object.hasOwn(words.imports || {}, 'TranslateWordsDialog'), false);
});

test('remaining Vue components are reachable from the app and game entry points', () => {
  const root = new URL('../src/', import.meta.url);
  const files = readdirSync(root, { recursive: true }).filter(file => file.endsWith('.vue'));
  const names = new Map(files.map(file => [basename(file, '.vue'), file]));
  const edges = new Map();
  for (const file of files) {
    const descriptor = parse(readFileSync(new URL(file.replaceAll('\\', '/'), root), 'utf8')).descriptor;
    const references = new Set();
    const visitTemplate = node => {
      if (node.type === 1) {
        const name = names.has(node.tag) ? node.tag : node.tag.replace(/(^|-)([a-z])/g,
          (match, prefix, letter) => letter.toUpperCase());
        if (names.has(name)) references.add(names.get(name));
      }
      for (const child of node.children || []) visitTemplate(child);
    };
    if (descriptor.template) visitTemplate(parseVueTemplate(descriptor.template.content));
    if (descriptor.script || descriptor.scriptSetup) {
      const script = compileScript(descriptor, { id: file });
      for (const entry of Object.values(script.imports || {})) {
        if (entry.source.endsWith('.vue') && names.has(basename(entry.source, '.vue'))) {
          references.add(names.get(basename(entry.source, '.vue')));
        }
      }
    }
    edges.set(file, references);
  }
  const reachable = new Set();
  const visit = file => {
    if (!file || reachable.has(file)) return;
    reachable.add(file);
    for (const reference of edges.get(file) || []) visit(reference);
  };
  for (const entry of ['App', 'CardApp', 'ConsApp']) visit(names.get(entry));
  assert.deepEqual(files.filter(file => !reachable.has(file)), []);
});

test('equivalent bold tags do not prompt to save, but removing bold still does', async () => {
  for (const key of ['transcription', 'back', 'context', 'hint']) {
    const word = { ...initialWord(), [key]: '[first<b>stress</b>last]' };
    const vm = editState(word);
    await vm.methods.set_word(word, false);
    vm.dialog.editingWord[key] = '<p>[first<strong>stress</strong>last]</p>';
    await vm.methods.closeDialog();
    assert.equal(vm.dialog.show, false);
    assert.equal(vm.emitted.length, 0);
  }
  const word = { ...initialWord(), transcription: '[first<b>stress</b>last]' };
  const vm = editState(word);
  await vm.methods.set_word(word, false);
  let prompts = 0;
  vm.saveDialog.value = { confirm_popup: async () => { prompts++; return util.CONFIRM_RESULT.STOP; } };
  vm.dialog.editingWord.transcription = '[firststresslast]';
  await vm.methods.closeDialog();
  assert.equal(prompts, 1);
  assert.equal(vm.dialog.show, true);
});

test('translation checkbox saves both states immediately and later edits remain detectable', async () => {
  const vm = editState(initialWord());
  await vm.methods.set_word(initialWord(), false);
  for (const value of [true, false]) {
    const previousSaves = vm.emitted.length;
    vm.methods.saveTranslationStatus(value);
    assert.equal(vm.emitted.length, previousSaves + 1);
    assert.equal(vm.emitted.at(-1)[0], 'save');
    assert.equal(vm.emitted.at(-1)[1].hasTranslation, value);
    assert.equal(vm.dialog.prevWord.hasTranslation, value);
    assert.notEqual(vm.dialog.prevWord, vm.dialog.editingWord);
    assert.equal(vm.dialog.show, true);
  }
  let prompts = 0;
  vm.saveDialog.value = { confirm_popup: async () => { prompts++; return util.CONFIRM_RESULT.STOP; } };
  vm.dialog.editingWord.back = 'changed after autosave';
  await vm.methods.closeDialog();
  assert.equal(prompts, 1);
  assert.equal(vm.dialog.show, true);
  assert.match(editor.template.content, /@update:model-value="methods.saveTranslationStatus"/);
});

test('reader generation preserves book contexts by default and replaces them only when enabled', async () => {
  const originalChrome = globalThis.chrome;
  const originalFetch = globalThis.fetch;
  try {
    globalThis.fetch = async () => ({ ok: true, json: async () => ({ results: [
      { id: 7, front: 'bonjour [bon**jour**]', back: 'hello', context: 'generated example. → translated example.' },
    ] }) });
    for (const ai_model of Object.values(util.AI_MODEL)) {
    for (const [course_id, context, replace_context_for_reader, expected] of [
      ['fr_kindle', '<b>Book example.</b>', false, '<b>Book example.</b>'],
      ['fr_koreader', 'Book example.', false, 'Book example.'],
      ['fr_kindle', 'Book example.', true, 'generated example. → translated example.'],
      ['fr_kindle', '<p><br></p>', false, 'generated example. → translated example.'],
      ['fr_en', 'Old example.', false, 'generated example. → translated example.'],
    ]) {
      let listener;
      globalThis.chrome = { runtime: { id: 'test' },
        tabs: { create: async () => ({ id: 1 }), onUpdated: { addListener: callback => { listener = callback; }, removeListener() {} } },
        scripting: { executeScript: async () => [{ result: [['7', 'bonjour [bon**jour**]', 'hello', 'generated example.', 'translated example.']] }] } };
      const word = { id: 7, front: 'bonjour', course_id, context, targetLang: 'fr', hint: 'Book hint' };
      await processContexts([word], { ai_model, prompt_prefix: 'prompt', request_count: 1,
        words_per_request: 10, add_2_back: true, include_transcription: true, translation_to: 'en', replace_context_for_reader }, () => {});
      if (listener) await listener(1, { status: 'complete' });
      assert.equal(word.context, expected);
      assert.equal(word.back, 'hello');
      assert.equal(word.hasTranslation, true);
      assert.equal(word.transcription, '[bon<b>jour</b>]');
      assert.equal(word.hint, 'Book hint');
      assert.equal(word.targetLang, 'fr');
    }
    }
    assert.equal(util.options.replace_context_for_reader, false);
  } finally {
    globalThis.chrome = originalChrome;
    globalThis.fetch = originalFetch;
  }
});

test('reader generation selects incomplete words and optionally includes completed book contexts', async () => {
  const course_id = 'fr_kindle';
  const options = { current_course_id: course_id, translation_to: 'en', request_count: 1, prompt_prefix: '', include_transcription: false };
  const words = [
    { id: 1, front: 'one', context: 'Book example.', hasTranslation: null },
    { id: 2, front: 'two', context: 'Book example.', hasTranslation: false },
    { id: 3, front: 'three', context: 'Book example.', hasTranslation: true, back: 'translation', transcription: '[three]' },
    { id: 4, front: 'four', context: '<p><br></p>', hasTranslation: true, back: 'translation' },
    { id: 5, front: 'five', context: 'Book example.', hasTranslation: true, back: 'translation' },
    { id: 6, front: 'six', context: 'Book example.', hasTranslation: null, archived: true },
  ].map(word => ({ ...word, course_id }));
  const { vm, props, calls } = contextState(options, words);
  let pending = vm.context_popup({ action() {} });
  assert.equal(vm.isReader.value, true);
  assert.equal(props.optionsData.replace_context_for_reader, false);
  await vm.confirm();
  await pending;
  assert.deepEqual(calls[0][0].map(word => word.id), [1, 2, 4]);
  assert.equal(calls[0][1].replace_context_for_reader, false);
  props.optionsData.include_transcription = true;
  pending = vm.context_popup({ action() {} });
  await vm.confirm();
  await pending;
  assert.deepEqual(calls[1][0].map(word => word.id), [1, 2, 4, 5]);
  props.optionsData.replace_context_for_reader = true;
  pending = vm.context_popup({ action() {} });
  await vm.confirm();
  await pending;
  assert.deepEqual(calls[2][0].map(word => word.id), [1, 2, 3, 4, 5]);
  assert.equal(calls[2][1].replace_context_for_reader, true);
});