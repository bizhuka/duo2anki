<template>
    <v-dialog v-model="translation.show" max-width="35rem" :persistent="translation.loading">
        <v-card>
            <v-card-title>{{ util.getText('Translate words') }}</v-card-title>
            <v-card-text>
                <v-row>
                    <v-col cols="12" sm="6">
                        <v-select v-model="translation.from" :items="translationLanguages" item-title="title"
                            item-value="value" :label="util.getText('Source language')" density="compact"
                            :disabled="translation.loading" hide-details />
                    </v-col>
                    <v-col cols="12" sm="6">
                        <v-select v-model="translation.to" :items="translationLanguages" item-title="title"
                            item-value="value" :label="util.getText('Target language')" density="compact"
                            :disabled="translation.loading" hide-details @update:model-value="saveTranslationTarget" />
                    </v-col>
                </v-row>
                <BatchRequestControls class="mt-4" v-model:words-per-request="optionsData.words_per_request"
                    v-model:request-count="optionsData.request_count" :disabled="translation.loading" />
                <v-checkbox v-model="optionsData.add_2_back" :true-value="false" :false-value="true"
                    :label="util.getText('Overwrite existing translations')" density="compact" hide-details
                    :disabled="translation.loading" />
                <div class="mt-2">{{ util.getText('Words') }} - {{ translationWordCount }}</div>
                <v-progress-linear v-if="translation.loading" class="mt-2"
                    :model-value="translation.total ? translation.completed / translation.total * 100 : 0"
                    color="primary" />
            </v-card-text>
            <v-card-actions>
                <v-spacer />
                <v-btn :disabled="translation.loading" @click="translation.show = false">
                    {{ util.getText('Cancel') }}
                </v-btn>
                <v-btn color="success" prepend-icon="mdi-translate" :loading="translation.loading"
                    :disabled="!canTranslate" @click="translateWords">
                    {{ util.getText('Translate words') }}
                </v-btn>
            </v-card-actions>
        </v-card>
    </v-dialog>
</template>

<script setup>
import { computed, reactive, toRaw } from 'vue';
import BatchRequestControls from './small/BatchRequestControls.vue';
import { util } from '../lib/util.js';
import { normalizeAzureLanguage, translateWithAzure } from '../lib/ai.js';
import { duolingoCourses } from '../lib/i18n/translation.js';

const props = defineProps({
    optionsData: { type: Object, required: true },
    dbProxy: { type: Object, required: true },
    saveOptions: { type: Function, required: true },
    showMessage: { type: Function, required: true },
});
const emit = defineEmits(['refresh-words', 'update:loading']);

const translation = reactive({
    show: false,
    loading: false,
    courseId: '',
    from: '',
    to: 'en',
    words: [],
    completed: 0,
    total: 0,
});

function translationLanguage(language) {
    if (!language) return '';
    const code = normalizeAzureLanguage(language).split('-')[0];
    return ({ ua: 'uk', no: 'nb' })[code] || code;
}

const translationLanguages = duolingoCourses.map(course => ({
    title: course.language,
    value: translationLanguage(course.code),
}));

function mostCommonLanguage(words, field) {
    const counts = new Map();
    for (const word of words) {
        const language = translationLanguage(word[field]);
        if (language) counts.set(language, (counts.get(language) || 0) + 1);
    }
    return [...counts].sort((first, second) => second[1] - first[1])[0]?.[0] || '';
}

function wordLanguage(word) {
    return translationLanguage(word.targetLang || util.get_course_info(word.course_id).targetLang);
}

const eligibleTranslationWords = computed(() => translation.words.filter(word =>
    word.course_id === translation.courseId && !word.archived && word.front?.trim() &&
    word.hasTranslation !== true &&
    (!wordLanguage(word) || wordLanguage(word) === translation.from)));
const translationWordCount = computed(() => Math.min(eligibleTranslationWords.value.length,
    props.optionsData.words_per_request * props.optionsData.request_count));
const canTranslate = computed(() => !!translation.from && !!translation.to &&
    translation.from !== translation.to && translationWordCount.value > 0);

async function saveTranslationTarget() {
    props.optionsData.translation_to = translation.to;
    try {
        await props.saveOptions();
    } catch (error) {
        props.showMessage(error.message, 'error');
    }
}

async function openTranslationDialog() {
    if (translation.loading) return;
    const courseId = props.optionsData.current_course_id;
    if (!courseId) return;
    try {
        const words = await toRaw(props.dbProxy).select(courseId);
        const activeWords = words.filter(word => !word.archived && word.front?.trim());
        const missingTranslations = activeWords.filter(word => word.hasTranslation !== true);
        const course = util.get_course_info(courseId);
        translation.courseId = courseId;
        translation.words = words;
        translation.from = translationLanguage(course.targetLang) ||
            mostCommonLanguage(missingTranslations, 'targetLang') || mostCommonLanguage(activeWords, 'targetLang');
        translation.to = translationLanguage(props.optionsData.translation_to) || 'en';
        translation.completed = 0;
        translation.total = 0;
        translation.show = true;
    } catch (error) {
        props.showMessage(error.message, 'error');
    }
}

async function translateWords() {
    if (translation.loading || !canTranslate.value) return;
    const database = toRaw(props.dbProxy);
    const { from, to, courseId } = translation;
    const addToBack = props.optionsData.add_2_back;
    const wordsPerRequest = Number(props.optionsData.words_per_request);
    const requestCount = Number(props.optionsData.request_count);
    if (!Number.isInteger(wordsPerRequest) || wordsPerRequest < 10 || wordsPerRequest > 40 ||
        !Number.isInteger(requestCount) || requestCount < 1 || requestCount > 4) return;
    const words = eligibleTranslationWords.value.slice(0, wordsPerRequest * requestCount);
    translation.loading = true;
    emit('update:loading', true);
    translation.completed = 0;
    translation.total = words.length;
    let updated = 0;
    try {
        props.optionsData.translation_to = to;
        await props.saveOptions();
        for (let start = 0; start < words.length; start += wordsPerRequest) {
            const batch = words.slice(start, start + wordsPerRequest);
            const translated = await translateWithAzure(batch.map(word => word.front.trim()), to, from);
            for (const [index, word] of batch.entries()) {
                if (!translated[index]) continue;
                const current = await database.words.get(word.id);
                if (!current || current.course_id !== courseId || current.archived ||
                    current.hasTranslation === true ||
                    current.front !== word.front || (wordLanguage(current) && wordLanguage(current) !== from) ||
                    (!addToBack && current.back !== word.back)) continue;
                updated += await database.words.update(word.id, {
                    back: util.mergeTranslationBack(current.back, translated[index], addToBack),
                    hasTranslation: true,
                });
            }
            translation.completed += batch.length;
            emit('refresh-words');
        }
        translation.show = false;
        props.showMessage(util.getText('translation_complete', [updated]), updated ? 'success' : 'info');
    } catch (error) {
        props.showMessage(error.message, 'error');
    } finally {
        try {
            translation.words = await database.select(courseId);
        } catch (error) {
            props.showMessage(error.message, 'error');
        } finally {
            translation.loading = false;
            emit('update:loading', false);
            emit('refresh-words');
        }
    }
}

defineExpose({ openTranslationDialog });
</script>