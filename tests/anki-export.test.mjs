import './ai-example.test.mjs';
import './reader-import.test.mjs';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { reactive, computed, watch, nextTick, toRaw } from 'vue';
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
import { readGoogleSearchImage } from '../src/lib/imageSearch.js';
import * as ankiTemplates from '../src/lib/ankiTemplates.js';
import * as ankiPreview from '../src/lib/ankiTemplatePreview.js';

// Load the existing exporter with an in-memory download sink. FileSaver's named
// browser export cannot be imported directly by Node; production code stays intact.
let download;
const genankiSource = readFileSync(new URL('../src/lib/genanki.js', import.meta.url), 'utf8')
  .replace(/^import .*;$/gm, '').replace(/^export /gm, '');
const { Model, Deck, Note, Package: AnkiPackage, getStableNoteGuid, getReaderAnkiId } = new Function(
  'saveAs', 'sha256', 'JSZip', 'bigInt',
  `${genankiSource}\nreturn { Model, Deck, Note, Package, getStableNoteGuid, getReaderAnkiId };`
)((blob, name) => { download = { blob, name }; }, sha256, JSZip, bigInt);
const { descriptor } = parse(readFileSync(new URL('../src/components/Anki.vue', import.meta.url), 'utf8'));
const component = new Function('util', 'ActionButton', 'Model', 'Deck', 'Note', 'AnkiPackage', 'getStableNoteGuid', 'getReaderAnkiId', 'normalizeLanguageCode',
  ...Object.keys(ankiTemplates), 'AnkiTemplateEditor',
  descriptor.script.content.replace(/^import .*;$/gm, '').replace('export default', 'return')
)(util, {}, Model, Deck, Note, AnkiPackage, getStableNoteGuid, getReaderAnkiId, normalizeLanguageCode, ...Object.values(ankiTemplates), {});
const editorDescriptor = parse(readFileSync(new URL('../src/components/AnkiTemplateEditor.vue', import.meta.url), 'utf8')).descriptor;
const editorComponent = new Function('util', 'ActionButton', ...Object.keys(ankiTemplates), ...Object.keys(ankiPreview),
  editorDescriptor.script.content.replace(/^import[\s\S]*?;\r?$/gm, '').replace('export default', 'return')
)(util, {}, ...Object.values(ankiTemplates), ...Object.values(ankiPreview));
const SQL = await initSqlJs();
globalThis.window = { SQL };

const word = { id: 1, front: 'bonjour', back: 'hello; good morning; greeting',
  context: '<b>Bonjour</b> tout le monde. → Hello everyone.', transcription: 'bɔ̃ʒuʁ', hint: 'French book',
  targetLang: 'fr', image: 'example.png', hasTranslation: true, course_id: 'fr_en' };

test('image sources limit base64 length without limiting URLs', () => {
  const prefix = 'data:image/jpeg;base64,';
  const boundary = prefix + 'A'.repeat(util.maxBase64ImageLength - prefix.length);
  assert.equal(util.isImageTooLarge(boundary), false);
  assert.equal(util.isImageTooLarge(boundary + 'A'), true);
  assert.equal(util.isImageTooLarge('https://example.com/' + 'A'.repeat(util.maxBase64ImageLength)), false);
  assert.equal(util.isImageTooLarge(null), false);
});

test('image warnings include all course words, sort by size, and clear on the next clean export', async () => {
  const image = 'data:image/jpeg;base64,' + 'A'.repeat(util.maxBase64ImageLength);
  for (const mode of ['direct', 'reverse', 'listening']) {
    const words = [{ ...word, image }, { ...word, front: 'salut', image: image + 'A' },
      { ...word, front: 'merci' }, { ...word, front: 'archived', image: image + 'AA', archived: true },
      { ...word, front: 'missing-context', image: image + 'AAA', context: '' },
      { ...word, front: 'untranslated', image: image + 'AAAA', hasTranslation: false },
      { ...word, front: 'other-course', image: image + 'AAAAA', course_id: 'de_en' }];
    const original = structuredClone(words);
    const vm = exporter(mode, words);
    await vm.triggerExport();
    assert.ok(download);
    assert.deepEqual(vm.db_words, original);
    assert.equal(vm.importGuide.show, true);
    assert.equal(vm.importGuide.tab, 'import');
    const warnings = ['untranslated', 'missing-context', 'archived', 'salut', 'bonjour']
      .map((word, index) => ({ word, size: image.length + 4 - index }));
    assert.deepEqual(vm.importGuide.warnings, warnings);
    assert.ok(vm.messages.every(([, type]) => type === 'success'));
    const zip = await JSZip.loadAsync(await download.blob.arrayBuffer());
    const db = new SQL.Database(await zip.file('collection.anki2').async('uint8array'));
    try {
      const images = db.exec('SELECT flds FROM notes')[0].values.map(([fields]) => fields.split('\x1f')[3]);
      assert.deepEqual(images, [image, image + 'A', word.image]);
      assert.equal(db.exec('SELECT count(*) FROM cards')[0].values[0][0], 3);
    } finally { db.close(); }
    // The tab must still have warnings when every oversized image is excluded from export.
    vm.db_words = words.filter(item => !['bonjour', 'salut'].includes(item.front));
    await exportCollection(vm);
    assert.deepEqual(vm.importGuide.warnings, warnings.slice(0, 3));
    vm.importGuide.tab = 'warnings';
    vm.db_words = [{ ...word }];
    await exportCollection(vm);
    assert.deepEqual(vm.importGuide.warnings, []);
    assert.equal(vm.importGuide.tab, 'import');
  }
});

