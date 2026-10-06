import assert from 'node:assert/strict';
import test from 'node:test';
import initSqlJs from 'sql.js';
import { parseReaderDatabase, prepareReaderWords, canImportReaderBooks } from '../src/lib/readerImport.js';
import { util } from '../src/lib/util.js';
import { DbProxy } from '../src/lib/database.js';
import { readFileSync } from 'node:fs';
import { parse, compileScript, compileTemplate } from '@vue/compiler-sfc';
import { ref, reactive, toRaw } from 'vue';

const SQL = await initSqlJs();

function fixture(kind = 'kindle') {
    const db = new SQL.Database();
    if (kind === 'kindle') {
        db.run(`CREATE TABLE WORDS(id TEXT, stem TEXT, word TEXT, lang TEXT);
            CREATE TABLE BOOK_INFO(id TEXT, title TEXT, lang TEXT);
            CREATE TABLE LOOKUPS(word_key TEXT, book_key TEXT, usage TEXT, timestamp INTEGER);
            INSERT INTO WORDS VALUES ('1','salut','salut','en');
            INSERT INTO BOOK_INFO VALUES ('a','French book','fr'),('b','Other French book','fra'),('c','English book','en-GB');
            INSERT INTO LOOKUPS VALUES ('1','a','salut ami',1700000000),('1','b','salut ami',1700000001),('1','c','salut friend',1700000002);`);
    } else {
        db.run(`CREATE TABLE title(id INTEGER, name TEXT);
            CREATE TABLE vocabulary(word TEXT, highlight TEXT, prev_context TEXT, next_context TEXT, create_time INTEGER, title_id INTEGER);
            INSERT INTO title VALUES (1,'French book');
            INSERT INTO vocabulary VALUES ('salut','salut','say','now',1700000000,1),('merci','merci','','',1700000001,2);`);
    }
    const bytes = db.export();
    db.close();
    return bytes;
}

test('Kindle language selection happens before word deduplication and uses book rather than word language', () => {
    const pending = parseReaderDatabase(fixture(), SQL);
    assert.equal(pending.books.length, 3);
    const words = prepareReaderWords(pending);
    assert.equal(words.length, 2);
    const french = words.find(word => word.course_id === 'fr_kindle');
    assert.equal(french.targetLang, 'fr');
    assert.match(french.hint, /French book/);
    assert.match(french.hint, /Other French book/);
    assert.equal(french.transcription, undefined);
    assert.equal(words.find(word => word.course_id === 'en_kindle').targetLang, 'en-gb');
    assert.equal(words.every(word => !('book_id' in word) && !('books' in word)), true);
    assert.deepEqual(prepareReaderWords(pending), words);
});

test('KOReader requires every book language, including unknown books, and uses independent courses', () => {
    const pending = parseReaderDatabase(fixture('koreader'), SQL);
    assert.equal(pending.books.every(book => book.language === ''), true);
    assert.throws(() => prepareReaderWords(pending), /language/);
    pending.books[0].language = 'fr';
    assert.throws(() => prepareReaderWords(pending), /language/);
    pending.books.forEach(book => { book.language = 'fr'; });
    assert.equal(prepareReaderWords(pending).every(word => word.course_id === 'fr_koreader'), true);
    assert.equal(util.get_course_info('fr_koreader').targetLang, 'fr');
    assert.equal(util.get_course_info('fr_en').sourceLang, 'en');
});

test('reimport updates context and book hint only, preserving transcription, Back and scheduling', async () => {
    const existing = { id: 7, course_id: 'fr_kindle', front: 'salut', context: '<strong>salut</strong> ami',
        hint: 'old book title', transcription: 'custom pronunciation', targetLang: 'fr-FR', sourceLang: 'de', back: 'manual translation',
        hasTranslation: false, image: 'keep.png', archived: true, date: new Date(1700000000000),
        interval: 12, status: 1, ease_factor: 2.7, next_review: new Date(1800000000000) };
    const before = { ...existing };
    const changes = [];
    const database = {
        transaction: async (...args) => args.at(-1)(), word_meta: {},
        _addLineBreaks: DbProxy.prototype._addLineBreaks,
        words: {
            where: () => ({ equals: key => ({ first: async () => key[0] === existing.course_id && key[1] === existing.front ? existing : undefined }) }),
            update: async (id, update) => { assert.equal(id, 7); changes.push(update); Object.assign(existing, update); },
            add: async () => { throw new Error('Reimport attempted to insert duplicate'); },
        },
    };
    const incoming = [{ course_id: 'fr_kindle', front: 'salut', targetLang: 'fr', context: '<strong>salut</strong> encore.',
        hint: 'different book title', transcription: 'do not replace pronunciation', back: 'do not replace translation', date: new Date() }];
    const result = await DbProxy.prototype.importReaderWords.call(database, incoming);
    assert.deepEqual(result, { added: 0, updated: 1 });
    assert.deepEqual(Object.keys(changes[0]), ['context', 'hint']);
    assert.equal(existing.hint, 'different book title');
    assert.deepEqual({ ...existing, context: before.context, hint: before.hint }, before);
    assert.deepEqual(await DbProxy.prototype.importReaderWords.call(database, incoming), { added: 0, updated: 0 });
    const currentContext = existing.context;
    assert.deepEqual(await DbProxy.prototype.importReaderWords.call(database,
        [{ ...incoming[0], hint: 'shorter book name' }]), { added: 0, updated: 1 });
    assert.equal(existing.context, currentContext);
    assert.equal(existing.hint, 'shorter book name');
    assert.equal(existing.transcription, before.transcription);
    assert.equal(existing.back, before.back);
});

