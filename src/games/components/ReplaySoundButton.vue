<template>
  <v-btn icon variant="text" @click.stop="replay" title="Replay Sound">
    <v-icon>mdi-volume-high</v-icon>
  </v-btn>
</template>

<script>
import { util } from '../../lib/util.js';

export default {
  name: 'ReplaySoundButton',
  props: {
    card: {
      type: Object,
      default: null,
    },
    soundMode: {
      type: Number,
      default: util.SOUND_MODE.FRONT_WORD_WITH_CONTEXT,
    },
  },
  data() {
    return {
      currentSound: null,
    };
  },
  watch: {
    card: {
      handler(newCard) {
        if (this.currentSound) {
          this.currentSound.pause();
        }
        // Don't autoplay, just prepare it.
        this.currentSound = newCard ? util.playSound(newCard, false, this.soundMode) : null;
      },
      immediate: true,
      deep: true,
    },
  },
  methods: {
    replay() {
      if (this.currentSound) {
        this.currentSound.pause();
        this.currentSound.currentTime = 0;
        this.currentSound.play();
      }
    },
  },
  beforeUnmount() {
    if (this.currentSound) {
      this.currentSound.pause();
      this.currentSound = null;
    }
  },
};
</script>