function imageDropZone(props, emit) {
  const { descriptor: dropZone } = parse(readFileSync(
    new URL('../src/components/small/ImageDropZone.vue', import.meta.url), 'utf8'));
  const dropComponent = new Function('ref', 'computed', 'useTheme', 'util',
    dropZone.script.content.replace(/^import .*;.*$/gm, '').replace('export default', 'return'))(
    value => ({ value }), getter => ({ get value() { return getter(); } }), () => ({}), util);
  return dropComponent.setup(props, { emit });
}

test('image drops reject oversized base64 without updating or saving', () => {
  const events = [];
  const { methods } = imageDropZone({ image: null }, (...args) => events.push(args));
  methods.setImage('data:image/png;base64,' + 'A'.repeat(util.maxBase64ImageLength));
  assert.deepEqual(events, [['image-too-large']]);
  events.length = 0;
  methods.setImage('https://example.com/image');
  assert.deepEqual(events, [['update:image', 'https://example.com/image'], ['save']]);
  events.length = 0;
  methods.setImage('data:image/png;base64,AAAA');
  assert.deepEqual(events, [['update:image', 'data:image/png;base64,AAAA'], ['save']]);
});

test('image drops prefer image URLs over file content and surrounding webpage links', () => {
  const events = [];
  const props = { image: null };
  const { methods } = imageDropZone(props, (...args) => {
    events.push(args);
    if (args[0] === 'update:image') props.image = args[1];
  });
  const originalParser = globalThis.DOMParser;
  const originalReader = globalThis.FileReader;
  const imageUrl = 'https://example.com/image';
  const webpage = 'https://example.com/page';
  const base64 = 'data:image/png;base64,' + 'A'.repeat(util.maxBase64ImageLength);
  let imageSource = imageUrl;
  let imageLink = webpage;
  let reads = 0;
  globalThis.DOMParser = class {
    parseFromString() {
      return { querySelector: () => ({ getAttribute: () => imageSource,
        closest: () => ({ getAttribute: () => imageLink }) }) };
    }
  };
  globalThis.FileReader = class {
    readAsDataURL() {
      reads++;
      this.onload({ target: { result: base64 } });
    }
  };
  const drop = (html, uri = '', plain = '') => methods.handleDrop({ preventDefault() {},
    dataTransfer: { files: [{ type: 'image/png' }],
      getData: type => ({ 'text/html': html, 'text/uri-list': uri, 'text/plain': plain })[type] || '' } });
  try {
    drop('image', webpage);
    assert.deepEqual(events, [['update:image', imageUrl], ['save']]);
    assert.equal(reads, 0);
    events.length = 0;
    const thumbnail = 'https://encrypted-tbn0.gstatic.com/images?q=test';
    imageSource = thumbnail;
    imageLink = 'https://www.google.com/imgres?imgurl=' + encodeURIComponent(imageUrl);
    drop('image', imageLink);
    assert.deepEqual(events, [['update:image', imageUrl], ['save']]);
    methods.handleImageError();
    assert.deepEqual(events.slice(2), [['update:image', thumbnail], ['save']]);
    assert.equal(reads, 0);
    events.length = 0;
    imageSource = base64;
    imageLink = 'https://www.google.com/imgres?imgurl=' + encodeURIComponent(imageUrl);
    drop('image', imageLink);
    assert.deepEqual(events, [['update:image', imageUrl], ['save']]);
    assert.equal(reads, 0);
    events.length = 0;
    imageLink = webpage;
    drop('image', webpage, imageUrl);
    assert.deepEqual(events, [['update:image', imageUrl], ['save']]);
    assert.equal(reads, 0);
    events.length = 0;
    drop('image', webpage);
    assert.deepEqual(events, [['image-too-large']]);
    assert.equal(reads, 1);
    events.length = 0;
    drop('');
    assert.deepEqual(events, [['image-too-large']]);
    assert.equal(reads, 2);
  } finally {
    globalThis.DOMParser = originalParser;
    globalThis.FileReader = originalReader;
  }
});

