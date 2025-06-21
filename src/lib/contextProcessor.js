import { util } from './util.js';
import { process_with_gpt4mini } from './ai_processors/gpt4mini.js';


async function _get_AI_results(firstId, lastId, expectedLength, ai_model, wordIsNew) {
    // Use a Promise to handle the asynchronous waiting
    return new Promise((resolve, reject) => {
        const isGrok = ai_model === 'grok'; //util.AI_MODEL.GROK;
        const mainElementSelector = isGrok ? 'body' : '#main'; // Assuming #main is the container
        const paragraphSelector = isGrok ? 'p[class="break-words"]' : 'p[data-start][data-end]';
        const timeoutDuration = 120 * 1000; // in seconds timeout

        const checkParagraphs = () => {
            function _deleteAttributes(htmlString) {
                return htmlString.replace(/<([a-z][a-z0-9]*)[^>]*?(\/?)>/gi, '<$1$2>');
            }
            function _splitAndTrim(str) {
                return str.split('→').map(item => item.trim());
            }

            const paragraphs = document.querySelectorAll(paragraphSelector);
            console.log(`Found ${paragraphs.length} paragraphs.`);

            if (paragraphs.length === expectedLength) {
                const firstP = paragraphs[0]?.textContent;
                const lastP_Array = paragraphs[paragraphs.length - 1]?.textContent?.split('→');
                if ( ( (firstP.startsWith(firstId.toString()) && lastP_Array[0].startsWith(lastId.toString() ) ) 
                         || wordIsNew ) &&
                    lastP_Array?.length === 5 &&                    
                    lastP_Array[lastP_Array.length - 1].indexOf('.') > 0) {
                    // Return data from all '<p>'
                    return Array.from(paragraphs).map(p => _splitAndTrim(_deleteAttributes(p.innerHTML)));
                }
            } else if (paragraphs.length === 1 && (paragraphs[0].innerHTML.split('→').length - 1 === expectedLength * (5 - 1))) {
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

        const isLocal = "poafjilkhgdgdilghljbpdepnimbldam" === chrome.runtime.id
        try {
            const promises = batchesToProcess.map(batch => process_with_gpt4mini(batch, optionsData, isLocal));
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