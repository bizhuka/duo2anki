import './ai-example.test.mjs';
import './reader-import.test.mjs';
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
import { translationLanguages } from '../src/lib/translationLanguages.js';
import { getDuolingoCourseLanguage, normalizeLanguageCode } from '../src/lib/i18n/translation.js';

// Load the existing exporter with an in-memory download sink. FileSaver's named
// browser export cannot be imported directly by Node; production code stays intact.
let download;
const genankiSource = readFileSync(new URL('../src/lib/genanki.js', import.meta.url), 'utf8')
  .replace(/^import .*;$/gm, '').replace(/^export /gm, '');
const { Model, Deck, Note, Package: AnkiPackage, getStableNoteGuid, getReaderAnkiId } = new Function(
  'saveAs', 'sha256', 'JSZip', 'bigInt', 'STATUS',
  `${genankiSource}\nreturn { Model, Deck, Note, Package, getStableNoteGuid, getReaderAnkiId };`
)((blob, name) => { download = { blob, name }; }, sha256, JSZip, bigInt, STATUS);
const { descriptor } = parse(readFileSync(new URL('../src/components/Anki.vue', import.meta.url), 'utf8'));
const component = new Function('util', 'ActionButton', 'Model', 'Deck', 'Note', 'AnkiPackage', 'getStableNoteGuid', 'getReaderAnkiId', 'normalizeLanguageCode',
  descriptor.script.content.replace(/^import .*;$/gm, '').replace('export default', 'return')
)(util, {}, Model, Deck, Note, AnkiPackage, getStableNoteGuid, getReaderAnkiId, normalizeLanguageCode);
const SQL = await initSqlJs();
globalThis.window = { SQL };