test('failed original images save the HTTPS thumbnail, retry identical drops, and never loop or apply stale fallbacks', () => {
  const original = 'https://example.com/protected.jpg';
  const thumbnail = 'https://encrypted-tbn0.gstatic.com/images?q=test';
  const props = { image: original };
  const events = [];
  const { methods, imageVersion } = imageDropZone(props, (...args) => {
    events.push(args);
    if (args[0] === 'update:image') props.image = args[1];
  });
  methods.setImage(original, thumbnail);
  assert.equal(imageVersion.value, 1);
  methods.handleImageError();
  assert.equal(props.image, thumbnail);
  assert.deepEqual(events, [['update:image', original], ['save'], ['update:image', thumbnail], ['save']]);
  assert.equal(imageVersion.value, 2);
  methods.handleImageError();
  assert.equal(events.length, 4);

  methods.setImage(original, thumbnail);
  props.image = 'https://example.com/different-word.jpg';
  methods.handleImageError();
  assert.equal(props.image, 'https://example.com/different-word.jpg');

  methods.setImage(original, 'http://example.com/insecure.jpg');
  methods.handleImageError();
  assert.equal(props.image, original);
  const version = imageVersion.value;
  methods.setImage(original, original);
  assert.equal(imageVersion.value, version + 1);
  methods.handleImageError();
  assert.equal(props.image, original);
});

test('image editor shows app-level errors for oversized autofill and context-menu images without replacing the current image', () => {
  const { descriptor: editor } = parse(readFileSync(
    new URL('../src/components/EditDialog.vue', import.meta.url), 'utf8'));
  const editorComponent = new Function('reactive', 'ref', 'watch', 'nextTick', 'computed', 'onBeforeUnmount',
    'util', 'ENABLE_DEBUG_LOGGING', 'ReplaySoundButton', 'GenerateExampleButton',
    'googleImageSearchQuery', 'readGoogleSearchImage',
    editor.script.content.replace(/^import .*;$/gm, '').replace('export default', 'return'))(
    value => value, value => ({ value }), () => {}, async () => {},
    getter => ({ get value() { return getter(); } }), () => {}, util, false, {}, {}, () => {}, () => {});
  const events = [];
  const messages = [];
  assert.doesNotMatch(editor.template.content, /<InfoAlert/);
  const vm = editorComponent.setup({ filteredWords: [], optionsData: util.options,
    showMessage: (...args) => messages.push(args) },
    { emit: (...args) => events.push(args) });
  vm.dialog.show = true;
  vm.dialog.editingWord = { ...word };
  assert.equal(vm.methods.setImage('data:image/jpeg;base64,' + 'A'.repeat(util.maxBase64ImageLength)), false);
  assert.equal(vm.dialog.editingWord.image, word.image);
  assert.deepEqual(events, []);
  assert.deepEqual(messages, [[util.getImageTooLargeMessage(), 'error']]);
  const image = 'https://example.com/original';
  assert.equal(vm.methods.setImage(image), true);
  assert.equal(vm.dialog.editingWord.image, image);
  assert.equal(events.length, 1);
  assert.equal(events[0][0], 'save');
  assert.equal(messages.length, 1);
});

test('Google image autofill prefers original URLs and never converts URLs to base64', async () => {
  const originalLocation = globalThis.location;
  const originalDocument = globalThis.document;
  const source = 'data:image/jpeg;base64,AAAA';
  const thumbnail = 'https://example.com/thumbnail';
  const original = 'https://example.com/original';
  const image = (src, href = null) => ({ currentSrc: src, complete: true, naturalWidth: 200,
    naturalHeight: 200, getBoundingClientRect: () => ({ width: 100, height: 100 }),
    closest: () => href ? { href } : null });
  let images = [];
  globalThis.location = { href: 'https://www.google.com/search?udm=2&q=bonjour' };
  globalThis.document = { querySelectorAll: () => images,
    createElement: () => { throw new Error('Image autofill must not create base64'); } };
  try {
    images = [image(source, '/imgres?imgurl=' + encodeURIComponent(original))];
    assert.equal(await readGoogleSearchImage('bonjour'), original);
    images = [image(thumbnail)];
    assert.equal(await readGoogleSearchImage('bonjour'), thumbnail);
    images = [image(source), image(thumbnail)];
    assert.equal(await readGoogleSearchImage('bonjour'), thumbnail);
    images = [image(source)];
    assert.equal(await readGoogleSearchImage('bonjour'), source);
    assert.equal(await readGoogleSearchImage('different'), null);
  } finally {
    globalThis.location = originalLocation;
    globalThis.document = originalDocument;
  }
});

