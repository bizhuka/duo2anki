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

            MessageHandler.instance.initialization = (async () => {
                await util.read_options();
            })();
        }
        await MessageHandler.instance.initialization;
        return MessageHandler.instance;
    }

    async set_course_id(course_id, tabId) {
        if (tabId < 0 || !Number.isInteger(tabId) || !util.get_course_info(course_id).targetLang) return;
        this.tabCourses ??= new Map();
        if (this.tabCourses.get(tabId)?.course_id !== course_id) {
            this.tabCourses.set(tabId, { course_id });
        }
        for (const waiter of this.courseWaiters || []) {
            if (waiter.tabId === tabId) waiter.resolve();
        }
    }

    async wait_for_course(tabId) {
        if (this.tabCourses?.has(tabId)) return this.tabCourses.get(tabId);
        await new Promise((resolve, reject) => {
            this.courseWaiters ??= new Set();
            const waiter = { tabId, resolve: null };
            const onReady = () => {
                clearTimeout(timeout);
                this.courseWaiters.delete(waiter);
                resolve();
            };
            const timeout = setTimeout(() => {
                this.courseWaiters.delete(waiter);
                reject(new Error('Could not verify the Duolingo course in this tab. No words were imported. Please reload the Words page and try again.'));
            }, 30000);
            waiter.resolve = onReady;
            this.courseWaiters.add(waiter);
        });
        return this.tabCourses.get(tabId);
    }

    async extract_vocabulary(tabId) {
        // Reload so the course request and vocabulary belong to the same fresh page.
        this.tabCourses?.delete(tabId);
        await chrome.tabs.reload(tabId);
        await this.wait_for_words_page(tabId);
        const course = await this.wait_for_course(tabId);
        const { course_id } = course;

        // Inject the content script into the Duolingo vocabulary page
        const results = await chrome.scripting.executeScript({
            target: { tabId },
            func: getDuolingoVocabulary,
            args: [], // No arguments needed for the function
        });

        if (!results || !results[0] || !results[0].result || !Array.isArray(results[0].result)) {
            throw new Error(util.getText("bg_invalidVocabData"), results);
        }
        if (this.tabCourses.get(tabId) !== course) {
            throw new Error('The Duolingo course changed during import. Please try again.');
        }
        const vocabularyWithSound = results[0].result;
        this.pasteCalculatedFields(vocabularyWithSound, course_id);

        // Send a message  to update the progress bar
        const saved = await chrome.runtime.sendMessage({
            foreground: true,
            action: 'words_loaded',
            action_params: [vocabularyWithSound],
        });
        if (saved?.error) throw new Error(saved.error);
    }

    async wait_for_words_page(tabId) {
        await new Promise((resolve, reject) => {
            let settled = false;
            const finish = (error) => {
                if (settled) return;
                settled = true;
                clearTimeout(timeout);
                chrome.tabs.onUpdated.removeListener(onUpdated);
                if (error) reject(error);
                else resolve();
            };
            const onUpdated = (updatedTabId, changeInfo) => {
                if (updatedTabId === tabId && changeInfo.status === 'complete') finish();
            };
            const timeout = setTimeout(() => {
                finish(new Error('The Duolingo page did not finish loading. Please try again.'));
            }, 30000);
            chrome.tabs.onUpdated.addListener(onUpdated);
            chrome.tabs.get(tabId).then(tab => {
                if (tab.status === 'complete') finish();
            }, finish);
        });

        const results = await chrome.scripting.executeScript({
            target: { tabId },
            func: async () => {
                const isReady = () => [...document.querySelectorAll('section')].some(section => {
                    const item = section.querySelector('ul > li');
                    return item?.querySelector('h3') && item?.querySelector('p');
                });
                if (isReady()) return true;
                return await new Promise(resolve => {
                    const finish = (result) => {
                        clearTimeout(timeout);
                        observer.disconnect();
                        resolve(result);
                    };
                    const observer = new MutationObserver(() => {
                        if (isReady()) finish(true);
                    });
                    const timeout = setTimeout(() => {
                        finish({ error: 'The Duolingo word list did not finish loading. Sign in on the Words page and try again.' });
                    }, 30000);
                    observer.observe(document, { childList: true, subtree: true });
                    if (isReady()) finish(true);
                });
            },
        });
        const result = results?.[0]?.result;
        if (result !== true) {
            throw new Error(result?.error || 'The Duolingo word list is not ready. Please try again.');
        }
    }

    pasteCalculatedFields(vocabularyRaw, course_id) {
        const { targetLang, sourceLang } = util.get_course_info(course_id);
        for (const item of vocabularyRaw) {
            item.course_id = course_id;
            item.targetLang = targetLang;
            item.sourceLang = sourceLang;
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
    if (!Number.isInteger(details.tabId) || details.tabId < 0) return;
    // Updated regex to capture target and optional source language codes separately
    const match = details.url.match(/courses\/DUOLINGO_([^/?]*)\?/);
    if (match && match[1]) {
        const course_id = match[1].toLowerCase();
        if (!course_id) {
            return;
        }

        const handlerInstance = await MessageHandler.get_instance();
        await handlerInstance.set_course_id(course_id, details.tabId);
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
