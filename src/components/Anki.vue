<template>
  <div>

    <div class="d-flex justify-end px-2" style="margin-bottom: 0.5rem;">
      <ActionButton icon="mdi-upload"
        :tooltipText="util.getText('Anki')"
        color="success"
        :disabled="!canExport || exportingToAnki"
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
                      v-model="optionsData.includeScheduleInformation"
                      :disabled="exportingToAnki || exportMode.key !== 'direct'"
                      :label="util.getText('includeScheduleInformation')"
                      @update:model-value="saveOptions"
                      density="compact"
                      hide-details
                    ></v-checkbox>
                  </div>
                </template>
                <span>{{ util.getText('anki_scheduleInfoTooltip') }}</span>
              </v-tooltip>

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
        <v-card-text>
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
import { normalizeLanguageCode } from '../lib/i18n/translation.js';

const EXPORT_MODES = {
  direct: { key: 'direct', label: 'Direct', suffix: '', idOffset: 0, fields: ['Sound', 'ContextSound'], required: [0] },
  reverse: { key: 'reverse', label: 'Reverse', suffix: ' - Reverse', idOffset: 10000000, fields: ['CombinedSound'], required: [0, 6] },
  listening: { key: 'listening', label: 'Listening', suffix: ' - Listening', idOffset: 20000000, fields: ['CombinedSound'], required: [0, 7] },
};

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
  },
  
  data() {
    return {
      exportingToAnki: false,
      importGuide: { show: false, fileName: '', includeSchedule: false },
    };
  },
  
  computed: {
    canExport() {
      return Array.isArray(this.getValidWordsForExport());
    },
    exportModes() {
      return Object.values(EXPORT_MODES);
    },
    exportMode() {
      return EXPORT_MODES[this.optionsData.ankiExportMode] || EXPORT_MODES.direct;
    },
    importSettings() {
      return [
        { name: util.getText('Import any learning progress'), value: this.importGuide.includeSchedule
          ? util.getText('anki_importProgressInitial') : util.getText('Off') },
        { name: util.getText('Import any deck presets'), value: util.getText('Off') },
        { name: util.getText('Merge note types'), value: util.getText('On') },
        { name: util.getText('Update notes'), value: util.getText('Always') },
        { name: util.getText('Update note types'), value: util.getText('Always') },
      ];
    },

    deckName() {
      const course = util.getCurrentCourse();
      return `duo2anki${course ? `- ${course}` : ''}${this.exportMode.suffix}`;
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
    get_id_from_name(name) {
      const mode = Object.values(EXPORT_MODES).find(mode => mode.suffix && name.endsWith(mode.suffix)) || EXPORT_MODES.direct;
      const baseName = mode.suffix ? name.slice(0, -mode.suffix.length) : name;
      const hash = Array.from(baseName).reduce((acc, char) => acc + char.charCodeAt(0), 0);
      const namespaceOffset = Object.values(util.readerCourses)
        .find(reader => baseName === `!duo2anki- ${reader.name}`)?.ankiIdOffset || 0;
      return mode.idOffset + namespaceOffset + (hash % 1000000000);
    },

    getTtsLanguage(targetLang) {
      if (!targetLang?.trim()) return '';
      try {
        const code = normalizeLanguageCode(targetLang);
        const locale = new Intl.Locale(code).maximize();
        return [locale.language, locale.region].filter(Boolean).join('_');
      } catch {
        return '';
      }
    },

    getValidWordsForExport() {
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

      if (this.exportMode.key === 'reverse') {
        words = words.filter(word => util.getTranslationAlternatives(word.back).length > 0);
      } else if (this.exportMode.key === 'listening') {
        const courseLanguage = util.get_course_info(this.optionsData.current_course_id).targetLang;
        words = this.getTtsLanguage(courseLanguage)
          ? words.filter(word => util.get_sound_text(word, util.SOUND_MODE.FRONT_WORD_WITH_CONTEXT)) : [];
      }

      if (words.length === 0) {
        return util.getText('anki_noMatchingWords');
      }
      return words;
    },

    async triggerExport() { // Changed to async as it calls async operations like ankiPackage.writeToFile
      if (this.exportingToAnki) return;
      const wordsToExport = this.getValidWordsForExport();
      if (typeof wordsToExport === 'string') {
        this.showMessage(wordsToExport, 'warning');
        return;
      }
      if (wordsToExport.some(word => util.isImageTooLarge(word.image))) {
        this.showMessage(util.getText('image_base64TooLarge', [util.maxBase64ImageLength / 1024]), 'error');
        return;
      }
      
      if (!window.SQL) {
        this.showMessage('SQL.js not initialized. Please ensure it is loaded.', 'error');
        return;
      }
      this.exportingToAnki = true;

      const deckName = this.deckName;
      const nodeType = this.nodeType;
      const options = { ...this.optionsData };
      const exportMode = this.exportMode;
      const reader = util.getReaderCourseInfo(options.current_course_id);
      const modelId = reader ? getReaderAnkiId(options.current_course_id, exportMode.key, 'model')
        : this.get_id_from_name(nodeType);
      let db;
      try {
        // The course defines the shared template voice; words do not override it.
        const courseLanguage = util.get_course_info(options.current_course_id).targetLang;
        const language = this.getTtsLanguage(courseLanguage);
        const questionContent = '<div>{{Front}}</div>{{#Transcription}}<div class="transcription">{{Transcription}}</div>{{/Transcription}}';
        const hintContent = '{{#Hint}}<div class="hint">{{Hint}}</div>{{/Hint}}';
        const answerContent = (contextAudio = '', hint = '') => `${questionContent}${hint}<hr id=answer><div>{{Back}}</div>{{#Image}}<div><img src="{{Image}}"></div>{{/Image}}${contextAudio}<div class="context">{{Context}}</div>`;
        const speed = options.ttsSpeed ?? 1;
        const audio = field => language ? `{{#${field}}}[anki:tts lang=${language} speed=${speed}]{{${field}}}[/anki:tts]{{/${field}}}` : '';
        const templates = {
          direct: { name: util.getText('mainTemplate'), qfmt: `${questionContent}${hintContent}${audio('Sound')}`,
            afmt: answerContent(audio('ContextSound'), hintContent) },
          reverse: { name: util.getText('Reverse'), qfmt: `{{#ReversePrompt}}<div>{{ReversePrompt}}</div>{{/ReversePrompt}}${hintContent}`,
            afmt: answerContent(audio('CombinedSound'), hintContent) },
          listening: { name: util.getText('Listening'), qfmt: `${audio('CombinedSound')}${hintContent}`,
            // FrontSide retains the question replay button without queuing answer audio.
            afmt: `{{FrontSide}}${answerContent()}` },
        };
        const ankiModel = new Model({
          id: modelId,
          name: nodeType,
          flds: [
            { name: 'Front' },
            { name: 'Back' },
            { name: 'Sound' },
            { name: 'Image' },
            { name: 'Context' },
            { name: 'Transcription' },
          ].concat(exportMode.key === 'direct' ? [{ name: 'ContextSound' }]
            : [{ name: 'ReversePrompt' }, { name: 'CombinedSound' }], [{ name: 'Hint' }]),
          req: [[0, 'all', exportMode.required]],
          tmpls: [templates[exportMode.key]],
          css: `.card { font-family: arial; font-size: 1.5rem; text-align: center; color: black; background-color: white; }
            .hint { font-size: 1rem; opacity: 0.7; margin: 0.5rem 0; overflow-wrap: anywhere; }`,
        });

        const deckId = reader ? getReaderAnkiId(options.current_course_id, exportMode.key, 'deck') : modelId + 1;
        const ankiDeck = new Deck(deckId, deckName);
        const ankiPackage = new AnkiPackage();
        ankiPackage.addDeck(ankiDeck);

        db = new window.SQL.Database();
        ankiPackage.setSqlJs(db);

        const audioModes = {
          Sound: { mode: util.SOUND_MODE.FRONT_WORD },
          ContextSound: { mode: util.SOUND_MODE.CONTEXT_ONLY },
          CombinedSound: { mode: util.SOUND_MODE.FRONT_WORD_WITH_CONTEXT },
        };

        for (const item of wordsToExport) { // Use for...of for async iteration
          // Games supply the original progress; Reverse and Listening start as new cards.
          const scheduleInfo = exportMode.key === 'direct' && options.includeScheduleInformation && item.next_review ? {
              next_review: item.next_review,
              status: item.status,
              interval: item.interval,
              ease_factor: item.ease_factor,
          } : null;

          const sounds = {};
          for (const field of exportMode.fields) {
            sounds[field] = (util.get_sound_text(item, audioModes[field].mode) || '')
              .replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;');
          }
          const reversePrompt = util.getTranslationAlternatives(item.back).slice(0, 2).join('; ')
            .replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;');

          const fields = [
            item.front,
            item.back || '',
            sounds.Sound || '',
            item.image || '',
            item.context || '',
            item.transcription || '',
          ];
          if (exportMode.key === 'direct') fields.push(sounds.ContextSound || '');
          else fields.push(reversePrompt, sounds.CombinedSound || '');
          fields.push(item.hint || '');
          // Editable translations, hints and examples do not change the note's identity.
          const note = new Note(ankiModel, fields, scheduleInfo, null,
            getStableNoteGuid(item.course_id || options.current_course_id, item.front, exportMode.key));
          ankiDeck.addNote(note);
        }

        // Now that all notes and media are added, write the file
        const fileName = `${deckName}-${ wordsToExport.length } words-${ new Date().toISOString().split('T')[0] }.apkg`;
        await ankiPackage.writeToFile(fileName);
        this.showMessage(fileName, 'success');
        this.importGuide = { show: true, fileName,
          includeSchedule: exportMode.key === 'direct' && options.includeScheduleInformation };
      } catch (error) {
        console.error('Error exporting to Anki:', error);
        this.showMessage(util.getText('errorExportingToAnki'), 'error');
      } finally {
        db?.close();
        this.exportingToAnki = false;
      }
    }
}
}
</script>

<style>
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
