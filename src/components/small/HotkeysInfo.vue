<template>
  <v-container fluid :data-lang="optionsData.pluginLanguage">
    <v-card variant="outlined">
      <v-card-title class="text-h6">{{ util.getText('Application Hotkeys') }}</v-card-title>
      <v-list density="compact">
        <v-list-item>
          <v-list-item-title>
            <v-chip color="primary" label size="small" class="me-2">Alt + W</v-chip>
            {{ util.getText('Open/Close Duo2Anki Side Panel') }}
          </v-list-item-title>
        </v-list-item>
      </v-list>
    </v-card>

    <v-card variant="outlined" class="mt-4">
      <v-card-title class="text-h6">{{ util.getText('Edit Word Dialog Hotkeys') }}</v-card-title>
      <v-list density="compact">
        <v-list-item>
          <v-list-item-title>
            <v-chip color="secondary" label size="small" class="me-2">←</v-chip>
            {{ util.getText('Previous Word') }}
          </v-list-item-title>
        </v-list-item>
        <v-list-item>
          <v-list-item-title>
            <v-chip color="secondary" label size="small" class="me-2">→</v-chip>
            {{ util.getText('Next Word') }}
          </v-list-item-title>
        </v-list-item>
        <v-list-item>
          <v-list-item-title>
            <v-chip color="secondary" label size="small" class="me-2">F4</v-chip>
            {{ util.getText('Find Image for current word') }}
          </v-list-item-title>
        </v-list-item>
        <v-list-item>
          <v-list-item-title>
            <v-chip color="secondary" label size="small" class="me-2">MediaPlayPause</v-chip>
            {{ util.getText('Play audio for current word') }}
          </v-list-item-title>
        </v-list-item>
      </v-list>
    </v-card>
  </v-container>
</template>

<script setup>
import { util } from '@/lib/util'; // Import util

// Define props
const props = defineProps({
  optionsData: {
    type: Object,
    required: true
  }
});
</script>

<script>
export default {
  name: 'HotkeysInfo',
};
</script>