test('rich-text editor propagates normalized edits without repeating unchanged values', () => {
  const { descriptor: editor } = parse(readFileSync(
    new URL('../src/components/small/RichTextEditor.vue', import.meta.url), 'utf8'));
  const handlerSource = editor.scriptSetup.content.slice(editor.scriptSetup.content.indexOf('const handleUpdate ='));
  const props = { modelValue: '<p>Original context.</p>', breakDelimeter: '\u23ce' };
  const updates = [];
  const handleUpdate = new Function('props', 'emit', `${handlerSource}\nreturn handleUpdate;`)(
    props, (event, value) => {
      assert.equal(event, 'update:modelValue');
      updates.push(value);
      props.modelValue = value;
    });

  handleUpdate('<p>Edited context.</p>');
  assert.deepEqual(updates, ['<p>Edited context.</p>']);
  handleUpdate('<p>Edited context.</p>');
  assert.equal(updates.length, 1);
  handleUpdate('<p><strong>Edited</strong> context.</p>');
  assert.equal(updates.at(-1), '<p><strong>Edited</strong> context.</p>');
  handleUpdate('<p>First.\u23ce Second.</p>');
  assert.equal(updates.at(-1), '<p>First.\u23ce</p><p> Second.</p>');
  handleUpdate(props.modelValue);
  assert.equal(updates.length, 3);
  handleUpdate('<p><br></p>');
  assert.equal(updates.at(-1), '');

  props.breakDelimeter = '\u23ce;\u2192';
  handleUpdate('<p>new translation</p>');
  assert.equal(updates.at(-1), '<p>new translation</p>');
});

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
  const db = await openDownloadedCollection(vm.messages);
  try {
    const model = Object.values(JSON.parse(db.exec('SELECT models FROM col')[0].values[0][0]))[0];
    const [fields, guid] = db.exec('SELECT flds, guid FROM notes')[0].values[0];
    assert.equal(db.exec('SELECT count(*) FROM cards')[0].values[0][0], 1);
    assert.deepEqual(db.exec('SELECT type, queue, due, ivl, factor, reps, lapses, left, odue, odid FROM cards')[0].values[0],
      Array(10).fill(0));
    return { model, fields: Object.fromEntries(model.flds.map((f, i) => [f.name, fields.split('\x1f')[i]])), guid };
  } finally {
    db.close();
  }
}

async function openDownloadedCollection(messages) {
  assert.ok(download, JSON.stringify(messages));
  const zip = await JSZip.loadAsync(await download.blob.arrayBuffer());
  assert.deepEqual(Object.keys(zip.files).sort(), ['collection.anki2', 'media']);
  assert.equal(await zip.file('media').async('string'), '{}');
  return new SQL.Database(await zip.file('collection.anki2').async('uint8array'));
}

test('Export all bundles only the selected course and retains each mode identity, filters, templates and Games progress', async () => {
  const originalCourse = util.options.current_course_id;
  try {
    for (const course_id of ['fr_en', 'fr_kindle', 'fr_koreader']) {
      util.options.current_course_id = course_id;
      const mainWord = { ...word, course_id, status: STATUS.LEARNED, next_review: new Date(1800000000000),
        interval: 14400, ease_factor: 2.7, steps_index: 2 };
      const words = [mainWord, { ...mainWord, id: 2, front: 'punctuation', back: ';' },
        { ...mainWord, front: 'other-course', course_id: 'de_en' },
        { ...mainWord, front: 'archived', archived: true }, { ...mainWord, front: 'untranslated', hasTranslation: false },
        { ...mainWord, front: 'no-context', context: '' }, { ...mainWord, front: 'no-image', image: '' }];
      const originalWords = structuredClone(words);
      const vm = exporter('reverse', words, course_id);
      vm.optionsData.ankiTemplates = { reverse: { fieldNames: ankiTemplates.getAnkiFieldNames('reverse'),
        qfmt: '<div>Custom reverse: {{ReversePrompt}}</div>', afmt: '{{Front}} / {{Back}}', css: '.card { color: green; }' } };
      const originalOptions = structuredClone(vm.optionsData);
      const separateExports = {};
      for (const mode of ['direct', 'reverse', 'listening']) {
        const separate = exporter(mode, [mainWord], course_id);
        separate.optionsData.ankiTemplates = vm.optionsData.ankiTemplates;
        separateExports[mode] = await exportCollection(separate);
      }
      download = null;
      await vm.triggerExportAll();
      const db = await openDownloadedCollection(vm.messages);
      try {
        const [modelJson, deckJson] = db.exec('SELECT models, decks FROM col')[0].values[0];
        const models = JSON.parse(modelJson);
        const decks = JSON.parse(deckJson);
        const notes = db.exec('SELECT guid, mid, flds FROM notes')[0].values;
        const cards = db.exec('SELECT did, type, queue, due, ivl, factor, reps, lapses, left, odue, odid FROM cards')[0].values;
        assert.equal(Object.keys(models).length, 3);
        assert.equal(Object.keys(decks).filter(id => id !== '1').length, 3);
        assert.equal(notes.length, 5); // Reverse excludes the punctuation-only translation.
        assert.equal(cards.length, 5);
        assert.equal(new Set(notes.map(([guid]) => guid)).size, 5);
        assert.ok(cards.every(([, ...schedule]) => schedule.every(value => value === 0)));
        for (const mode of ['direct', 'reverse', 'listening']) {
          const separate = separateExports[mode];
          const model = models[separate.model.id];
          assert.equal(model.name, separate.model.name);
          assert.deepEqual(model.flds, separate.model.flds);
          assert.deepEqual(model.tmpls, separate.model.tmpls);
          assert.equal(model.css, separate.model.css);
          const note = notes.find(([guid]) => guid === separate.guid);
          assert.ok(note);
          assert.equal(note[1], model.id);
          assert.deepEqual(note[2].split('\x1f'), Object.values(separate.fields));
          const deckId = course_id === 'fr_en' ? model.id + 1 : getReaderAnkiId(course_id, mode, 'deck');
          assert.equal(decks[deckId].name, model.name.slice(1));
          assert.equal(cards.filter(([id]) => id === deckId).length, mode === 'reverse' ? 1 : 2);
        }
        assert.match(download.name, / - All-2 words-\d{4}-\d{2}-\d{2}\.apkg$/);
        assert.equal(vm.importGuide.fileName, download.name);
        assert.equal(vm.importGuide.show, true);
        assert.deepEqual(vm.db_words, originalWords);
        assert.deepEqual(vm.optionsData, originalOptions);
        assert.equal(vm.exportingToAnki, false);
        assert.equal(vm.exportingAll, false);
      } finally { db.close(); }
    }
  } finally { util.options.current_course_id = originalCourse; }
});

