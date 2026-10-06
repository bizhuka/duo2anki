<template>
    <v-dialog v-model="dialog.show" max-width="35rem" scrollable>
        <v-card>
            <v-card-title class="text-h6 py-2 generation-title">{{ dialog.title }}</v-card-title>
            <v-card-text class="pt-1 pb-0">
                <TranslationLanguages :from="dialog.from" v-model:to="optionsData.translation_to" readonly-from
                    :disabled="dialog.loadingWords" @update:to="saveOptions" class="mb-2" />
                <v-textarea v-model="optionsData.prompt_prefix" :label="util.getText('Context')" rows="3" max-rows="4" auto-grow
                    density="compact" hide-details :disabled="dialog.loadingWords" append-inner-icon="mdi-replay"
                    @click:append-inner="fillDefaultPrompt" />
                <v-checkbox v-model="optionsData.include_transcription" :label="util.getText('Transcription')"
                    density="compact" hide-details :disabled="dialog.loadingWords" />
                <v-textarea v-if="optionsData.include_transcription" v-model="optionsData.transcription_prompt"
                    :label="util.getText('Transcription')" rows="2" max-rows="3" auto-grow density="compact"
                    hide-details :disabled="dialog.loadingWords" append-inner-icon="mdi-replay"
                    @click:append-inner="fillDefaultTranscriptionPrompt" />
                <v-radio-group v-model="optionsData.ai_model" inline prepend-icon="mdi-robot-happy-outline"
                    density="compact" hide-details :disabled="dialog.loadingWords" class="mt-2">
                    <v-radio :label="util.getText('Chat GPT')" :value="util.AI_MODEL.CHATGPT"></v-radio>
                    <v-radio :label="util.getText('Grok')" :value="util.AI_MODEL.GROK"></v-radio>
                    <v-radio label="OSS 120b" :value="util.AI_MODEL.GROQ"></v-radio>
                </v-radio-group>
                <BatchRequestControls v-model:words-per-request="optionsData.words_per_request"
                    v-model:request-count="optionsData.request_count" :disabled="dialog.loadingWords" />
                <v-checkbox v-model="optionsData.add_2_back" :true-value="false" :false-value="true"
                    :label="util.getText('Overwrite existing translations')" density="compact" hide-details
                    :disabled="dialog.loadingWords" />
                <v-tooltip v-if="isReader" location="top">
                    <template v-slot:activator="{ props }">
                        <div v-bind="props" tabindex="0">
                            <v-checkbox v-model="optionsData.replace_context_for_reader"
                                :label="util.getText('Overwrite existing context')" density="compact" hide-details
                                :disabled="dialog.loadingWords" />
                        </div>
                    </template>
                    <span>{{ util.getText('context_readerOverwriteHint') }}</span>
                </v-tooltip>
            </v-card-text>
            <v-card-actions>
                <v-spacer></v-spacer>
                <v-btn color="primary" variant="text" @click="cancel" style="text-transform: none;">
                    {{ util.getText('Cancel') }}
                </v-btn>
                <v-btn color="success" variant="text" @click="confirm" style="text-transform: none;"
                    :loading="dialog.loadingWords" :disabled="!canConfirm || dialog.loadingWords">
                    {{ util.getText('Ok') }}
                </v-btn>
            </v-card-actions>
        </v-card>
    </v-dialog>
</template>

<script>
import { computed, reactive, watch } from 'vue';
import { util } from '../lib/util.js'; // Import util at top level
import { processContexts } from '../lib/contextProcessor.js';
import BatchRequestControls from './small/BatchRequestControls.vue';
import TranslationLanguages from './small/TranslationLanguages.vue';
import { inferTranslationSource, translationLanguage, translationLanguageName } from '../lib/translationLanguages.js';

