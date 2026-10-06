<template>
  <v-select
    :model-value="courseIds.includes(modelValue) ? modelValue : null"
    :items="courseItems"
    item-title="title"
    item-value="value"
    density="compact"
    hide-details
    variant="plain"
    class="mx-2 course-select"
    aria-label="Course or reader"
    @update:model-value="$emit('update:modelValue', $event)"
  >
    <template v-slot:selection="{ item }">
      <template v-if="item.raw.reader">
        <v-icon :title="item.raw.title" size="small">mdi-book-open-variant</v-icon>
        <span class="text-caption ms-1" :title="item.raw.title">{{ item.raw.language.toUpperCase() }}</span>
      </template>
      <v-img v-else-if="item.raw.flag" :src="item.raw.flag" height="18" width="26" :alt="item.raw.title" contain />
      <v-icon v-else :title="item.raw.title">{{ item.raw.icon }}</v-icon>
    </template>
    <template v-slot:item="{ props, item }">
      <v-list-item v-bind="props" role="option" :aria-selected="modelValue === item.raw.value"
        :subtitle="`${(courseWordCounts[item.raw.value] ?? 0).toLocaleString()} ${util.getText('Words')}`">
        <template v-slot:prepend>
          <v-img v-if="item.raw.flag" :src="item.raw.flag" height="18" width="26" contain class="me-2" />
          <v-icon v-else class="me-2">{{ item.raw.icon }}</v-icon>
        </template>
      </v-list-item>
    </template>
  </v-select>
</template>

<script setup>
import { computed } from 'vue';
import { getDuolingoCourseLanguage, normalizeLanguageCode } from '../../lib/i18n/translation.js';
import { util } from '../../lib/util.js';

const props = defineProps({
  modelValue: { type: String, default: null },
  courseIds: { type: Array, default: () => [] },
  courseWordCounts: { type: Object, default: () => ({}) },
});
defineEmits(['update:modelValue']);

const flagCountries = {
  AR: 'sa', CS: 'cz', CY: 'gb-wls', DA: 'dk', DE: 'de', EL: 'gr', EN: 'gb',
  ES: 'es', FI: 'fi', FR: 'fr', GA: 'ie', GD: 'gb-sct', HE: 'il', HI: 'in',
  HT: 'ht', HU: 'hu', ID: 'id', IT: 'it', JA: 'jp', KO: 'kr', NL: 'nl',
  NB: 'no', PL: 'pl', PT: 'pt', RO: 'ro', RU: 'ru', SV: 'se', SW: 'tz',
  UK: 'ua', VI: 'vn', YI: 'il', ZH: 'cn', ZU: 'za', TR: 'tr',
};

const courseItems = computed(() => {
  return props.courseIds.map(courseId => {
    if (util.isReaderCourse(courseId)) {
      const reader = util.getReaderCourseInfo(courseId);
      return { value: courseId, title: util.getCourseName(courseId), icon: 'mdi-book-open-variant',
        reader: reader?.reader, language: reader?.targetLang };
    }
    const { lang_id } = util.get_course_info(courseId);
    const flagLanguage = normalizeLanguageCode(lang_id).split('-')[0].toUpperCase();
    return {
      value: courseId,
      title: `${getDuolingoCourseLanguage(lang_id) || lang_id} (${courseId})`,
      flag: flagCountries[flagLanguage] ? `https://flagcdn.com/w40/${flagCountries[flagLanguage]}.png` : '',
      icon: 'mdi-earth',
    };
  });
});
</script>

<style scoped>
.course-select {
  flex: 0 0 5rem;
  width: 5rem;
}
</style>