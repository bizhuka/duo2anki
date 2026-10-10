<template>
  <div>

    <div class="anki-export-actions d-flex align-center justify-end px-2" style="margin-bottom: 0.5rem;">
      <ActionButton icon="mdi-upload"
        :label="util.getText('Export')"
        :tooltipText="util.getText('anki_exportTooltip', [util.getText(exportMode.label)])"
        color="success"
        :disabled="!canExport || exportingToAnki"
        :loading="exportingToAnki && !exportingAll"
        @click="triggerExport"/>
      <ActionButton icon="mdi-upload-multiple"
        :label="util.getText('Export all')"
        :tooltipText="util.getText('anki_exportAllTooltip')"
        color="success"
        :disabled="!canExportAll || exportingToAnki"
        :loading="exportingToAnki && exportingAll"
        @click="triggerExportAll" />
      <ActionButton icon-only icon="mdi-cog-outline" :tooltipText="util.getText('Templates')" color="success"
        :disabled="exportingToAnki" @click="$refs.templateEditor.open(exportMode.key)" />
    </div>

    <AnkiTemplateEditor ref="templateEditor" :optionsData="optionsData" :saveOptions="saveOptions"
      :showMessage="showMessage" :word="previewWord" />

    <v-card>
      <v-card-title>
        <span class="headline">{{ exportDialogTitle }}</span>
      </v-card-title>
      <v-card-text>
        <v-container>
          <v-row>
            <v-col cols="12">
              <v-btn-toggle v-model="optionsData.ankiExportMode" mandatory divided variant="outlined"
                color="primary" class="anki-export-modes" :disabled="exportingToAnki"
                @update:model-value="saveOptions">
                <v-btn v-for="mode in exportModes" :key="mode.key" :value="mode.key">
                  {{ util.getText(mode.label) }}
                </v-btn>
              </v-btn-toggle>
            </v-col>
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
                  <div v-bind="props" tabindex="0">
                    <v-checkbox
                      :model-value="true"
                      disabled
                      :label="util.getText('Export with translations only')"
                      density="compact"
                      hide-details
                    ></v-checkbox>
                  </div>
                </template>
                <span>{{ util.getText('anki_translationRequired') }}</span>
              </v-tooltip>

              <v-tooltip location="top">
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
                <span v-html="util.getText('anki_exportContextTooltip', [util.getText('context_generateTitle')])"></span>
              </v-tooltip>
              <v-checkbox
                v-model="optionsData.exportWithImagesOnly"
                :label="util.getText('Export with images only')"
                @update:model-value="saveOptions"
                density="compact"
                hide-details
              ></v-checkbox>
            </v-col>
          </v-row>
        </v-container>
      </v-card-text>
    </v-card>

    <v-dialog v-model="importGuide.show" max-width="640" scrollable>
      <v-card>
        <v-card-title>{{ util.getText('Import into Anki') }}</v-card-title>
        <v-tabs v-if="importGuide.warnings.length" v-model="importGuide.tab" color="primary">
          <v-tab value="import">{{ util.getText('Import into Anki') }}</v-tab>
          <v-tab value="warnings">{{ util.getText('Warnings') }} ({{ importGuide.warnings.length }})</v-tab>
        </v-tabs>
        <v-card-text>
          <v-window v-model="importGuide.tab">
            <v-window-item value="import">
              <p class="mb-3">{{ util.getText('anki_importFile', [importGuide.fileName]) }}</p>
              <v-table density="compact" class="anki-import-settings">
                <thead>
                  <tr>
                    <th>{{ util.getText('Import option') }}</th>
                    <th>{{ util.getText('Recommended setting') }}</th>
                  </tr>
                </thead>
                <tbody>
                  <tr v-for="setting in importSettings" :key="setting.name">
                    <td>{{ setting.name }}</td>
                    <td>{{ setting.value }}</td>
                  </tr>
                </tbody>
              </v-table>
              <p class="mt-3">{{ util.getText('anki_importUpdates') }}</p>
              <p class="mt-3">{{ util.getText('anki_cardRequirements') }}</p>
              <p class="mt-3">{{ util.getText('anki_importAudio') }}</p>
              <v-alert type="warning" variant="tonal" density="compact" class="mt-3">
                {{ util.getText('anki_importMigration') }}
              </v-alert>
            </v-window-item>
            <v-window-item v-if="importGuide.warnings.length" value="warnings">
              <v-alert type="warning" variant="tonal" density="compact">
                {{ util.getImageTooLargeMessage('anki_imageSizeWarning') }}
              </v-alert>
              <v-table density="compact" class="anki-import-settings mt-3">
                <thead>
                  <tr>
                    <th>{{ util.getText('Words') }}</th>
                    <th>{{ util.getText('Image size') }}</th>
                  </tr>
                </thead>
                <tbody>
                  <tr v-for="(warning, index) in importGuide.warnings" :key="index">
                    <td>{{ warning.word }}</td>
                    <td>{{ (warning.size / 1000).toFixed(2) }} kB</td>
                  </tr>
                </tbody>
              </v-table>
            </v-window-item>
          </v-window>
        </v-card-text>
        <v-card-actions>
          <v-spacer />
          <v-btn @click="importGuide.show = false">{{ util.getText('Ok') }}</v-btn>
        </v-card-actions>
      </v-card>
    </v-dialog>
  </div>
