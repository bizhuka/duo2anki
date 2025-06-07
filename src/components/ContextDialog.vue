<template>
    <v-dialog v-model="dialog.show" max-width="35rem" :data-lang="optionsData.pluginLanguage">
        <v-card>
            <v-card-title class="text-h5">{{ dialog.title }}</v-card-title>
            <v-card-text>
                <v-switch v-model="optionsData.useGrok" :label="optionsData.useGrok ? util.getText('Grok') : util.getText('Chat GPT')"
                    density="compact" />
                <v-textarea v-model="optionsData.prompt_prefix" :label="util.getText('Context')" rows="4" auto-grow clearable
                    clear-icon="mdi-replay" @click:clear="fillDefaultPrompt" />

                <v-slider v-model="optionsData.request_count" :min="1" :max="3" :step="1" thumb-label
                    :label="util.getText('Request count')" />
                <v-switch v-model="optionsData.add_2_back"
                    :label="optionsData.add_2_back ? util.getText('Add text to `Translation - Back`') : util.getText('Replace `Translation - Back`')"
                    density="compact" />
            </v-card-text>
            <v-card-actions>
                <v-spacer></v-spacer>
                <v-btn color="primary" variant="text" @click="cancel" style="text-transform: none;">
                    {{ util.getText('Cancel') }}
                </v-btn>
                <v-btn color="success" variant="text" @click="confirm" style="text-transform: none;"
                    :disabled="!optionsData.prompt_prefix || !optionsData.request_count">
                    {{ util.getText('Ok') }}
                </v-btn>
            </v-card-actions>
        </v-card>
    </v-dialog>
</template>

<script>
import { reactive } from 'vue';
import { util } from '../lib/util.js'; // Import util at top level
import { processContexts } from '../lib/contextProcessor.js';

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
    setup(props, { emit }) {
        const dialog = reactive({
            show: false,
            title: util.getText('Fill empty contexts'),
            prompt_prefix: '',
            action: null, // Callback for external action if needed
        });

        function fillDefaultPrompt() {
            props.optionsData.prompt_prefix = _get_default_prompt_prefix()
        }

        function _get_default_prompt_prefix() {
            return util.getText('context_defaultPrompt');
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
        }

        async function confirm() {
            // Access props directly in setup
            const prompt_prefix = props.optionsData.prompt_prefix.trim();
            if (!prompt_prefix || !props.optionsData.request_count) return; // Basic validation
 
            // Save options to local storage
            props.saveOptions();
 
            // Filter words with empty context
            const filteredWords = props.db_words.filter(word => !word.context);
 
            dialog.show = false; // Close dialog immediately after initiating tab creation
            await processContexts(filteredWords, props.optionsData, dialog.action);
        }
 
        function cancel() {
            dialog.show = false;
            // emit('cancelled');
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
