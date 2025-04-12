<template>
  <v-tooltip :location="tooltipLocation" :text="tooltipText" :open-delay="openDelay">
    <template v-slot:activator="{ props }">
      <v-btn
        v-bind="props"
        icon
        variant="text"
        density="compact"
        rounded="circle"
        size="x-large"
        :style="buttonStyle"
        @click="$emit('click')"
      >
        <v-icon size="x-large">{{ iconName }}</v-icon>
      </v-btn>
    </template>
  </v-tooltip>
</template>

<script>
import { computed } from 'vue';
import { util } from '@/lib/util'; // Import util

export default {
  name: 'ChevronButton',
  props: {
    direction: {
      type: String,
      required: true,
      validator: (value) => ['left', 'right'].includes(value),
    },
    tooltipText: {
      type: String,
      required: true,
    },
    tooltipLocation: {
      type: String,
      default: 'top',
    },
    openDelay: {
      type: [String, Number],
      default: 0, // Default to no delay
    },
  },
  emits: ['click'],
  setup(props) {
    const iconName = computed(() => `mdi-chevron-${props.direction}`);

    const buttonStyle = computed(() => ({
      position: 'absolute',
      top: '50%',
      [props.direction]: '-10px', // Dynamic left/right positioning
      transform: 'translateY(-50%)',
      zIndex: 1,
    }));

    return {
      iconName,
      buttonStyle,
    };
  },
};
</script>