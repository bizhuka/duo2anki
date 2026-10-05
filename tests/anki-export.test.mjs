import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { parse, compileTemplate } from '@vue/compiler-sfc';
import initSqlJs from 'sql.js';
import JSZip from 'jszip';
import bigInt from 'big-integer';
import { sha256 } from 'js-sha256';
import { STATUS } from '../src/lib/database.js';
import { util } from '../src/lib/util.js';
import { isLocalExtension, getTranslateUrl } from '../src/lib/ai.js';

// Load the existing exporter with an in-memory download sink. FileSaver's named
// browser export cannot be imported directly by Node; production code stays intact.
let download;
const genankiSource = readFileSync(new URL('../src/lib/genanki.js', import.meta.url), 'utf8')
  .replace(/^import .*;$/gm, '').replace(/^export /gm, '');
const { Model, Deck, Note, Package: AnkiPackage, getStableNoteGuid } = new Function(
  'saveAs', 'sha256', 'JSZip', 'bigInt', 'STATUS',
  `${genankiSource}\nreturn { Model, Deck, Note, Package, getStableNoteGuid };`
)((blob, name) => { download = { blob, name }; }, sha256, JSZip, bigInt, STATUS);
const { descriptor } = parse(readFileSync(new URL('../src/components/Anki.vue', import.meta.url), 'utf8'));
const component = new Function('util', 'ActionButton', 'Model', 'Deck', 'Note', 'AnkiPackage', 'getStableNoteGuid',
  descriptor.script.content.replace(/^import .*;$/gm, '').replace('export default', 'return')
)(util, {}, Model, Deck, Note, AnkiPackage, getStableNoteGuid);
const SQL = await initSqlJs();
globalThis.window = { SQL };

const word = { id: 1, front: 'bonjour', back: 'hello; good morning; greeting',
  context: '<b>Bonjour</b> tout le monde. → Hello everyone.', transcription: 'bɔ̃ʒuʁ',
  targetLang: 'fr', image: 'example.png', hasTranslation: true, course_id: 'fr_en' };

function exporter(mode, words = [word], courseId = 'fr_en') {
  const vm = { ...component.data(), optionsData: { ...util.options, current_course_id: courseId, ankiExportMode: mode },
    db_words: words, messages: [], showMessage(...args) { this.messages.push(args); } };
  for (const [name, method] of Object.entries(component.methods)) vm[name] = method.bind(vm);
  for (const [name, getter] of Object.entries(component.computed)) {
    Object.defineProperty(vm, name, { get: getter.bind(vm) });
  }
  return vm;
}

async function exportCollection(vm) {
  download = null;
  await vm.triggerExport();
  assert.ok(download, JSON.stringify(vm.messages));
  const zip = await JSZip.loadAsync(await download.blob.arrayBuffer());
  assert.deepEqual(Object.keys(zip.files).sort(), ['collection.anki2', 'media']);
  assert.equal(await zip.file('media').async('string'), '{}');
  const db = new SQL.Database(await zip.file('collection.anki2').async('uint8array'));
  try {
    const model = Object.values(JSON.parse(db.exec('SELECT models FROM col')[0].values[0][0]))[0];
    const [fields, guid] = db.exec('SELECT flds, guid FROM notes')[0].values[0];
    assert.equal(db.exec('SELECT count(*) FROM cards')[0].values[0][0], 1);
    return { model, fields: Object.fromEntries(model.flds.map((f, i) => [f.name, fields.split('\x1f')[i]])), guid };
  } finally {
    db.close();
  }
}

test('speech text and provider URLs preserve all browser sound modes', () => {
  assert.equal(util.options.ttsProvider, util.TTS_PROVIDER.RESPONSIVE_VOICE);
  const expected = new Map([
    [util.SOUND_MODE.OFF, null], [util.SOUND_MODE.FRONT_WORD, 'bonjour'],
    [util.SOUND_MODE.CONTEXT_ONLY, 'Bonjour tout le monde.'],
    [util.SOUND_MODE.FRONT_WORD_WITH_CONTEXT, 'bonjour. Bonjour tout le monde.'],
  ]);
  for (const [mode, text] of expected) {
    assert.equal(util.get_sound_text(word, mode), text);
    assert.equal(util.get_sound_url(word, mode), text === null ? null :
      `https://texttospeech.responsivevoice.org/v1/text:synthesize?text=${encodeURIComponent(text)}&lang=fr&engine=g3&name=&pitch=0.5&rate=0.5&volume=1&key=StO3dWAU&gender=female`);
  }
  assert.equal(util.get_sound_text(null), null);
  assert.equal(util.get_sound_text({}), null);
  assert.equal(util.get_sound_text({ front: ' mot ' }), 'mot');
  assert.equal(util.get_sound_url({ front: 'mot' }), null);
  assert.equal(util.get_sound_text({ context: '<b>phrase</b> → translation' }), 'phrase');
  assert.equal(util.get_sound_text({ front: 'mot' }, util.SOUND_MODE.CONTEXT_ONLY), null);
  const provider = util.options.ttsProvider;
  try {
    util.options.ttsProvider = util.TTS_PROVIDER.GOOGLE;
    assert.equal(util.get_sound_url(word),
      `https://translate.google.com/translate_tts?ie=UTF-8&client=tw-ob&tl=fr&q=${encodeURIComponent(expected.get(40))}`);
    assert.equal(Object.hasOwn(util.TTS_PROVIDER, 'AZURE_MICROSOFT'), false);
    util._set_options({ ttsProvider: 'Azure Microsoft' });
    assert.equal(util.options.ttsProvider, util.TTS_PROVIDER.RESPONSIVE_VOICE);
  } finally { util.options.ttsProvider = provider; }
});

