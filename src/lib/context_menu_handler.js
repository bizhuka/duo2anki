import { util } from './util.js';
import { getDuolingoCourseLanguage } from "./i18n/translation.js";
import { isSidePanelOpen } from './sidepanel_handler.js';

// --- Context Menu Handler ---
const CONTEXT_MENU_ID = "addWordContextMenu";

/**
 * Creates or updates the context menu.
 */
async function create_or_update_context_menu() {
    await util.read_options();
    const course_id = util.options.current_course_id;

    let title;
    if (course_id) {
        const course_info = util.get_course_info(course_id);
        const course_name = getDuolingoCourseLanguage(course_info.lang_id);
        title = `+ "${course_name}"`;
    } else {
        title = `+ ${ util.getText('addNewWord') }`;
    }

    chrome.contextMenus.create({
        id: CONTEXT_MENU_ID,
        title: title,
        contexts: ["selection"],
        visible: true,
    }, () => {
        if (chrome.runtime.lastError) {
            // If the menu already exists, update it instead
            chrome.contextMenus.update(CONTEXT_MENU_ID, { title: title });
        }
    });
}

/**
 * Handles the click event from the context menu.
 * @param {object} info - The click event information.
 * @param {object} tab - The tab where the click occurred.
 */
function handle_context_menu_click(info, tab) {
    if (info.menuItemId === CONTEXT_MENU_ID && info.selectionText) {
        const selectedWord = info.selectionText.trim();
        if (!selectedWord) return;

        const sendMessage = () => {
            chrome.runtime.sendMessage({
                foreground: true,
                action: 'add_word_from_context',
                action_params: [selectedWord],
            });
        };

        if (isSidePanelOpen()) {
            sendMessage();
        } else {
            util.open_side_panel({ active: true, currentWindow: true });
            setTimeout(sendMessage, 800); // Wait for the panel to open
        }
    }
}

// --- Initialization ---
// Add the click listener when the module is loaded.
chrome.contextMenus.onClicked.addListener(handle_context_menu_click);

// --- Initialization ---
// Create the menu when the extension is installed or updated
chrome.runtime.onInstalled.addListener(create_or_update_context_menu);
// Create the menu when the browser starts
chrome.runtime.onStartup.addListener(create_or_update_context_menu);
// Update the menu when the course changes
chrome.storage.onChanged.addListener((changes, namespace) => {
    if (namespace === 'local' && changes.options?.newValue?.current_course_id !== changes.options?.oldValue?.current_course_id) {
        create_or_update_context_menu();
    }
});