import { util } from './util.js';
import { process_with_GROQ, ENABLE_DEBUG_LOGGING } from './ai.js';

async function _get_AI_results(firstId, lastId, expectedLength, ai_model, wordIsNew, ENABLE_DEBUG_LOGGING = false) {
    // Chrome runs this function in the AI tab, so its DOM helpers stay nested here.
    return new Promise((resolve, reject) => {
        const isGrok = ai_model === 'grok'; //util.AI_MODEL.GROK;
        if (ENABLE_DEBUG_LOGGING) console.log(`_get_AI_results started. isGrok: ${isGrok}, firstId: ${firstId}, lastId: ${lastId}, expectedLength: ${expectedLength}, wordIsNew: ${wordIsNew}`);
        const mainElementSelector = 'body';
        const resultSelector = isGrok
            ? '[data-testid="assistant-message"][aria-label="Grok"]'
            : '[data-markdown-text-style="assistant-message"]';
        if (ENABLE_DEBUG_LOGGING) console.log(`Using selectors: mainElementSelector: "${mainElementSelector}", resultSelector: "${resultSelector}"`);
        const timeoutDuration = 120 * 1000; // in seconds timeout
        const settleDuration = 2000;
        let settleTimeoutId = null;
        let pendingSnapshot = null;

        const checkParagraphs = () => {
            function _getTextWithLineBreaks(element) {
                const clone = element.cloneNode(true);
                clone.querySelectorAll('br').forEach(lineBreak => lineBreak.replaceWith('\n'));
                // Keep stressed syllables bold inside brackets without altering example text.
                clone.querySelectorAll('strong, b').forEach(bold => {
                    const range = document.createRange();
                    range.selectNodeContents(clone);
                    range.setEndBefore(bold);
                    const precedingText = range.toString();
                    if (precedingText.lastIndexOf('[') > precedingText.lastIndexOf(']')) {
                        bold.replaceWith(`**${bold.textContent}**`);
                    }
                });
                return clone.textContent || '';
            }
            function _splitAndTrim(str) {
                return str.split('→').map(item => item.trim());
            }

            const resultNodes = Array.from(document.querySelectorAll(resultSelector));
            const latestResult = resultNodes[resultNodes.length - 1];
            const paragraphs = latestResult
                ? Array.from(latestResult.querySelectorAll('p'))
                : [];
            if (ENABLE_DEBUG_LOGGING) console.log(`Found ${paragraphs.length} paragraphs.`);

            let lines;
            if (paragraphs.length === expectedLength) {
                lines = paragraphs.map(_getTextWithLineBreaks);
            } else if (paragraphs.length === 1) {
                lines = _getTextWithLineBreaks(paragraphs[0]).split(/\r?\n/).filter(line => line.trim());
            } else {
                return null;
            }
            const rows = lines.map(_splitAndTrim);
            if (rows.length !== expectedLength || rows.some(row => row.length !== 5 || row.some(field => !field))) {
                return null;
            }
            if (!wordIsNew && (rows[0][0] !== String(firstId) || rows[rows.length - 1][0] !== String(lastId))) {
                return null;
            }
            const lastSentence = rows[rows.length - 1][4];
            if (!/[.!?\u2026\u3002\uFF01\uFF1F\u061F\u0964]["'\u00BB\u201D\u2019)\]]*$/.test(lastSentence)) {
                return null;
            }
            if (document.querySelector('button[data-testid="stop-button"], button[data-testid="stop-generation"], button[aria-label*="stop" i], [data-is-streaming="true"], [data-streaming="true"], [aria-busy="true"]')) {
                return null;
            }
            return rows;
        };

        // Set a timeout for the whole operation
        const timeoutId = setTimeout(() => {
            console.error("Timeout waiting for paragraphs.");
            clearTimeout(settleTimeoutId);
            observer.disconnect();
            reject(new Error(`Timeout: Did not find ${expectedLength} paragraphs matching criteria within ${timeoutDuration / 1000} seconds.`));
        }, timeoutDuration);

        const scheduleCheck = () => {
            const result = checkParagraphs();
            const snapshot = result ? JSON.stringify(result) : null;
            if (snapshot && snapshot === pendingSnapshot) return;
            clearTimeout(settleTimeoutId);
            settleTimeoutId = null;
            pendingSnapshot = snapshot;
            if (!result) return;
            settleTimeoutId = setTimeout(() => {
                settleTimeoutId = null;
                const settledResult = checkParagraphs();
                if (settledResult && JSON.stringify(settledResult) === snapshot) {
                    clearTimeout(timeoutId);
                    observer.disconnect();
                    resolve(settledResult);
                } else {
                    pendingSnapshot = null;
                    scheduleCheck();
                }
            }, settleDuration);
        };

        // Create a MutationObserver
        const observer = new MutationObserver(() => {
            if (ENABLE_DEBUG_LOGGING) console.log('MutationObserver triggered.');
            scheduleCheck();
        });

        // Start observing the target node for configured mutations
        const targetNode = document.querySelector(mainElementSelector);
        if (!targetNode) {
            console.error(`Target node "${mainElementSelector}" not found.`);
            clearTimeout(timeoutId);
            reject(new Error(`Target node "${mainElementSelector}" not found.`));
            return;
        }
        if (ENABLE_DEBUG_LOGGING) console.log('Starting observer.');
        // Observe changes in children and subtree
        observer.observe(targetNode, {
            childList: true,
            subtree: true,
            characterData: true,
            attributes: true,
            attributeFilter: ['aria-busy', 'aria-label', 'data-testid', 'data-is-streaming', 'data-streaming'],
        });

        scheduleCheck();
    });
}

function _update_context(results, wordsToProcess, add_2_back, include_transcription, sourceLang, replace_context_for_reader = false) {
    // API and scraped responses share this policy; neither path should overwrite book hints.
    for (const result of results) {
        const bracketed = result.front?.match(/\[[^\]\r\n]+\]/);
        const front = bracketed ? result.front.replace(bracketed[0], '').trim() : result.front;
        const word = wordsToProcess.find(w => w.id.toString() === result.id.toString() || (w.id === util.WORD_IS_NEW && w.front === front));
        if (word) {
            // Reader book examples survive by default; empty contexts can still be filled.
            if (!util.isReaderCourse(word.course_id) || replace_context_for_reader || !util.hasText(word.context)) {
                word.context = result.context;
            }
            word.back = util.mergeTranslationBack(word.back, result.back, add_2_back);
            const transcription = bracketed?.[0] || result.transcription?.match(/\[[^\]\r\n]+\]/)?.[0];
            if (include_transcription && transcription) {
                word.transcription = util.normalizeTranscription(transcription);
            }
            if (util.unescape_html(util.delete_all_tags(result.back || '')).trim()) {
                word.hasTranslation = true;
                if (sourceLang) word.sourceLang = sourceLang;
            }
        }
    }
    return wordsToProcess;
}

