"use strict";

/**
 * Main function to load and extract Duolingo vocabulary from the current page.
 * Assumes it's running in a browser context on the Duolingo vocabulary page.
 * It is injected with chrome.scripting.executeScript, so it must stay self-contained.
 * @returns {Promise<Array<Object>>} A promise that resolves with an array of vocabulary items [{front, back}, ...]
 * @throws {Error} If the vocabulary section cannot be found or other errors occur.
 */
export async function getDuolingoVocabulary() {
  // How long to wait for one "Load more" batch before clicking again.
  const BATCH_TIMEOUT_MS = 20000;
  // How many times to click "Load more" for the same batch before giving up.
  const MAX_ATTEMPTS_PER_BATCH = 3;

  // Helper function to find the next vocabulary button
  function findNextVocabularyButton() {
    const buttons = document.querySelectorAll('li[role="button"]');
    for (const button of buttons) {
      if (isVocabularyButton(button)) {
        return button;
      }
    }
    return null;
  }

  // Helper function to check if an element is a vocabulary button
  function isVocabularyButton(element) {
    const isLiElement = "li" === element.tagName.toLowerCase();
    const isButtonRole = "button" === element.getAttribute("role");
    const hasBoldText = null !== element.querySelector("b");
    const hasImage = null !== element.querySelector("img");

    return isLiElement && isButtonRole && hasBoldText && hasImage;
  }

  // While a batch is loading, the same "Load more" item shows a spinner instead of
  // its text and icon, so it is not a vocabulary button but the list is not finished.
  function hasLoadMoreItem() {
    return !!document.querySelector('section ul > li[role="button"]');
  }

  function isWordItem(item) {
    return !!(item.querySelector("h3") && item.querySelector("p"));
  }

  function countLoadedWords() {
    let count = 0;
    document.querySelectorAll("section ul > li").forEach((item) => {
      if (isWordItem(item)) count++;
    });
    return count;
  }

  function updateProgress(loaded, total) {
    chrome.runtime.sendMessage({
      foreground: true,
      action: "update_progress_bar",
      action_params: [
        total ? `Loading ${Math.min(loaded, total)} / ${total} words...` : `Loading ${loaded} words...`,
      ],
    });
  }

  // Resolves true when the "Load more" item is gone, or when more words than
  // `previousCount` are on the page and the button is clickable again; false after `timeoutMs`.
  function waitForMoreWords(previousCount, timeoutMs) {
    return new Promise((resolve) => {
      const isDone = () => !hasLoadMoreItem()
        || (countLoadedWords() > previousCount && !!findNextVocabularyButton());
      let checkScheduled = false;
      const finish = (result) => {
        clearTimeout(timeout);
        observer.disconnect();
        resolve(result);
      };
      const observer = new MutationObserver(() => {
        if (checkScheduled) return;
        checkScheduled = true;
        // Check once per burst of mutations instead of once per added word.
        setTimeout(() => {
          checkScheduled = false;
          if (isDone()) finish(true);
        }, 50);
      });
      const timeout = setTimeout(() => finish(isDone()), timeoutMs);
      observer.observe(document.getElementById("root") || document.body, { childList: true, subtree: true });
      if (isDone()) finish(true);
    });
  }

  // Helper function to click through all vocabulary buttons
  async function loadAllVocabulary() {
    const numberOfAllWords = numberOfWordsInTargetLanguage();
    let attempts = 0;
    updateProgress(countLoadedWords(), numberOfAllWords);

    while (hasLoadMoreItem()) {
      const loadedBefore = countLoadedWords();
      if (numberOfAllWords && loadedBefore >= numberOfAllWords) break;

      // No clickable button means a batch is still loading: just wait again.
      findNextVocabularyButton()?.click();
      attempts++;
      const loadedMore = await waitForMoreWords(loadedBefore, BATCH_TIMEOUT_MS);

      if (loadedMore) {
        attempts = 0;
        updateProgress(countLoadedWords(), numberOfAllWords);
      } else if (attempts >= MAX_ATTEMPTS_PER_BATCH) {
        throw new Error(
          `Duolingo stopped loading words after ${loadedBefore} of ${numberOfAllWords || "all"}. No words were imported. Please try again.`
        );
      }
    }
  }

  // Helper function to find the vocabulary section
  function findVocabularySection() {
    const sections = document.querySelectorAll("section");

    for (const section of sections) {
      const listItems = section.querySelectorAll("ul > li");

      if (listItems.length > 0 && isWordItem(listItems[0])) {
        return section;
      }
    }

    throw new Error("Cannot find vocabulary section");
  }

  // Helper function to extract vocabulary from the section
  function extractVocabulary(section) {
    const vocabulary = [];

    section.querySelectorAll("ul > li").forEach((item) => {
      const wordElement = item.querySelector("h3");
      const translationElement = item.querySelector("p");

      if (wordElement && translationElement) {
        const front = wordElement.textContent.trim();
        const back = translationElement.textContent.trim();

        vocabulary.push({ front, back });
      }
    });

    return vocabulary;
  }

  // Reads the total from a heading like "1416 words", "1,688 mots" or "1.688 Wörter".
  // Returns null when it cannot be found; the total is only used for progress and as a stop hint.
  function numberOfWordsInTargetLanguage() {
    for (const h2 of document.querySelectorAll("h2")) {
      const match = h2.textContent.trim().match(/^(\d[\d\s.,  ]*)\s*\D+$/);
      if (match) {
        const total = parseInt(match[1].replace(/\D/g, ""), 10);
        if (total > 0) return total;
      }
    }
    return null;
  }

  /////////////////////////////////////////////////////////////////////////////////////////////////////
  console.log("Starting vocabulary extraction...");

  // Step 1: Click through all vocabulary buttons to load all words
  console.log("Loading all vocabulary items...");
  try {
    await loadAllVocabulary();
  } catch (error) {
    // Errors thrown inside executeScript do not reach the extension reliably.
    return { error: error.message };
  }
  console.log("Finished loading vocabulary items.");

  // Step 2: Find the vocabulary section
  console.log("Finding vocabulary section...");
  const vocabularySection = findVocabularySection();
  console.log("Vocabulary section found.");

  // Step 3: Extract vocabulary words and translations
  console.log("Extracting vocabulary...");
  const vocabulary = extractVocabulary(vocabularySection);
  console.log(`Extracted ${vocabulary.length} vocabulary items.`);

  // Step 4: Return the vocabulary
  return vocabulary;
}
