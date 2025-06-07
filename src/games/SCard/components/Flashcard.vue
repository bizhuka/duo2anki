<template>
  <v-card class="flashcard" min-height="360">
    <v-card-text class="text-center">
      <div class="card-front-content">
        <div class="text-h4 mb-2">{{ cardData.Front }}</div>
        <div class="text-subtitle-1 text-medium-emphasis mb-4" v-if="cardData.Transcription" v-html="cardData.Transcription"></div>
        <v-btn icon variant="text" @click.stop="replaySound" title="Replay Sound">
          <v-icon>mdi-volume-high</v-icon>
        </v-btn>
      </div>
    </v-card-text>

    <div v-show="showAnswer" ref="cardBackContent" style="opacity: 0;">
      <v-divider class="mx-4"></v-divider>
      <v-card-text class="text-center">
        <div class="text-h6" v-html="cardData.Back"></div>
        <v-img
          class="card-image my-2"
          v-if="cardData.Image"
          :src="cardData.Image"
          alt="Card image"
          max-height="200"
          contain
        ></v-img>
        <div class="text-body-2 text-medium-emphasis font-italic" v-if="cardData.Context" v-html="cardData.Context"></div>
      </v-card-text>
    </div>
  </v-card>
</template>

<script>
import anime from 'animejs/lib/anime.es.js';

export default {
  name: 'Flashcard',
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
    replaySound() {
      this.$emit('replay-sound');
    }
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