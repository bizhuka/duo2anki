<template>
  <div :data-lang="optionsData.pluginLanguage">

    <div class="d-flex justify-end px-2" style="margin-bottom: 0.5rem;">
      <ActionButton icon="mdi-upload"
        :tooltipText="util.getText('Anki')"
        color="success"
        :disabled="!db_words.length || exportingToAnki"
        :loading="exportingToAnki"
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
              <v-tooltip location="top" v-if="appName === 'duo2anki'">
                <template v-slot:activator="{ props }">
                  <v-checkbox
                    v-bind="props"
                    v-model="optionsData.exportWithContextOnly"
                    :label="util.getText('Export only words with context')"
                    @update:model-value="saveOptions"
                    density="compact"
                    hide-details
                  ></v-checkbox>
                </template>
                <span v-html="util.getText('anki_exportContextTooltip')"></span>
              </v-tooltip>

              <v-checkbox
                v-if="appName === 'duo2anki'"
                v-model="optionsData.includeScheduleInformation"
                :label="util.getText('includeScheduleInformation')"
                @update:model-value="saveOptions"
                density="compact"
                hide-details
              ></v-checkbox>

              <template v-if="appName === 'kindle2anki'">
                <v-checkbox
                  v-model="optionsData.exportWithTranslationsOnly"
                  label="Export with translations only"
                  @update:model-value="saveOptions"
                  density="compact"
                  hide-details
                ></v-checkbox>
                <v-checkbox
                  v-model="optionsData.exportWithImagesOnly"
                  label="Export with images only"
                  @update:model-value="saveOptions"
                  density="compact"
                  hide-details
                ></v-checkbox>
              </template>

              <v-checkbox
                v-model="optionsData.collection_media"
                :label="util.getText('exportAudioToCollectionMedia')"
                @update:model-value="saveOptions"
                density="compact"
                hide-details
              ></v-checkbox>
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
import { Model, Deck, Note, Package as AnkiPackage } from '../lib/genanki.js';
// import JSZip from "jszip";
// import { saveAs } from "file-saver";

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
    },
    appName: {
      type: String,
      default: ''
    }
  },
  
  data() {
    return {
      deckName: '',
      nodeType: '',
      exportingToAnki: false,
    };
  },
  
  mounted() {
    this.initializeComponent();
  },

  computed: {
    exportDialogTitle() {
      const wordsToExport = this.getValidWordsForExport();
      return `${ typeof wordsToExport === 'string' ? wordsToExport : `${ util.getText('Words') } - ${wordsToExport.length}`}`;
    }
  },
  
  methods: {
    _show_error(message){
      this.showMessage(message, 'error');
    },

    async initializeComponent() {
      const course = util.getCurrentCourse();
      const courseText =  course ? `- ${course}`: '';
      this.deckName = `${this.appName}${ courseText }`;
      this.nodeType = `!${this.appName}${ courseText }`;
    },

    get_id_from_name(name) {
      const hash = Array.from(name).reduce((acc, char) => acc + char.charCodeAt(0), 0);
      return hash % 1000000000; // Ensure the ID is within a valid range
    },

    getValidWordsForExport() {
      if (!this.db_words || this.db_words.length === 0) {
        return util.getText('No words to process or request count is 0.');
      }

      let words = this.db_words.filter(word => !word.archived);

      if (this.appName === 'kindle2anki') {
        if (this.optionsData.exportWithImagesOnly) {
          words = words.filter(word => word.image && word.image.trim() !== '');
        }
        if (this.optionsData.exportWithTranslationsOnly) {
          words = words.filter(word => word.back && word.back.trim() !== '');
        }
      } else { // duo2anki
        if (this.optionsData.exportWithContextOnly) {
          words = words.filter(word => word.context && word.context.trim() !== '');
        }
      }

      if (words.length === 0) {
        return util.getText('anki_noMatchingWords');
      }
      return words;
    },

    async triggerExport() { // Changed to async as it calls async operations like ankiPackage.writeToFile
      const wordsToExport = this.getValidWordsForExport();
      if (typeof wordsToExport === 'string') {
        this.showMessage(wordsToExport, 'warning');
        return;
      }
      
      if (!SQL) {
        this.showMessage('SQL.js not initialized. Please ensure it is loaded.', 'error');
        return;
      }
      this.exportingToAnki = true;

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
              name: util.getText('mainTemplate'),
              qfmt: `<div>{{Front}}</div><div class="transcription">{{Transcription}}</div>`, //[sound:{{Sound}}]
              afmt: `<div>{{FrontSide}}</div><hr id=answer><div>{{Back}}</div><div><img src="{{Image}}"></div><div class="context">{{Context}}</div>`,
            },
          ],
          css: `.card { font-family: arial; font-size: 1.5rem; text-align: center; color: black; background-color: white; }`,
        });

        const ankiDeck = new Deck(modelId + 1, this.deckName);
        const ankiPackage = new AnkiPackage();
        ankiPackage.addDeck(ankiDeck);

        const db = new SQL.Database();
        ankiPackage.setSqlJs(db);

        for (const item of wordsToExport) { // Use for...of for async iteration
          const scheduleInfo = this.optionsData.includeScheduleInformation && item.next_review ? {
              next_review: item.next_review,
              status: item.status,
              interval: item.interval,
              ease_factor: item.ease_factor,
          } : null;

          const soundUrl = util.get_sound_url(item, util.SOUND_MODE.FRONT_WORD);
          let soundField = soundUrl; // Default to URL
          console.log('Sound URL:', soundUrl);

          if (soundUrl && this.optionsData.collection_media) {
            try {
              const filename = `${item.targetLang}_${item.id}_${ item.front.replace(/[^a-zA-Z0-9-_.]/g, '_') }.mp3`;
              this.showMessage(util.getText('exportingAudioForWord', [item.front]), 'warning');

              const response = await fetch(`${soundUrl}`); // &_=${new Date().getTime()}
              if (response.ok) {
                const blob = await response.blob();
                ankiPackage.addMediaFile(blob, filename); // Add to main media package

                soundField = filename;
              }
            } catch (error) {
              console.error(`Error fetching sound from ${soundUrl}:`, error);
            }
          }

          const note = new Note(ankiModel, [
            item.front,
            item.back,
            soundField,
            item.image,
            item.context,
            (item.transcription || '') + `[sound:${soundField}]`,
          ], scheduleInfo);
          ankiDeck.addNote(note);
        }

        // Now that all notes and media are added, write the file
        const course = util.getCurrentCourse();
        const courseText =  course ? `- ${course}`: '';
        const fileName = `${this.appName}${courseText}-${ wordsToExport.length } words-${ new Date().toISOString().split('T')[0] }.apkg`;
        ankiPackage.writeToFile(fileName);
        this.showMessage(fileName, 'success');
      } catch (error) {
        console.error('Error exporting to Anki:', error);
        this.showMessage(util.getText('errorExportingToAnki'), 'error');
      } finally {
        this.exportingToAnki = false;
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