test('Export all skips empty modes, exports when another mode is eligible, and stops when the course has no eligible words', async () => {
  const vm = exporter('listening', [{ ...word, course_id: 'kindle' }], 'kindle');
  assert.equal(vm.canExport, false);
  assert.equal(vm.canExportAll, true);
  download = null;
  await vm.triggerExportAll();
  const db = await openDownloadedCollection(vm.messages);
  try {
    const models = JSON.parse(db.exec('SELECT models FROM col')[0].values[0][0]);
    assert.equal(Object.keys(models).length, 2);
    assert.equal(db.exec('SELECT count(*) FROM cards')[0].values[0][0], 2);
    assert.match(download.name, / - All-1 words-/);
  } finally { db.close(); }
  for (const words of [[], [{ ...word, course_id: 'other-course' }], [{ ...word, archived: true }]]) {
    const empty = exporter('direct', words);
    assert.equal(empty.canExportAll, false);
    download = null;
    await empty.triggerExportAll();
    assert.equal(download, null);
    assert.equal(empty.messages.at(-1)[1], 'warning');
  }
});

function templateEditor(optionsData = { ...util.options, current_course_id: 'fr_en', ankiTemplates: {} }) {
  const vm = reactive({ ...editorComponent.data(), optionsData, word, messages: [], saves: 0,
    async saveOptions() { this.saves++; }, showMessage(...args) { this.messages.push(args); } });
  for (const [name, method] of Object.entries(editorComponent.methods)) vm[name] = method.bind(vm);
  for (const [name, getter] of Object.entries(editorComponent.computed)) Object.defineProperty(vm, name, { get: getter.bind(vm) });
  return vm;
}

test('draft edits reactively refresh preview and Front/Back controls stay in sync while editing CSS', async () => {
  const editor = templateEditor();
  const preview = computed(() => editor.previewDocument);
  const stops = [watch(() => editor.section, editorComponent.watch.section.bind(editor)),
    watch(() => editor.side, editorComponent.watch.side.bind(editor))];
  try {
    editor.open('direct');
    assert.match(preview.value, /bonjour/);
    editor.draft.qfmt = '<h1>Edited front: {{Front}}</h1>';
    await nextTick();
    assert.match(preview.value, /<h1>Edited front: bonjour<\/h1>/);
    editor.section = 'afmt';
    await nextTick();
    assert.equal(editor.side, 'back');
    editor.draft.afmt = '<p>Edited back: {{Back}}</p>';
    await nextTick();
    assert.match(preview.value, /Edited back: hello;/);
    editor.section = 'css';
    editor.draft.css = '.card { color: purple; }';
    await nextTick();
    assert.match(preview.value, /color: purple/);
    assert.match(preview.value, /Edited back:/);
    editor.side = 'front';
    await nextTick();
    assert.equal(editor.section, 'css');
    assert.match(preview.value, /Edited front:/);
    editor.section = 'afmt';
    await nextTick();
    editor.side = 'front';
    await nextTick();
    assert.equal(editor.section, 'qfmt');
    assert.deepEqual(editor.optionsData.ankiTemplates, {});
  } finally { stops.forEach(stop => stop()); }
});

function previewAudio(document) {
  return [...document.matchAll(/data-anki-audio="([^"]+)"/g)]
    .map(match => JSON.parse(decodeURIComponent(match[1])));
}