test('inline import stages only in JS memory, cancel writes nothing, and confirm is the sole save path', async () => {
    const filename = new URL('../src/components/KindleImportTab.vue', import.meta.url);
    const descriptor = parse(readFileSync(filename, 'utf8')).descriptor;
    let imports = 0;
    let settings = 0;
    const props = reactive({ optionsData: { current_course_id: 'fr_en' },
        dbProxy: { importReaderWords: async words => { imports++; return { added: words.length, updated: 0 }; } },
        showMessage() {} });
    const vm = new Function('ref', 'toRaw', 'createDropZoneState', 'parseReaderDatabase', 'prepareReaderWords', 'util',
        'defineProps', 'defineEmits', 'window',
        descriptor.scriptSetup.content.replace(/^import .*;$/gm, '') +
        '\nreturn { processKindleFile, confirmReaderImport, cancelReaderImport, pendingImport };'
    )(ref, toRaw, () => ({ processing: ref(false), dropZoneRef: ref({ reset() {} }) }), parseReaderDatabase,
        prepareReaderWords, { ...util, save_options: async () => { settings++; } }, () => props, () => () => {}, { SQL });
    const file = { arrayBuffer: async () => fixture() };
    await vm.processKindleFile(file);
    assert.ok(vm.pendingImport.value);
    assert.equal(imports, 0);
    assert.equal(settings, 0);
    vm.cancelReaderImport();
    assert.equal(vm.pendingImport.value, null);
    assert.equal(imports, 0);
    await vm.processKindleFile(file);
    await vm.confirmReaderImport();
    assert.equal(imports, 1);
    assert.equal(settings, 1);
    assert.equal(vm.pendingImport.value, null);
    assert.match(descriptor.template.content, /<ReaderBookLanguagesPanel/);
    assert.doesNotMatch(descriptor.template.content, /v-dialog/);
    for (const name of ['KindleImportTab', 'ReaderBookLanguagesPanel', 'small/CourseSelector', 'small/TranslationLanguages', 'WordsTab']) {
        const component = parse(readFileSync(new URL(`../src/components/${name}.vue`, import.meta.url), 'utf8')).descriptor;
        const script = compileScript(component, { id: name });
        assert.deepEqual(compileTemplate({ source: component.template.content, filename: `${name}.vue`, id: name,
            compilerOptions: { bindingMetadata: script.bindings } }).errors, []);
    }
});

test('skipped books need no language and contribute no words, contexts or hints', () => {
    const pending = parseReaderDatabase(fixture('koreader'), SQL);
    assert.equal(pending.books.every(book => book.skip === false), true);
    assert.equal(canImportReaderBooks(pending.books), false);
    const selected = pending.books.find(book => book.id === '1');
    selected.language = 'fr';
    const skipped = pending.books.find(book => book.id === '2');
    skipped.skip = true;
    assert.equal(canImportReaderBooks(pending.books), true);
    assert.deepEqual(prepareReaderWords(pending).map(word => word.front), ['salut']);
    skipped.skip = false;
    assert.equal(canImportReaderBooks(pending.books), false);
    assert.throws(() => prepareReaderWords(pending), /language/);
    pending.books.forEach(book => { book.skip = true; });
    assert.equal(canImportReaderBooks(pending.books), false);
    assert.throws(() => prepareReaderWords(pending), /at least one book/);
});

test('edited titles become new-word hints and skipped same-course books do not influence merged content', () => {
    const pending = parseReaderDatabase(fixture(), SQL);
    const selected = pending.books.find(book => book.id === 'a');
    selected.title = 'Short & clear';
    for (const book of pending.books.filter(book => book !== selected)) {
        book.skip = true;
        book.language = '';
        book.title = 'Skipped hint';
        book.words[0].context = 'Skipped context';
    }
    const words = prepareReaderWords(pending);
    assert.equal(words.length, 1);
    assert.equal(words[0].course_id, 'fr_kindle');
    assert.equal(words[0].hint, 'Short &amp; clear');
    assert.equal(words[0].transcription, undefined);
    assert.doesNotMatch(words[0].context, /Skipped/);
    assert.equal('skip' in words[0], false);
    assert.equal('title' in words[0], false);
});

test('saving generated reader fields preserves book-context HTML exactly and retains the Duolingo save path', async () => {
    const updates = [];
    const legacy = [];
    const database = { words: { update: async (id, changes) => updates.push({ id, changes }) },
        updateWord: async word => legacy.push(word) };
    const reader = { id: 7, course_id: 'fr_kindle', front: 'bonjour', context: '<b>Book example.<br></b>',
        back: 'hello', transcription: '[bon<b>jour</b>]', hint: 'Book hint', hasTranslation: true };
    const duolingo = { ...reader, id: 8, course_id: 'fr_en' };
    await DbProxy.prototype.updateWordsContext.call(database, [reader, duolingo]);
    assert.equal(updates.length, 1);
    assert.equal(updates[0].id, 7);
    assert.equal(updates[0].changes.context, reader.context);
    assert.equal(updates[0].changes.hint, reader.hint);
    assert.deepEqual(legacy, [duolingo]);
});