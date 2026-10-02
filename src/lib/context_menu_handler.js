import { util } from './util.js';
import { getDuolingoCourseLanguage } from "./i18n/translation.js";
import { isSidePanelOpen } from './sidepanel_handler.js';

// --- Context Menu Handler ---
const CONTEXT_MENU_ID = "addWordContextMenu";
const IMAGE_CONTEXT_MENU_ID = "addImageContextMenu";

// Track the current editing word's front text
let currentEditingWordFront = null;

/**
 * Creates or updates the text context menu.
 */
async function create_or_update_context_menu() {
    await util.read_options();
    const course_id = util.options.current_course_id;

    if (!course_id) {
        return;
    }

    if (!currentEditingWordFront) {
        // Remove the image context menu if no valid course
        chrome.contextMenus.remove(IMAGE_CONTEXT_MENU_ID);
    } else {

        const title = util.getText('image_contextMenu', [currentEditingWordFront]);

        chrome.contextMenus.create({
            id: IMAGE_CONTEXT_MENU_ID,
            title: title,
            contexts: ["image"],
            visible: true,
        }, () => {
            if (chrome.runtime.lastError) {
                // If the menu already exists, update it instead
                chrome.contextMenus.update(IMAGE_CONTEXT_MENU_ID, { title: title });
            }
        });
    }

    const title = `+ "${ getDuolingoCourseLanguage(util.get_course_info(course_id).lang_id) ?? util.getText('addNewWord') }`;
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
    // Handle text selection context menu
    let sendMessage = null;
    if (info.menuItemId === CONTEXT_MENU_ID && info.selectionText) {
        const selectedWord = info.selectionText.trim();
        if (!selectedWord) return;

        sendMessage = () => {
            chrome.runtime.sendMessage({
                foreground: true,
                action: 'add_word_from_context',
                action_params: [selectedWord],
            });
        };
    }

    // Handle image context menu
    if (info.menuItemId === IMAGE_CONTEXT_MENU_ID && info.srcUrl) {
        // // Skip if the click is from the image search tab
        // if (tab.id === util.options.imageSearchTabId) {
        //     return;
        // }

        const imageUrl = info.srcUrl;
        if (!imageUrl) return;

        sendMessage = () => {
            chrome.runtime.sendMessage({
                foreground: true,
                action: 'add_image_to_word',
                action_params: [imageUrl],
            });
        };
    }

    if (isSidePanelOpen()) {
        sendMessage();
    } else {
        util.open_side_panel({ active: true, currentWindow: true });
        setTimeout(sendMessage, 800); // Wait for the panel to open
    }
}

if (chrome.contextMenus) {
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
        if (namespace === 'local') {
            // Update image menu if editing word changes
            if (changes.editingWordFront) {
                currentEditingWordFront = changes.editingWordFront.newValue;
            }

            // Update text menu if course changes
            if (changes.editingWordFront || (changes.options?.newValue?.current_course_id !== changes.options?.oldValue?.current_course_id)) {
                create_or_update_context_menu();
            }
        }
    });

    // // Clean up imageSearchTabId when that tab is closed
    // if (chrome.tabs && chrome.tabs.onRemoved) {
    //     chrome.tabs.onRemoved.addListener(async (tabId) => {
    //         await util.read_options();
    //         if (tabId === util.options.imageSearchTabId) {
    //             util.options.imageSearchTabId = null;
    //             await util.save_options({ imageSearchTabId: null });
    //         }
    //     });
    // }
}