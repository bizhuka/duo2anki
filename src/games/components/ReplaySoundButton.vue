<template>
  <v-tooltip location="top" :text="card.front" :open-delay="1000">
      <template v-slot:activator="{ props }">
        <v-icon v-bind="props" color="success" size="large" @click="changeSoundMode">{{ soundIcon }}</v-icon>
      </template>
  </v-tooltip>
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
    modes: {
      type: Array,
      required: true,
    },
    autoOff: {
      type: Boolean,
      default: false,
    },
  },

  emits: [
    'sound-mode-changed'
  ],

  data() {
    return {
    };
  },

  computed:{
    soundMode() {
      // If the global sound mode is valid for this instance, use it.
      if (this.modes.includes(util.options.soundMode)) {
        return util.options.soundMode;
      }
      // Otherwise, fall back to the first available mode.
      return this.modes.length > 0 ? this.modes[0] : util.SOUND_MODE.OFF;
    },
    soundIcon(){
      switch (this.soundMode) {
        case util.SOUND_MODE.OFF:
          return 'mdi-volume-off';
        case util.SOUND_MODE.FRONT_WORD:
          return 'mdi-volume-low';
        case util.SOUND_MODE.CONTEXT_ONLY:
          return 'mdi-volume-medium';
        case util.SOUND_MODE.FRONT_WORD_WITH_CONTEXT:
          return 'mdi-volume-high';
        default:
          return 'mdi-volume-off'; // Default icon
      }
    }
  },

  watch: {
    card: {
      handler(newCard) {
        this.set_new(newCard);
      },
      immediate: true,
      deep: true,
    },
  },
  methods: {
    set_new(newCard){
      // if(!this.soundMode)
      //   this.soundMode = this.modes.length ? this.modes[0] : util.SOUND_MODE.OFF

      if (newCard) {
        util.playSound(newCard, this.soundMode);
        if(this.autoOff) 
          setTimeout(() => {
             // Automatically turn off sound mode after playing
          util.options.soundMode = util.SOUND_MODE.OFF;
        }, 2000);
      }
    },

    async changeSoundMode() {
      if (!this.modes.length) return;

      const currentIndex = this.modes.indexOf(this.soundMode);
      // Cycle to the next mode in the allowed list
      const nextIndex = (currentIndex + 1) % this.modes.length;
      const newMode = this.modes[nextIndex];

      // Update and save the global setting
      util.options.soundMode = newMode;

      this.set_new(this.card);
      this.$emit('sound-mode-changed');
    },

    replay() {
      // TODO: Implement replay logic if needed
    },
  },
};
</script>