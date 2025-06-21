import { util } from './lib/util.js'
import { getDuolingoVocabulary } from './lib/duolingo_loader.js';
import './lib/sidepanel_handler.js'; // Handles side panel connection and toggling
import './lib/context_menu_handler.js';
import { RANDOM_GAME_NOTIFICATION_ID } from './lib/notification_handler.js';

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (!message.background)
        return;
    // Use the updated util.callMethod that handles async calls and sendResponse
    MessageHandler.get_instance()
        .then(instance => {
            util.callMethod(instance, message, sendResponse);
        });

    return true; // This keeps the message port open
});

class MessageHandler {
    static async get_instance() {
        if (!MessageHandler.instance) {
            MessageHandler.instance = new MessageHandler();

            // Load options and set course_id
            await util.read_options();
            MessageHandler.instance.set_course_id(util.options.current_course_id);
        }
        return MessageHandler.instance;
    }

    async set_course_id(course_id) {
        const course_info = util.get_course_info(course_id);

        this.course_id = course_id;
        this.targetLang = course_info.targetLang;
        this.sourceLang = course_info.sourceLang;
    }

    async extract_vocabulary(tabId) {
        // Ensure targetLang is available before executing the script
        if (!this.targetLang) {
            throw new Error(util.getText("bg_targetLangMissing"));
        }

        // Inject the content script into the Duolingo vocabulary page
        const results = await chrome.scripting.executeScript({
            target: { tabId },
            func: getDuolingoVocabulary,
            args: [], // No arguments needed for the function
        });

        if (!results || !results[0] || !results[0].result || !Array.isArray(results[0].result)) {
            throw new Error(util.getText("bg_invalidVocabData"), results);
        }
        const vocabularyWithSound = results[0].result;
        this.pasteCalculatedFields(vocabularyWithSound);

        // Send a message  to update the progress bar
        chrome.runtime.sendMessage({
            foreground: true,
            action: 'words_loaded',
            action_params: [vocabularyWithSound],
        });
    }

    pasteCalculatedFields(vocabularyRaw) {
        for (const item of vocabularyRaw) {
            item.course_id = this.course_id;
            item.targetLang = this.targetLang;
            item.sourceLang = this.sourceLang;
        }
    }

    async setupGameAlarm() {
        const interval = util.options.gameNotificationInterval;

        chrome.alarms.clear('randomGameAlarm');

        if (interval > 0) {
            chrome.alarms.create('randomGameAlarm', {
                delayInMinutes: 1, // For testing, show first notification after 1 minute
                periodInMinutes: interval
            });
        } else {
            chrome.notifications.clear(RANDOM_GAME_NOTIFICATION_ID);
        }
    }
}

chrome.webRequest.onBeforeRequest.addListener(async (details) => {
    // Updated regex to capture target and optional source language codes separately
    const match = details.url.match(/courses\/DUOLINGO_([^/?]*)\?/);
    if (match && match[1]) {
        const course_id = match[1].toLowerCase();
        if(!course_id){
            return
        }

        const handlerInstance = await MessageHandler.get_instance();
        handlerInstance.set_course_id(course_id);
        await util.save_options({ current_course_id: course_id });

        chrome.runtime.sendMessage({
            foreground: true,
            action: 'set_new_course_id',
            action_params: [course_id],
        });
    }
},
    {
        urls: ["https://www.duolingo.com/*/courses/DUOLINGO_*"]
    }
);