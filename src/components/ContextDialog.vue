<template>
    <v-dialog v-model="dialog.show" max-width="35rem">
        <v-card>
            <v-card-title class="text-h5">{{ dialog.title }}</v-card-title>
            <v-card-text>
                <v-textarea v-model="optionsData.prompt_prefix" :label="util.getText('Context')" rows="4" auto-grow clearable
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
                    :loading="dialog.loadingWords"  :disabled="!optionsData.prompt_prefix || !optionsData.request_count">
                    {{ util.getText('Ok') }}
                </v-btn>
            </v-card-actions>
        </v-card>
    </v-dialog>
</template>

<script>
import { reactive, watch } from 'vue';
import { util } from '../lib/util.js'; // Import util at top level
import { processContexts } from '../lib/contextProcessor.js';
import BatchRequestControls from './small/BatchRequestControls.vue';

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
    },
    setup(props, { emit }) {
        const dialog = reactive({
            show: false,
            title: util.getText('Fill empty contexts'),
            prompt_prefix: '',
            action: null, // Callback for external action if needed
            resolve: null,
            reject: null,
            loadingWords: false
        });

        watch(() => dialog.show, (newValue) => {
            if (!newValue && dialog.resolve) {
                // Dialog was closed externally (e.g., Escape key)
                dialog.resolve();
            }
        });

        function fillDefaultPrompt() {
            props.optionsData.prompt_prefix = util.getText('context_defaultPrompt')
        }

        // Method to show the dialog
        function context_popup(options = {}) {
            if (typeof options.action !== 'function')
                throw new Error(util.getText('Pass action!'))

            // Access props directly in setup
            if (!props.optionsData.prompt_prefix)
                fillDefaultPrompt();

            dialog.action = options.action;
            dialog.show = true;

            return new Promise((resolve, reject) => {
                dialog.resolve = resolve;
                dialog.reject = reject;
            });
        }

        async function confirm() {
            const prompt_prefix = props.optionsData.prompt_prefix.trim();
            if (!prompt_prefix || !props.optionsData.request_count) return;
            dialog.loadingWords = true;

            props.saveOptions();
            const filteredWords = props.db_words.filter(word => !word.context || 
              // TODO  
              word.context === "<p><br></p>"
            );
            try {
                await processContexts(filteredWords, props.optionsData, dialog.action);                
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
            util
        };
    },
}
</script>
