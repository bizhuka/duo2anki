/**
 * AnkiConnect service for communicating with Anki via the AnkiConnect API
 * Documentation: https://foosoft.net/projects/anki-connect/
 */

import { util } from "./util.js"; // Ensure .js extension

const API_URL = 'http://localhost:8765';

const ankiTool = {

      // Anki Connect API functions
      async connect(action = 'version', params = {}) { // Add default value wrap
        const version = 6;
        const payload = { action, version, params };

        try {
            const response = await fetch(API_URL, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify(payload)
            });

            const responseData = await response.json();

            if (responseData.error) {
                console.error(util.getText('Anki Connect error:'), responseData.error);
                throw new Error(responseData.error);
            }

            return responseData.result;
        } catch (error) {
            throw error;
        }
    },

    async export(historyItems) {
        const results = {
            success: 0,
            failed: 0,
            duplicates: 0,
        };

        const notes = historyItems
            .filter(item => item.front && item.back)
            .map(item => ({
                deckName: util.options.ankiDeck,
                modelName: util.options.ankiModel,
                fields: {
                    Front: item.front,
                    Back: item.back,
                    Sound: util.get_sound_url(item),
                    Image: item.image,
                    Context: item.context,
                },
            }));

        if (notes.length === 0) {
            return results; // No valid notes to add
        }

        try {
            // Check if notes can be added first
            const canAddNotesResult = await this.connect('canAddNotes', { notes });

            const notesToAdd = [];
            canAddNotesResult.forEach((canAdd, index) => {
                if (canAdd) {
                    notesToAdd.push(notes[index]);
                } else {
                    results.duplicates++; // Mark as failed if cannot be added
                }
            });

            if (notesToAdd.length === 0) {
                return results; // No notes can be added
            }

            // Add the notes that passed the check
            const addNotesResult = await this.connect('addNotes', { notes: notesToAdd });

            addNotesResult.forEach(result => {
                if (typeof result === 'number') { // Success is indicated by the note ID (a number)
                    results.success++;
                } else if (typeof result === 'string' && result.includes('it is a duplicate')) {
                    results.duplicates++;
                } else { // Failure is indicated by null or an error string (other than duplicate)
                    results.failed++;
                    console.log(util.getText('Anki addNotes error:'), result); // Log other errors for notes that *could* be added but still failed
                }
            });
        } catch (error) {
            // This catch block handles errors from the connect function itself (e.g., network issues for canAddNotes or addNotes)
            console.error(util.getText('Anki Connect request failed:'), error);
            // If the request itself fails, assume all notes intended for adding failed
            // Add the count of notes that *could* have been added to the failed count
            // (Notes that couldn't be added were already counted)
            results.failed += notesToAdd.length; // Add the remaining potential failures
        }

        return results;
    },
};

export { ankiTool };
