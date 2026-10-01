<template>
    <div>
        <v-slider :model-value="wordsPerRequest" :min="10" :max="40" :step="5" thumb-label
            :label="util.getText('Words per request')" prepend-icon="mdi-file-word-outline" :disabled="disabled"
            @update:model-value="$emit('update:wordsPerRequest', $event)">
            <template v-slot:thumb-label="{ modelValue }">
                {{ modelValue }}
            </template>
        </v-slider>
        <v-slider :model-value="requestCount" :min="1" :max="4" :step="1" thumb-label
            :label="util.getText('Request count')" :disabled="disabled"
            @update:model-value="$emit('update:requestCount', $event)" />
    </div>
</template>

<script setup>
import { util } from '../../lib/util.js';

defineProps({
    wordsPerRequest: { type: Number, required: true },
    requestCount: { type: Number, required: true },
    disabled: { type: Boolean, default: false },
});
defineEmits(['update:wordsPerRequest', 'update:requestCount']);
</script>