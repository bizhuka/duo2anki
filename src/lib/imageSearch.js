export function googleImageSearchQuery(source) {
    try {
        const url = new URL(source);
        if (url.origin === 'https://www.google.com' && url.pathname === '/search' &&
            (url.searchParams.get('tbm') === 'isch' || url.searchParams.get('udm') === '2')) {
            return url.searchParams.get('q');
        }
    } catch {
        return null;
    }
    return null;
}

export async function readGoogleSearchImage(expectedQuery) {
    const matchesSearch = () => {
        const url = new URL(location.href);
        return url.origin === 'https://www.google.com' && url.pathname === '/search' &&
            (url.searchParams.get('tbm') === 'isch' || url.searchParams.get('udm') === '2') &&
            (!expectedQuery || url.searchParams.get('q') === expectedQuery);
    };
    if (!matchesSearch()) {
        return null;
    }

    const selector = '#search [data-img-wrapper] img, #search a[href*="/imgres"] img';

    const findImage = () => {
        if (!matchesSearch()) return null;
        for (const image of document.querySelectorAll(selector)) {
            const source = image.currentSrc || image.src;
            const bounds = image.getBoundingClientRect();
            if (!image.complete || image.naturalWidth < 40 || image.naturalHeight < 40 ||
                bounds.width < 40 || bounds.height < 40 || !/^(https?:|data:image\/)/i.test(source)) continue;
            if (source.startsWith('data:image/')) return source;
            try {
                const canvas = document.createElement('canvas');
                canvas.width = image.naturalWidth;
                canvas.height = image.naturalHeight;
                canvas.getContext('2d').drawImage(image, 0, 0);
                return canvas.toDataURL('image/png');
            } catch {
                return source;
            }
        }
        return null;
    };

    const initialImage = findImage();
    if (initialImage) return initialImage;
    return await new Promise(resolve => {
        const finish = result => {
            clearTimeout(timeout);
            observer.disconnect();
            document.removeEventListener('load', onChange, true);
            resolve(result);
        };
        const onChange = () => {
            const image = findImage();
            if (image || !matchesSearch()) finish(image);
        };
        const observer = new MutationObserver(onChange);
        const timeout = setTimeout(() => finish(null), 8000);
        observer.observe(document, { childList: true, subtree: true, attributes: true, attributeFilter: ['src', 'srcset'] });
        document.addEventListener('load', onChange, true);
        onChange();
    });
}