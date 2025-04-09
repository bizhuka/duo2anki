<template>
    <v-dialog v-model="dialog.show" max-width="25rem" :data-lang="optionsData.pluginLanguage">
        <v-card>
            <v-card-title class="text-h5">
                <v-row no-gutters align="center">
                    {{ dialog.title }}
                    <v-spacer/>
                    <v-btn v-if="dialog.showStop" variant="text" size="small" icon="mdi-close" @click="stop"/>
                </v-row>
            </v-card-title>

            <v-card-text>{{ dialog.message }}</v-card-text>
            <v-card-actions>
                <v-spacer></v-spacer>
                <v-btn color="primary" variant="text" @click="no" style="text-transform: none;">
                    {{ dialog.noText }}
                </v-btn>
                <v-btn :color="dialog.yesColor" variant="text" @click="confirm" :prepend-icon="dialog.yesIcon" style="text-transform: none;">
                    {{ dialog.yesText }}
                </v-btn>
            </v-card-actions>
        </v-card>
    </v-dialog>
</template>

<script>
import { reactive } from 'vue';
import { util } from '../../lib/util.js';

export default {
    props: {
        optionsData: { // Added prop
            type: Object,
            required: true
        }
    },
    setup(props) { // Add props to setup
        const dialog = reactive({
            show: false,
            title: util.getText('Confirmation'),
            message: '',
            noText: util.getText('No'),
            yesText: util.getText('Yes'),
            showStop: false, // Show stop button
            action: null, // Action to execute on yes
            resolvePromise: null, // To store the promise's resolve function
            yesColor: '',       // Default color
            yesIcon: undefined, // Default icon
        });

        // Method to show the dialog
        function confirm_popup(options) {
            return new Promise((resolve) => {
                dialog.title = options.title || util.getText('Confirmation');
                dialog.message = options.message && util.getText(options.message);
                dialog.noText = options.noText || util.getText('No');
                dialog.yesText = options.yesText || util.getText('Yes');
                dialog.showStop = options.showStop || false; // Show stop button
                dialog.action = options.action || null; // Store the action

                // Set color and icon based on message
                if (options.message === null || options.message?.toLowerCase()?.includes('elete')) {
                    dialog.yesColor = 'error';
                    dialog.yesIcon  = 'mdi-delete';
                } else {
                    dialog.yesColor = 'success';
                    dialog.yesIcon  = undefined;
                }
                
                dialog.show = true;
                dialog.resolvePromise = resolve; // Store the resolve function
            });
        }

        async function confirm() { // Make async if action can be async
            if (typeof dialog.action === 'function') {
                await dialog.action(); // Execute the action
            }
            resetDialogState(util.CONFIRM_RESULT.YES);
        }

        function no() {
            resetDialogState(util.CONFIRM_RESULT.NO);      
        }

        function stop() {
            resetDialogState(util.CONFIRM_RESULT.STOP);
        }

        // Reset state after dialog closes
        function resetDialogState(result) {
            // Return the result (true/false) to the promise
            dialog.resolvePromise(result);

            dialog.action = null;
            dialog.resolvePromise = null;
            // And close the dialog
            dialog.show = false;
        }

        // Return reactive state and methods
        return {
            dialog,
            confirm_popup,
            confirm,
            no,
            stop
        };
    },
}
</script>