async function _check_context_results(tabId, wordsToProcess, optionsData) {
    const firstId = wordsToProcess[0].id;
    const lastId = wordsToProcess[wordsToProcess.length - 1].id;
    const expectedLength = wordsToProcess.length;
    console.log(util.getText('context_waitingForParagraphs', [expectedLength, firstId, lastId]));

    const results = await chrome.scripting.executeScript({
        target: { tabId },
        args: [firstId, lastId, expectedLength, optionsData.ai_model, Number(firstId) === util.WORD_IS_NEW, ENABLE_DEBUG_LOGGING],
        func: _get_AI_results,
    });

    const scrapedResultArrays = results && results.length > 0 && results[0].result;
    if (!scrapedResultArrays) {
        return null;
    }

    const normalizedResults = scrapedResultArrays.map(scrapedArray => ({
        id: scrapedArray[0],
        front: scrapedArray[1],
        back: scrapedArray[2],
        context: `${scrapedArray[3]} → ${scrapedArray[4]}`
    }));

    return _update_context(normalizedResults, wordsToProcess, optionsData.add_2_back, optionsData.include_transcription,
        optionsData.sourceLang || optionsData.translation_to, optionsData.replace_context_for_reader);
}

export async function processContexts(inWords, optionsData, actionCallback) {
    const prompt_prefix = optionsData.prompt_prefix.trim() || util.getText('context_defaultPrompt');
    if (!prompt_prefix || !optionsData.request_count) return; // Basic validation

    const filteredWords = inWords; // inWords is already the filtered list
    const wordsPerRequest = optionsData.words_per_request;

    // GROQ returns structured data directly; the other providers are read from browser tabs.
    if (optionsData.ai_model === util.AI_MODEL.GROQ) {
        const batchesToProcess = [];
        for (let i = 0; i < optionsData.request_count; i++) {
            const startIndex = i * wordsPerRequest;
            const currentBatch = filteredWords.slice(startIndex, startIndex + wordsPerRequest);

            if (currentBatch.length === 0) break;

            batchesToProcess.push(currentBatch);
        }

        try {
            const promises = batchesToProcess.map(batch => process_with_GROQ(batch, optionsData));
            const results = await Promise.all(promises);

            const actionPromises = [];
            for (const result of results) {
                if (result && result.length > 0) {
                    const batchWords = batchesToProcess[results.indexOf(result)];
                    const processedWords = _update_context(result, batchWords, optionsData.add_2_back, optionsData.include_transcription,
                        optionsData.sourceLang || optionsData.translation_to, optionsData.replace_context_for_reader);
                    actionPromises.push(actionCallback(processedWords));
                }
            }
            await Promise.all(actionPromises);
        } catch (error) {
            console.error('An error occurred during GROQ OSS 120b processing:', error);
            throw error; // Re-throw the error to be caught by the caller
        }
        return;
    }

    const tabCreationPromises = [];
    const batchesToProcess = []; // Store batches corresponding to tab creation promises

    // Prepare batches and tab creation promises
    for (let i = 0; i < optionsData.request_count; i++) {
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
        const url = optionsData.ai_model === util.AI_MODEL.GROK ?
            `https://grok.com/?q=${encodedContext}` :
            `https://chat.openai.com/?q=${encodedContext}`;

        // Add tab creation promise
        tabCreationPromises.push(chrome.tabs.create({ url: url, active: i === 0 }));
    }

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
                    const processedWords = await _check_context_results(tabId, currentBatch, optionsData);
                    if (processedWords && processedWords.length > 0) {
                        actionCallback(processedWords); // Call the action with results
                    }
                }
            }
        };

        chrome.tabs.onUpdated.addListener(listener);
    });
}