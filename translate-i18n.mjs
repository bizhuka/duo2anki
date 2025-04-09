import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import { v2 } from '@google-cloud/translate';

const { Translate } = v2;

// --- Configuration ---
const API_KEY = 'AIzaSyDE_BnVJZab5iizQoYLmayOMYT-QdqnPTo'; // Your Google Cloud API Key
const SOURCE_LANG = 'en';
const I18N_DIR = 'src/lib/i18n';
const EXCLUDE_FILES = ['en.js', 'translation.js'];
// --- End Configuration ---

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const i18nPath = path.join(__dirname, I18N_DIR);

// Instantiate the client
const translate = new Translate({ key: API_KEY });

// Helper function to parse the JS object from file content
// This is a simplified parser assuming the structure `export default { ... };`
function parseTranslations(content) {
    try {
        // Remove export default and trailing semicolon/comma
        const jsonString = content
            .replace(/^export default\s*/, '')
            .replace(/;\s*$/, '')
            .replace(/,\s*};?\s*$/, '}'); // Handle potential trailing comma before closing brace

        // Use Function constructor for potentially more robust parsing than JSON.parse
        // as it can handle keys without quotes and trailing commas (though we try to remove them)
        // WARNING: This is generally unsafe if the file content isn't trusted.
        // In this specific case, we trust our own i18n files.
        return new Function(`return ${jsonString}`)();
    } catch (error) {
        console.error(`Error parsing content: ${error.message}`);
        console.error("Problematic content snippet:", content.substring(0, 200));
        throw error; // Re-throw to stop execution
    }
}

// Helper function to format the object back into JS file content
function formatTranslations(obj) {
    // Convert object to a nicely formatted JSON string
    const jsonString = JSON.stringify(obj, null, 4);
    // Wrap it back in the export default structure
    return `export default ${jsonString};\n`;
}

async function translateFile(filePath, sourceTranslations) {
    const targetLang = path.basename(filePath, '.js');
    console.log(`\n--- Translating ${filePath} to ${targetLang.toUpperCase()} ---`);

    try {
        const targetContent = await fs.readFile(filePath, 'utf-8');
        const existingTargetTranslations = parseTranslations(targetContent); // Parse existing to potentially preserve untranslated keys if needed, though we overwrite based on source.

        const sourceKeys = Object.keys(sourceTranslations);
        const sourceValues = Object.values(sourceTranslations);

        if (sourceValues.length === 0) {
            console.log(`No strings found in source file for ${targetLang}. Skipping.`);
            return;
        }

        console.log(`Requesting translation for ${sourceValues.length} strings...`);
        // Translate the source values using an options object
        let [translations] = await translate.translate(sourceValues, {
            from: SOURCE_LANG,
            to: targetLang
        });
        console.log(`Received ${translations.length} translations.`);

        if (translations.length !== sourceKeys.length) {
            console.error(`Mismatch in translation count for ${targetLang}. Expected ${sourceKeys.length}, got ${translations.length}. Skipping file.`);
            return;
        }

        // Build the new translated object
        const newTranslations = {};
        sourceKeys.forEach((key, index) => {
            // Basic check to retain placeholders like {0}, {1} etc.
            // Google Translate sometimes adds spaces around them.
            const originalValue = sourceValues[index];
            let translatedValue = translations[index];

            const placeholders = originalValue.match(/{\d+}/g);
            if (placeholders) {
                placeholders.forEach(placeholder => {
                    const regex = new RegExp(`{\\s*${placeholder.substring(1, placeholder.length - 1)}\\s*}`, 'g');
                    translatedValue = translatedValue.replace(regex, placeholder);
                });
            }
             // Preserve HTML tags - Google Translate usually handles this well, but as a fallback:
             // This is a very basic attempt and might not cover all cases perfectly.
             const htmlTags = originalValue.match(/<[^>]+>/g);
             if (htmlTags) {
                 const translatedTags = translatedValue.match(/<[^>]+>/g) || [];
                 // If tag count differs significantly, log a warning
                 if (Math.abs(htmlTags.length - translatedTags.length) > 1) {
                    console.warn(`Potential HTML tag mismatch for key "${key}" in ${targetLang}:`);
                    console.warn(`  Original: ${originalValue}`);
                    console.warn(`  Translated: ${translatedValue}`);
                 }
                 // Attempt to restore original tags if simple replacement occurred (e.g., < strong > to <strong>)
                 htmlTags.forEach(tag => {
                    const simplifiedTag = tag.replace(/\s+/g, '');
                    const regex = new RegExp(simplifiedTag.replace(/</g, '<\\s*').replace(/>/g, '\\s*>'), 'gi');
                    translatedValue = translatedValue.replace(regex, tag);
                 });

             }


            newTranslations[key] = translatedValue;
            // console.log(`  ${key}: "${sourceValues[index]}" -> "${translatedValue}"`); // Log individual translations if needed
        });

        // Format and write back to the file
        const newContent = formatTranslations(newTranslations);
        await fs.writeFile(filePath, newContent, 'utf-8');
        console.log(`Successfully updated ${filePath}`);

    } catch (error) {
        console.error(`Failed to process ${filePath}: ${error}`);
        if (error.response) {
            console.error('API Response Error:', JSON.stringify(error.response.data, null, 2));
        }
    }
}

async function main() {
    console.log('Starting translation process...');
    try {
        // Read source English file
        const sourceFilePath = path.join(i18nPath, `${SOURCE_LANG}.js`);
        const sourceContent = await fs.readFile(sourceFilePath, 'utf-8');
        const sourceTranslations = parseTranslations(sourceContent);
        console.log(`Loaded ${Object.keys(sourceTranslations).length} keys from ${SOURCE_LANG}.js`);

        // List files in the i18n directory
        const files = await fs.readdir(i18nPath);
        const targetFiles = files.filter(file =>
            file.endsWith('.js') && !EXCLUDE_FILES.includes(file)
        );

        console.log(`Found target files: ${targetFiles.join(', ')}`);

        // Process each target file
        for (const file of targetFiles) {
            const filePath = path.join(i18nPath, file);
            await translateFile(filePath, sourceTranslations);
            // Add a longer delay to avoid hitting API rate limits if any
            console.log('Waiting 1 second before next file...');
            await new Promise(resolve => setTimeout(resolve, 1000));
        }

        console.log('\nTranslation process finished.');

    } catch (error) {
        console.error('An error occurred during the translation process:', error);
    }
}

main();
