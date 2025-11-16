import { util } from './util.js';
import { process_with_gpt4mini } from './ai_processors/gpt4mini.js';
import { ENABLE_DEBUG_LOGGING } from './debugConfig.js';

async function _get_AI_results(firstId, lastId, expectedLength, ai_model, wordIsNew) {
    // Use a Promise to handle the asynchronous waiting
    return new Promise((resolve, reject) => {
        const isGrok = ai_model === 'grok'; //util.AI_MODEL.GROK;
        if (ENABLE_DEBUG_LOGGING) console.log(`_get_AI_results started. isGrok: ${isGrok}, firstId: ${firstId}, lastId: ${lastId}, expectedLength: ${expectedLength}, wordIsNew: ${wordIsNew}`);
        const mainElementSelector = isGrok ? 'body' : '#main'; // Assuming #main is the container
        const paragraphSelector = isGrok ? 'p[class="break-words"]' : 'p[data-start][data-end]';
        if (ENABLE_DEBUG_LOGGING) console.log(`Using selectors: mainElementSelector: "${mainElementSelector}", paragraphSelector: "${paragraphSelector}"`);
        const timeoutDuration = 120 * 1000; // in seconds timeout

        const checkParagraphs = () => {
            function _deleteAttributes(htmlString) {
                return htmlString.replace(/<([a-z][a-z0-9]*)[^>]*?(\/?)>/gi, '<$1$2>');
            }
            function _splitAndTrim(str) {
                return str.split('→').map(item => item.trim());
            }

            const paragraphs_raw = document.querySelectorAll(paragraphSelector);
            const paragraphs = isGrok ? Array.from(paragraphs_raw).slice(2) : paragraphs_raw;
            if (ENABLE_DEBUG_LOGGING) console.log(`Found ${paragraphs.length} paragraphs.`);

            if (paragraphs.length === expectedLength) {
                const firstP = paragraphs[0]?.textContent;
                const lastP_Array = paragraphs[paragraphs.length - 1]?.textContent?.split('→');
                const sanitizedFirstP = firstP?.replace(/^\s+/, '');
                const sanitizedLastId = lastP_Array?.[0]?.replace(/^\s+/, '');
                const lastSentence = lastP_Array?.[lastP_Array.length - 1] ?? '';
                const lastSentenceIncludesDot = lastSentence.indexOf('.') > 0;
                const lastIdMatches = sanitizedLastId?.startsWith(lastId.toString());
                if (ENABLE_DEBUG_LOGGING) console.log('Checking condition for expectedLength:', {
                    firstP: firstP,
                    lastP_Array: lastP_Array,
                    firstP_startsWith_firstId: sanitizedFirstP?.startsWith(firstId.toString()),
                    lastP_Array_0_startsWith_lastId: lastIdMatches,
                    wordIsNew: wordIsNew,
                    lastP_Array_length: lastP_Array?.length,
                    lastP_Array_last_item_includes_dot: lastSentenceIncludesDot,
                    lastIdMatches: lastIdMatches
                });
                if ( ( (sanitizedFirstP?.startsWith(firstId.toString()) && lastIdMatches ) 
                         || wordIsNew ) &&
                    lastP_Array?.length === 5 &&                    
                    (lastSentenceIncludesDot || lastIdMatches)) {
                    // Return data from all '<p>'
                    if (ENABLE_DEBUG_LOGGING) console.log('Conditions met for expectedLength. Returning data.');
                    return Array.from(paragraphs).map(p => _splitAndTrim(_deleteAttributes(p.innerHTML)));
                }
            } else if (paragraphs.length === 1 && (paragraphs[0].innerHTML.split('→').length - 1 === expectedLength * (5 - 1))) {
                const parts = _deleteAttributes(paragraphs[0].innerHTML).split('<br>');
                const lastP_Array = _splitAndTrim(parts[parts.length - 1]);
                const sanitizedLastId = lastP_Array?.[0]?.replace(/^\s+/, '');
                const lastSentence = lastP_Array?.[lastP_Array.length - 1] ?? '';
                const lastSentenceIncludesDot = lastSentence.indexOf('.') > 0;
                const lastIdMatches = sanitizedLastId?.startsWith(lastId.toString());
                if (ENABLE_DEBUG_LOGGING) console.log('Checking condition for single paragraph:', {
                    'innerHTML': paragraphs[0].innerHTML,
                    'parts': parts,
                    'lastP_Array': lastP_Array,
                    'last_item': lastP_Array[lastP_Array.length - 1],
                    lastP_Array_last_item_includes_dot: lastSentenceIncludesDot,
                    lastIdMatches: lastIdMatches
                });
                if (lastSentenceIncludesDot || lastIdMatches) {
                    if (ENABLE_DEBUG_LOGGING) console.log('Conditions met for single paragraph. Returning data.');
                    return parts.map(p => _splitAndTrim(p));
                }
            }
            if (ENABLE_DEBUG_LOGGING) console.log('Conditions not met yet.');
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
            if (ENABLE_DEBUG_LOGGING) console.log('MutationObserver triggered.');
            // Check if the conditions are met after any mutation
            const result = checkParagraphs();
            if (result) {
                if (ENABLE_DEBUG_LOGGING) console.log('Result found, resolving promise.');
                clearTimeout(timeoutId); // Clear the timeout
                obs.disconnect(); // Stop observing
                resolve(result); // Resolve the promise with the results
            }
            // Otherwise, continue observing
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
        observer.observe(targetNode, { childList: true, subtree: true });
    });
}

function _update_context(results, wordsToProcess, add_2_back) {
    for (const result of results) {
        const word = wordsToProcess.find(w => w.id.toString() === result.id.toString() || (w.id === util.WORD_IS_NEW && w.front === result.front));
        if (word) {
            word.context = result.context;
            if (add_2_back && word.back) {
                word.back += ` → ${result.back}`;
            } else {
                word.back = result.back;
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
        args: [firstId, lastId, expectedLength, optionsData.ai_model, Number(firstId) === util.WORD_IS_NEW],
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

    return _update_context(normalizedResults, wordsToProcess, optionsData.add_2_back);
}

export async function processContexts(inWords, optionsData, actionCallback) {
    const prompt_prefix = optionsData.prompt_prefix.trim();
    if (!prompt_prefix || !optionsData.request_count) return; // Basic validation

    const filteredWords = inWords; // inWords is already the filtered list
    const wordsPerRequest = optionsData.words_per_request;

    if (optionsData.ai_model === util.AI_MODEL.GPT4MINI) {
        const batchesToProcess = [];
        for (let i = 0; i < optionsData.request_count; i++) {
            const startIndex = i * wordsPerRequest;
            const currentBatch = filteredWords.slice(startIndex, startIndex + wordsPerRequest);

            if (currentBatch.length === 0) break;

            batchesToProcess.push(currentBatch);
        }

        try {
            const promises = batchesToProcess.map(batch => process_with_gpt4mini(batch, optionsData));
            const results = await Promise.all(promises);

            const actionPromises = [];
            for (const result of results) {
                if (result && result.length > 0) {
                    const batchWords = batchesToProcess[results.indexOf(result)];
                    const processedWords = _update_context(result, batchWords, optionsData.add_2_back);
                    actionPromises.push(actionCallback(processedWords));
                }
            }
            await Promise.all(actionPromises);
        } catch (error) {
            console.error('An error occurred during GPT-4 Mini processing:', error);
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