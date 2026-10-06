<template>
  <v-tooltip location="top" :text="util.getText('Generate new example')">
    <template #activator="{ props: tooltipProps }">
      <v-btn v-bind="tooltipProps" icon="mdi-refresh" variant="text" color="primary"
        size="small" :loading="loading" :disabled="loading || !word.front?.trim()"
        :aria-label="util.getText('Generate new example')" @click.stop="generate" />
    </template>
  </v-tooltip>

  <v-dialog v-model="review.show" max-width="35rem" scrollable>
    <v-card @keydown.left.stop @keydown.right.stop>
      <v-card-title>{{ util.getText('Replace and save this word') }}</v-card-title>
      <v-card-subtitle>{{ review.word?.front }}</v-card-subtitle>
      <v-card-text>
        <p class="mb-3">{{ util.getText('example_replaceNotice') }}</p>
        <v-checkbox v-model="review.replaceTranslation" :label="util.getText('Replace translation')"
          density="compact" hide-details />
        <v-textarea :model-value="util.unescape_html(util.delete_all_tags(review.back))"
          :label="util.getText('New translation')" readonly rows="2" auto-grow
          variant="outlined" density="compact" hide-details class="mb-3" />
        <v-checkbox v-model="review.replaceContext" :label="util.getText('Replace context')"
          density="compact" hide-details />
        <v-textarea :model-value="util.unescape_html(util.delete_all_tags(review.context))"
          :label="util.getText('New context')" readonly rows="4" auto-grow
          variant="outlined" density="compact" hide-details />
      </v-card-text>
      <v-card-actions>
        <v-spacer />
        <v-btn class="text-none" @click="review.show = false">{{ util.getText('Cancel') }}</v-btn>
        <v-btn class="text-none" color="success" :disabled="!canSave" @click="save">
          {{ util.getText('Save') }}
        </v-btn>
      </v-card-actions>
    </v-card>
  </v-dialog>
  <v-snackbar v-model="errorVisible" color="error">{{ error }}</v-snackbar>
</template>

<script setup>
import { computed, onBeforeUnmount, reactive, ref, watch } from 'vue';
import { util } from '../../lib/util.js';
import { process_with_GROQ } from '../../lib/ai.js';
import { translationLanguageName, wordLanguage } from '../../lib/translationLanguages.js';

const props = defineProps({
  word: { type: Object, required: true },
  optionsData: { type: Object, required: true },
  soundMode: { type: Number, default: util.SOUND_MODE.OFF },
});
const emit = defineEmits(['save']);
const loading = ref(false);
const error = ref('');
const errorVisible = ref(false);
const review = reactive({
  show: false, word: null, back: '', context: '',
  sourceLang: '',
  replaceTranslation: true, replaceContext: true,
});
const canSave = computed(() => review.replaceTranslation || review.replaceContext);
let active = true;
onBeforeUnmount(() => { active = false; });
watch(() => props.word, () => { review.show = false; });

async function generate() {
  if (loading.value) return;
  const word = props.word;
  if (!word?.front?.trim() || word.archived) return;
  loading.value = true;
  errorVisible.value = false;
  try {
    const from = translationLanguageName(wordLanguage(word));
    const sourceLang = props.optionsData.translation_to;
    const to = translationLanguageName(sourceLang);
    if (!from || !to) throw new Error(util.getText('example_missingLanguages'));
    const currentExample = util.get_sound_text(word, util.SOUND_MODE.CONTEXT_ONLY) || '';
    const prompt_prefix = util.getText('context_defaultPrompt')
      .replaceAll('{FROM_LANGUAGE}', from).replaceAll('{TO_LANGUAGE}', to)
      + `\nGenerate a new example, different from this current example: ${JSON.stringify(currentExample)}.`;
    const results = await process_with_GROQ([{ ...word }], { ...props.optionsData, prompt_prefix });
    if (!active || props.word !== word || word.archived) return;
    const result = Array.isArray(results) && results.find(item => String(item.id) === String(word.id));
    if (typeof result?.back !== 'string' || typeof result?.context !== 'string' ||
        !util.delete_all_tags(result.back).trim() || !util.delete_all_tags(result.context).trim()) {
      throw new Error(util.getText('example_invalidResult'));
    }
    Object.assign(review, {
      word, back: result.back, context: result.context, sourceLang,
      replaceTranslation: true, replaceContext: true, show: true,
    });
    if (props.soundMode !== util.SOUND_MODE.OFF) {
      util.playSound({ ...word, back: result.back, context: result.context }, util.SOUND_MODE.CONTEXT_ONLY);
    }
  } catch (cause) {
    if (active && props.word === word) {
      error.value = cause.message;
      errorVisible.value = true;
    }
  } finally {
    loading.value = false;
  }
}

function save() {
  if (!review.show || !canSave.value || props.word !== review.word || props.word.archived) return;
  emit('save', { ...review });
  review.show = false;
}
</script>