test('preview sound uses the resolved Anki audio block, including static text, edited fields and FrontSide', () => {
  const editor = templateEditor();
  for (const mode of ['direct', 'reverse', 'listening']) {
    editor.open(mode);
    const frontAudio = previewAudio(editor.previewDocument);
    assert.deepEqual(frontAudio.map(item => item.front), mode === 'reverse' ? []
      : [mode === 'direct' ? 'bonjour' : 'bonjour. Bonjour tout le monde.']);
    editor.side = 'back';
    const backAudio = previewAudio(editor.previewDocument);
    assert.deepEqual(backAudio.map(item => item.front),
      [mode === 'direct' ? 'Bonjour tout le monde.' : 'bonjour. Bonjour tout le monde.']);
  }
  editor.open('direct');
  editor.draft.qfmt = '[anki:tts lang=en_US speed=0.7]Say <b>{{Back}}</b><br>&amp; {{Front}} → keep this[/anki:tts]';
  const [audio] = previewAudio(editor.previewDocument);
  assert.deepEqual(audio, { front: 'Say hello; good morning; greeting & bonjour → keep this', targetLang: 'en-us', speed: 0.7 });
  editor.draft.afmt = '{{FrontSide}}{{tts de_DE speed=0.9:Back}}';
  editor.side = 'back';
  const backAudio = previewAudio(editor.previewDocument);
  assert.deepEqual(backAudio[0], audio);
  assert.deepEqual(backAudio[1], { front: word.back, targetLang: 'de-de', speed: 0.9 });
});

test('clicking a preview replay button reuses the shared player with the template text and speed', () => {
  const editor = templateEditor();
  editor.open('direct');
  editor.draft.qfmt = '[anki:tts lang=en_US speed=0.7]Edited speech: {{Back}} → keep this[/anki:tts]';
  const [item] = previewAudio(editor.previewDocument);
  const originalAudio = globalThis.Audio;
  const originalPlayer = util.audioPlayer;
  const originalSpeed = util.options.ttsSpeed;
  const originalProvider = util.options.ttsProvider;
  let click;
  let prevented = false;
  const frameDocument = { set onclick(callback) { click = callback; } };
  editor.bindPreviewAudio({ target: { contentDocument: frameDocument } });
  editor.bindPreviewAudio({ target: { contentDocument: frameDocument } });
  globalThis.Audio = class {
    constructor(url) { this.url = url; }
    play() { this.played = true; return Promise.resolve(); }
    pause() { this.paused = true; }
  };
  try {
    util.options.ttsSpeed = 1.3;
    util.options.ttsProvider = util.TTS_PROVIDER.GOOGLE;
    util.audioPlayer = null;
    click({ preventDefault() { prevented = true; }, target: { closest() {
      return { dataset: { ankiAudio: encodeURIComponent(JSON.stringify(item)) } };
    } } });
    assert.equal(prevented, true);
    assert.equal(util.audioPlayer.played, true);
    assert.equal(new URL(util.audioPlayer.url).searchParams.get('q'), item.front);
    assert.equal(new URL(util.audioPlayer.url).searchParams.get('tl'), 'en-us');
    assert.equal(util.audioPlayer.playbackRate, 0.7);
    assert.equal(util.options.ttsSpeed, 1.3);
  } finally {
    globalThis.Audio = originalAudio;
    util.audioPlayer = originalPlayer;
    util.options.ttsSpeed = originalSpeed;
    util.options.ttsProvider = originalProvider;
  }
});

test('template drafts save all modes, cancel without changing settings, and export the same content shown in preview', async () => {
  const editor = templateEditor();
  editor.open('direct');
  editor.drafts.direct.qfmt = '<h1>Discard {{Front}}</h1>';
  editor.show = false;
  assert.deepEqual(editor.optionsData.ankiTemplates, {});
  editor.open('direct');
  assert.doesNotMatch(editor.draft.qfmt, /Discard/);
  for (const mode of Object.keys(ankiTemplates.EXPORT_MODES)) {
    editor.mode = mode;
    editor.draft.qfmt = `<h1>${mode}: {{Front}}</h1>{{#Hint}}<aside>{{Hint}}</aside>{{/Hint}}`;
    editor.draft.afmt = '{{FrontSide}}<hr>{{Back}}';
    editor.draft.css = `.card { color: ${mode === 'direct' ? 'red' : 'blue'}; }`;
    assert.match(editor.previewDocument, new RegExp(`${mode}: bonjour`));
    editor.side = 'back';
    assert.match(editor.previewDocument, /hello; good morning; greeting/);
    editor.side = 'front';
  }
  await editor.save();
  assert.equal(editor.show, false);
  assert.equal(editor.saves, 1);
  for (const mode of Object.keys(ankiTemplates.EXPORT_MODES)) {
    const vm = exporter(mode);
    vm.optionsData.ankiTemplates = editor.optionsData.ankiTemplates;
    const { model } = await exportCollection(vm);
    const saved = editor.optionsData.ankiTemplates[mode];
    assert.equal(model.tmpls[0].qfmt, saved.qfmt);
    assert.equal(model.tmpls[0].afmt, saved.afmt);
    assert.equal(model.css, saved.css);
  }
});

