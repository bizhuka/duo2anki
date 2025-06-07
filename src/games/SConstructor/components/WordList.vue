<template>
  <v-sheet rounded="lg" border :class="containerClass" class="pa-4">
    <div class="text-subtitle-1 font-weight-medium mb-2">{{ title }}</div>
    <div class="word-list-area" ref="wordListAreaRef">
      <WordItem
        v-for="(word, index) in words"
        :key="`wld-${index}-${word}`"
        :word="word"
        @selectWord="onWordClicked(word, index)"
        :class="wordItemClass" />
      <p v-if="words.length === 0" class="empty-list-message text-medium-emphasis font-italic">
        {{ emptyListMessage }}
      </p>
    </div>
  </v-sheet>
</template>

<script>
import WordItem from './WordItem.vue';
import { ref } from 'vue';
import anime from 'animejs';

export default {
  components: {
    WordItem,
  },
  props: {
    title: {
      type: String,
      required: true,
    },
    words: {
      type: Array,
      required: true,
      default: () => [],
    },
    emptyListMessage: {
      type: String,
      default: 'No words to display.',
    },
    wordItemClass: {
      type: String,
      default: '',
    },
    containerClass: {
      type: String,
      default: '',
    },
  },
  emits: ['wordClicked'],
  setup(props, { emit, expose }) {
    const wordListAreaRef = ref(null);

    const getTargetSelector = () => {
      // Since WordItem is now a v-chip, we target it directly.
      // The wordItemClass can still be used for specificity if needed.
      if (props.wordItemClass && props.wordItemClass.trim() !== '') {
        return '.' + props.wordItemClass.trim();
      }
      return '.v-chip'; // Default to .v-chip
    };
    
    const onWordClicked = (word, originalIndex) => {
      emit('wordClicked', { word, originalIndex });
    };
    
    const animateSuccess = () => {
      if (wordListAreaRef.value) {
        const targets = wordListAreaRef.value.querySelectorAll(getTargetSelector());
        if (!targets || targets.length === 0) return;
        
        anime({
          targets: targets,
          backgroundColor: ['#BFDBAE', 'rgba(0,0,0,0)'], // Animate from green to transparent
          scale: [1, 1.2, 1],
          easing: 'easeInOutQuad',
          duration: 800,
          delay: anime.stagger(100),
        });
      }
    };
    
    const animateFailure = () => {
      if (wordListAreaRef.value) {
        const targets = wordListAreaRef.value.querySelectorAll(getTargetSelector());
        if (!targets || targets.length === 0) return;

        anime({
          targets: targets,
          backgroundColor: ['#FCA5A5', 'rgba(0,0,0,0)'], // Animate from red to transparent
          translateX: [-8, 8, -8, 8, 0],
          easing: 'easeInOutQuad',
          duration: 500,
          delay: anime.stagger(100),
        });
      }
    };

    expose({ animateSuccess, animateFailure });

    return {
      onWordClicked,
      wordListAreaRef,
    };
  },
};
</script>

<style scoped>
.word-list-area {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  min-height: 48px;
  padding: 8px;
  border-radius: 6px;
  align-items: center;
  background-color: rgba(var(--v-theme-on-surface), 0.05);
}

.empty-list-message {
  width: 100%;
  text-align: center;
}

/* Styling for specific instances can be done via containerClass in App.vue's style or here if general enough */
.word-bank-style {
  --v-border-color: rgba(var(--v-theme-success), 0.5);
}
.word-bank-style .text-subtitle-1 {
  color: rgb(var(--v-theme-success));
}

.constructed-sentence-style {
  --v-border-color: rgba(var(--v-theme-primary), 0.5);
}
.constructed-sentence-style .text-subtitle-1 {
  color: rgb(var(--v-theme-primary));
}
.constructed-sentence-style .word-list-area {
  border-style: dashed;
  border-color: rgba(var(--v-theme-primary), 0.3);
}

/* The animation classes are no longer needed as animejs handles the color changes directly */
</style>