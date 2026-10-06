import { util } from './util.js';
import { normalizeLanguage } from './ai.js';
import { translationLanguage, translationLanguageName } from './translationLanguages.js';

const readerFormats = [
    {
        reader: 'kindle', tables: ['lookups', 'words', 'book_info'],
        query: `SELECT w.stem AS front, w.word AS highlight, l.usage AS context,
            l.timestamp AS date, l.book_key AS book_id, b.title AS book_title, b.lang AS book_lang
            FROM lookups l JOIN words w ON w.id = l.word_key
            LEFT JOIN book_info b ON b.id = l.book_key ORDER BY l.timestamp DESC`,
        context: row => {
            const text = escapeReaderText(row.context);
            const highlight = escapeReaderText(row.highlight);
            return highlight ? text.replace(highlight, `<strong>${highlight}</strong>`) : text;
        },
    },
    {
        reader: 'koreader', tables: ['vocabulary', 'title'],
        query: `SELECT v.word AS front, v.highlight, v.prev_context, v.next_context,
            v.create_time AS date, v.title_id AS book_id, t.name AS book_title
            FROM vocabulary v LEFT JOIN title t ON t.id = v.title_id ORDER BY v.create_time DESC`,
        context: row => [escapeReaderText(row.prev_context),
            `<strong>${escapeReaderText(row.highlight || row.front)}</strong>`,
            escapeReaderText(row.next_context)].filter(Boolean).join(' '),
    },
];

function escapeReaderText(text) {
    return util.unescape_html(util.delete_all_tags(String(text || ''))).replace(/\s+/g, ' ').trim()
        .replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;');
}

function readerDate(timestamp) {
    const numeric = Number(timestamp);
    const date = numeric > 0 ? new Date(numeric > 1e9 && numeric < 1e12 ? numeric * 1000 : numeric)
        : new Date(timestamp);
    return Number.isNaN(date.getTime()) ? new Date() : date;
}

export function parseReaderDatabase(buffer, SQL) {
    if (!SQL) throw new Error(util.getText('reader_sqlUnavailable'));
    let database;
    try {
        const bytes = buffer instanceof ArrayBuffer ? new Uint8Array(buffer) : buffer;
        database = new SQL.Database(bytes);
        const tables = new Set(database.exec("SELECT name FROM sqlite_master WHERE type = 'table'")[0]?.values
            .map(row => row[0].toLowerCase()) || []);
        const format = readerFormats.find(reader => reader.tables.every(table => tables.has(table)));
        if (!format) throw new Error(util.getText('reader_invalidDatabase'));
        const result = database.exec(format.query)[0];
        const books = new Map();
        for (const values of result?.values || []) {
            const row = Object.fromEntries(result.columns.map((column, index) => [column, values[index]]));
            const front = row.front?.trim();
            if (!front) continue;
            const id = String(row.book_id ?? 'unknown');
            if (!books.has(id)) {
                const detectedLanguage = row.book_lang || '';
                books.set(id, { id, title: row.book_title || util.getText('reader_unknownBook'), skip: false,
                    detectedLanguage, language: translationLanguageName(detectedLanguage)
                        ? translationLanguage(detectedLanguage) : '', words: [] });
            }
            books.get(id).words.push({ front, context: format.context(row), date: readerDate(row.date) });
        }
        return { reader: format.reader, books: [...books.values()].map(book => ({ ...book,
            wordCount: new Set(book.words.map(word => word.front)).size })) };
    } finally {
        database?.close();
    }
}

export function canImportReaderBooks(books) {
    const selected = books.filter(book => !book.skip);
    return selected.length > 0 && selected.every(book => translationLanguageName(book.language));
}

export function prepareReaderWords(pending) {
    if (!canImportReaderBooks(pending.books)) {
        throw new Error(util.getText('reader_languagesRequired'));
    }
    const words = new Map();
    for (const book of pending.books.filter(book => !book.skip)) {
        const language = translationLanguage(book.language);
        const course_id = util.createReaderCourseId(pending.reader, language);
        if (!course_id) throw new Error(util.getText('reader_invalidDatabase'));
        const detected = normalizeLanguage(book.detectedLanguage || language);
        const region = detected.split('-').slice(1).join('-');
        const targetLang = translationLanguage(detected) === language && region ? `${language}-${region}` : language;
        for (const lookup of book.words) {
            const key = JSON.stringify([course_id, lookup.front]);
            const existing = words.get(key);
            if (existing) {
                existing.context = util.mergeWithReturn(existing.context, lookup.context);
                existing.hint = util.mergeWithReturn(existing.hint, escapeReaderText(book.title));
            } else {
                words.set(key, { ...lookup, course_id, targetLang, hint: escapeReaderText(book.title) });
            }
        }
    }
    return [...words.values()];
}