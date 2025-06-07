<template>
  <div class="review-controls">
    <template v-for="option in reviewOptions" :key="option.value">
      <v-btn
        :key="option.value"
        v-if="card && card.schedule_results && card.schedule_results[option.value] !== undefined"
        :color="option.color"
        @click="selectQuality(option.value)"
        class="review-button"
        :title="option.label"
        style="text-transform: none;">
        {{ option.label }} {{ card.schedule_results[option.value] }}
      </v-btn>
    </template>
  </div>
</template>

<script>
import { DbProxy } from '../../lib/database.js';

export default {
  name: 'ReviewControls',
  props: {
    card: {
      type: Object,
      default: null
    },
    dbProxy: {
      type: DbProxy,
      default: null
    }
  },
  data() {
    return {
      reviewOptions: [
        { label: 'Again', value: "again", icon: 'mdi-close-circle-outline', color: 'error' },
        { label: 'Hard',  value: "hard",  icon: 'mdi-help-circle-outline', color: 'warning' },
        { label: 'Good',  value: "good",  icon: 'mdi-check-circle-outline', color: 'success' },
        { label: 'Easy',  value: "easy",  icon: 'mdi-thumb-up-outline', color: 'primary' },
      ]
    };
  },
  methods: {
    selectQuality(qualityValue) {
      this.$emit('review-selected', qualityValue);
    }
  }
};
</script>

<style scoped>
.review-controls {
  display: flex;
  justify-content: space-around;
  align-items: center;
  width: 100%;
  gap: 8px; /* Add gap between buttons */
}

.review-button {
  flex-grow: 1; /* Allow buttons to grow and fill the space */
}
</style>