<template>
  <v-chip
    @click="handleClick"
    :disabled="isDisabled"
    label
  >
    {{ word }}
  </v-chip>
</template>

<script>
export default {
  props: {
    word: {
      type: String,
      required: true,
    },
    isDisabled: {
      type: Boolean,
      default: false,
    },
  },
  emits: ['selectWord'],
  setup(props, { emit }) {
    const handleClick = () => {
      if (!props.isDisabled) {
        emit('selectWord', props.word);
      }
    };

    return {
      handleClick,
    };
  },
};
</script>

<style scoped>
.v-chip {
  cursor: pointer;
  user-select: none;
}
</style>