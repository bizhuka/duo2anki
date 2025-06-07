"use strict";

import { util } from './util.js';
import Dexie from "dexie";


// --- New SM2-like Algorithm Constants & Enums ---
const STATUS = {
  LEARNING: 0,
  LEARNED: 1,
  RELEARNING: 2,
};

// "New Cards" tab
const NEW_STEPS = [15, 1440, 8640] // [1, 10]; // in minutes
const GRADUATING_INTERVAL = 3; // 1; // in days
const EASY_INTERVAL = 6; // 4; // in days
const STARTING_EASE = 250; // in percent (becomes 2.5)

// "Reviews" tab
const EASY_BONUS = 130; // in percent
const INTERVAL_MODIFIER = 100; // in percent
const MAXIMUM_INTERVAL = 36500; // in days

// "Lapses" tab
const LAPSES_STEPS = [10, 1440, 4320]; // in minutes  (Test  [ 10 ])
const MINIMUM_INTERVAL = 1; // in days (for lapsed cards)
const NEW_INTERVAL = 70; // in percent (for lapsed cards)

const MIN_EF = 1.3; // Minimum E-Factor (SuperMemo's is 1.3)

// Constants for time calculations
const MINUTES_IN_HOUR = 60;
const MINUTES_IN_DAY = 24 * MINUTES_IN_HOUR;

class DbProxy extends Dexie {
  constructor() {
    super("duo2AnkiDB");

    this.version(2).stores({
      words: // Initial schema for words table
             "++id, course_id, front, back, [course_id+front], date, context" +
             // version 2 adds new fields for scheduling
             ", next_review, last_reviewed, interval, ease_factor, steps_index, status, [course_id+next_review], [course_id+status]"
    }).upgrade(tx => {
      return tx.table('words').toCollection().modify(word => {
        this._set_dafaults(word); // Set defaults for existing words
      });
    });

    this.words = this.table("words");
  }

  _set_dafaults(word) { 
    word.status = word.status || STATUS.LEARNING;
    word.ease_factor = word.ease_factor || ( STARTING_EASE / 100 );
    word.interval = word.interval || 0;
    word.steps_index = word.steps_index || 0;
    word.next_review = word.next_review || null;
    word.last_reviewed = word.last_reviewed || null;
  }

  _addLineBreaks(text) {
    if (!text) return '';
    return text.replace(/→/g, "→<br>").replace(/\./g, ".<br>");
  }

  // Add words to the database, skipping duplicates based on [course_id+front]
  async addWords(words) {
    if (!words || words.length === 0) {
      return 0; // No words to add
    }

    // Fetch existing words for these courses to check for duplicates
    const existingWords = await this.select(words[0].course_id);
    const existingKeysSet = new Set(
      existingWords.map((w) => `${w.course_id}_${w.front}`)
    );

    const baseTimestamp = new Date().getTime();

    // Use reduce to filter and map in a single pass
    const wordsToAdd = words.reduce((acc, word, index) => {
      if (!existingKeysSet.has(`${word.course_id}_${word.front}`)) {
        this._set_dafaults(word); // Set defaults if not already set
        acc.push({
          ...word,
          context: this._addLineBreaks(word.context),
          // Use a decreasing timestamp based on the original array index to maintain relative order
          date: new Date(baseTimestamp - index),
        });
      }
      return acc;
    }, []); // Initialize accumulator as an empty array

    if (wordsToAdd.length > 0) {
      await this.words.bulkAdd(wordsToAdd);
    }

    return wordsToAdd.length; // Return the count of actually added words
  }

  async select(course_id) {
    const words = await this.words
      .where("course_id")
      .equals(course_id)
      .reverse()
      .sortBy("date");
    return words;
  }

  async deleteWord(item) {
    return await this.words.delete(item.id);
  }

  async clearWords() {
    return await this.words.clear();
  }

  async updateWord(item) {
    // await this.words.update(item.id, { ...item });
    await this.deleteWord(item);
    await this.words.add({
      ...item,
      context: this._addLineBreaks(item.context),
    });
  }

  async updateWordsContext(wordsToProcess) {
    for (const word of wordsToProcess) {
      await this.updateWord(word);
    }
  }

