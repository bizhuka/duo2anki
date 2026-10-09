<template>
  <v-dialog v-model="show" max-width="1120" scrollable :persistent="saving">
    <v-card class="anki-template-editor">
      <v-card-title class="d-flex align-center justify-space-between font-weight-bold">
        {{ util.getText('Anki Templates') }}
        <ActionButton icon-only icon="mdi-refresh" color="primary" variant="tonal" :tooltipText="resetTooltip"
          :disabled="saving" @click="resetDefault" />
      </v-card-title>
      <v-card-text class="anki-template-content">
        <v-btn-toggle v-model="mode" mandatory divided variant="outlined" color="primary"
          class="template-mode-toggle mb-3" :disabled="saving">
          <v-btn v-for="item in modes" :key="item.key" :value="item.key">{{ util.getText(item.label) }}</v-btn>
        </v-btn-toggle>
        <div v-if="draft" class="template-columns">
          <div class="template-code-column">
            <div class="template-panel-header">
              <h3 class="template-panel-title">{{ util.getText('Template') }}</h3>
              <v-btn-toggle v-model="section" mandatory divided variant="outlined" density="compact" color="primary">
                <v-btn value="qfmt" size="small">{{ util.getText('Front') }}</v-btn>
                <v-btn value="afmt" size="small">{{ util.getText('Back') }}</v-btn>
                <v-btn value="css" size="small">CSS</v-btn>
              </v-btn-toggle>
            </div>
            <v-textarea :key="section" v-model="draft[section]" :aria-label="sectionLabel"
              variant="outlined" density="compact" hide-details no-resize rows="16"
              spellcheck="false" autocomplete="off" autocapitalize="off"
              class="template-code" :disabled="saving" @keydown.tab.prevent="indentCode" />
          </div>
          <div class="template-preview-column">
            <div class="template-panel-header">
              <h3 class="template-panel-title">{{ util.getText('Preview') }}</h3>
              <v-btn-toggle v-model="side" mandatory divided variant="outlined" density="compact" color="primary">
                <v-btn value="front" size="small">{{ util.getText('Front') }}</v-btn>
                <v-btn value="back" size="small">{{ util.getText('Back') }}</v-btn>
              </v-btn-toggle>
            </div>
            <iframe v-if="word && !templateError" :srcdoc="previewDocument" sandbox="allow-same-origin"
              :title="util.getText('Preview')" class="template-preview" @load="bindPreviewAudio" />
            <div v-else class="template-preview template-preview-empty text-medium-emphasis"
              :class="{ 'text-error': templateError }" :role="templateError ? 'alert' : 'status'">
              {{ templateError || util.getText('anki_templateNoWord') }}
            </div>
          </div>
        </div>
        <p class="text-caption text-medium-emphasis mt-3 mb-0">{{ util.getText('anki_templateCompatibility') }}</p>
      </v-card-text>
      <v-card-actions>
        <v-spacer />
        <v-btn :disabled="saving" @click="show = false">{{ util.getText('Cancel') }}</v-btn>
        <v-btn color="primary" :loading="saving" :disabled="!!templateError" @click="save">{{ util.getText('Save') }}</v-btn>
      </v-card-actions>
    </v-card>
  </v-dialog>
</template>

<script>
import { util } from '../lib/util.js';
import { EXPORT_MODES, getAnkiFieldNames, getAnkiNoteFields, getAnkiTemplate,
  getDefaultAnkiTemplate, getAnkiTtsSettings } from '../lib/ankiTemplates.js';
import { formatAnkiCode, validateAnkiTemplate, getAnkiPreviewDocument } from '../lib/ankiTemplatePreview.js';
import ActionButton from './small/ActionButton.vue';

const SECTIONS = ['qfmt', 'afmt', 'css'];

