
export async function process_with_gpt4mini(wordsToProcess, optionsData, isLocal) {
    const translateUrl = isLocal ? 'http://localhost:3000/translate' : 'https://duo2anki.fly.dev/translate'
    // const translateUrl = 'https://duo2anki.fly.dev/translate'

    async function call_api(prompt) {
        const response = await fetch(translateUrl, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({ prompt }),
        });

        if (!response.ok) {
            const errorData = await response.json().catch(() => null); // Try to parse error response
            const errorMessage = errorData?.error || `API call failed with status: ${response.status}`;
            console.error(errorMessage);
            throw new Error(errorMessage);
        }

        return await response.json();
    }

    const prompt_prefix = optionsData.prompt_prefix.trim();
    if (!prompt_prefix) return null;

    const formattedWords = wordsToProcess
        .map(word => `${word.id} - ${word.front}`)
        .join('\n');

    const fullContextText = `${prompt_prefix}\n\n${formattedWords}`;

    const apiResult = await call_api(fullContextText);

    return apiResult && apiResult.results ? apiResult.results : null;
}