  async getCardsForReview() {
    const count = 30;

    const now = new Date();
    let resultCards = [];
    let remainingCount = count;
    const course_id = util.options.current_course_id;
    const contextFilter = card => card.context && card.context.indexOf('→') > 0;

    // Part 1: New cards (status === LEARNING and next_review is null or past)
    // Sorted by their original creation date to ensure older new cards are shown first.
    if (remainingCount > 0) {
      let newCardCandidates = await this.words
        .where({ course_id: course_id, status: STATUS.LEARNING })
        // Also ensure steps_index is 0 for truly new cards, or that next_review is null/past for learning cards that might have a step.
        // The primary filter is LEARNING.
        // The original logic also checked for next_review being null or past, which is good for cards that might have been manually reset or imported.
        .and(card => (!card.next_review || card.next_review <= now) && contextFilter(card))
        .sortBy("date"); // Oldest first

      const newCardsToAdd = newCardCandidates.slice(0, remainingCount);
      resultCards.push(...newCardsToAdd);
      remainingCount -= newCardsToAdd.length;
    }
    console.log(`LEARNING ${resultCards.length} new cards for course ${course_id}.`);

    // Part 2: Due cards (status === LEARNED or RELEARNING and next_review <= now)
    // Sorted by next_review date (earliest due first).
    if (remainingCount > 0) {
      const dueCardCandidates = await this.words
        .where('[course_id+next_review]')
        .between([course_id, Dexie.minKey], [course_id, now], true, true) // inclusive start and end
        // Ensure these are not "new" cards already picked up by checking status.
        .and(card => (card.status === STATUS.LEARNED || card.status === STATUS.RELEARNING) && contextFilter(card))
        .sortBy('next_review'); // Dexie sorts by index if .between is on an index. Explicit sortBy is fine.

        console.log(`LEARNED ${dueCardCandidates.length} due cards for course ${course_id}.`);

      let uniqueDueCardsToAdd = [];
      for (const card of dueCardCandidates) {
        // Ensure card wasn't already added in the "new" phase if criteria somehow overlapped
        // (e.g. a card with reps=0 but a past next_review date)
        if (!resultCards.some(rc => rc.id === card.id)) {
            uniqueDueCardsToAdd.push(card);
        }
        if (uniqueDueCardsToAdd.length >= remainingCount) break;
      }
      resultCards.push(...uniqueDueCardsToAdd);
    }

    // Add schedule_results to each card
    const reviewResponses = ["again", "hard", "good", "easy"];
    for (const card of resultCards) {
      card.schedule_results = {};
      for (const response of reviewResponses) {
        const cardCopy = { ...card };

        const intervalInMinutes = this.schedule(cardCopy, response);
        if (intervalInMinutes !== null && typeof intervalInMinutes !== 'undefined') {
          // if(card.status === STATUS.LEARNED) {
          //   console.log(`Card ${card.id} with status LEARNED has interval ${intervalInMinutes} minutes for response "${response}".`);
          // }
          card.schedule_results[response] = this._formatIntervalDisplay(intervalInMinutes);
        }
      }
    }

    console.log(resultCards);
    return resultCards;
  }

  async processReview(cardId, responseString) { // responseString is "again", "hard", "good", or "easy"
    const dbCard = await this.words.get(cardId);

    if (!dbCard) {
      console.error(`DbProxy: Card with id ${cardId} not found for processReview.`);
      return null;
    }

    // The schedule function will modify dbCard's status, ease_factor, steps_index directly.
    // It will return the calculated interval *duration* in days, or null if no update should occur.
    const nextIntervalDurationInMinutes = this.schedule(dbCard, responseString);

    if (nextIntervalDurationInMinutes === null || typeof nextIntervalDurationInMinutes === 'undefined') {
      // An invalid responseString for the card's status was likely given, or another error in schedule.
      // schedule() should have logged the error. No update to card.
      console.log(`DbProxy: Review for card ${cardId} with response "${responseString}" resulted in no change.`);
      return dbCard; // Return the card unmodified
    }

    // dbCard.interval is already updated by the schedule function to the base interval.
    dbCard.last_reviewed = new Date();
    // nextIntervalDurationInMinutes is the duration until the next review. Convert to milliseconds.
    const next_review_offset_ms = nextIntervalDurationInMinutes * 60 * 1000; // Convert minutes to milliseconds
    dbCard.next_review = new Date(dbCard.last_reviewed.getTime() + next_review_offset_ms);

    await this.updateWord(dbCard); // dbCard now has updated status, ef, steps_index, interval (in minutes), next_review
    // console.log(`Processed review for card ${cardId}, response ${responseString}, new interval ${dbCard.interval} minutes, next review ${dbCard.next_review}`);
    return dbCard;
  }

  _formatIntervalDisplay(totalMinutes) {
    if (totalMinutes <= 0) {
      return "0m";
    }
    let result = [];

    const days = Math.floor(totalMinutes / MINUTES_IN_DAY);
    totalMinutes %= MINUTES_IN_DAY; // Remaining minutes after extracting days

    const hours = Math.floor(totalMinutes / MINUTES_IN_HOUR);
    totalMinutes %= MINUTES_IN_HOUR; // Remaining minutes after extracting hours

    const minutes = Math.round(totalMinutes); // Remaining minutes are just minutes

    if (days > 0) {
      result.push(`${days}d`);
    }
    if (hours > 0) {
      result.push(`${hours}h`);
    }
    if (minutes > 0 || result.length === 0) { // Always show minutes if nothing else, or if there are minutes
      result.push(`${minutes}m`);
    }

    return result.join(" ");
  }

