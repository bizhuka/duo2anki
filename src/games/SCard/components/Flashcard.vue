<template>
  <v-card class="flashcard" min-height="360">
    <v-card-text class="text-center">
      <div class="card-front-content">
        <div class="text-h4 mb-2">{{ cardData.front }}</div>
        <div class="text-subtitle-1 text-medium-emphasis mb-4" v-if="cardData.transcription" v-html="cardData.transcription"></div>
        <ReplaySoundButton :card="cardData" />
      </div>
    </v-card-text>

    <div v-show="showAnswer" ref="cardBackContent" style="opacity: 0;">
      <v-divider class="mx-4"></v-divider>
      <v-card-text class="text-center">
        <div class="text-h6" v-html="cardData.back"></div>
        <v-img
          class="card-image my-2"
          v-if="cardData.image"
          :src="cardData.image"
          alt="Card image"
          max-height="200"
          contain
        ></v-img>
        <div class="text-body-2 text-medium-emphasis font-italic" v-if="cardData.context" v-html="cardData.context"></div>
      </v-card-text>
    </div>
  </v-card>
</template>

<script>
import anime from 'animejs/lib/anime.es.js';
import ReplaySoundButton from '../../components/ReplaySoundButton.vue';

export default {
  name: 'Flashcard',
  components: {
    ReplaySoundButton,
  },
  props: {
    cardData: {
      type: Object,
      required: true,
    },
    showAnswer: {
      type: Boolean,
      required: true,
    },
  },
  watch: {
    showAnswer(newValue) {
      this.$nextTick(() => {
        const el = this.$refs.cardBackContent;
        if (el) {
          if (newValue) {
            el.style.removeProperty('opacity');
            el.style.transform = 'translateY(10px)';
            anime({
              targets: el,
              opacity: 1,
              translateY: 0,
              duration: 700,
              easing: 'easeOutQuad'
            });
          } else {
            // Reset for next appearance
            anime.set(el, { opacity: 0 });
          }
        }
      });
    }
  },
  methods: {
  },
  mounted() {
    if (this.showAnswer) {
      this.$nextTick(() => {
        const el = this.$refs.cardBackContent;
        if (el) {
          anime.set(el, { opacity: 1, translateY: 0 });
        }
      });
    }
  }
};
</script>

<style scoped>
.flashcard {
  display: flex;
  flex-direction: column;
  justify-content: center;
}
.context :deep(b) {
  white-space: pre-wrap; /* To respect line breaks in context */
}
</style>