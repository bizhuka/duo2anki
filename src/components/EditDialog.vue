<template>
  <v-dialog v-model="dialog.show" max-width="40rem" density="compact" :data-lang="optionsData.pluginLanguage">
    <!-- Render card content only if editingWord exists -->
    <v-card v-if="dialog.editingWord" density="compact" style="position: relative;"> <!-- Ensure positioning context -->
      <!-- Left Chevron Button -->
      <ChevronButton direction="left" :tooltip-text="util.getText('Previous Word (Left Arrow)')" :open-delay="1000"
        @click="methods.edit_popup(dialog.editingWord, -1)" />
      <!-- Right Chevron Button -->
      <ChevronButton direction="right" :tooltip-text="util.getText('Next Word (Right Arrow)')" :open-delay="1000"
        @click="methods.edit_popup(dialog.editingWord, 1)" />
      <v-card-title>
        {{ util.getText('Edit Word - №') }}{{ dialog.editingIndex + 1 }}
        <v-btn icon="mdi-close" variant="text" density="compact" size="x-large" @click="methods.closeDialog"
          style="position: absolute; top: 8px; right: 8px;"></v-btn>
      </v-card-title>
      <v-card-text style="padding-top: 0.2rem; padding-bottom: 0; overflow-y: auto; max-height: 70vh;">
        <v-col style="padding-top: 0;padding-bottom: 0; display: flex; flex-direction: column; flex-grow: 1;">

          <v-text-field v-model="dialog.editingWord.front" :label="util.getText('Word')" v-if="dialog.showRichText" density="compact"
            hide-details readonly="true" class="mb-2"> <!-- Added margin-bottom -->
            <!-- Play sound with the word ONLY -->
            <template v-slot:append-inner>
              <v-tooltip location="top" :text="util.getText('{0} (MediaPlayPause)', [dialog?.editingWord?.front])" :open-delay="1000">
                <template v-slot:activator="{ props }">
                  <v-icon v-bind="props" color="success" @click="methods.changeSoundMode">{{ soundIcon }}</v-icon>
                </template>
              </v-tooltip>
            </template>
            <!-- Search for image button -->
            <template v-slot:append>
              <v-tooltip location="top" :text="util.getText('Find Image (F4)')" :open-delay="1000">
                <template v-slot:activator="{ props }">
                  <v-icon v-bind="props" color="primary" @click="methods.findImageFromFront">mdi-image-search</v-icon>
                </template>
              </v-tooltip>
            </template>
          </v-text-field>

          <!-- Translation - Find back image-->
          <RichTextEditor v-if="dialog.showRichText" v-model="dialog.editingWord.back" :label="util.getText('Translation')"
            min-height="2rem" class="mb-2" :handlers="{ customButton1Click: methods.handleFindImageFromBack }"
            :icons="{ customButton1Icon: '\\F0978', customButton1Color: 'primary' }" :optionsData="optionsData" />

          <!-- Context Play sound context-->
          <RichTextEditor v-if="dialog.showRichText" v-model="dialog.editingWord.context" :label="util.getText('Context')"
            min-height="6rem" hide-details class="mb-2"
            :handlers="{ customButton1Click: methods.handleContextPlaySound }"
            :icons="{ customButton1Icon: '\\F057E', customButton1Color: 'success' }" :optionsData="optionsData" />

          <!-- Combined Image Display and Drop Zone -->
          <ImageDropZone
            :image="dialog.editingWord.image"
            @update:image="newImage => { dialog.editingWord.image = newImage }"
            @save="methods.saveEdit"
            :optionsData="optionsData"
          />
        </v-col>
      </v-card-text>
      <v-card-actions>
        <v-spacer></v-spacer>
        <!-- Delete button -->
        <v-btn color="error" text @click="methods.deleteWord" density="compact" prepend-icon="mdi-delete"
          style="text-transform: none;">{{ util.getText('Delete') }}</v-btn>
        <!-- Save emits the local copy -->
        <v-btn color="success" text @click="methods.saveEdit" density="compact" style="text-transform: none;">{{ util.getText('Save') }}</v-btn>
      </v-card-actions>
    </v-card>

    <ConfirmDialog ref="saveDialog" :optionsData="optionsData" />
  </v-dialog>
</template>