test('unchanged drafts preserve application defaults and reset removes only the active mode customization', async () => {
  const editor = templateEditor();
  editor.open('direct');
  await editor.save();
  assert.deepEqual(editor.optionsData.ankiTemplates, {});
  editor.open('direct');
  editor.drafts.direct.css = '.card { color: green; }';
  editor.drafts.reverse.qfmt = '<div>Custom {{Back}}</div>';
  await editor.save();
  assert.equal(editor.optionsData.ankiTemplates.direct.qfmt,
    ankiTemplates.getDefaultAnkiTemplate('direct', editor.optionsData).qfmt);
  const reverse = structuredClone(toRaw(editor.optionsData.ankiTemplates.reverse));
  editor.open('direct');
  editor.resetDefault();
  editor.show = false;
  assert.equal(editor.optionsData.ankiTemplates.direct.css, '.card { color: green; }');
  editor.open('direct');
  editor.resetDefault();
  await editor.save();
  assert.equal(Object.hasOwn(editor.optionsData.ankiTemplates, 'direct'), false);
  assert.deepEqual(editor.optionsData.ankiTemplates.reverse, reverse);
  const vm = exporter('direct');
  vm.optionsData.ankiTemplates = editor.optionsData.ankiTemplates;
  const { model } = await exportCollection(vm);
  assert.equal(model.css, ankiTemplates.getDefaultAnkiTemplate('direct', editor.optionsData).css);
});

test('field additions, deletions and renames replace saved templates with application defaults', async () => {
  for (const mode of Object.keys(ankiTemplates.EXPORT_MODES)) {
    const vm = exporter(mode);
    const fieldNames = ankiTemplates.getAnkiFieldNames(mode);
    const custom = { qfmt: '<div>Custom {{Front}}</div>', afmt: '{{Back}}', css: '.card { color: red; }' };
    for (const changed of [[...fieldNames, 'RemovedField'], fieldNames.slice(1), ['OldFront', ...fieldNames.slice(1)]]) {
      vm.optionsData.ankiTemplates = { [mode]: { ...custom, fieldNames: changed } };
      const { model } = await exportCollection(vm);
      assert.equal(model.tmpls[0].qfmt, ankiTemplates.getDefaultAnkiTemplate(mode, vm.optionsData).qfmt);
      assert.notEqual(model.css, custom.css);
    }
    vm.optionsData.ankiTemplates = { [mode]: { ...custom, fieldNames: [...fieldNames].reverse() } };
    const { model } = await exportCollection(vm);
    assert.equal(model.tmpls[0].qfmt, custom.qfmt);
  }
});

test('saved templates retain current application TTS language/speed and user-edited voices', () => {
  const options = { ...util.options, current_course_id: 'fr_en', ttsSpeed: 1 };
  const template = ankiTemplates.getDefaultAnkiTemplate('direct', options);
  options.ankiTemplates = { direct: { ...template, css: '.card { color: red; }',
    fieldNames: ankiTemplates.getAnkiFieldNames('direct'), tts: ankiTemplates.getAnkiTtsSettings(options) } };
  options.current_course_id = 'de_en';
  options.ttsSpeed = 0.8;
  assert.match(ankiTemplates.getAnkiTemplate('direct', options).qfmt, /lang=de_DE speed=0.8/);
  options.ankiTemplates.direct.qfmt = template.qfmt.replace('lang=fr_FR speed=1', 'lang=ja_JP speed=0.5');
  assert.match(ankiTemplates.getAnkiTemplate('direct', options).qfmt, /lang=ja_JP speed=0.5/);
});

test('template storage survives reload and failed saves retain the previous settings and draft', async () => {
  const originalChrome = globalThis.chrome;
  const originalTemplates = util.options.ankiTemplates;
  let stored;
  globalThis.chrome = { storage: { local: {
    async set(value) { stored = JSON.parse(JSON.stringify(value)); },
    async get() { return stored; },
  } } };
  try {
    const editor = templateEditor();
    editor.saveOptions = () => util.save_options({ ankiTemplates: editor.optionsData.ankiTemplates });
    editor.open('direct');
    editor.draft.css = '.card { color: purple; }';
    await editor.save();
    util.options.ankiTemplates = {};
    await util.read_options();
    assert.equal(util.options.ankiTemplates.direct.css, '.card { color: purple; }');
    editor.open('direct');
    editor.draft.css = '.card { color: blue; }';
    const previous = editor.optionsData.ankiTemplates;
    editor.saveOptions = async () => { throw new Error('Storage unavailable'); };
    await editor.save();
    assert.equal(editor.optionsData.ankiTemplates, previous);
    assert.equal(editor.show, true);
    assert.equal(editor.draft.css, '.card { color: blue; }');
    assert.equal(editor.messages.at(-1)[1], 'error');
  } finally {
    globalThis.chrome = originalChrome;
    util.options.ankiTemplates = originalTemplates;
  }
});