const word = { id: 1, front: 'bonjour', back: 'hello; good morning; greeting',
  context: '<b>Bonjour</b> tout le monde. → Hello everyone.', transcription: 'bɔ̃ʒuʁ', hint: 'French book',
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

test('Anki always requires marked nonempty translations and disables export when no eligible words remain', () => {
  assert.equal(Object.hasOwn(util.options, 'exportWithTranslationsOnly'), false);
  assert.doesNotMatch(descriptor.template.content, /v-model="optionsData.exportWithTranslationsOnly"/);
  assert.match(descriptor.template.content, /anki_translationRequired/);
  for (const course_id of ['fr_en', 'fr_kindle', 'fr_koreader']) {
    for (const change of [{ back: '' }, { back: ' ' }, { back: '<p><br></p>' }, { hasTranslation: false },
      { hasTranslation: null }, { hasTranslation: undefined }]) {
      const vm = exporter('direct', [{ ...word, course_id, ...change }], course_id);
      vm.optionsData.exportWithTranslationsOnly = false;
      assert.equal(typeof vm.getValidWordsForExport(), 'string');
      assert.equal(vm.canExport, false);
    }
    const valid = exporter('direct', [{ ...word, course_id }], course_id);
    assert.equal(valid.canExport, true);
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
      assert.equal(Object.hasOwn(fields, 'TtsLanguage'), false);
      assert.equal(model.flds.some(field => field.name === 'TtsLanguage'), false);
      assert.equal(fields.Context, word.context);
      assert.equal(fields.Hint, word.hint);
      assert.equal(fields.Transcription, word.transcription);
      assert.equal(model.flds.at(-1).name, 'Hint');
      assert.equal(guid, getStableNoteGuid(word.course_id, word.front, mode));
      assert.deepEqual(new Note(new Model(model), Object.values(fields)).cards, [0]);
      const { qfmt, afmt } = model.tmpls[0];
      assert.doesNotMatch(qfmt + afmt, /TtsLanguage/);
      assert.match(qfmt, /\{\{Hint\}\}/);
      if (mode === 'listening') {
        assert.ok(qfmt.indexOf('[anki:tts') < qfmt.indexOf('{{Hint}}'));
        assert.doesNotMatch(qfmt, /\{\{Transcription\}\}/);
        assert.match(afmt, /\{\{FrontSide\}\}/);
        assert.match(afmt, /\{\{Transcription\}\}/);
        assert.doesNotMatch(afmt, /\{\{Hint\}\}/);
      } else {
        assert.match(afmt, /\{\{Hint\}\}/);
        if (mode === 'reverse') {
          assert.doesNotMatch(qfmt, /\{\{Transcription\}\}/);
          assert.match(afmt, /<div>\{\{Front\}\}<\/div>\{\{#Transcription\}\}/);
          assert.match(afmt, /\{\{Transcription\}\}/);
        } else {
          assert.match(qfmt, /\{\{Transcription\}\}/);
          assert.ok(qfmt.indexOf('{{Front}}') < qfmt.indexOf('{{Transcription}}'));
          assert.ok(qfmt.indexOf('{{Transcription}}') < qfmt.indexOf('{{Hint}}'));
          assert.ok(qfmt.indexOf('{{Hint}}') < qfmt.indexOf('[anki:tts'));
        }
      }
      assert.ok(!qfmt.includes('[sound:') && !afmt.includes('[sound:'));
      if (mode === 'direct') {
        assert.equal(fields.Sound, 'bonjour');
        assert.equal(fields.ContextSound, 'Bonjour tout le monde.');
        assert.ok(qfmt.includes('[anki:tts lang=fr_FR speed=1]{{Sound}}[/anki:tts]'));
        assert.ok(afmt.includes('[anki:tts lang=fr_FR speed=1]{{ContextSound}}[/anki:tts]'));
      } else {
        assert.equal(fields.ReversePrompt, 'hello; good morning');
        assert.equal(fields.CombinedSound, 'bonjour. Bonjour tout le monde.');
        if (mode === 'reverse') {
          assert.ok(qfmt.includes('{{ReversePrompt}}') && !qfmt.includes('[anki:tts'));
          assert.ok(afmt.includes('[anki:tts lang=fr_FR speed=1]{{CombinedSound}}[/anki:tts]'));
        } else {
          assert.ok(qfmt.includes('[anki:tts lang=fr_FR speed=1]{{CombinedSound}}[/anki:tts]') && !qfmt.includes('{{Front}}'));
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
    ['zh-TW', 'zh_TW'], ['pt_BR', 'pt_BR'], ['ua', 'uk_UA'], ['UK', 'uk_UA'], ['ua_UA', 'uk_UA'],
    ['ukr', 'uk_UA'], ['no', 'nb_NO'], ['', ''], ['invalid language', '']]) {
    assert.equal(vm.getTtsLanguage(language), expected);
  }
  vm.db_words = [{ ...word, targetLang: '' }];
  assert.equal(vm.getValidWordsForExport().length, 1);
  vm.optionsData.current_course_id = 'kindle';
  vm.db_words = [{ ...word, course_id: 'kindle' }];
  assert.equal(typeof vm.getValidWordsForExport(), 'string');
});

test('shared language normalization handles Ukrainian aliases without changing stored course IDs', () => {
  for (const code of ['UA', 'UK', 'ua', 'uk', 'ukr', 'ua_UA', 'UK-ua']) {
    assert.equal(normalizeLanguageCode(code).split('-')[0], 'uk');
    assert.equal(getDuolingoCourseLanguage(code), 'Ukrainian');
  }
  assert.equal(normalizeLanguageCode('UA_UA'), 'uk-ua');
  assert.equal(normalizeLanguageCode('zh_Hant_TW'), 'zh-hant-tw');
  assert.equal(getDuolingoCourseLanguage('nb'), 'Norwegian (Bokmål)');
  assert.deepEqual(util.get_course_info('ua_en'), { targetLang: 'ua', sourceLang: 'en', lang_id: 'UA' });
  assert.match(util.getCourseName('uk_kindle'), /Ukrainian/);
  assert.match(descriptor.template.content, /anki_scheduleInfoTooltip/);
});

test('Anki templates take locale only from course_id and ignore individual word locales', async () => {
  const vm = exporter('listening');
  vm.optionsData.ttsSpeed = 0.8;
  const result = await exportCollection(vm);
  assert.ok(result.model.tmpls[0].qfmt.includes('[anki:tts lang=fr_FR speed=0.8]{{CombinedSound}}[/anki:tts]'));
  assert.equal(Object.hasOwn(result.fields, 'TtsLanguage'), false);

  vm.db_words = [{ ...word, course_id: 'kindle' },
    { ...word, front: 'hello', targetLang: 'en-GB', course_id: 'kindle' }];
  vm.optionsData.current_course_id = 'kindle';
  download = null;
  await vm.triggerExport();
  assert.equal(download, null);
  assert.equal(vm.messages.at(-1)[1], 'warning');

  const previous = util.options.current_course_id;
  try {
    util.options.current_course_id = 'en_kindle';
    const reader = exporter('listening', [{ ...word, course_id: 'en_kindle', targetLang: 'en-GB' }], 'en_kindle');
    const courseVoice = await exportCollection(reader);
    assert.match(courseVoice.model.tmpls[0].qfmt, /lang=en_US speed=1/);
    reader.db_words = [{ ...word, course_id: 'en_kindle', targetLang: 'en-GB' },
      { ...word, front: 'hello', course_id: 'en_kindle', targetLang: 'fr' },
      { ...word, front: 'bye', course_id: 'en_kindle', targetLang: '' }];
    download = null;
    await reader.triggerExport();
    assert.ok(download);
    const zip = await JSZip.loadAsync(await download.blob.arrayBuffer());
    const db = new SQL.Database(await zip.file('collection.anki2').async('uint8array'));
    try {
      const model = Object.values(JSON.parse(db.exec('SELECT models FROM col')[0].values[0][0]))[0];
      assert.match(model.tmpls[0].qfmt, /lang=en_US speed=1/);
      assert.equal(model.flds.some(field => field.name === 'TtsLanguage'), false);
      assert.equal(db.exec('SELECT count(*) FROM cards')[0].values[0][0], 3);
    } finally { db.close(); }
  } finally { util.options.current_course_id = previous; }
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

test('reader model/deck IDs and note GUIDs differ across readers, languages and modes and remain stable', () => {
  const ids = new Set();
  const guids = new Set();
  for (const reader of ['kindle', 'koreader']) {
    for (const language of new Set(translationLanguages.map(item => item.value))) {
      const course = util.createReaderCourseId(reader, language);
      for (const mode of ['direct', 'reverse', 'listening']) {
        for (const role of ['model', 'deck']) {
          const id = getReaderAnkiId(course, mode, role);
          assert.equal(Number.isSafeInteger(id), true);
          assert.equal(id >= 1000000000000, true);
          assert.equal(ids.has(id), false);
          assert.equal(getReaderAnkiId(course, mode, role), id);
          ids.add(id);
        }
        const guid = getStableNoteGuid(course, 'bonjour', mode);
        assert.equal(guids.has(guid), false);
        guids.add(guid);
      }
    }
  }
});

test('language-specific reader APKGs have separate note types and retain current native audio templates', async () => {
  const previous = util.options.current_course_id;
  const models = new Set();
  const guids = new Set();
  try {
    for (const course of ['fr_kindle', 'fr_koreader', 'en_kindle']) {
      for (const mode of ['direct', 'reverse', 'listening']) {
        util.options.current_course_id = course;
        const vm = exporter(mode, [{ ...word, course_id: course, targetLang: course.split('_')[0] }], course);
        assert.match(vm.deckName, course.endsWith('kindle') ? /Kindle/ : /KOReader/);
        assert.match(vm.nodeType, course.startsWith('fr') ? /French/ : /English/);
        const exported = await exportCollection(vm);
        assert.equal(exported.model.id, getReaderAnkiId(course, mode, 'model'));
        assert.equal(models.has(exported.model.id), false);
        assert.equal(guids.has(exported.guid), false);
        models.add(exported.model.id);
        guids.add(exported.guid);
        assert.equal(exported.fields.Transcription, word.transcription);
        assert.equal(exported.fields.Hint, word.hint);
        assert.equal(Object.hasOwn(exported.fields, 'TtsLanguage'), false);
        assert.match(exported.model.tmpls[0].qfmt + exported.model.tmpls[0].afmt,
          course.startsWith('fr') ? /lang=fr_FR speed=1/ : /lang=en_US speed=1/);
        const repeated = await exportCollection(vm);
        assert.equal(repeated.model.id, exported.model.id);
        assert.equal(repeated.guid, exported.guid);
      }
    }
  } finally { util.options.current_course_id = previous; }
});