  // New SM2-like Algorithm implementation
  // Modifies the card object directly for status, ease_factor, steps_index.
  // Returns the next interval duration in MINUTES, or null if an invalid response for the status is given.
  schedule(card, response) { // card is the dbCard object, response is "again", "hard", "good", "easy"
    // Ensure essential fields are initialized if they somehow weren't (defensive)
    card.status = typeof card.status === 'number' ? card.status : STATUS.LEARNING;
    card.steps_index = typeof card.steps_index === 'number' ? card.steps_index : 0;
    card.ease_factor = typeof card.ease_factor === 'number' ? card.ease_factor : (STARTING_EASE / 100);
    // card.interval is expected to be in minutes if it's already set.
    // Initialize to 0 minutes if not set.
    card.interval = typeof card.interval === 'number' ? card.interval : 0;

    switch (Number(card.status)) {
      case STATUS.LEARNING: // Renamed from STATUS.LEARNING for clarity with initial state
        switch (response) {
          case "again":
            card.steps_index = 0;
            return NEW_STEPS[card.steps_index]; // NEW_STEPS is in minutes
          case "good":
            card.steps_index += 1;
            if (card.steps_index < NEW_STEPS.length) {
              return NEW_STEPS[card.steps_index]; // NEW_STEPS is in minutes
            } else {
              card.status = STATUS.LEARNED;
              card.interval = GRADUATING_INTERVAL * MINUTES_IN_DAY; // Convert days to minutes
              return card.interval;
            }
          case "easy":
            card.status = STATUS.LEARNED;
            card.interval = EASY_INTERVAL * MINUTES_IN_DAY; // Convert days to minutes
            return card.interval;
          case "hard": // Invalid for learning
            // console.error(`DbProxy.schedule: Invalid response "hard" for card status "learning" (id: ${card.id})`);
            return null; // Indicates no change
          default:
            console.error(`DbProxy.schedule: Unknown response "${response}" for learning card (id: ${card.id})`);
            return null;
        }

      case STATUS.LEARNED:
        // Ensure card.interval is treated as minutes for these calculations
        let currentIntervalInMinutes = card.interval; // Should already be in minutes

        switch (response) {
          case "again":
            card.status = STATUS.RELEARNING;
            card.steps_index = 0;
            card.ease_factor = Math.max(MIN_EF, card.ease_factor - 0.20);
            card.interval = Math.max(MINIMUM_INTERVAL * MINUTES_IN_DAY, (currentIntervalInMinutes * NEW_INTERVAL / 100));
            return LAPSES_STEPS[0]; // LAPSES_STEPS is in minutes
          case "hard":
            card.ease_factor = Math.max(MIN_EF, card.ease_factor - 0.15);
            card.interval = currentIntervalInMinutes * 1.2 * (INTERVAL_MODIFIER / 100) * MINUTES_IN_DAY;
            return Math.min(MAXIMUM_INTERVAL * MINUTES_IN_DAY, card.interval);
          case "good":
            card.interval = currentIntervalInMinutes * card.ease_factor * (INTERVAL_MODIFIER / 100)  * MINUTES_IN_DAY;
            return Math.min(MAXIMUM_INTERVAL * MINUTES_IN_DAY, card.interval);
          case "easy":
            card.ease_factor += 0.15;
            card.interval = currentIntervalInMinutes * card.ease_factor * (INTERVAL_MODIFIER / 100) * (EASY_BONUS / 100) * MINUTES_IN_DAY;
            return Math.min(MAXIMUM_INTERVAL * MINUTES_IN_DAY, card.interval);
          default:
            console.error(`DbProxy.schedule: Unknown response "${response}" for learned card (id: ${card.id})`);
            return null;
        }

      case STATUS.RELEARNING:
        switch (response) {
          case "again":
            card.steps_index = 0;
            return LAPSES_STEPS[0]; // LAPSES_STEPS is in minutes
          case "good":
            card.steps_index += 1;
            if (card.steps_index < LAPSES_STEPS.length) {
              return LAPSES_STEPS[card.steps_index]; // LAPSES_STEPS is in minutes
            } else {
              card.status = STATUS.LEARNED;
              // Interval (card.interval, in minutes) is not modified here as per Python comments; it was set when lapsed.
              return card.interval;
            }
          case "hard": // Invalid for relearning
          case "easy": // Invalid for relearning
            // console.error(`DbProxy.schedule: Invalid response "${response}" for card status "relearning" (id: ${card.id})`);
            return null;
          default:
            console.error(`DbProxy.schedule: Unknown response "${response}" for relearning card (id: ${card.id})`);
            return null;
        }
      default:
        console.error(`DbProxy.schedule: Unknown card status "${card.status}" (id: ${card.id})`);
        return null;
    }
  }
}

export { DbProxy };
