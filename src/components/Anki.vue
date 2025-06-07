<template>
  <div :data-lang="optionsData.pluginLanguage">

    <div class="d-flex justify-end px-2" style="margin-bottom: 0.5rem;">
      <!-- :loading="ankiLoading.export" -->
      <ActionButton icon="mdi-upload"
        :tooltipText="util.getText('Anki')"
        color="success"
        :disabled="!db_words.length"
        @click="triggerExport"/>
    </div>

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

            <v-col cols="12">
                  <v-checkbox
                    label="Include schedule information"
                    density="compact"
                    hide-details
                    readonly="true"/>
            </v-col>
          </v-row>
        </v-container>
      </v-card-text>
    </v-card>
  </div>
</template>

<script setup>
    import { util } from '../lib/util.js';;
    import ActionButton from './small/ActionButton.vue';
</script>

<script>
import { Model, Deck, Note, Package as AnkiPackage } from 'genanki-js';

export default {
  components: { 
    ActionButton,
  },
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
    },
    showMessage: {
      type: Function,
      required: true
    }
  },
  
  data() {
    return {
      deckName: '',
      nodeType: '',
      ankiLoading: false,
    };
  },
  
  mounted() {
    this.initializeComponent();
  },

  computed: {
    exportDialogTitle() {
      const wordsToExport = this.getValidWordsForExport();
      return `${ typeof wordsToExport === 'string' ? wordsToExport : `${ util.getText('Words') } - ${wordsToExport.length}`}`;
    },
  },
  
  methods: {
    _show_error(message){
      this.showMessage(message, 'error');
    },

    async initializeComponent() {
        this.deckName = `duo2anki - ` + util.getCurrentCourse();
        this.nodeType = `!duo2anki - ` + util.getCurrentCourse();
    },

    get_id_from_name(name) {
      const hash = Array.from(name).reduce((acc, char) => acc + char.charCodeAt(0), 0);
      return hash % 1000000000; // Ensure the ID is within a valid range
    },

    getValidWordsForExport() {
      if (!this.db_words || this.db_words.length === 0) {
        return util.getText('No words to process or request count is 0.');
      }

      const words = this.optionsData.exportWithContextOnly
        ? this.db_words.filter(word => word.context && word.context.trim() !== '')
        : this.db_words;

      if (words.length === 0) {
        return util.getText('anki_noMatchingWords');
      }
      return words;
    },

    triggerExport() { // Changed to async as it calls async operations like ankiPackage.writeToFile
      const wordsToExport = this.getValidWordsForExport();
      if (typeof wordsToExport === 'string') {
        this.showMessage(wordsToExport, 'warning');
        closeDialog();
        return;
      }
      
      if (!SQL) {
        this.showMessage('SQL.js not initialized. Please ensure it is loaded.', 'error');
        return;
      }

      const modelId = this.get_id_from_name(this.nodeType);
      try {
        const ankiModel = new Model({
          id: modelId,
          name: this.nodeType,
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

        const ankiDeck = new Deck(modelId + 1, this.deckName);

        wordsToExport.forEach(item => {
          const note = new Note(ankiModel, [
            item.front,
            item.back,
            util.get_sound_url(item),
            item.image,
            item.context,
            item.transcription || '',
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
        this.showMessage('Error exporting to Anki. See console for details.', 'error');
      }
    }
}
}
</script>

<style>
.error-link {
  color: white;
  text-decoration: underline;
}
</style>
