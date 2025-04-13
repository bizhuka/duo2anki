import { util } from './util.js'; // Import util for open_side_panel

let sidePanelPort = null; // Holds the connection port to the side panel if open

// Listener for connections (e.g., from the side panel)
chrome.runtime.onConnect.addListener((port) => {
    if (port.name === 'sidepanel') {
        sidePanelPort = port;

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
function toggleSidePanel() {
    if (sidePanelPort) {
        // Panel is open, send message to close it
        // The side panel should handle closing itself upon receiving this message
        chrome.runtime.sendMessage({
            foreground: true, // Assuming the message needs to go to content/sidepanel scripts
            action: 'close_side_panel',
        });
    } else {
        // Panel is closed, open it
        util.open_side_panel({ active: true, currentWindow: true });
    }
}

// Listener for keyboard shortcuts
chrome.commands.onCommand.addListener((command) => {
    if (command === 'duo2anki_side_panel') {
        toggleSidePanel();
    }
});

// Listener for the extension icon click
chrome.action.onClicked.addListener(() => {
    toggleSidePanel();
});