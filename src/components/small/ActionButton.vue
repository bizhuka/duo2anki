<template>
  <!-- <v-tooltip :text="tooltipText" location="top">
    <template v-slot:activator="{ props: tooltipProps }"> -->
    <v-btn
        v-bind="tooltipProps"
        :icon="false"
        :color="color"
        :variant="variant"
        :size="size"
        :density="density"
        :class="buttonClass"
        :loading="loading"
        :disabled="disabled"
        :data-lang="dataLang"
        @click="$emit('click', $event)"
      >
        <v-icon :icon="icon" class="mr-1"></v-icon>
        {{ tooltipText }}
      </v-btn>
    <!-- </template>
  </v-tooltip> -->
</template>

<script setup>
import { defineProps, defineEmits } from 'vue';

defineProps({
  icon: { type: String, required: true },
  tooltipText: { type: String, required: true },
  color: { type: String, default: undefined },
  variant: { type: String, default: 'text' },
  size: { type: String, default: 'small' },
  density: { type: String, default: 'compact' },
  loading: { type: Boolean, default: false },
  disabled: { type: Boolean, default: false },
  dataLang: { type: String, default: undefined },
});

defineEmits(['click']);
</script>