test('local and released extension IDs select the correct translation backend', () => {
  const chromeOriginal = globalThis.chrome;
  try {
    for (const [id, local] of [['another-local-development-id', true],
      ['jeaabcmnagiglkfhfeokcigpbmddmcdh', true],
      ['ilcpcjkfnmgmjknmoclnlelkcaiibnkf', false],
      ['lbmmipgdkklfhencdebpjjnpenifehle', false]]) {
      globalThis.chrome = { runtime: { id } };
      assert.equal(isLocalExtension(), local);
      assert.equal(getTranslateUrl(), local ? 'http://localhost:3000/translate'
        : 'https://duo2anki-backend.vercel.app/translate');
    }
  } finally { globalThis.chrome = chromeOriginal; }
});

test('every exportWith option is enabled by default and has a compilable checkbox', () => {
  for (const key of Object.keys(util.options).filter(key => key.startsWith('exportWith'))) {
    assert.equal(util.options[key], true);
    assert.ok(descriptor.template.content.includes(`v-model="optionsData.${key}"`));
  }
  assert.equal(Object.hasOwn(util.options, 'collection_media'), false);
  assert.equal(Object.hasOwn(util.options, 'exportWithAzureTranslationsOnly'), false);
  assert.ok(!descriptor.template.content.includes('collection_media'));
  assert.equal(compileTemplate({ source: descriptor.template.content, filename: 'Anki.vue', id: 'test' }).errors.length, 0);
});

test('each checkbox filters both Duolingo and reader words and can be disabled', () => {
  const missing = [
    ['exportWithContextOnly', { context: '' }],
    ['exportWithTranslationsOnly', { back: '' }],
    ['exportWithTranslationsOnly', { back: '   ' }],
    ['exportWithTranslationsOnly', { hasTranslation: false }],
    ['exportWithTranslationsOnly', { hasTranslation: undefined }],
    ['exportWithImagesOnly', { image: '' }],
  ];
  for (const course_id of ['fr_en', 'kindle']) {
    for (const [option, change] of missing) {
      const vm = exporter('direct', [{ ...word, course_id, ...change }], course_id);
      assert.equal(typeof vm.getValidWordsForExport(), 'string');
      vm.optionsData[option] = false;
      assert.equal(vm.getValidWordsForExport().length, 1);
    }
  }
});

for (const mode of ['direct', 'reverse', 'listening']) {
  test(`${mode}: exported APKG contains native TTS text and one card, without audio downloads`, async () => {
    const vm = exporter(mode);
    const course = util.options.current_course_id;
    const provider = util.options.ttsProvider;
    util.options.current_course_id = 'fr_en';
    // Export must not consult a browser provider or fetch speech files.
    util.options.ttsProvider = 'unavailable';
    const fetchOriginal = globalThis.fetch;
    globalThis.fetch = () => { throw new Error('Export attempted a network request'); };
    try {
      const { model, fields, guid } = await exportCollection(vm);
      assert.equal(fields.TtsLanguage, 'fr_FR');
      assert.equal(fields.Context, word.context);
      assert.equal(guid, getStableNoteGuid(word.course_id, word.front, mode));
      assert.deepEqual(new Note(new Model(model), Object.values(fields)).cards, [0]);
      const { qfmt, afmt } = model.tmpls[0];
      assert.ok(!qfmt.includes('[sound:') && !afmt.includes('[sound:'));
      if (mode === 'direct') {
        assert.equal(fields.Sound, 'bonjour');
        assert.equal(fields.ContextSound, 'Bonjour tout le monde.');
        assert.ok(qfmt.includes('[anki:tts lang={{TtsLanguage}} speed=1]{{Sound}}[/anki:tts]'));
        assert.ok(afmt.includes('[anki:tts lang={{TtsLanguage}} speed=1]{{ContextSound}}[/anki:tts]'));
      } else {
        assert.equal(fields.ReversePrompt, 'hello; good morning');
        assert.equal(fields.CombinedSound, 'bonjour. Bonjour tout le monde.');
        if (mode === 'reverse') {
          assert.ok(qfmt.includes('{{ReversePrompt}}') && !qfmt.includes('[anki:tts'));
          assert.ok(afmt.includes('[anki:tts lang={{TtsLanguage}} speed=1]{{CombinedSound}}[/anki:tts]'));
        } else {
          assert.ok(qfmt.includes('[anki:tts lang={{TtsLanguage}} speed=1]{{CombinedSound}}[/anki:tts]') && !qfmt.includes('{{Front}}'));
          assert.ok(afmt.startsWith('{{FrontSide}}') && !afmt.includes('[anki:tts'));
        }
      }
    } finally {
      util.options.current_course_id = course;
      util.options.ttsProvider = provider;
      globalThis.fetch = fetchOriginal;
    }
  });
}

