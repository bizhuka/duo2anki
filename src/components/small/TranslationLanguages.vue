<template>
    <v-row>
        <v-col cols="12" sm="6">
            <v-select :model-value="from" :items="translationLanguages" item-title="title" item-value="value"
                :label="util.getText('Source language')" density="compact" :disabled="disabled"
                :rules="requiredLanguage" required hide-details="auto"
                @update:model-value="$emit('update:from', $event)" />
        </v-col>
        <v-col cols="12" sm="6">
            <v-select :model-value="to" :items="translationLanguages" item-title="title" item-value="value"
                :label="util.getText('Target language')" density="compact" :disabled="disabled"
                :rules="requiredLanguage" required hide-details="auto"
                @update:model-value="$emit('update:to', $event)" />
        </v-col>
    </v-row>
</template>

<script setup>
import { util } from '../../lib/util.js';
import { translationLanguages, translationLanguageName } from '../../lib/translationLanguages.js';

defineProps({
    from: { type: String, default: '' },
    to: { type: String, default: '' },
    disabled: { type: Boolean, default: false },
});
defineEmits(['update:from', 'update:to']);

const requiredLanguage = [value => !!translationLanguageName(value) || util.getText('Required')];
</script>