import { util } from './util.js';

const GAMES = [
    { id: 'scard', name: util.getText('flashcards'), url: '/src/games/SCard/index.html' },
    { id: 'sconstructor', name: util.getText('sentenceConstructor'), url: '/src/games/SConstructor/index.html' },
    { id: 'sconstructor_bychar', name: util.getText('wordConstructor'), url: '/src/games/SConstructor/index.html?consMode=byChar' },
    { id: 'sconstructor_frontGame', name: util.getText('constructorFront'), url: '/src/games/SConstructor/index.html?consMode=frontGame' },
    { id: 'sconstructor_backGame', name: util.getText('constructorBack'), url: '/src/games/SConstructor/index.html?consMode=backGame' },
];

export const RANDOM_GAME_NOTIFICATION_ID = 'duo2anki-random-game';

chrome.alarms.onAlarm.addListener((alarm) => {
    if (alarm.name === 'randomGameAlarm') {
        chrome.notifications.create(RANDOM_GAME_NOTIFICATION_ID, {
            type: 'basic',
            iconUrl: 'icon.png',
            title: util.getText('timeToPractice'),
            message: util.getText('clickForRandomGame'),
            priority: 2
        });
    }
});

chrome.notifications.onClicked.addListener((notificationId) => {
    if (notificationId === RANDOM_GAME_NOTIFICATION_ID) {
        const randomGame = GAMES[Math.floor(Math.random() * GAMES.length)];
        if (randomGame) {
            chrome.tabs.create({ url: chrome.runtime.getURL(randomGame.url) });
        }
        chrome.notifications.clear(notificationId);
    }
});