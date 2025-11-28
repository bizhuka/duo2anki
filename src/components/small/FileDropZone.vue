<script>
import { ref } from 'vue';

export function createDropZoneState() {
    return {
        processing: ref(false),
        dropZoneRef: ref(null),
    };
}
</script>

<template>
    <div class="drop-zone" :style="dropZoneStyle" @dragover.prevent="onDragOver" @dragenter.prevent="onDragEnter"
        @dragleave.prevent="onDragLeave" @drop.prevent="onDrop" @click="triggerFileSelect">
        <div class="drop-zone__content">
            <v-icon size="36" color="primary" class="mb-2">{{ icon }}</v-icon>
            <span v-if="!fileName">{{ idleLabel }}</span>
            <span v-else>{{ fileName }}</span>
        </div>
        <v-progress-circular v-if="processing" indeterminate color="primary" size="32" class="mt-3" />
        <input ref="fileInput" type="file" class="visually-hidden" :accept="accept" @change="onFileChange" />
    </div>
</template>

<script setup>
import { computed, ref, watchEffect } from 'vue';

const props = defineProps({
    icon: {
        type: String,
        default: 'mdi-file-upload',
    },
    idleLabel: {
        type: String,
        required: true,
    },
    accept: {
        type: String,
        default: '',
    },
    processing: {
        type: Boolean,
        default: false,
    },
    highlightColor: {
        type: String,
        default: '#4caf50',
    },
    baseColor: {
        type: String,
        default: '#bdbdbd',
    },
    idleBackground: {
        type: String,
        default: '#f0f0f0',
    },
    activeBackground: {
        type: String,
        default: '#e8f5e9',
    },
});

const emit = defineEmits(['file-selected']);

const isDragOver = ref(false);
const fileName = ref('');
const fileInput = ref(null);

const dropZoneStyle = computed(() => ({
    border: `2px dashed ${isDragOver.value ? props.highlightColor : props.baseColor}`,
    borderRadius: '4px',
    backgroundColor: isDragOver.value ? props.activeBackground : (fileName.value ? 'transparent' : props.idleBackground),
    cursor: props.processing ? 'progress' : 'pointer',
    transition: 'border-color 0.2s ease, background-color 0.2s ease',
    padding: '1.5rem',
    minHeight: '10rem',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    textAlign: 'center',
    position: 'relative',
    pointerEvents: props.processing ? 'none' : 'auto',
}));

watchEffect(() => {
    if (!props.processing) {
        return;
    }
    isDragOver.value = false;
});

function triggerFileSelect() {
    if (props.processing) {
        return;
    }
    fileInput.value?.click();
}

function onDragEnter(event) {
    if (props.processing) {
        return;
    }
    if (event.dataTransfer?.types?.includes('Files')) {
        isDragOver.value = true;
    }
}

function onDragOver(event) {
    if (props.processing) {
        return;
    }
    event.preventDefault();
}

function onDragLeave(event) {
    if (props.processing) {
        return;
    }
    if (!event.currentTarget.contains(event.relatedTarget)) {
        isDragOver.value = false;
    }
}

function onDrop(event) {
    if (props.processing) {
        return;
    }
    isDragOver.value = false;
    const file = event.dataTransfer?.files?.[0];
    if (file) {
        handleFile(file);
    }
}

function onFileChange(event) {
    if (props.processing) {
        resetInputValue();
        return;
    }
    const file = event.target?.files?.[0];
    if (file) {
        handleFile(file);
    }
    resetInputValue();
}

function handleFile(file) {
    fileName.value = file.name;
    emit('file-selected', file);
}

function resetInputValue() {
    if (fileInput.value) {
        fileInput.value.value = '';
    }
}

function reset() {
    fileName.value = '';
    resetInputValue();
    isDragOver.value = false;
}

defineExpose({ reset });
</script>

<style scoped>
.drop-zone {
    position: relative;
}

.visually-hidden {
    position: absolute;
    width: 1px;
    height: 1px;
    padding: 0;
    margin: -1px;
    overflow: hidden;
    clip: rect(0, 0, 0, 0);
    border: 0;
}
</style>
