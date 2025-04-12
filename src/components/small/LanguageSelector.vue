<template>
  <v-select
    v-model="selectedLanguage"
    :items="languageItems"
    item-value="value"
    density="compact"
    hide-details
    @update:modelValue="onLanguageChange"
    style="max-width: 70px;"
    class="mx-2 language-select"
    variant="plain"
  >
    <!-- Slot for displaying the selected item (flag) -->
    <template v-slot:selection="{ item }">
      <v-img :src="item.raw.flag" height="20" width="30" contain class="me-2"></v-img>
    </template>
    <!-- Slot for displaying items in the dropdown list -->
    <template v-slot:item="{ props, item }">
      <v-list-item v-bind="props" :title="null">
        <template v-slot:prepend>
          <v-img :src="item.raw.flag" height="20" width="30" contain class="me-3"></v-img>
        </template>
        <v-list-item-title>{{ item.raw.nativeName }}</v-list-item-title>
      </v-list-item>
    </template>
  </v-select>
</template>

<script>
import { computed, ref, watch } from 'vue';
import { pluginsTranslations } from '../../lib/i18n/translation.js'; // Adjusted path

export default {
  props: {
    modelValue: { // Use modelValue for v-model compatibility
      type: String,
      required: true,
    },
  },
  emits: ['update:modelValue'], // Declare the event emitted for v-model
  setup(props, { emit }) {
    const selectedLanguage = ref(props.modelValue);

    // Watch for external changes to the modelValue prop
    watch(() => props.modelValue, (newValue) => {
      selectedLanguage.value = newValue;
    });

    // Create items for the language selector using flag image paths and native names
    const languageItems = computed(() => {
      return Object.keys(pluginsTranslations).map(langCode => ({
        flag: pluginsTranslations[langCode]?.flag || '', // Keep flag path separate
        nativeName: pluginsTranslations[langCode]?.native || langCode, // Add native name
        value: langCode
      }));
    });

    const onLanguageChange = (newValue) => {
      selectedLanguage.value = newValue;
      emit('update:modelValue', newValue); // Emit the update event for v-model
    };

    return {
      selectedLanguage,
      languageItems,
      onLanguageChange,
    };
  },
};
</script>

<style scoped>
/* Add any component-specific styles here if needed */
.language-select {
  /* Example style */
  min-width: 70px; /* Ensure it doesn't shrink too much */
}
</style>