export default {
  components: { ActionButton },
  props: {
    optionsData: { type: Object, required: true },
    saveOptions: { type: Function, required: true },
    showMessage: { type: Function, required: true },
    word: { type: Object, default: null },
  },
  data() {
    return { util, show: false, saving: false, mode: 'direct', section: 'qfmt', side: 'front',
      drafts: {}, initialDrafts: {}, initialTemplates: {} };
  },
  computed: {
    modes() { return Object.values(EXPORT_MODES); },
    draft() { return this.drafts[this.mode]; },
    resetTooltip() { return util.getText('anki_resetTemplate', [util.getText(EXPORT_MODES[this.mode].label)]); },
    sectionLabel() { return this.section === 'css' ? 'CSS' : util.getText(this.section === 'qfmt' ? 'Front' : 'Back'); },
    templateError() {
      for (const [mode, draft] of Object.entries(this.drafts)) {
        try { validateAnkiTemplate(draft, getAnkiFieldNames(mode)); }
        catch (error) { return `${util.getText(EXPORT_MODES[mode].label)}: ${error.message}`; }
      }
      return '';
    },
    previewDocument() {
      if (!this.word || !this.draft || this.templateError) return '';
      const fieldNames = getAnkiFieldNames(this.mode);
      const fieldValues = getAnkiNoteFields(this.word, this.mode);
      const deck = `duo2anki${util.getCurrentCourse() ? `- ${util.getCurrentCourse()}` : ''}${EXPORT_MODES[this.mode].suffix}`;
      const fields = Object.fromEntries(fieldNames.map((name, index) => [name, fieldValues[index]]));
      return getAnkiPreviewDocument(this.getDraftTemplate(this.mode), { ...fields, Deck: deck, Subdeck: deck.split('::').at(-1),
        Type: `!${deck}`, Card: getDefaultAnkiTemplate(this.mode, this.optionsData).name, Tags: '', CardFlag: '' }, this.side);
    },
  },
  watch: {
    section(section) {
      if (section !== 'css') this.side = section === 'qfmt' ? 'front' : 'back';
    },
    side(side) {
      if (this.section !== 'css') this.section = side === 'front' ? 'qfmt' : 'afmt';
    },
  },
  methods: {
    bindPreviewAudio(event) {
      // The iframe cannot run scripts. Handle its replay clicks here through
      // the same player used by words and Games, with the rendered Anki text.
      const frameDocument = event.target.contentDocument;
      if (!frameDocument) return;
      // Rebinding on load must not attach a second handler and play twice.
      frameDocument.onclick = event => {
        const button = event.target.closest?.('[data-anki-audio]');
        if (!button) return;
        event.preventDefault();
        const { speed, ...item } = JSON.parse(decodeURIComponent(button.dataset.ankiAudio));
        util.playSound(item, util.SOUND_MODE.FRONT_WORD, { speed });
      };
    },
    formatTemplate(template) {
      return Object.fromEntries(SECTIONS.map(section => [section, formatAnkiCode(template[section], section)]));
    },
    getDraftTemplate(mode) {
      // Formatting is for readability. Preserve original whitespace in sections
      // that the user has not edited, including when only CSS was changed.
      return Object.fromEntries(SECTIONS.map(section => [section,
        this.drafts[mode][section] === this.initialDrafts[mode][section]
          ? this.initialTemplates[mode][section] : this.drafts[mode][section]]));
    },
    open(mode) {
      this.mode = mode;
      this.section = 'qfmt';
      this.side = 'front';
      this.initialTemplates = Object.fromEntries(this.modes.map(item => [item.key, getAnkiTemplate(item.key, this.optionsData)]));
      this.drafts = Object.fromEntries(this.modes.map(item => [item.key, this.formatTemplate(this.initialTemplates[item.key])]));
      this.initialDrafts = JSON.parse(JSON.stringify(this.drafts));
      this.show = true;
    },
    resetDefault() {
      const defaults = getDefaultAnkiTemplate(this.mode, this.optionsData);
      this.initialTemplates[this.mode] = defaults;
      this.drafts[this.mode] = this.formatTemplate(defaults);
      this.initialDrafts[this.mode] = { ...this.drafts[this.mode] };
    },
    async indentCode(event) {
      const input = event.target;
      const start = input.selectionStart;
      const end = input.selectionEnd;
      const source = this.draft[this.section];
      const remove = event.shiftKey && source.slice(Math.max(0, start - 2), start) === '  ';
      if (event.shiftKey && !remove) return;
      this.draft[this.section] = remove ? source.slice(0, start - 2) + source.slice(end)
        : source.slice(0, start) + '  ' + source.slice(end);
      await this.$nextTick();
      input.setSelectionRange(start + (remove ? -2 : 2), start + (remove ? -2 : 2));
    },
    async save() {
      if (this.saving || this.templateError) return;
      const previous = this.optionsData.ankiTemplates;
      const templates = { ...previous };
      for (const [mode, draft] of Object.entries(this.drafts)) {
        const defaults = this.formatTemplate(getDefaultAnkiTemplate(mode, this.optionsData));
        if (SECTIONS.every(section => draft[section] === defaults[section])) delete templates[mode];
        else if (SECTIONS.some(section => draft[section] !== this.initialDrafts[mode][section])) {
          templates[mode] = { ...this.getDraftTemplate(mode), fieldNames: getAnkiFieldNames(mode), tts: getAnkiTtsSettings(this.optionsData) };
        }
      }
      this.saving = true;
      try {
        this.optionsData.ankiTemplates = templates;
        await this.saveOptions();
        this.show = false;
      } catch (error) {
        this.optionsData.ankiTemplates = previous;
        this.showMessage(util.getText('anki_templateSaveError'), 'error');
      } finally {
        this.saving = false;
      }
    },
  },
};
</script>

<style scoped>
.anki-template-content {
  overflow-y: auto !important;
}

.template-mode-toggle {
  display: flex;
  width: 100%;
}

.template-mode-toggle .v-btn {
  flex: 1;
  min-width: 0;
}

.template-columns {
  display: grid;
  grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
  gap: 16px;
}

.template-panel-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  flex-wrap: wrap;
  gap: 8px;
  margin-bottom: 8px;
}

.template-panel-title {
  font-size: 1.25rem;
  font-weight: 700;
}

.template-code :deep(textarea) {
  font-family: Consolas, monospace;
  font-size: 0.875rem;
  line-height: 1.5;
  white-space: pre;
  overflow: auto;
}

.template-preview-column {
  display: flex;
  flex-direction: column;
  min-width: 0;
}

.template-preview {
  flex: 1;
  width: 100%;
  min-height: 320px;
  border: 1px solid rgba(var(--v-theme-on-surface), 0.25);
  border-radius: 4px;
  background: white;
}

.template-preview-empty {
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 16px;
}

@media (max-width: 650px) {
  .template-columns {
    grid-template-columns: minmax(0, 1fr);
  }
}
</style>
