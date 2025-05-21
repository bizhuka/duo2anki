<template>
  <v-dialog v-model="dialog" max-width="500px">
    <v-card>
      <v-card-title>
        <span class="headline">{{ exportDialogTitle }}</span>
      </v-card-title>
      <v-card-text>
        <v-container>
          <v-row>
            <v-col cols="12">
              <v-text-field
                v-model="deckName"
                :label="util.getText('Anki Deck')"
                required
                density="compact"
                hide-details
                readonly="true"
              ></v-text-field>
            </v-col>
            <v-col cols="12">
              <v-text-field
                v-model="nodeType"
                :label="util.getText('Anki Note Type')"
                required
                density="compact"
                hide-details
                readonly="true"
              ></v-text-field>
            </v-col>
            <v-col cols="12">
              <v-tooltip location="top">
                <template v-slot:activator="{ props }">
                  <v-checkbox
                    v-bind="props"
                    v-model="optionsData.exportWithContextOnly"
                    :label="util.getText('Export only words with context')"
                    @update:model-value="saveOptions"
                    density="compact"
                    hide-details
                    readonly="true"
                  ></v-checkbox>
                </template>
                <span v-html="util.getText('anki_exportContextTooltip')"></span>
              </v-tooltip>
            </v-col>
          </v-row>
        </v-container>
      </v-card-text>
      <v-card-actions>
        <v-spacer></v-spacer>
        <v-btn color="primary" text @click="closeDialog">{{ util.getText('Cancel') }}</v-btn>
        <v-btn color="success" text @click="triggerExport">{{ util.getText('Ok') }}</v-btn>
      </v-card-actions>
    </v-card>
  </v-dialog>
</template>

<script>
import { ref, computed } from 'vue';
import { util } from '../../lib/util.js'; // Assuming util.js is in lib
import { Model, Deck, Note, Package as AnkiPackage } from 'genanki-js';

export default {
  props: {
    db_words: {
      type: Array,
      required: true,
    },
    optionsData: {
      type: Object,
      required: true,
    },
    saveOptions: {
      type: Function,
      required: true,
    },
    showMessage: {
      type: Function,
      required: true,
    }
  },
  setup(props) {
    const dialog = ref(false);
    const deckName = ref('');
    const nodeType = ref('');

    function openDialog() {
      deckName.value = `duo2anki - ` + util.getCurrentCourse();
      nodeType.value = `!duo2anki - ` + util.getCurrentCourse();
      dialog.value = true;
    }

    function closeDialog() {
      dialog.value = false;
    }
    
    function get_id_from_name(name) {
      const hash = Array.from(name).reduce((acc, char) => acc + char.charCodeAt(0), 0);
      return hash % 1000000000; // Ensure the ID is within a valid range
    }

    function getValidWordsForExport() {
      if (!props.db_words || props.db_words.length === 0) {
        return util.getText('No words to process or request count is 0.');
      }

      const words = props.optionsData.exportWithContextOnly
        ? props.db_words.filter(word => word.context && word.context.trim() !== '')
        : props.db_words;

      if (words.length === 0) {
        return util.getText('anki_noMatchingWords');
      }
      return words;
    }

    const exportDialogTitle = computed(() => {
      const wordsToExport = getValidWordsForExport();
      return `${ typeof wordsToExport === 'string' ? wordsToExport : `${ util.getText('Words') } - ${wordsToExport.length}`}`;
    });

    async function triggerExport() { // Changed to async as it calls async operations like ankiPackage.writeToFile
      const wordsToExport = getValidWordsForExport();
      if (typeof wordsToExport === 'string') {
        props.showMessage(wordsToExport, 'warning');
        closeDialog();
        return;
      }
      
      if (!SQL) {
        props.showMessage('SQL.js not initialized. Please ensure it is loaded.', 'error');
        closeDialog();
        return;
      }

      const modelId = get_id_from_name(nodeType.value);
      try {
        const ankiModel = new Model({
          id: modelId,
          name: nodeType.value,
          flds: [
            { name: 'Front' },
            { name: 'Back' },
            { name: 'Sound' },
            { name: 'Image' },
            { name: 'Context' },
            { name: 'Transcription' },
          ],
          req: [ // Define required fields for card generation
            [0, "all", [0]], // Requires the 'Front' field for the first card template
          ],
          tmpls: [
            {
              name: 'Main template',
              qfmt: `<div>{{Front}}</div><div class="transcription">{{Transcription}}</div>[sound:{{Sound}}]`,
              afmt: `<div>{{FrontSide}}</div><hr id=answer><div>{{Back}}</div><div><img src="{{Image}}"></div><div class="context">{{Context}}</div>`,
            },
          ],
          css: `.card { font-family: arial; font-size: 1.5rem; text-align: center; color: black; background-color: white; }`,
        });

        const ankiDeck = new Deck(modelId + 1, deckName.value);

        wordsToExport.forEach(item => {
          const note = new Note(ankiModel, [
            item.front,
            item.back,
            util.get_sound_url(item),
            item.image,
            item.context,
            '', // Transcription field can be empty or filled based on your data
          ]);
          ankiDeck.addNote(note);
        });

        const ankiPackage = new AnkiPackage();
        ankiPackage.addDeck(ankiDeck);

        const db = new SQL.Database();
        ankiPackage.setSqlJs(db);

        // genanki-js's writeToFile method handles the download in browser environments
        ankiPackage.writeToFile(`duo2anki - ${ util.getCurrentCourse() }.apkg`);
      } catch (error) {
        console.error('Error exporting to Anki:', error);
        props.showMessage('Error exporting to Anki. See console for details.', 'error');
      } finally {
        closeDialog();
      }
    }
    
    // Expose methods to the template via the setup context
    return {
      dialog,
      deckName,
      nodeType,
      openDialog,
      closeDialog,
      triggerExport,
      util, // Expose util for template usage
      exportDialogTitle
    };
  }
};
</script>

<style scoped>
/* Add any specific styles for your dialog here */
</style>