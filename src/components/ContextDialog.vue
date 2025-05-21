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
            const wordsPerRequest = 30;
            const tabCreationPromises = [];
            const batchesToProcess = []; // Store batches corresponding to tab creation promises

            // Prepare batches and tab creation promises
            for (let i = 0; i < props.optionsData.request_count; i++) {
                const startIndex = i * wordsPerRequest;
                const currentBatch = filteredWords.slice(startIndex, startIndex + wordsPerRequest);

                if (currentBatch.length === 0) break; // Stop if no more words

                batchesToProcess.push(currentBatch); // Store batch

                // Format the words for the current batch
                const formattedWords = currentBatch
                    .map(word => `${word.id} - ${word.front}`)
                    .join('\n');

                // Combine context and formatted words
                const fullContextText = `${prompt_prefix}\n\n${formattedWords}`;

                // Construct the URL
                const encodedContext = encodeURIComponent(fullContextText);
                const url = props.optionsData.useGrok ?
                    `https://grok.com/?q=${encodedContext}` :
                    `https://chat.openai.com/?q=${encodedContext}`;

                // Add tab creation promise
                tabCreationPromises.push(chrome.tabs.create({ url: url, active: i === 0 }));
            }

            dialog.show = false; // Close dialog immediately after initiating tab creation
            if (tabCreationPromises.length === 0) {
                console.log(util.getText("No words to process or request count is 0."));
                return;
            }

            // Create all tabs simultaneously
            const createdTabs = await Promise.all(tabCreationPromises);

            // Process each tab individually after creation
            createdTabs.forEach((tab, index) => {
                const currentBatch = batchesToProcess[index]; // Get the corresponding batch
                let processed = false; // Flag to ensure action runs only once per tab

                const listener = async (tabId, changeInfo) => {
                    // Ignore updates from other tabs or if already processed
                    if (tabId !== tab.id || processed) return;

                    // Check for completion or error status
                    if (changeInfo.status === 'complete' || changeInfo.status === 'error') {
                        // Ensure listener is removed immediately to prevent further triggers
                        chrome.tabs.onUpdated.removeListener(listener);
                        processed = true; // Mark as processed

                        if (changeInfo.status === 'complete') {
                            // Get results for this specific tab and batch
                            const processedWords = await _check_context_results(tabId, currentBatch);
                            if (processedWords && processedWords.length > 0) {
                                dialog.action(processedWords); // Call the action with results
                            }
                        }
                    }
                };

                chrome.tabs.onUpdated.addListener(listener);
            });
        }

        function cancel() {
            dialog.show = false;
            // emit('cancelled');
        }

        async function _check_context_results(tabId, wordsToProcess) {
            const firstId = wordsToProcess[0].id;
            const lastId = wordsToProcess[wordsToProcess.length - 1].id;
            const expectedLength = wordsToProcess.length;
            console.log(util.getText('context_waitingForParagraphs', [expectedLength, firstId, lastId]));

            const results = await chrome.scripting.executeScript({
                target: { tabId },
                args: [firstId, lastId, expectedLength, props.optionsData.useGrok],
                func: _get_AI_results,
            });

            const finalResult = results && results.length > 0 && results[0].result ?
                _update_context(results[0].result, wordsToProcess) :
                null;
            // The dialog.action call is now handled in the 'confirm' function's listener
            debugger
            return finalResult; // Return the processed words (or null)
        }

        function _update_context(finalResult, wordsToProcess) {
            for (const [index, word] of wordsToProcess.entries()) {
                const result = finalResult[index] // TODO serach in finalResult insetad?
                if (word.id === Number(result[0])) {
                    word.context = `${result[3]} → ${result[4]}`

                    // Access props directly in setup
                    if (props.optionsData.add_2_back) {
                        word.back += ` → ${result[2]}`
                    } else {
                        word.back = result[2]
                    }

                }
            }
            return wordsToProcess
        }

        async function _get_AI_results(firstId, lastId, expectedLength, useGrok) {
            // Use a Promise to handle the asynchronous waiting
            return new Promise((resolve, reject) => {
                debugger
                const mainElementSelector = useGrok ? 'body' : '#main'; // Assuming #main is the container
                const paragraphSelector = useGrok ? 'p[class="break-words"]' : 'p[data-start][data-end]';
                const timeoutDuration = 120 * 1000; // in seconds timeout

                function _deleteAttributes(htmlString) {
                    return htmlString.replace(/<([a-z][a-z0-9]*)[^>]*?(\/?)>/gi, '<$1$2>');
                }

                function _splitAndTrim(str) {
                    return str.split('→').map(item => item.trim());
                }

                const checkParagraphs = () => {
                    const paragraphs = document.querySelectorAll(paragraphSelector);
                    console.log(`Found ${paragraphs.length} paragraphs.`);

                    if (paragraphs.length === expectedLength) {
                        const firstP = paragraphs[0]?.textContent;
                        const lastP_Array = paragraphs[paragraphs.length - 1]?.textContent?.split('→');
                        if (firstP.startsWith(firstId.toString()) &&
                            lastP_Array?.length === 5 &&
                            lastP_Array[0].startsWith(lastId.toString()) &&
                            lastP_Array[lastP_Array.length - 1].indexOf('.') > 0) {

                            // Return data from all '<p>'
                            return Array.from(paragraphs).map(p => _splitAndTrim(_deleteAttributes(p.innerHTML)));
                        }
                    } else if (paragraphs.length === 1 && (paragraphs[0].innerHTML.split('→').length - 1 === expectedLength * (5 - 1))) {
                        debugger
                        const parts = _deleteAttributes(paragraphs[0].innerHTML).split('<br>');
                        const lastP_Array = _splitAndTrim(parts[parts.length - 1]);
                        if (lastP_Array[lastP_Array.length - 1].indexOf('.') > 0) {
                            return parts.map(p => _splitAndTrim(p));
                        }
                    }
                    return null; // Indicate conditions not met yet
                };

                // Set a timeout for the whole operation
                const timeoutId = setTimeout(() => {
                    console.error("Timeout waiting for paragraphs.");
                    observer.disconnect();
                    reject(new Error(`Timeout: Did not find ${expectedLength} paragraphs matching criteria within ${timeoutDuration / 1000} seconds.`));
                }, timeoutDuration);

                // Create a MutationObserver
                const observer = new MutationObserver((mutationsList, obs) => {
                    // Check if the conditions are met after any mutation
                    const result = checkParagraphs();
                    if (result) {
                        clearTimeout(timeoutId); // Clear the timeout
                        obs.disconnect(); // Stop observing
                        resolve(result); // Resolve the promise with the results
                    }
                    // Otherwise, continue observing
                });

                // Start observing the target node for configured mutations
                const targetNode = document.querySelector(mainElementSelector);
                // Observe changes in children and subtree
                observer.observe(targetNode, { childList: true, subtree: true });
            });
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