<script>
import { reactive, ref, watch, nextTick, computed } from 'vue';
import { util } from '@/lib/util';
import ChevronButton from './small/ChevronButton.vue';
import ImageDropZone from './small/ImageDropZone.vue';
export default {
  emits: ['save'],

  props: {
    onDeleteWord: {
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

    const soundIcon = computed(() => {
      switch (util.options.soundMode) {
        case util.SOUND_MODE.FRONT_WORD:
          return 'mdi-volume-medium';
        case util.SOUND_MODE.FRONT_WORD_WITH_CONTEXT:
          return 'mdi-volume-high';
        case util.SOUND_MODE.OFF:
          return 'mdi-volume-off';
      }
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
      } else {
        window.removeEventListener('keydown', handleKeydown);
      }
    });

    async function _checkIsSaved() {
      if (!dialog.editingWord || !dialog.prevWord)
        return true; // No need to check if no word is being edited

      // Check if any property has changed
      const isChanged = Object.keys(dialog.editingWord).some(key => {
        if (key === 'image') return false; // Skip image comparison

        let prevValue = dialog.prevWord[key];
        let currentValue = dialog.editingWord[key];
        if (key === 'context' || key === 'back') {
          prevValue = util.delete_all_linebreaks(prevValue);
          currentValue = util.delete_all_linebreaks(currentValue);
        }
        //if(prevValue !== currentValue)console.log(`Property ${key} changed from ${prevValue} to ${currentValue}`);
        return prevValue !== currentValue;
      });

      if (isChanged) {
        const result = await saveDialog.value.confirm_popup({
          title: dialog.editingWord.front,
          message: 'edit_unsavedChangesPrompt',
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

    const methods = {
      async edit_popup(currentWord, shift=0) {
        const currentIndex = props.filteredWords.findIndex(word => word.id === currentWord.id);
        if (currentIndex === -1) return; // Word not found in filtered list

        if (shift !== 0 && !await _checkIsSaved()) {
          return; // Do not change word if not saved
        }

        dialog.editingIndex = (currentIndex + shift + props.filteredWords.length) % props.filteredWords.length;
        const newWord = props.filteredWords[dialog.editingIndex];

        // Store the new word for comparison
        dialog.prevWord = newWord;

        // Ensure 'image' property exists, initialize if not
        dialog.editingWord = newWord ? {
          image: null,
          context: '<p></p>', // TODO Initialize context to an empty paragraph
          ...newWord
        } : null;

        dialog.show = true; // Show the dialog

        if (shift !== 0) {
          await methods.setDialogFocus(); // Wait for DOM update before focusing
          await methods.updateImageTab();
        }
        methods.playCurrentWordSound();
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

      async playCurrentWordSound(mode = null) {
        let word = null;
        switch (mode || util.options.soundMode) {
          case util.SOUND_MODE.FRONT_WORD:
            word = { front: dialog.editingWord.front, targetLang: dialog.editingWord.targetLang };
            break;
          case util.SOUND_MODE.FRONT_WORD_WITH_CONTEXT:
            word = dialog.editingWord;
            break;
          case util.SOUND_MODE.OFF:
            word = {}; // Stop sound
            break;
          case util.SOUND_MODE.CONTEXT_ONLY:
            word = { front: '', context: dialog.editingWord.context, targetLang: dialog.editingWord.targetLang };
            break;
        }
        if (word) {
          util.playSound(word); // Play sound for the word
        }
      },

      handleContextPlaySound() {
        methods.playCurrentWordSound(util.SOUND_MODE.CONTEXT_ONLY); // Play sound for context only
        methods.setDialogFocus(); // Call the existing focus method
      },

      async changeSoundMode() {
        util.options.soundMode = (util.options.soundMode + 1) % 3; // Cycle through sound modes
        util.save_options({ soundMode: util.options.soundMode }); // Save the new sound mode
        methods.playCurrentWordSound(); // Play sound for the current word
        methods.setDialogFocus();
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

      async deleteWord() { // Make the function async
        if (dialog.editingWord) {
          const deleted = await props.onDeleteWord(dialog.editingWord);

          // Close the dialog only if the deletion was confirmed and successful
          if (deleted === util.CONFIRM_RESULT.YES) {
            methods.closeDialog(); // Call internal method
          }
        }
      },

      // Find image based on the 'front' field
      async findImageFromFront() {
        await util.openImageSearchTab(
          dialog?.editingWord?.front,
          dialog?.editingWord?.targetLang ? `&lang=${dialog?.editingWord?.targetLang}` : '');
        await methods.setDialogFocus(); // Set focus back to the dialog
      },

      // Find image based on the 'back' (Translation) field
      async handleFindImageFromBack() {
        const arr0 = util.delete_all_tags(dialog?.editingWord?.back).split('→');
        const arr1 = arr0[arr0.length - 1].split(',');
        await util.openImageSearchTab(arr1[0].trim());
        await methods.setDialogFocus(); // Set focus back to the dialog
      },
    };

    return {
      util,
      dialog,
      saveDialog, // <-- Expose the ref to the template
      methods,
      soundIcon // Expose the computed property
    };
  }
}
</script>
