<template>
  <!-- Bind the computed style to set the CSS variable -->
  <div class="rich-text-editor-wrapper mb-2" :style="editorStyle">
    <slot name="label">
      <label v-if="label" class="v-label v-label--clickable">{{ label }}</label>
    </slot>
    <QuillEditor
      :content="modelValue"
      @update:content="handleUpdate"
      @ready="handleReady"
      :options="editorOptions"
      contentType="html"
      theme="snow"
      :style="{ minHeight: props.minHeight }"
    />
    <Teleport v-if="toolbarTarget && $slots['toolbar-start']" :to="toolbarTarget">
      <span class="toolbar-start"><slot name="toolbar-start" /></span>
    </Teleport>
  </div>
</template>

<script setup>
import { QuillEditor } from '@vueup/vue-quill';
import '@vueup/vue-quill/dist/vue-quill.snow.css';
import { computed, ref } from 'vue';
import { useTheme } from 'vuetify'; // Import useTheme
import { util } from '@/lib/util'; // Import util

// Define props and emits for v-model compatibility
const props = defineProps({
  modelValue: {
    type: String,
    default: ''
  },
  label: {
    type: String,
    default: ''
  },
  minHeight: { // Add minHeight prop
    type: String,
    required: true,
  },
  handlers: { // Keep handlers prop
    type: Object,
    default: () => ({})
  },
  icons: { // Add icons prop
    type: Object,
    default: () => ({}) // Expects keys like customButton1Icon, customButton1Color
  },
  optionsData: { // Added prop
    type: Object,
    required: true
  },
  hideToolbar: { // New prop to control toolbar visibility
    type: Boolean,
    default: false
  },
  breakDelimeter: { // Optional string of delimiters to split into line breaks
    type: String,
    default: ''
  }
});

const emit = defineEmits(['update:modelValue']);
const theme = useTheme(); // Get the theme object
const toolbarTarget = ref(null);
// Quill owns the toolbar DOM; this target lets Vue insert the toolbar-start slot into it.
const handleReady = quill => {
  toolbarTarget.value = quill.getModule('toolbar')?.container.querySelector('.ql-customButton1')?.parentElement;
};


// Computed property for the icon content CSS variable
// Generic computed property for the custom button icon content
const customButton1IconContent = computed(() => {
  // Use a generic key like 'customButton1Icon'
  return props.icons?.customButton1Icon; // e.g., '\\F0978'
});

// Computed property for the custom button icon color
const customButton1Color = computed(() => {
  const colorName = props.icons?.customButton1Color; // e.g., 'primary', 'success'
  if (colorName && theme.current.value.colors[colorName]) {
    // If it's a valid theme color name, resolve it to its CSS value
    return theme.current.value.colors[colorName]; // e.g., 'rgb(var(--v-theme-primary))' or hex/rgb value
  }
  // Otherwise, use the provided value directly (could be a CSS color like '#FF0000') or default to 'inherit'
  return colorName || 'inherit';
});

const editorStyle = computed(() => ({
  '--custom-button1-icon': `"${customButton1IconContent.value}"`,
  '--custom-button1-color': customButton1Color.value // Pass color value directly
}));

// Toolbar options with the new button and handler
const editorOptions = computed(() => {
  const modules = {
    toolbar: props.hideToolbar ? false : { // Conditionally hide or show toolbar
      container: [
        ['bold', 'italic', 'underline', 'clean'],
        [{ 'list': 'ordered'}, { 'list': 'bullet' }],
        ['customButton1'] // props.hideToolbar Or hide this button?
      ],
      handlers: {
        // Use generic handler key 'customButton1Click'
        'customButton1': () => props.handlers?.customButton1Click?.()
      }
    }
  };

  return {
    matchVisual: false,
    modules: modules,
    placeholder: util.getText('Enter text...')
  };
});

