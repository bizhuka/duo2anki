<template>
    <div class="kindle-import" :data-lang="optionsData.pluginLanguage">
        <v-card class="pa-4" variant="flat">
            <FileDropZone ref="kindleDropZoneRef" icon="mdi-database-import"
                idle-label="Drop Kindle vocabulary DB 'vocab.db' here or click to select"
                accept=".db,.sqlite,.sqlite3,.sqlite-db" :processing="kindleIsProcessing"
                @file-selected="handleKindleFileSelected" />
            <v-card-subtitle class="text-center pt-2">
                Kindle saves the vocabulary builder database at <code>Kindle/system/vocabulary/vocab.db</code> when the device is mounted.
            </v-card-subtitle>

            <FileDropZone ref="dictionaryDropZoneRef" class="mt-6" icon="mdi-book-open-page-variant"
                idle-label="Drop Kobo dictionary .zip or .dicthtml file here or click to select"
                accept=".zip,.dicthtml" :processing="dictIsProcessing"
                @file-selected="handleDictionaryFileSelected" />
            <v-card-subtitle class="text-center pt-2">
                You can download custom unencrypted dictionaries from <a href="https://www.mobileread.com/forums/showthread.php?t=232883" target="_blank">here</a>.
            </v-card-subtitle>
        </v-card>
    </div>
</template>

<script setup>
import FileDropZone, { createDropZoneState } from './small/FileDropZone.vue';
import { util } from '@/lib/util.js';
import JSZip from 'jszip';

const props = defineProps({
    optionsData: {
        type: Object,
        required: true,
    },
    dbProxy: {
        type: Object,
        required: true,
    },
    showMessage: {
        type: Function,
        required: true,
    },
});

const emit = defineEmits(['refresh-words']);

const { processing: kindleIsProcessing, dropZoneRef: kindleDropZoneRef } = createDropZoneState();
const { processing: dictIsProcessing,   dropZoneRef: dictionaryDropZoneRef } = createDropZoneState();
const KINDLE_COURSE = 'kindle';

const KINDLE_SELECT_QUERY = `
  SELECT
    w.word AS word_original,
    w.stem AS stem,
    w.lang AS word_lang,
    l.usage AS context,
    l.timestamp AS date,
    b.lang AS book_lang,
    b.title AS book_title
  FROM lookups l
  JOIN words w ON w.id = l.word_key
  JOIN book_info b ON b.id = l.book_key
  ORDER BY l.timestamp DESC;
`;

function asUint8Array(payload) {
    if (payload instanceof Uint8Array) {
        return payload;
    }
    if (payload instanceof ArrayBuffer) {
        return new Uint8Array(payload);
    }
    if (ArrayBuffer.isView(payload)) {
        return new Uint8Array(payload.buffer);
    }
    return null;
}

function parseKindleTimestamp(rawTimestamp) {
    if (rawTimestamp instanceof Date) {
        return rawTimestamp;
    }

    const numericValue = Number(rawTimestamp);
    if (!Number.isNaN(numericValue)) {
        if (numericValue > 1e12) {
            return new Date(numericValue);
        }
        if (numericValue > 1e9) {
            return new Date(numericValue * 1000);
        }
        if (numericValue > 0) {
            return new Date(numericValue);
        }
    }

    if (typeof rawTimestamp === 'string') {
        const parsed = Date.parse(rawTimestamp);
        if (!Number.isNaN(parsed)) {
            return new Date(parsed);
        }
    }

    return new Date();
}

async function decompressGzip(compressedBytes) {
    if (!(compressedBytes instanceof Uint8Array)) {
        throw new Error('Dictionary HTML payload is invalid.');
    }

    if (compressedBytes.length < 2 || compressedBytes[0] !== 0x1f || compressedBytes[1] !== 0x8b) {
        throw new Error('First dictionary HTML file is not GZIP compressed.');
    }

    if (typeof DecompressionStream === 'undefined') {
        throw new Error('GZIP decompression is not supported in this environment.');
    }

    const blob = new Blob([compressedBytes], { type: 'application/gzip' });
    if (typeof blob.stream !== 'function') {
        throw new Error('GZIP decompression is not supported in this environment.');
    }

    const stream = blob.stream().pipeThrough(new DecompressionStream('gzip'));
    const arrayBuffer = await new Response(stream).arrayBuffer();
    const decoder = new TextDecoder('utf-8');
    return decoder.decode(arrayBuffer);
}

