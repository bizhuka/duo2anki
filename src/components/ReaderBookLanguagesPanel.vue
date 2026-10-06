<template>
    <section class="book-languages mt-4">
        <v-divider class="mb-3" />
        <h2 class="text-subtitle-1 mb-2">{{ util.getText('reader_bookLanguages') }}</h2>
        <v-table density="compact">
            <thead>
                <tr>
                    <th>{{ util.getText('reader_bookName') }}</th>
                    <th>{{ util.getText('reader_language') }}</th>
                    <th class="skip-column">{{ util.getText('reader_skipBook') }}</th>
                </tr>
            </thead>
            <tbody>
                <tr v-for="book in books" :key="book.id">
                    <td>
                        <v-textarea v-model="book.title" :aria-label="`${util.getText('reader_bookName')}: ${book.id}`"
                            :disabled="loading || book.skip" rows="1" max-rows="4" auto-grow
                            density="compact" hide-details class="book-title" />
                        <div class="text-caption text-medium-emphasis">{{ book.wordCount }} {{ util.getText('Words') }}</div>
                    </td>
                    <td>
                        <v-select v-model="book.language" :items="translationLanguages" item-title="title" item-value="value"
                            :aria-label="`${util.getText('reader_language')}: ${book.title}`" :placeholder="util.getText('reader_language')"
                            :disabled="loading || book.skip" density="compact" hide-details>
                            <template #selection="{ item }">
                                <span class="language-name">{{ item.title }}</span>
                                <span class="language-code" :title="item.title">{{ item.value.toUpperCase() }}</span>
                            </template>
                        </v-select>
                    </td>
                            <td class="skip-column">
                            <v-checkbox v-model="book.skip" :aria-label="`${util.getText('reader_skipBook')}: ${book.title}`"
                                :disabled="loading" density="compact" hide-details />
                            </td>
                </tr>
            </tbody>
        </v-table>
        <div class="d-flex justify-end ga-2 mt-3">
            <v-btn variant="text" :disabled="loading" @click="$emit('cancel')">{{ util.getText('Cancel') }}</v-btn>
            <v-btn color="success" prepend-icon="mdi-database-import" :disabled="!canImport || loading"
                :loading="loading" @click="$emit('confirm')">{{ util.getText('reader_import') }}</v-btn>
        </div>
    </section>
</template>

<script setup>
import { computed } from 'vue';
import { util } from '../lib/util.js';
import { translationLanguages } from '../lib/translationLanguages.js';
import { canImportReaderBooks } from '../lib/readerImport.js';

const props = defineProps({ books: { type: Array, required: true }, loading: { type: Boolean, default: false } });
defineEmits(['confirm', 'cancel']);
const canImport = computed(() => canImportReaderBooks(props.books));
</script>

<style scoped>
.book-languages :deep(table) { table-layout: fixed; width: 100%; }
.book-languages :deep(th), .book-languages :deep(td) { width: calc(55% - 26px); padding: 8px; }
.book-languages :deep(th:first-child), .book-languages :deep(td:first-child) { width: calc(45% - 26px); }
.book-languages :deep(.skip-column) { width: 52px; padding: 4px; text-align: center; font-size: 0.875rem; }
.skip-column :deep(.v-selection-control) { justify-content: center; }
.book-languages :deep(.v-field__input) { padding-inline: 8px; font-size: 0.875rem; }
.book-title { overflow-wrap: anywhere; font-size: 0.875rem; }
.book-languages :deep(.v-select__selection-text) { white-space: normal; overflow-wrap: anywhere; }
.language-code { display: none; }
@media (max-width: 400px) {
    .language-name { display: none; }
    .language-code { display: inline; }
}
</style>