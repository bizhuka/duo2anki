<template>
    <!-- :key="languageKey" -->
    <div class="d-flex flex-column align-center justify-center mx-auto">
        <div class="d-flex align-center">            
            <!-- <v-icon v-if="icon" :icon="icon" class="me-2" /> -->
            <v-label density="compact">{{ TitleText }}</v-label>
        </div>

        <v-breadcrumbs v-if="items && items.length" :items="items" density="compact">
            <!-- >>>>>> divider=">" -->
            <template v-slot:divider>
                <v-icon icon="mdi-chevron-right" />
            </template>

            <template v-slot:item="{ item }">
                <v-icon :icon="item.icon" />
                <v-breadcrumbs-item :href="item.href" @click.prevent.stop="onClickHandler(item)">
                    {{ item.title }}
                </v-breadcrumbs-item>
            </template>
        </v-breadcrumbs>
    </div>
</template>

<script setup>
import { util } from '@/lib/util'; // Import util
</script>

<script>
export default {
    props: {
        TitleText: {
            type: String,
            required: false
        },

        items: {
            type: Array,
            required: true,
        },

        clickHandler: {
            type: Function,
            required: false,
        }
    },

    data() {
        return {
        };
    },

    methods: {        
        onClickHandler(item) {
            if(this.clickHandler)
                this.clickHandler(item)
            else if (item.href) {
                window.open(item.href, '_blank');
            }
        }
    }
}
</script>