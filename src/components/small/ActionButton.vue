<template>
  <v-tooltip :text="tooltipText" location="top" :disabled="!iconOnly">
    <template v-slot:activator="{ props: tooltipProps }">
    <v-btn
        v-bind="tooltipProps"
        :icon="iconOnly"
        :aria-label="tooltipText"
        :color="color"
        :variant="variant"
        :size="size"
        :density="density"
        :class="buttonClass"
        :loading="loading"
        :disabled="disabled"
        @click="$emit('click', $event)"
      >
        <v-icon :icon="icon" :class="{ 'mr-1': !iconOnly }"></v-icon>
        <template v-if="!iconOnly">{{ tooltipText }}</template>
      </v-btn>
    </template>
  </v-tooltip>
</template>

<script setup>
import { defineProps, defineEmits } from 'vue';

defineProps({
  icon: { type: String, required: true },
  tooltipText: { type: String, required: true },
  iconOnly: { type: Boolean, default: false },
  color: { type: String, default: undefined },
  variant: { type: String, default: 'text' },
  size: { type: String, default: 'small' },
  density: { type: String, default: 'compact' },
  loading: { type: Boolean, default: false },
  disabled: { type: Boolean, default: false },
});

defineEmits(['click']);
</script>
