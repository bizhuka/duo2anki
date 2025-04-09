// import Dexie from '../lib/dexie.min.mjs';
import Dexie from "dexie";

class DbProxy extends Dexie {
  constructor() {
    super("duo2AnkiDB");

    this.version(1).stores({
      words: "++id, course_id, front, back, [course_id+front], date, context",
      // TODO courses: '++id, fromLanguage, toLanguage, name',
    });

    this.words = this.table("words");
  }

  _addLineBreaks(text) {
    if(!text) return '';
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
}

export { DbProxy };
