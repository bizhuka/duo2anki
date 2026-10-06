<template>
    <div class="kindle-import">
        <v-card class="pa-4" variant="flat">
            <FileDropZone ref="kindleDropZoneRef" icon="mdi-database-import"
                :idle-label="util.getText('reader_dropDatabase')"
                accept=".db,.sqlite,.sqlite3,.sqlite-db" :processing="kindleIsProcessing"
                @file-selected="handleKindleFileSelected" />
            <v-card-subtitle class="text-center pt-2" style="white-space: normal; overflow-wrap: anywhere;">
                Kindle: <code>Kindle/system/vocabulary/vocab.db</code>
            </v-card-subtitle>
            <v-card-subtitle class="text-center pt-2" style="white-space: normal; overflow-wrap: anywhere;">
                KOReader: <code>Storage/koreader/settings/vocabulary_builder.sqlite3</code>
            </v-card-subtitle>

            <div v-show="false">
            <FileDropZone ref="dictionaryDropZoneRef" class="mt-6" icon="mdi-book-open-page-variant"
                idle-label="Drop Kobo dictionary .zip or .dicthtml file here or click to select"
                accept=".zip,.dicthtml" :processing="dictIsProcessing"
                @file-selected="handleDictionaryFileSelected" />
            <v-card-subtitle class="text-center pt-2">
                You can download custom unencrypted dictionaries from <a href="https://www.mobileread.com/forums/showthread.php?t=232883" target="_blank">here</a>.
            </v-card-subtitle>
            </div>
        </v-card>
        <ReaderBookLanguagesPanel v-if="pendingImport" :books="pendingImport.books" :loading="kindleIsProcessing"
            class="px-4 pb-4" @cancel="cancelReaderImport" @confirm="confirmReaderImport" />
    </div>
</template>

<script setup>
import FileDropZone, { createDropZoneState } from './small/FileDropZone.vue';
import ReaderBookLanguagesPanel from './ReaderBookLanguagesPanel.vue';
import { ref, toRaw } from 'vue';
import { parseReaderDatabase, prepareReaderWords } from '../lib/readerImport.js';
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
// Book rows and language choices are temporary; nothing is saved before confirmation.
const pendingImport = ref(null);

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
    return util.mergeWithReturn(existingText, addition, deleteBrackets);
}

function handleKindleFileSelected(file) {
    if (!file) {
        kindleDropZoneRef.value?.reset();
        return;
    }

    if (kindleIsProcessing.value) return;

    processKindleFile(file);
}

async function processKindleFile(file) {
    if (kindleIsProcessing.value) {
        return;
    }

    kindleIsProcessing.value = true;
    pendingImport.value = null;

    try {
        const buffer = await file.arrayBuffer();
        // Parsing only prepares the inline panel, not database records or active-course settings.
        const pending = parseReaderDatabase(buffer, window.SQL);
        if (pending.books.length) pendingImport.value = pending;
        else props.showMessage(util.getText('reader_emptyDatabase'), 'info');
    } catch (error) {
        props.showMessage(error.message, 'error');
    } finally {
        kindleIsProcessing.value = false;
    }
}

function cancelReaderImport() {
    if (kindleIsProcessing.value) return;
    pendingImport.value = null;
    kindleDropZoneRef.value?.reset();
}

async function confirmReaderImport() {
    if (!pendingImport.value || kindleIsProcessing.value) return;
    kindleIsProcessing.value = true;
    try {
        // Assign courses before merging identical words; book titles become learning hints.
        const words = prepareReaderWords(pendingImport.value);
        // Raw Dexie avoids Vue proxies in transactions; reimports update context and hint only.
        const { added, updated } = await toRaw(props.dbProxy).importReaderWords(words);
        pendingImport.value = null;
        kindleDropZoneRef.value?.reset();
        emit('refresh-words');
        props.showMessage(util.getText('reader_importSummary', [added, updated]), 'success');
        const courses = [...new Set(words.map(word => word.course_id))];
        if (!courses.includes(props.optionsData.current_course_id)) {
            await util.save_options({ current_course_id: courses[0] });
            emit('refresh-words');
        }
    } catch (error) {
        props.showMessage(error.message, 'error');
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
    max-height: calc(100dvh - 8rem);
    overflow-y: auto;
    overflow-x: hidden;
}
</style>
