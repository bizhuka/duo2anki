<template>
  <v-alert v-if="status.message" :type="status.type" :icon="status.type === 'error' ? false : undefined" class="mb-4" density="compact" closable @click:close="showMessage()">
    <span v-html="status.message.replace(/\n/g, '<br>')"></span>
  </v-alert>
</template>

<script>
import { reactive } from 'vue';
import { util } from '@/lib/util'; // Import util

export default {
  name: 'InfoAlert',
  setup() {
    const status = reactive({
      message: '', // Initialize with empty message
      type: 'info' // Default type
    });

    // Method to show the alert
    function showMessage(newMessage, newType = '') {
      status.message = newMessage;
      status.type = newType;
    }

    // Return reactive state and methods to be used in the template and exposed
    return {
      status,
      showMessage
    };
  },
  
  methods: {
  }
};
</script>