test('preview renders nested/inverted sections, FrontSide and HTML fields without reparsing field values', () => {
  const template = { qfmt: '{{#Hint}}{{#Front}}<b>{{Front}}</b>{{/Front}}{{/Hint}}{{^Image}}No image{{/Image}}',
    afmt: '{{FrontSide}}<hr>{{Back}} / {{text:Context}}', css: '.card { color: teal; }' };
  const fields = { Front: 'bonjour', Hint: 'hint', Image: '', Back: '<i>{{Front}}</i>', Context: '<b>A &amp; B</b>' };
  const front = ankiPreview.getAnkiPreviewDocument(template, fields, 'front');
  const back = ankiPreview.getAnkiPreviewDocument(template, fields, 'back');
  assert.match(front, /<b>bonjour<\/b>No image/);
  assert.match(back, /<b>bonjour<\/b>No image<hr><i>{{Front}}<\/i> \/ A &amp; B/);
  assert.match(back, /body class="card card1"/);
  assert.match(back, /default-src 'none'/);
  fields.Hint = '';
  assert.doesNotMatch(ankiPreview.getAnkiPreviewDocument(template, fields, 'front'), /<b>bonjour/);
  assert.throws(() => ankiPreview.validateAnkiTemplate({ qfmt: '{{Unknown}}', afmt: '' }, ['Front']), /Unknown field/);
  assert.throws(() => ankiPreview.validateAnkiTemplate({ qfmt: '{{#Front}}oops', afmt: '' }, ['Front']), /conditional/);
  assert.throws(() => ankiPreview.validateAnkiTemplate({ qfmt: '{{#Front}}{{Back{{/Front}}', afmt: '' }, ['Front', 'Back']), /brackets/);
});

test('editor formats code, blocks invalid fields, and uses the first current-course word even when export filters exclude it', () => {
  const source = '<span>{{Front}}</span><span>{{Back}}</span><pre>  a\n b</pre>';
  const formatted = ankiPreview.formatAnkiCode(source, 'qfmt');
  assert.match(formatted, /<span>{{Front}}<\/span><span>{{Back}}<\/span>/);
  assert.match(formatted, /<pre>  a\n b<\/pre>/);
  assert.match(ankiPreview.formatAnkiCode('.card{color:red;font-size:20px;}', 'css'), /\n  color: red;/);
  const editor = templateEditor();
  editor.open('direct');
  editor.draft.qfmt = '{{Missing}}';
  assert.match(editor.templateError, /Unknown field/);
  const first = { ...word, front: 'first', hasTranslation: false };
  assert.equal(exporter('direct', [first, word]).previewWord, first);
  assert.equal(compileTemplate({ source: editorDescriptor.template.content, filename: 'AnkiTemplateEditor.vue', id: 'test' }).errors.length, 0);
});

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
  test(`${mode}: exported cards start new and Games progress is preserved`, async () => {
    for (const status of [STATUS.LEARNING, STATUS.LEARNED, STATUS.RELEARNING]) {
      const learnedWord = { ...word, status, next_review: new Date(1800000000000),
        last_reviewed: new Date(1790000000000), interval: 14400, ease_factor: 2.7, steps_index: 2 };
      const original = structuredClone(learnedWord);
      const vm = exporter(mode, [learnedWord]);
      await exportCollection(vm);
      assert.deepEqual(learnedWord, original);
    }
  });

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

test('replacing/stopping pending audio handles cancellation, while genuine playback errors remain readable', async () => {
  const originalAudio = globalThis.Audio;
  const originalPlayer = util.audioPlayer;
  const originalError = console.error;
  const errors = [];
  console.error = (...args) => errors.push(args.join(' '));
  globalThis.Audio = class {
    constructor() { this.pending = new Promise((resolve, reject) => { this.reject = reject; }); }
    play() { return this.pending; }
    pause() { this.reject(new DOMException('Interrupted by pause().', 'AbortError')); }
  };
  try {
    util.audioPlayer = null;
    util.playSound(word, util.SOUND_MODE.FRONT_WORD);
    util.playSound(word, util.SOUND_MODE.CONTEXT_ONLY);
    await Promise.resolve();
    assert.deepEqual(errors, []);
    util.playSound(word, util.SOUND_MODE.OFF);
    await Promise.resolve();
    assert.deepEqual(errors, []);
    assert.equal(util.audioPlayer, null);
    const failed = util.playSound(word, util.SOUND_MODE.FRONT_WORD);
    failed.reject(new DOMException('No supported source was found.', 'NotSupportedError'));
    await Promise.resolve();
    assert.equal(errors.length, 1);
    assert.match(errors[0], /^Error playing audio: NotSupportedError: No supported source was found\./);
    assert.match(errors[0], /provider=.*language=fr, speed=.*mediaError=none/);
  } finally {
    globalThis.Audio = originalAudio;
    util.audioPlayer = originalPlayer;
    console.error = originalError;
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