async function getHTML(zipInstance, fileName) {
    const htmlEntry = zipInstance.file(fileName);

    if (!htmlEntry) {
        throw new Error(`Dictionary archive is missing ${fileName}.`);
    }

    const compressedBytes = await htmlEntry.async('uint8array');
    const content = await decompressGzip(compressedBytes);

    return content;
}

function escapeRegExp(value) {
    return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function normalizeDefinition(rawBlock) {
    const withSeparators = util.unescape_html(
        rawBlock
        .replace(/<\/div>/gi, ' ')
        .replace(/<div[^>]*>/gi, ' ')
        .replace(/<\/k>/gi, ' ')
        .replace(/<k[^>]*>/gi, ' '));

    const withoutTags = withSeparators.replace(/<[^>]+>/g, ' ');
    const normalized = withoutTags
        .replace(/\s+/g, ' ')
        .replace(/\s*\/\s*/g, ' / ')  // TODO Check if this is needed
        .trim();
    return normalized
        .replace(/^\/\s*/, '')
        .replace(/^([a-z0-9]+>\s*)+/i, '')
        .trim();
}

function extractDefinition(htmlContent, word) {
    const trimmed = word.trim();
    if (!trimmed) {
        return null;
    }

    const pattern = new RegExp(`>${escapeRegExp(trimmed)}(<[\\s\\S]*?)(?=<\\/w>|<w>)`, 'i');
    const match = pattern.exec(htmlContent);
    if (!match) {
        return null;
    }

    let block = match[1];
    block = block.replace(/^(\s*<\/?[a-z0-9]+[^>]*>\s*)+/i, '');

    let transcription = '';
    const transcriptionMatch = block.match(/<k[^>]*>([\s\S]*?)<\/k>/i);
    if (transcriptionMatch) {
        transcription = transcriptionMatch[1].replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
        block = block.replace(transcriptionMatch[0], ' ');
    }
    const definition = normalizeDefinition(block);

    if (!definition && !transcription) {
        return null;
    }

    return {
        definition,
        transcription,
    };
}

function groupWordsByPrefix(words) {
    const map = new Map();
    for (const word of words) {
        const front = (word.front || '').trim().toLowerCase();
        if (!front) {
            continue;
        }
        const prefix = front.slice(0, 2);
        if (prefix.length < 2) {
            continue;
        }
        if (!map.has(prefix)) {
            map.set(prefix, []);
        }
        map.get(prefix).push(word);
    }
    return map;
}

function mergeWithReturn(existingText, addition, deleteBrackets = false) {
    const trimmed_existingText = (existingText || '').trim();
    const trimmed_addition = (addition || '').trim();

    if (!trimmed_addition) {
        return trimmed_existingText;
    }

    if (!trimmed_existingText) {
        return trimmed_addition;
    }

    const big   = trimmed_existingText.length > trimmed_addition.length ? trimmed_existingText : trimmed_addition;
    const small = trimmed_existingText.length > trimmed_addition.length ? trimmed_addition     : trimmed_existingText;
    
    // Remove all whitespace for comparison
    let _big   = big.replace(/\s/g, '')
    let _small = small.replace(/\s/g, '')

    // Optionally remove [bracketed] content at start
    if(deleteBrackets){
       _big  = _big.replace(/^\[.*?\]/, '');
       _small = _small.replace(/^\[.*?\]/, '');
    }

    return _big.includes(_small) ? big : `${trimmed_existingText} ⏎ ${trimmed_addition}`;
}

async function importKindleLookups(buffer) {
    const sqlModule = window?.SQL;
    if (!sqlModule) {
        throw new Error('SQL.js not initialized. Please wait and try again.');
    }

    const kindleBytes = asUint8Array(buffer);
    if (!kindleBytes) {
        throw new Error('Kindle database payload is invalid.');
    }

    let sqliteDb;
    try {
        sqliteDb = new sqlModule.Database(kindleBytes);
    } catch (error) {
        throw new Error('Unable to open Kindle database file.');
    }

    let execResult;
    try {
        execResult = sqliteDb.exec(KINDLE_SELECT_QUERY);
    } catch (error) {
        throw new Error('Failed to read Kindle database content.');
    } finally {
        sqliteDb.close();
    }

    const queryResult = execResult && execResult.length ? execResult[0] : null;
    const columns = queryResult ? queryResult.columns : [];
    const rows = queryResult ? queryResult.values : [];

    if (!rows.length) {
        return { total: 0, added: 0, skipped: 0 };
    }

    const columnIndex = columns.reduce((acc, columnName, index) => {
        acc[columnName] = index;
        return acc;
    }, {});

    const existingWords = await props.dbProxy.words.where({ course_id: KINDLE_COURSE }).toArray();
    const wordEntries = new Map();

    for (const word of existingWords) {
        const key = `${KINDLE_COURSE}_${word.front}`;
        wordEntries.set(key, {
            source: 'db',
            updated: false,
            record: { ...word, context: (word.context || '').replace(/<br>/g, '') },
        });
    }

    await util.save_options({ current_course_id: KINDLE_COURSE });

    let processedRows = 0;

    for (const row of rows) {
        const front = row[columnIndex.stem]?.trim();
        if (!front) {
            continue;
        }
        const word_original = row[columnIndex.word_original]?.trim() || '';
        const context = normalizeDefinition( (row[columnIndex.context]?.trim() || '') )
                           .replace(word_original, `<strong>${word_original}</strong>`);
        const transcriptionValue = row[columnIndex.book_title]?.trim() || '';

        if (!context) {
            continue;
        }

        const key = `${KINDLE_COURSE}_${front}`;
        const existingEntry = wordEntries.get(key);

        if (existingEntry) {
            if (existingEntry.record.context.includes(context)) {
                continue;
            }
            const mergedContext = mergeWithReturn(existingEntry.record.context, context );
            const mergedTranscription = mergeWithReturn(existingEntry.record.transcription, transcriptionValue);

            existingEntry.record = {
                ...existingEntry.record,
                context: mergedContext,
                transcription: mergedTranscription,
            };

            if (existingEntry.source === 'db') {
                existingEntry.updated = true;
            }
            processedRows += 1;
            continue;
        }

        wordEntries.set(key, {
            source: 'new',
            updated: false,
            record: {
                course_id: KINDLE_COURSE,
                front,
                context,
                date: parseKindleTimestamp(row[columnIndex.date]),
                transcription: transcriptionValue,
                targetLang: row[columnIndex.word_lang] || '',
                //   sourceLang: courseInfo.sourceLang,
            },
        });
        processedRows += 1;
    }

    const wordsToInsert = [];
    const wordsToUpdate = [];

    for (const { source, updated, record } of wordEntries.values()) {
        if (source === 'new') {
            const prepared = { ...record };
            await props.dbProxy._set_dafaults(prepared);
            wordsToInsert.push({
                ...prepared,
                context: props.dbProxy._addLineBreaks(prepared.context),
            });
        } else if (updated) {
            wordsToUpdate.push({ ...record });
        }
    }

    for (const word of wordsToUpdate) {
        await props.dbProxy.updateWord(word);
    }

    if (wordsToInsert.length) {
        await props.dbProxy.words.bulkAdd(wordsToInsert);
    }

    const total = rows.length;
    const added = wordsToInsert.length;
    const updated = wordsToUpdate.length;
    const skipped = Math.max(0, total - processedRows);
    return {
        total,
        added,
        skipped,
        updated,
    };
}

function handleKindleFileSelected(file) {
    if (!file) {
        kindleDropZoneRef.value?.reset();
        return;
    }

    if (kindleIsProcessing.value) {
        props.showMessage('A Kindle import is already in progress.', 'info');
        kindleDropZoneRef.value?.reset();
        return;
    }

    processKindleFile(file);
}

async function processKindleFile(file) {
    if (kindleIsProcessing.value) {
        return;
    }

    kindleIsProcessing.value = true;

    try {
        const buffer = await file.arrayBuffer();
        const result = await importKindleLookups(buffer);

        const { total, added, skipped, updated } = result;
        if (!total) {
            props.showMessage('No Kindle lookups found in the selected file.', 'info');
            return;
        }

        const summaryParts = [];
        if (added) {
            summaryParts.push(`imported ${added}`);
        }
        if (updated) {
            summaryParts.push(`updated ${updated}`);
        }

        const summary = summaryParts.length
            ? `Processed ${total} Kindle lookups: ${summaryParts.join(', ')}.`
            : 'No new Kindle lookups were added.';

        props.showMessage(summary, (added || updated) ? 'success' : 'info');

        const details = [];
        if (updated) {
            details.push(`Updated ${updated} existing words.`);
        }
        if (skipped > 0) {
            details.push(`Skipped ${skipped} duplicates.`);
        }

        emit('refresh-words');
    } catch (error) {
        console.error('Kindle import failed:', error);
        const message = error?.message || 'Failed to import Kindle database.';
        props.showMessage(message, 'error');
    } finally {
        kindleIsProcessing.value = false;
    }
}

async function processDictionaryFile(file) {
    const lowerName = file.name.toLowerCase();
    if (!lowerName.endsWith('.zip') && !lowerName.endsWith('.dicthtml')) {
        props.showMessage('Please select a .zip or .dicthtml dictionary file.', 'error');
        dictionaryDropZoneRef.value?.reset();
        return;
    }

    dictIsProcessing.value = true;

    try {
        let zipInstance;
        try {
            zipInstance = await JSZip.loadAsync(file);
        } catch (error) {
            throw new Error('Dictionary file is not a valid ZIP archive.');
        }

        const words = await props.dbProxy.select(KINDLE_COURSE);
        if (!words.length) {
            props.showMessage('No Kindle words found to enrich with dictionary entries.', 'info');
            return;
        }

        const htmlEntryMap = Object.keys(zipInstance.files)
            .filter((name) => name.toLowerCase().endsWith('.html'))
            .reduce((acc, name) => {
                const normalized = name.split('/').pop()?.toLowerCase(); // extracts the file name without folders
                if (normalized) {
                    acc.set(normalized, name);
                }
                return acc;
            }, new Map());

        if (!htmlEntryMap.size) {
            throw new Error('Dictionary archive does not contain any HTML files.');
        }

        const wordsByPrefix = groupWordsByPrefix(words);
        if (!wordsByPrefix.size) {
            props.showMessage('No Kindle words matched dictionary prefix grouping.', 'info');
            return;
        }

        let updatedCount = 0;

        for (const [prefix, groupedWords] of wordsByPrefix.entries()) {
            const normalizedName = `${prefix}.html`;
            const actualName = htmlEntryMap.get(normalizedName);
            if (!actualName) {
                continue;
            }

            let htmlContent;
            try {
                htmlContent = await getHTML(zipInstance, actualName);
            } catch (error) {
                const message = `Failed to read dictionary file ${actualName}. Encrypted or corrupted file?`
                console.error(message, error);
                props.showMessage(message, 'error');
                throw new Error(message);
            }

            for (const word of groupedWords) {
                const wordKey = (word.front || '').trim().toLowerCase();
                if (!wordKey) {
                    continue;
                }

                const extraction = extractDefinition(htmlContent, wordKey);
                if (!extraction) {
                    continue;
                }

                const updatedWord = { ...word };
                let changed = false;

                const existingBack = (word.back || '').trim();                
                const mergedBack = mergeWithReturn(existingBack, extraction.definition, true);
                if (mergedBack && mergedBack !== existingBack) {
                    updatedWord.back = mergedBack;
                    changed = true;
                }

                const existingTranscription = (word.transcription || '').trim();
                const mergedTranscription = mergeWithReturn(existingTranscription, extraction.transcription);
                if (mergedTranscription && mergedTranscription !== existingTranscription) {
                    updatedWord.transcription = mergedTranscription;
                    changed = true;
                }

                if (!changed) {
                    continue;
                }

                try {
                    await props.dbProxy.updateWord(updatedWord);
                    updatedCount += 1;
                } catch (updateError) {
                    console.error(`Failed to update word ${word.front}:`, updateError);
                }
            }
        }

        if (updatedCount > 0) {
            props.showMessage(`Updated dictionary definitions for ${updatedCount} words.`, 'success');
            emit('refresh-words');
        } else {
            props.showMessage('No matching dictionary entries were found for current words.', 'info');
        }
    } catch (error) {
        console.error('Dictionary import failed:', error);
        const message = error?.message || 'Failed to import Kindle dictionary.';
        props.showMessage(message, 'error');
    } finally {
        dictIsProcessing.value = false;
        dictionaryDropZoneRef.value?.reset();
    }
}

function handleDictionaryFileSelected(file) {
    if (!file) {
        dictionaryDropZoneRef.value?.reset();
        return;
    }

    if (dictIsProcessing.value) {
        props.showMessage('A dictionary import is already in progress.', 'info');
        dictionaryDropZoneRef.value?.reset();
        return;
    }

    processDictionaryFile(file);
}
</script>

<style scoped>
.kindle-import {
    height: 100%;
}
</style>
