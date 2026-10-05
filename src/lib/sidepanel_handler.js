import { googleImageSearchQuery } from './imageSearch.js';

let sidePanelPort = null; // Holds the connection port to the side panel if open
let pendingImageSearchTabId = null;

function openSidePanel(tab) {
    const target = Number.isInteger(tab?.id)
        ? { tabId: tab.id }
        : { windowId: chrome.windows.WINDOW_ID_CURRENT };
    chrome.sidePanel.open(target).catch(error => {
        console.error('Failed to open side panel:', error);
    });
}
function sendImageSearchCapture(tabId) {
    chrome.runtime.sendMessage({
        foreground: true,
        action: 'capture_image_from_search',
        action_params: [tabId],
    }).catch(() => {});
}

function requestImageSearchCapture(tab) {
    const query = googleImageSearchQuery(tab?.url);
    if (!Number.isInteger(tab?.id) || !query) return false;
    if (sidePanelPort) {
        sendImageSearchCapture(tab.id);
    } else {
        pendingImageSearchTabId = tab.id;
        openSidePanel(tab);
    }
    return true;
}

export function isSidePanelOpen() {
    return !!sidePanelPort;
}

// Listener for connections (e.g., from the side panel)
chrome.runtime.onConnect.addListener((port) => {
    if (port.name === 'sidepanel') {
        sidePanelPort = port;
        if (pendingImageSearchTabId !== null) {
            sendImageSearchCapture(pendingImageSearchTabId);
            pendingImageSearchTabId = null;
        }

        // Listener for when the side panel closes
        port.onDisconnect.addListener(() => {
            sidePanelPort = null;
            console.log('Side panel disconnected.'); // Optional: for debugging
            // Handle potential errors during disconnect
            if (chrome.runtime.lastError) {
                console.warn('Side panel disconnect error:', chrome.runtime.lastError.message);
            }
        });
    }
});

// Function to toggle the side panel
function toggleSidePanel(tab) {
    if (sidePanelPort) {
        // Panel is open, send message to close it
        // The side panel should handle closing itself upon receiving this message
        chrome.runtime.sendMessage({
            foreground: true, // Assuming the message needs to go to content/sidepanel scripts
            action: 'close_side_panel',
        });
    } else {
        // Panel is closed, open it
        openSidePanel(tab);
    }
}

// Listener for keyboard shortcuts
chrome.commands.onCommand.addListener((command, tab) => {
    if (command === 'app_side_panel') {
        if (!requestImageSearchCapture(tab)) toggleSidePanel(tab);
    }
});

// Listener for the extension icon click
chrome.action.onClicked.addListener(tab => {
    if (!requestImageSearchCapture(tab)) toggleSidePanel(tab);
});