// Rebuild separator-based paragraphs without stripping inline formatting such as bold.
const handleUpdate = (content) => {
  if (!props.breakDelimeter || !content) {
    emit('update:modelValue', content.replace(/<\/p><p>/g, '')); // Yep delete this way. Not util.delete_all_linebreaks(content)
    return;
  }

  // 1. Remove paragraph wrappers before rebuilding them; keep inline formatting.
  const textContent = content
    .replace(/<\/?p(?:\s[^>]*)?>/gi, '')
    .replace(/^(?:\s|<br\s*\/?>)+|(?:\s|<br\s*\/?>)+$/gi, '')
    .replace(/\s+/g, ' ').trim();

  // 2. Split the text by delimiters.
  const parts = textContent.split(new RegExp(`([${props.breakDelimeter}])`));

  // 3. Rebuild the content with each part in a <p> tag.
  let newContent = '';
  for (let i = 0; i < parts.length; i++) {
    const part = parts[i];
    if (!part) continue;

    // if part is a delimiter, append it to the previous <p>
    if (props.breakDelimeter.includes(part) && newContent.endsWith('</p>')) {
      newContent = newContent.slice(0, -4) + part + '</p>';
    } else {
      newContent += `<p>${part}</p>`;
    }
  }

  // 4. Clean up any empty paragraphs.
  newContent = newContent.replace(/<p><\/p>/g, '').replace(/<p>\s*<\/p>/g, '');   

  // Emit only normalized changes to avoid a Quill/v-model feedback loop.
  if (newContent !== content) {
    emit('update:modelValue', newContent);
  }
};
</script>

<style scoped>
/* Apply the CSS variable via style binding */
.rich-text-editor-wrapper {
  display: flex;
  flex-direction: column;
}

.rich-text-editor-wrapper .v-label {
  font-size: 0.875rem; /* Match Vuetify label size */
  color: rgba(0, 0, 0, 0.6); /* Match Vuetify label color */
  margin-bottom: 4px;
  display: block; /* Ensure label takes its own line */
}

.toolbar-start {
  order: -1;
  display: inline-flex;
  align-items: center;
  margin-right: 0.25rem;
}

.toolbar-start :deep(.v-btn) {
  width: 2rem;
  height: 2rem;
  padding: 0;
  float: none;
}
.toolbar-start :deep(.v-icon) {
  font-size: 1.5rem;
  width: 1.5rem;
  height: 1.5rem;
}
/* Style adjustments for Quill inside Vuetify */
:deep(.ql-toolbar.ql-snow) {
  display: flex;
  align-items: center;
  border-top-left-radius: 4px;
  border-top-right-radius: 4px;
  border-bottom: 0;
  padding: 8px;
}

:deep(.ql-toolbar .ql-formats:has(.ql-customButton1)) {
  display: flex;
  align-items: center;
  margin-left: auto;
  margin-right: 0;
}

:deep(.ql-container.ql-snow) {
  border-bottom-left-radius: 4px;
  border-bottom-right-radius: 4px;
  /* min-height is now controlled by the prop via inline style */
  font-size: 1rem; /* Match default text field font size */
  line-height: 1.5;
}

:deep(.ql-editor) {
  padding: 10px 12px; /* Adjust padding to better match v-text-field */
  /* min-height is now controlled by the prop via inline style */
}

/* Adjust padding for single-line appearance */
:deep(.ql-editor[style*="min-height: 40px"]) {
  padding-top: 8px;
  padding-bottom: 8px;
}


:deep(.ql-editor.ql-blank::before) {
  font-style: normal; /* Prevent italic placeholder */
  left: 12px; /* Align placeholder with padding */
  right: 12px;
  color: rgba(0, 0, 0, 0.42); /* Match Vuetify placeholder color */
}

/* Style the generic custom button */
:deep(.ql-toolbar .ql-customButton1) {
  width: 2rem;
  height: 2rem;
  padding: 0.25rem;
}

:deep(.ql-toolbar .ql-customButton1::before) {
  font-family: 'Material Design Icons'; /* Ensure MDI font is used */
  content: var(--custom-button1-icon); /* Use generic CSS variable for icon */
  color: var(--custom-button1-color); /* Use generic CSS variable for color */
  font-size: 1.5rem;
  line-height: 1.5rem;
  display: inline-block; /* Needed for proper rendering */
  width: 1.5rem;
  vertical-align: middle; /* Align icon vertically */
}

/* Optional: Adjust spacing if needed */
:deep(.ql-toolbar .ql-formats button) {
  margin-right: 4px; /* Add some space between buttons */
}
</style>