test('language selection handles reader locales, aliases and missing languages', () => {
  const vm = exporter('listening');
  for (const [language, expected] of [['en', 'en_US'], ['en-GB', 'en_GB'], ['ja', 'ja_JP'],
    ['zh-TW', 'zh_TW'], ['pt_BR', 'pt_BR'], ['ua', 'uk_UA'], ['no', 'nb_NO'], ['', ''], ['invalid language', '']]) {
    assert.equal(vm.getTtsLanguage(language), expected);
  }
  vm.db_words = [{ ...word, targetLang: '' }];
  assert.equal(typeof vm.getValidWordsForExport(), 'string');
});

test('Anki speed stays in the template and mixed reader languages retain per-note selection', async () => {
  const vm = exporter('listening');
  vm.optionsData.ttsSpeed = 0.8;
  const result = await exportCollection(vm);
  assert.ok(result.model.tmpls[0].qfmt.includes('[anki:tts lang={{TtsLanguage}} speed=0.8]{{CombinedSound}}[/anki:tts]'));
  assert.equal(result.fields.TtsLanguage, 'fr_FR');

  vm.db_words = [{ ...word, course_id: 'kindle' },
    { ...word, front: 'hello', targetLang: 'en-GB', course_id: 'kindle' }];
  vm.optionsData.current_course_id = 'kindle';
  download = null;
  await vm.triggerExport();
  assert.ok(download, JSON.stringify(vm.messages));
  const zip = await JSZip.loadAsync(await download.blob.arrayBuffer());
  const db = new SQL.Database(await zip.file('collection.anki2').async('uint8array'));
  try {
    const model = Object.values(JSON.parse(db.exec('SELECT models FROM col')[0].values[0][0]))[0];
    const languageIndex = model.flds.findIndex(field => field.name === 'TtsLanguage');
    assert.ok(languageIndex >= 0);
    assert.deepEqual(db.exec('SELECT flds FROM notes')[0].values.map(([fields]) => fields.split('\x1f')[languageIndex]),
      ['fr_FR', 'en_GB']);
    assert.ok(model.tmpls[0].qfmt.includes('[anki:tts lang={{TtsLanguage}} speed=0.8]'));
    assert.equal(db.exec('SELECT count(*) FROM cards')[0].values[0][0], 2);
  } finally { db.close(); }
});

test('browser replay still stops the previous sound and OFF does not start audio', () => {
  const audioOriginal = globalThis.Audio;
  const playerOriginal = util.audioPlayer;
  const speedOriginal = util.options.ttsSpeed;
  const providerOriginal = util.options.ttsProvider;
  globalThis.Audio = class {
    constructor(url) { this.url = url; this.currentTime = 5; this.paused = false; }
    play() { this.played = true; return Promise.resolve(); }
    pause() { this.paused = true; }
  };
  try {
    util.audioPlayer = null;
    const first = util.playSound(word, util.SOUND_MODE.FRONT_WORD);
    assert.ok(first.played);
    const second = util.playSound(word, util.SOUND_MODE.CONTEXT_ONLY);
    assert.ok(first.paused && first.currentTime === 0 && second.played);
    assert.equal(second.url, util.get_sound_url(word, util.SOUND_MODE.CONTEXT_ONLY));
    assert.equal(util.playSound(word, util.SOUND_MODE.OFF), null);
    assert.ok(second.paused && second.currentTime === 0);
    for (const speed of [0.5, 0.8, 1, 1.5]) {
      util.options.ttsSpeed = speed;
      util.options.ttsProvider = util.TTS_PROVIDER.RESPONSIVE_VOICE;
      assert.equal(new URL(util.get_sound_url(word)).searchParams.get('rate'), '0.5');
      assert.equal(util.playSound(word).playbackRate, speed);
      util.options.ttsProvider = util.TTS_PROVIDER.GOOGLE;
      assert.equal(util.playSound(word).playbackRate, speed);
    }
  } finally {
    globalThis.Audio = audioOriginal;
    util.audioPlayer = playerOriginal;
    util.options.ttsSpeed = speedOriginal;
    util.options.ttsProvider = providerOriginal;
  }
});