export default {
    props: {
        optionsData: {
            type: Object,
            required: true
        },
        saveOptions: {
            type: Function,
            required: true
        },
        db_words: {
            type: Array,
            required: true
        }
    },
    components: {
        BatchRequestControls,
        TranslationLanguages,
    },
    setup(props, { emit }) {
        const dialog = reactive({
            show: false,
            title: util.getText('context_generateTitle'),
            from: '',
            courseId: '',
            action: null, // Callback for external action if needed
            resolve: null,
            reject: null,
            loadingWords: false
        });

        const isReader = computed(() => util.isReaderCourse(dialog.courseId));
        const canConfirm = computed(() => !!translationLanguageName(dialog.from) &&
            !!translationLanguageName(props.optionsData.translation_to) &&
            !!props.optionsData.prompt_prefix?.trim() && !!props.optionsData.request_count &&
            (!props.optionsData.include_transcription || !!props.optionsData.transcription_prompt?.trim()));

        watch(() => dialog.show, (newValue) => {
            if (!newValue && dialog.resolve) {
                // Dialog was closed externally (e.g., Escape key)
                dialog.resolve();
            }
        });

        function fillDefaultPrompt() {
            props.optionsData.prompt_prefix = util.getText('context_defaultPrompt');
        }

        function fillDefaultTranscriptionPrompt() {
            props.optionsData.transcription_prompt = util.getText('context_transcriptionPrompt');
        }

        function ensurePromptMarkers() {
            const prompt = props.optionsData.prompt_prefix || '';
            if (!prompt.trim() || !prompt.includes('{TO_LANGUAGE}') || !prompt.includes('{FROM_LANGUAGE}'))
                fillDefaultPrompt();
        }

        // Method to show the dialog
        function context_popup(options = {}) {
            if (typeof options.action !== 'function')
                throw new Error(util.getText('Pass action!'))

            ensurePromptMarkers();
            props.optionsData.include_transcription ??= true;
            if (!props.optionsData.transcription_prompt?.trim() ||
                props.optionsData.transcription_prompt.trim() === util.getText('context_legacyTranscriptionPrompt')) fillDefaultTranscriptionPrompt();
            dialog.from = inferTranslationSource(props.optionsData.current_course_id, props.db_words);
            dialog.courseId = props.optionsData.current_course_id;
            props.optionsData.replace_context_for_reader ??= false;
            props.optionsData.translation_to = translationLanguage(props.optionsData.translation_to) || 'en';

            dialog.action = options.action;
            dialog.show = true;

            return new Promise((resolve, reject) => {
                dialog.resolve = resolve;
                dialog.reject = reject;
            });
        }

        async function confirm() {
            if (dialog.loadingWords) return;
            ensurePromptMarkers();
            if (!canConfirm.value) return;
            // Resolve markers only in the outgoing copy, preserving the editable saved template.
            const transcriptionPrompt = props.optionsData.include_transcription
                ? `\n${props.optionsData.transcription_prompt.trim()}\n${util.getText('context_transcriptionFormat')}`
                : '';
            const prompt_prefix = (props.optionsData.prompt_prefix.trim() + transcriptionPrompt)
                .replaceAll('{FROM_LANGUAGE}', translationLanguageName(dialog.from))
                .replaceAll('{TO_LANGUAGE}', translationLanguageName(props.optionsData.translation_to));
            dialog.loadingWords = true;

            // Reader words may need translation/pronunciation even when a book example exists.
            const replaceContext = !isReader.value || !!props.optionsData.replace_context_for_reader;
            const filteredWords = props.db_words.filter(word => (!word.course_id || word.course_id === dialog.courseId) &&
                !word.archived && word.front?.trim() && (isReader.value
                    ? replaceContext || word.hasTranslation !== true || !util.hasText(word.back) || !util.hasText(word.context) ||
                        (props.optionsData.include_transcription && !util.hasText(word.transcription))
                    : word.hasTranslation === false || !util.hasText(word.context)));
            // Freeze request settings before awaiting persistence or an AI response.
            const requestOptions = { ...props.optionsData, prompt_prefix, current_course_id: dialog.courseId,
                sourceLang: translationLanguage(props.optionsData.translation_to), replace_context_for_reader: replaceContext };
            try {
                await props.saveOptions();
                await processContexts(filteredWords, requestOptions, dialog.action);
                dialog.resolve();
            } catch (error) {
                dialog.reject(error);
            } finally {
                dialog.show = false;
                dialog.loadingWords = false;
            }
        }

        function cancel() {
            dialog.show = false;
            dialog.resolve(); // Resolve without error on cancel
        }

        // Return reactive state and methods
        return {
            dialog,
            context_popup,
            confirm,
            cancel,
            fillDefaultPrompt,
            fillDefaultTranscriptionPrompt,
            canConfirm,
            isReader,
            util
        };
    },
}
</script>

<style scoped>
.generation-title {
    white-space: normal;
    overflow-wrap: anywhere;
    line-height: 1.3;
}
</style>
