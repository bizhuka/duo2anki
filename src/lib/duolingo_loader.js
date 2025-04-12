"use strict";

/**
 * Main function to load and extract Duolingo vocabulary from the current page.
 * Assumes it's running in a browser context on the Duolingo vocabulary page.
 * @returns {Promise<Array<Object>>} A promise that resolves with an array of vocabulary items [{front, back}, ...]
 * @throws {Error} If the vocabulary section cannot be found or other errors occur.
 */
export async function getDuolingoVocabulary() {
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

  // Helper function to click through all vocabulary buttons
  async function loadAllVocabulary() {
    let clickCount = 0;
    const numberOfAllWords = numberOfWordsInTargetLanguage();
    while (findNextVocabularyButton()) {
      try {
        findNextVocabularyButton().click();

        // Send a message  to update the progress bar
        let currentWordPosition = 50 + clickCount++ * 50;
        chrome.runtime.sendMessage({
          foreground: true,
          action: "update_progress_bar",
          action_params: [
            `Loading ${currentWordPosition} / ${numberOfAllWords} words...`,
          ],
        });

        await new Promise((resolve, reject) => {
          try {
            const timeout = setTimeout(
              () => {
                observer.disconnect();
                reject("timeLimitExceeded");
              },
              currentWordPosition + 50 > numberOfAllWords ? 1000 : 10000
            );

            const observer = new MutationObserver((mutations) => {
              for (const mutation of mutations) {
                const target = mutation.target;

                if (
                  "childList" === mutation.type &&
                  isVocabularyButton(target) &&
                  mutation.addedNodes.length > 0
                ) {
                  resolve();
                  clearTimeout(timeout);
                  observer.disconnect();
                }
              }
            });

            try {
              const root = document.getElementById("root");
              const config = { childList: true, subtree: true };
              observer.observe(root, config);
            } catch (error) {
              observer.disconnect();
              clearTimeout(timeout);
              reject(error);
            }
          } catch (error) {
            reject(error);
          }
        });
      } catch (error) {
        if ("timeLimitExceeded" == error) {
          console.warn(
            "Vocabulary loading timed out. Proceeding with extracted words."
          );
          break;
        }
        throw error;
      }
    }

    // Send a message  to update the progress bar
    chrome.runtime.sendMessage({
      foreground: true,
      action: "update_progress_bar",
      action_params: [`Loading ${numberOfAllWords} words...`],
    });
  }

  // Helper function to find the vocabulary section
  function findVocabularySection() {
    const sections = document.querySelectorAll("section");

    for (const section of sections) {
      const listItems = section.querySelectorAll("ul > li");

      if (listItems.length > 0) {
        const firstItem = listItems[0];
        const wordElement = firstItem.querySelector("h3");
        const translationElement = firstItem.querySelector("p");

        if (wordElement && translationElement) {
          return section;
        }
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

  function numberOfWordsInTargetLanguage() {
    // Loop through all H2
    for (const h2 of document.querySelectorAll("h2")) {
      if (h2.textContent.trim().endsWith(" words")) {
        return h2.textContent.trim().split(" ")[0];
      }
    }
    return null;
  }

  /////////////////////////////////////////////////////////////////////////////////////////////////////
  console.log("Starting vocabulary extraction...");

  // Step 1: Click through all vocabulary buttons to load all words
  console.log("Loading all vocabulary items...");
  await loadAllVocabulary();
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
