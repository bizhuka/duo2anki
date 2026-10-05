<template>
  <v-dialog v-model="dialog.show" max-width="40rem" density="compact">
    <!-- Render card content only if editingWord exists -->
    <v-card v-if="dialog.editingWord" density="compact" style="position: relative;"> <!-- Ensure positioning context -->
      <!-- Left Chevron Button -->
      <ChevronButton v-if="dialog.editingWord.id !== util.WORD_IS_NEW"
        direction="left" :tooltip-text="util.getText('Previous Word (Left Arrow)')" :open-delay="1000"
        @click="methods.edit_popup(dialog.editingWord, -1)" />
      <!-- Right Chevron Button -->
      <ChevronButton v-if="dialog.editingWord.id !== util.WORD_IS_NEW"
        direction="right" :tooltip-text="util.getText('Next Word (Right Arrow)')" :open-delay="1000"
        @click="methods.edit_popup(dialog.editingWord, 1)" />
      <v-card-title>
        {{ dialog.editingWord.id === util.WORD_IS_NEW?
             util.getText('addNewWord'):
             util.getText('Edit Word - №') + dialog.editingIndex + 1 }}
        <v-btn icon="mdi-close" variant="text" density="compact" size="x-large" @click="methods.closeDialog"
          style="position: absolute; top: 8px; right: 8px;"></v-btn>
      </v-card-title>
      <v-card-text style="padding-top: 0.2rem; padding-bottom: 0; overflow-y: auto; max-height: 70vh;">
        <v-col style="padding-top: 0;padding-bottom: 0; display: flex; flex-direction: column; flex-grow: 1;">

          <v-text-field v-model="dialog.editingWord.front" :label="util.getText('Word')" v-if="dialog.showRichText" density="compact"
            hide-details readonly="true" class="mb-2"> <!-- Added margin-bottom -->
            <!-- Play sound with the word ONLY -->
            <template v-slot:append-inner v-if="!dialog.editingWord.archived">
              <ReplaySoundButton
                :card="dialog.editingWord"
                :modes="frontSoundModes"
              />
            </template>
            <!-- Search for image button -->
            <template v-slot:append v-if="!dialog.editingWord.archived">
              <v-tooltip location="top" max-width="280" :open-delay="1000">
                <template v-slot:activator="{ props }">
                  <v-icon v-bind="props" color="primary" @click="methods.findImageFromFront">mdi-image-search</v-icon>
                </template>
                <div>{{ util.getText('Find Image (F4)') }}</div>
                <div style="white-space: pre-line;">{{ util.getText('image_autoFillHint') }}</div>
              </v-tooltip>
            </template>
          </v-text-field>

          <RichTextEditor v-if="dialog.showRichText && !dialog.editingWord.archived" v-model="dialog.editingWord.transcription" :label="util.getText('hintOrTranscription')"
            min-height="1.5rem" class="mb-2" :optionsData="optionsData" :hideToolbar="true"/>

          <!-- Translation - Find back image-->
          <RichTextEditor v-if="dialog.showRichText && !dialog.editingWord.archived" v-model="dialog.editingWord.back" :label="util.getText('Translation')"
            min-height="2rem" class="mb-2" :handlers="{ customButton1Click: methods.handleFindImageFromBack }"
            :icons="{ customButton1Icon: '\\F0978', customButton1Color: 'primary' }"
            :break-delimeter="'⏎;→'" :optionsData="optionsData" />

          <v-checkbox v-if="!dialog.editingWord.archived"
            :model-value="dialog.editingWord.hasTranslation === true"
            @update:model-value="dialog.editingWord.hasTranslation = $event"
            :label="util.getText('Translated with Azure')" density="compact" hide-details class="mb-2" />

          <!-- Context Play sound context-->
          <RichTextEditor v-if="dialog.showRichText && !dialog.editingWord.archived" v-model="dialog.editingWord.context" :label="util.getText('Context')"
            min-height="6rem" hide-details class="mb-2"
            :handlers="{ customButton1Click: methods.handleContextPlaySound }"
            :icons="{ customButton1Icon: '\\F057E', customButton1Color: 'success' }" :break-delimeter="'⏎'" :optionsData="optionsData" />

          <!-- Combined Image Display and Drop Zone -->
          <ImageDropZone
            v-if="!dialog.editingWord.archived"
            :image="dialog.editingWord.image"
            @update:image="newImage => { dialog.editingWord.image = newImage }"
            @save="methods.saveEdit"
            @find-image="methods.findImageFromFront"
            :optionsData="optionsData"
          />
        </v-col>
      </v-card-text>
      <v-card-actions>
        <v-spacer></v-spacer>
        <!-- Delete button -->
        <v-btn v-if="dialog.editingWord.id !== util.WORD_IS_NEW"
          :color="dialog.editingWord.archived ? 'success' : 'error'" text @click="methods.toggleArchive" density="compact" 
          :prepend-icon="dialog.editingWord.archived ? 'mdi-archive-arrow-up-outline' : 'mdi-archive-arrow-down-outline'"
          style="text-transform: none;">
          {{ util.getText(dialog.editingWord.archived ? 'Restore' : 'Archive') }}
        </v-btn>
        <!-- Save emits the local copy -->
        <v-btn color="success" text @click="methods.saveEdit" density="compact" style="text-transform: none;">{{ util.getText('Save') }}</v-btn>
      </v-card-actions>
    </v-card>

    <ConfirmDialog ref="saveDialog" :optionsData="optionsData" />
  </v-dialog>
