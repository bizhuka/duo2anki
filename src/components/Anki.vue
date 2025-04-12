<template>
  <div :data-lang="optionsData.pluginLanguage">
          <!-- Anki Setup Guide Component -->
          <anki-setup-guide :optionsData="optionsData"/>


          <div class="d-flex justify-end px-2" style="margin-bottom: 0.5rem;margin-top: 0.5rem;"> <!-- Added px-2 for consistency -->
            <ActionButton
              icon="mdi-upload"
              :tooltipText="util.getText('Anki')"
              color="success"
              :loading="ankiLoading.export"
              :disabled="!db_words.length || !optionsData.ankiDeck || !optionsData.ankiModel"
              @click="exportToAnki"
            />
          </div>

          <!-- InfoAlert removed, will use the one passed from App.vue -->

          <v-row density="compact">
            <v-col cols="12" sm="6">
              <v-combobox
                v-model="optionsData.ankiDeck"
                :items="ankiDecks.items"
                :loading="ankiDecks.loading"
                :label="util.getText('Anki Deck')"
                @click:clear="optionsData.ankiDeck = ''"
                @update:model-value="saveOptions"
                clearable
                @focus="loadAnkiDecks"
                density="compact"
              >
                <template v-slot:prepend-inner>
                  <v-icon>mdi-cards</v-icon>
                </template>
                <template v-slot:append-inner>
                  <v-icon @click="loadAnkiDecks" color="primary">mdi-refresh</v-icon>
                </template>
              </v-combobox>
            </v-col>
            <v-col cols="12" sm="6">
              <v-combobox
                v-model="optionsData.ankiModel"
                :items="ankiModels.items"
                :loading="ankiModels.loading"
                :label="util.getText('Anki Note Type')"
                @click:clear="optionsData.ankiModel = ''"
                @update:model-value="saveOptions"
                clearable
                @focus="loadAnkiModels"
                density="compact"
              >
                <template v-slot:prepend-inner>
                  <v-icon>mdi-note-text</v-icon>
                </template>
                <template v-slot:append-inner>
                  <v-icon @click="loadAnkiModels" color="primary">mdi-refresh</v-icon>
                </template>
              </v-combobox>
            </v-col>
          </v-row>
          <v-row density="compact" style="margin-left: 0.5rem;">
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
          </v-row>
  </div>
</template>

<script setup>
    import { util } from '../lib/util.js';
    import { ankiTool } from '../lib/ankiTool.js';
    import AnkiSetupGuide from './small/AnkiSetupGuide.vue';
    import ActionButton from './small/ActionButton.vue'; // Import ActionButton
</script>

<script>

export default {
  components: { // Register components
    AnkiSetupGuide,
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
    showMessage: { // Add the new prop
      type: Function,
      required: true
    }
  },
  
  data() {
    return {
      // setupTab: null, // Removed, now in AnkiSetupGuide
      ankiDecks: {
        items: [],
        loading: false
      },
      ankiModels: {
        items: [],
        loading: false
      },
      ankiLoading: {
        export: false,
        version: null
      },
    };
  },
  
  mounted() {
    this.initializeComponent();
  },
  
  methods: {

    _show_instructions(){
      this.showMessage(util.getText('anki_setupInstructions'), 'error');
    },

    async initializeComponent() {      
      // Initialize Anki integration
      try {
        this.ankiLoading.version = await ankiTool.connect('version');
        console.log(util.getText('Connected to Anki, version:'), this.ankiLoading.version);

        await this.loadAnkiDecks();
        await this.loadAnkiModels();
      } catch (error) {
        this._show_instructions();
      }
    },

    async loadAnkiDecks() {
      await this.loadAnkiList('deckNames', this.ankiDecks);      
    },

    async loadAnkiModels() {
      await this.loadAnkiList('modelNames', this.ankiModels);
    },

    async loadAnkiList(type, list) {
      try {
        list.loading = true;
        this.showMessage(null, null); // Clear message using the prop
        list.items = await ankiTool.connect(type);
      } catch (error) {
        this._show_instructions();        
      } finally {
        list.loading = false;
      }
    },

    async exportToAnki() {
      const loaded = this.ankiLoading.version || this.ankiDecks.items.length > 0 || this.ankiModels.items.length > 0;
      if (!loaded || !this.db_words.length || !util.options.ankiDeck || !util.options.ankiModel) {
        // Use the passed-in showMessage prop
        this.showMessage(util.getText('anki_noCardsExported'), 'warning');
        return;
      }

      try {
        this.ankiLoading.export = true;
        // Use the passed-in showMessage prop
        this.showMessage(util.getText('Exporting to Anki...'), 'info');

        const wordsToExport = this.optionsData.exportWithContextOnly
          ? this.db_words.filter(word => word.context && word.context.trim() !== '')
          : this.db_words;

        if (wordsToExport.length === 0) {
          this.showMessage(util.getText('anki_noMatchingWords'), 'warning');
          this.ankiLoading.export = false; // Ensure loading state is reset
          return;
        }

        const results = await ankiTool.export(wordsToExport);

        if(results.duplicates > 0 && results.failed === 0){
          // Use the passed-in showMessage prop
          this.showMessage(util.getText('anki_exportSuccessDuplicates', [results.success, results.duplicates]), 'warning');
        } else if (results.success > 0) {
          // Use the passed-in showMessage prop
          this.showMessage(results.failed > 0 ?
            util.getText('anki_exportSuccessFailed', [results.success, results.failed]) :
            util.getText('Successfully exported {0} cards to Anki', [results.success]), 'success');
        } else if (results.failed > 0) {
          // Use the passed-in showMessage prop
          this.showMessage(util.getText('anki_exportFailed', [results.failed]), 'error');
        }
      } catch (error) {
        console.error('Error exporting to Anki:', error);
        // Use the passed-in showMessage prop
        this.showMessage(util.getText('Failed to export to Anki: {0}', [error.message]), 'error');
      } finally {
        this.ankiLoading.export = false;
      }
    },

    // setAnkiStatus method removed as it's replaced by the showMessage prop
  }
}
</script>

<style>
.error-link {
  color: white;
  text-decoration: underline;
}
</style>