</template>

<script setup>
    import { util } from '../lib/util.js';;
    import ActionButton from './small/ActionButton.vue';
</script>

<script>
import { Model, Deck, Note, Package as AnkiPackage, getStableNoteGuid, getReaderAnkiId } from '../lib/genanki.js';
import { EXPORT_MODES, getTtsLanguage, getAnkiFieldNames, getAnkiNoteFields, getAnkiTemplate } from '../lib/ankiTemplates.js';
import AnkiTemplateEditor from './AnkiTemplateEditor.vue';

export default {
  components: { 
    ActionButton,
    AnkiTemplateEditor,
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
  },
  
  data() {
    return {
      exportingToAnki: false,
      exportingAll: false,
      importGuide: { show: false, fileName: '', tab: 'import', warnings: [] },
    };
  },
  
  computed: {
    previewWord() {
      return this.db_words.find(word => word.course_id === this.optionsData.current_course_id) || null;
    },
    canExport() {
      return Array.isArray(this.getValidWordsForExport());
    },
    canExportAll() {
      return this.exportModes.some(mode => Array.isArray(this.getValidWordsForExport(mode)));
    },
    exportModes() {
      return Object.values(EXPORT_MODES);
    },
    exportMode() {
      return EXPORT_MODES[this.optionsData.ankiExportMode] || EXPORT_MODES.direct;
    },
    importSettings() {
      return [
        { name: util.getText('Import any deck presets'), value: util.getText('Off') },
        { name: util.getText('Merge note types'), value: util.getText('On') },
        { name: util.getText('Update notes'), value: util.getText('Always') },
        { name: util.getText('Update note types'), value: util.getText('Always') },
      ];
    },

    baseDeckName() {
      const course = util.getCurrentCourse();
      return `duo2anki${course ? `- ${course}` : ''}`;
    },
    deckName() {
      return `${this.baseDeckName}${this.exportMode.suffix}`;
    },
    nodeType() {
      return `!${this.deckName}`;
    },
    exportDialogTitle() {
      const wordsToExport = this.getValidWordsForExport();
      return `${ typeof wordsToExport === 'string' ? wordsToExport : `${ util.getText('Words') } - ${wordsToExport.length}`}`;
    }
  },
  
  methods: {
    getImageWarnings() {
      return this.db_words
        .filter(word => word.course_id === this.optionsData.current_course_id && util.isImageTooLarge(word.image))
        .map(word => ({ word: word.front, size: util.getBase64ImageSize(word.image) }))
        .sort((a, b) => b.size - a.size);
    },

    get_id_from_name(name) {
      const mode = Object.values(EXPORT_MODES).find(mode => mode.suffix && name.endsWith(mode.suffix)) || EXPORT_MODES.direct;
      const baseName = mode.suffix ? name.slice(0, -mode.suffix.length) : name;
      const hash = Array.from(baseName).reduce((acc, char) => acc + char.charCodeAt(0), 0);
      const namespaceOffset = Object.values(util.readerCourses)
        .find(reader => baseName === `!duo2anki- ${reader.name}`)?.ankiIdOffset || 0;
      return mode.idOffset + namespaceOffset + (hash % 1000000000);
    },

    getTtsLanguage,

    getValidWordsForExport(exportMode = this.exportMode) {
      if (!this.db_words || this.db_words.length === 0) {
        return util.getText('No words to process or request count is 0.');
      }

      let words = this.db_words.filter(word => !word.archived &&
        word.course_id === this.optionsData.current_course_id && word.front?.trim());

      if (this.optionsData.exportWithImagesOnly) {
        words = words.filter(word => word.image && word.image.trim() !== '');
      }
      words = words.filter(word => word.hasTranslation === true && util.hasText(word.back));
      if (this.optionsData.exportWithContextOnly) {
        words = words.filter(word => word.context && word.context.trim() !== '');
      }

      if (exportMode.key === 'reverse') {
        words = words.filter(word => util.getTranslationAlternatives(word.back).length > 0);
      } else if (exportMode.key === 'listening') {
        const courseLanguage = util.get_course_info(this.optionsData.current_course_id).targetLang;
        words = this.getTtsLanguage(courseLanguage)
          ? words.filter(word => util.get_sound_text(word, util.SOUND_MODE.FRONT_WORD_WITH_CONTEXT)) : [];
      }

      if (words.length === 0) {
        return util.getText('anki_noMatchingWords');
      }
      return words;
    },

    async triggerExport() {
      return this.exportToAnki([this.exportMode]);
    },

    async triggerExportAll() {
      return this.exportToAnki(this.exportModes);
    },

    async exportToAnki(exportModes) {
      if (this.exportingToAnki) return;
      const plans = exportModes.map(exportMode => ({ exportMode, words: this.getValidWordsForExport(exportMode) }));
      const validPlans = plans.filter(plan => Array.isArray(plan.words));
      if (!validPlans.length) {
        this.showMessage(plans[0].words, 'warning');
        return;
      }
      
      if (!window.SQL) {
        this.showMessage('SQL.js not initialized. Please ensure it is loaded.', 'error');
        return;
      }
      this.exportingToAnki = true;
      this.exportingAll = exportModes.length > 1;

      const baseDeckName = this.baseDeckName;
      const options = { ...this.optionsData };
      const reader = util.getReaderCourseInfo(options.current_course_id);
      let db;
      try {
        const ankiPackage = new AnkiPackage();
        db = new window.SQL.Database();
        ankiPackage.setSqlJs(db);

        for (const { exportMode, words } of validPlans) {
          const deckName = `${baseDeckName}${exportMode.suffix}`;
          const nodeType = `!${deckName}`;
          const modelId = reader ? getReaderAnkiId(options.current_course_id, exportMode.key, 'model')
            : this.get_id_from_name(nodeType);
          const template = getAnkiTemplate(exportMode.key, options);
          const ankiModel = new Model({
            id: modelId,
            name: nodeType,
            flds: getAnkiFieldNames(exportMode.key).map(name => ({ name })),
            req: [[0, 'all', exportMode.required]],
            tmpls: [{ name: template.name, qfmt: template.qfmt, afmt: template.afmt }],
            css: template.css,
          });
          const deckId = reader ? getReaderAnkiId(options.current_course_id, exportMode.key, 'deck') : modelId + 1;
          const ankiDeck = new Deck(deckId, deckName);
          ankiPackage.addDeck(ankiDeck);
          for (const item of words) {
            const fields = getAnkiNoteFields(item, exportMode.key);
            // Editable translations, hints and examples do not change the note's identity.
            const note = new Note(ankiModel, fields, null,
              getStableNoteGuid(item.course_id || options.current_course_id, item.front, exportMode.key));
            ankiDeck.addNote(note);
          }
        }

        const wordCount = new Set(validPlans.flatMap(plan => plan.words)).size;
        const fileDeckName = `${baseDeckName}${this.exportingAll ? ' - All' : validPlans[0].exportMode.suffix}`;
        const fileName = `${fileDeckName}-${wordCount} words-${new Date().toISOString().split('T')[0]}.apkg`;
        await ankiPackage.writeToFile(fileName);
        this.showMessage(fileName, 'success');
        this.importGuide = { show: true, fileName, tab: 'import',
          warnings: this.getImageWarnings() };
      } catch (error) {
        console.error('Error exporting to Anki:', error);
        this.showMessage(util.getText('errorExportingToAnki'), 'error');
      } finally {
        db?.close();
        this.exportingToAnki = false;
        this.exportingAll = false;
      }
    }
}
}
</script>

<style>
.anki-export-actions .v-btn {
  height: calc(var(--v-btn-height) - 8px);
  border-radius: 4px;
}

.anki-export-modes {
  display: flex;
  width: 100%;
}

.anki-export-modes .v-btn {
  flex: 1 1 auto;
  min-width: 0;
  padding: 0 4px;
}

.anki-import-settings table {
  table-layout: fixed;
}

.anki-import-settings th,
.anki-import-settings td {
  padding: 8px !important;
  white-space: normal;
  overflow-wrap: anywhere;
  font-size: 0.875rem;
}
</style>