</template>

<script>
import { reactive, ref, watch, nextTick, computed, onBeforeUnmount } from 'vue';
import { util } from '@/lib/util';
import { ENABLE_DEBUG_LOGGING } from '@/lib/ai.js';
import ReplaySoundButton from '@/games/components/ReplaySoundButton.vue';
import { googleImageSearchQuery, readGoogleSearchImage } from '@/lib/imageSearch.js';

export default {
  components: { ReplaySoundButton },
  emits: ['save'],

  props: {
    onArchiveWord: {
      type: Function,
      required: true
    },
    filteredWords: {
      type: Array,
      required: true
    },
    optionsData: { // Added prop
      type: Object,
      required: true
    }
  },

  setup(props, { emit }) {
    const dialog = reactive({
      show: false,
      editingWord: null,
      prevWord: null, // To store the previous word for comparison
      editingIndex: -1, // To track the index of the currently edited word
      showRichText: true, // Control visibility of RichTextEditors
    });
    const saveDialog = ref(null); // Reference to the ConfirmDialog component
    let imageSearchQuery = '';
    let imageSearchVersion = 0;
    const onImageTabUpdated = (tabId, changeInfo) => {
      if (tabId === util.options.imageSearchTabId && changeInfo.status === 'complete') {
        methods.captureImageFromSearchTab(tabId);
      }
    };
    onBeforeUnmount(() => {
      imageSearchVersion += 1;
      chrome.tabs.onUpdated.removeListener(onImageTabUpdated);
    });

    const handleKeydown = async (event) => {
      if (!dialog.show) return  // Only act if dialog is open

      if (event.key === 'MediaPlayPause') {        
        methods.playCurrentWordSound(util.SOUND_MODE.FRONT_WORD_WITH_CONTEXT);
      } else {
        const targetTagName = event?.target?.tagName?.toLowerCase();
        if (targetTagName === 'input' || targetTagName === 'textarea' || event.target.isContentEditable) return; // Ignore keydown events in these elements

        // Check for 'F4' for Find Image
        if (event.key === 'F4') {
          event.preventDefault(); // Prevent default browser behavior for F4 if any
          methods.findImageFromFront();
          return; // Exit after handling
        }

        // Check for Arrow keys for navigation
        const shift =
          event.key === 'ArrowRight' ? 1 :
            event.key === 'ArrowLeft' ? -1 : null;
        if (shift) {
          event.preventDefault(); // Prevent potential browser side effects
          await methods.edit_popup(dialog.editingWord, shift); // Ensure this is correct
        }
      }
    };

    // Add/remove listener based on dialog visibility
    watch(() => dialog.show, (isVisible) => {
      if (isVisible) {
        window.addEventListener('keydown', handleKeydown);
        chrome.tabs.onUpdated.addListener(onImageTabUpdated);
      } else {
        window.removeEventListener('keydown', handleKeydown);
        chrome.tabs.onUpdated.removeListener(onImageTabUpdated);
        imageSearchVersion += 1;
      }
      // Update storage when dialog visibility changes
      updateEditingWordStorage();
    });

    // Watch for changes to the editing word's front text
    watch(() => dialog.editingWord?.front, () => {
      updateEditingWordStorage();
    });

    // Helper function to update storage
    const updateEditingWordStorage = () => {
      const frontText = dialog.show && dialog.editingWord?.front ? dialog.editingWord.front : null;
      chrome.storage.local.set({ editingWordFront: frontText });
    };

    async function _checkIsSaved() {
      if (!dialog.editingWord || !dialog.prevWord)
        return true; // No need to check if no word is being edited

      // Check if any property has changed
      const isChanged = Object.keys(dialog.editingWord).some(key => {
        if (key === 'image') return false; // Skip image comparison

        let prevValue = dialog.prevWord[key];
        let currentValue = dialog.editingWord[key];
        if (key === 'context' || key === 'back' || key === 'transcription') {
          prevValue = util.unescape_html(util.delete_all_linebreaks(prevValue));
          currentValue = util.unescape_html(util.delete_all_linebreaks(currentValue));
        }
        if(prevValue !== currentValue){
           console.log(`Property ${key} changed: `);
           console.log(prevValue);
           console.log(currentValue);
        }
        return prevValue !== currentValue;
      });

      if (isChanged) {
        const result = await saveDialog.value.confirm_popup({
          title: dialog.editingWord.front,
          message: util.getText('edit_unsavedChangesPrompt'),
          yesText: util.getText('Save'),
          noText: util.getText('Discard'),
          showStop: true
        });

        switch (result) {
          case util.CONFIRM_RESULT.STOP:
            return false; // Stop the action
          case util.CONFIRM_RESULT.YES:
            methods.saveEdit(); // Save the changes and proceed
            break;
          case util.CONFIRM_RESULT.NO:
            break; // Discard changes and proceed
        }
      }
      return true;
    }

    const frontSoundModes = [
      util.SOUND_MODE.OFF,
      util.SOUND_MODE.FRONT_WORD,
      util.SOUND_MODE.FRONT_WORD_WITH_CONTEXT
    ];

    const findSiblingWord = (startIndex, direction, preferredArchivedState = null) => {
      const total = props.filteredWords.length;
      if (total <= 1 || startIndex === -1) return null;

      const normalizedDirection = direction >= 0 ? 1 : -1;
      let fallback = null;

      for (let step = 1; step < total; step++) {
        const candidateIndex = (startIndex + normalizedDirection * step + total) % total;
        const candidate = props.filteredWords[candidateIndex];
        if (!candidate || candidate.id === dialog.editingWord?.id) {
          continue;
        }

        if (preferredArchivedState === null || candidate.archived === preferredArchivedState) {
          return candidate;
        }

        if (!fallback) {
          fallback = candidate;
        }
      }

      return fallback;
    };

    const methods = {
      async edit_popup(currentWord, shift=0) {
        const currentIndex = props.filteredWords.findIndex(word => word.id === currentWord.id);
        if (currentIndex === -1) return; // Word not found in filtered list

        if (shift !== 0 && !await _checkIsSaved()) {
          return; // Do not change word if not saved
        }

        dialog.editingIndex = (currentIndex + shift + props.filteredWords.length) % props.filteredWords.length;
        methods.set_word(props.filteredWords[dialog.editingIndex], shift !== 0);
      },

      async add_new_word(newWord) {
        methods.set_word(newWord, true);
        methods.findImageFromFront();
      },

      async set_word(setWord, setFocus) {
        imageSearchVersion += 1;
        imageSearchQuery = '';
        // Store the new word for comparison
        dialog.prevWord = setWord;

        // Ensure 'image' property exists, initialize if not
        dialog.editingWord = setWord ? {
          image: null,
          context: '<p></p>', // TODO Initialize context to an empty paragraph
          ...setWord
        } : null;

        dialog.show = true; // Show the dialog

        if (setFocus) {
          await methods.setDialogFocus(); // Wait for DOM update before focusing
          await methods.updateImageTab();
        }
        // TODO methods.playCurrentWordSound();
      }, 

      async setDialogFocus() {
        // This helps ensure editors are properly re-rendered if needed
        dialog.showRichText = false;
        await nextTick();
        dialog.showRichText = true;
      },

      async updateImageTab() {
        // Check if the image search tab is active and refresh it if so
        if (util.options.imageSearchTabId) {
          try {
            const tab = await chrome.tabs.get(util.options.imageSearchTabId);
            // Check if the tab exists and is the currently active tab in its window
            if (tab && tab.active) {
              await methods.findImageFromFront(); // Refresh the search
            }
          } catch (error) {
          }
        }
      },

      async captureImageFromSearchTab(tabId) {
        const word = dialog.editingWord;
        const version = imageSearchVersion;
        const query = imageSearchQuery || util.delete_all_tags(word?.front).trim();
        if (!dialog.show || !word || word.archived || word.image || !query ||
            !Number.isInteger(tabId) || tabId !== util.options.imageSearchTabId) {
          return false;
        }
        try {
          const tab = await chrome.tabs.get(tabId);
          const actualQuery = googleImageSearchQuery(tab.url);
          if (!tab.active || tab.status !== 'complete' || actualQuery !== query) {
            return false;
          }
          const results = await chrome.scripting.executeScript({
            target: { tabId },
            func: readGoogleSearchImage,
            args: [query],
          });
          const image = results?.[0]?.result;
          if (!dialog.show || dialog.editingWord !== word || imageSearchVersion !== version ||
              word.image || word.archived || tabId !== util.options.imageSearchTabId ||
              !util.isValidImageSource(image)) {
            return false;
          }
          const currentTab = await chrome.tabs.get(tabId);
          if (!currentTab.active || currentTab.status !== 'complete' || googleImageSearchQuery(currentTab.url) !== query ||
              dialog.editingWord !== word || imageSearchVersion !== version || word.image || word.archived) {
            return false;
          }
          word.image = image;
          methods.saveEdit();
          return true;
        } catch {
          return false;
        }
      },

      async playCurrentWordSound(mode = null) {  
        if(ENABLE_DEBUG_LOGGING)console.log("playCurrentWordSound called with mode:", mode);      
        util.playSound(dialog.editingWord, mode || util.options.soundMode); // Play sound for the word
      },

      handleContextPlaySound() {
        methods.playCurrentWordSound(util.SOUND_MODE.CONTEXT_ONLY); // Play sound for context only
        methods.setDialogFocus(); // Call the existing focus method
      },

      async closeDialog() {
        if (!await _checkIsSaved()) {
          return; // Do not close dialog if not saved
        }
        dialog.show = false;
        dialog.editingWord = null;
      },

      saveEdit() {
        if (dialog.editingWord) {
          emit('save', dialog.editingWord);
          dialog.prevWord = dialog.editingWord; // Update previous word to current after saving
          // Do not close closeDialog();
        }
      },

      async toggleArchive() {
        if (!dialog.editingWord) return;

        const isArchiving = !dialog.editingWord.archived;
        const currentIndex = props.filteredWords.findIndex(word => word.id === dialog.editingWord.id);
        const preferredDirection = isArchiving ? 1 : -1;
        const preferredState = isArchiving ? false : true;

        const candidates = [
          findSiblingWord(currentIndex, preferredDirection, preferredState),
          findSiblingWord(currentIndex, -preferredDirection, preferredState),
          findSiblingWord(currentIndex, preferredDirection, null),
          findSiblingWord(currentIndex, -preferredDirection, null)
        ];

        const nextWord = candidates.find(Boolean) || null;

        const result = await props.onArchiveWord(dialog.editingWord, isArchiving);
        if (result === util.CONFIRM_RESULT.YES) {
          dialog.editingWord.archived = isArchiving;
          methods.saveEdit();

          if (nextWord) {
            await nextTick();
            methods.edit_popup(nextWord, 0);
          }
        }
      },

      async deleteWord() { // Make the function async
        if (dialog.editingWord) {
          const deleted = await props.onArchiveWord(dialog.editingWord);

          // Close the dialog only if the deletion was confirmed and successful
          if (deleted === util.CONFIRM_RESULT.YES) {
            methods.closeDialog(); // Call internal method
          }
        }
      },

      // Find image based on the 'front' field
      async findImageFromFront() {
        imageSearchVersion += 1;
        imageSearchQuery = util.delete_all_tags(dialog?.editingWord?.front).trim();
        await util.openImageSearchTab(
          imageSearchQuery,
          dialog?.editingWord?.targetLang ? `&lang=${dialog?.editingWord?.targetLang}` : '');
        await methods.captureImageFromSearchTab(util.options.imageSearchTabId);
        await methods.setDialogFocus(); // Set focus back to the dialog
      },

      // Find image based on the 'back' (Translation) field
      async handleFindImageFromBack() {
        const parts = util.getTranslationAlternatives(dialog?.editingWord?.back);
        imageSearchVersion += 1;
        imageSearchQuery = parts[0] || '';
        await util.openImageSearchTab(imageSearchQuery);
        await methods.captureImageFromSearchTab(util.options.imageSearchTabId);
        await methods.setDialogFocus(); // Set focus back to the dialog
      },
    };

    return {
      util,
      dialog,
      saveDialog, // <-- Expose the ref to the template
      methods,
      frontSoundModes,
    };
  }
}
</script>
