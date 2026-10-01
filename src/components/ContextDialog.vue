<template>
    <v-dialog v-model="dialog.show" max-width="35rem" scrollable>
        <v-card>
            <v-card-title class="text-h5">{{ dialog.title }}</v-card-title>
            <v-card-text>
                <TranslationLanguages v-model:from="dialog.from" v-model:to="optionsData.translation_to"
                    :disabled="dialog.loadingWords" @update:to="saveOptions" class="mb-4" />
                <v-textarea v-model="optionsData.prompt_prefix" :label="util.getText('Context')" rows="4" max-rows="6" auto-grow clearable
                    clear-icon="mdi-replay" @click:clear="fillDefaultPrompt" />
                <v-radio-group v-model="optionsData.ai_model" inline prepend-icon="mdi-robot-happy-outline">
                    <v-radio :label="util.getText('Chat GPT')" :value="util.AI_MODEL.CHATGPT"></v-radio>
                    <v-radio :label="util.getText('Grok')" :value="util.AI_MODEL.GROK"></v-radio>
                    <v-radio label="OSS 120b" :value="util.AI_MODEL.GROQ"></v-radio>
                </v-radio-group>
                <BatchRequestControls v-model:words-per-request="optionsData.words_per_request"
                    v-model:request-count="optionsData.request_count" />
                <v-checkbox v-model="optionsData.add_2_back" :true-value="false" :false-value="true"
                    :label="util.getText('Overwrite existing translations')" density="compact" hide-details />
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
            title: util.getText('Fill empty contexts'),
            from: '',
            action: null, // Callback for external action if needed
            resolve: null,
            reject: null,
            loadingWords: false
        });

        const canConfirm = computed(() => !!translationLanguageName(dialog.from) &&
            !!translationLanguageName(props.optionsData.translation_to) &&
            !!props.optionsData.prompt_prefix?.trim() && !!props.optionsData.request_count);

        watch(() => dialog.show, (newValue) => {
            if (!newValue && dialog.resolve) {
                // Dialog was closed externally (e.g., Escape key)
                dialog.resolve();
            }
        });

        function fillDefaultPrompt() {
            props.optionsData.prompt_prefix = util.getText('context_defaultPrompt');
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
            dialog.from = inferTranslationSource(props.optionsData.current_course_id, props.db_words);
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
            const prompt_prefix = props.optionsData.prompt_prefix.trim()
                .replaceAll('{FROM_LANGUAGE}', translationLanguageName(dialog.from))
                .replaceAll('{TO_LANGUAGE}', translationLanguageName(props.optionsData.translation_to));
            dialog.loadingWords = true;

            const filteredWords = props.db_words.filter(word => !word.context || 
              // TODO  
              word.context === "<p><br></p>"
            );
            try {
                await props.saveOptions();
                await processContexts(filteredWords, { ...props.optionsData, prompt_prefix }, dialog.action);
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
            canConfirm,
            util
        };
    },
}
</script>
