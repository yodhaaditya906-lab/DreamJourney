// In-memory cache helper for Google Sheets CSV exports
const csvCache: Record<string, { data: string; timestamp: number }> = {};

export async function fetchCachedCSV(url: string, ttlMs = 120000): Promise<string> {
    const now = Date.now();
    if (csvCache[url] && (now - csvCache[url].timestamp < ttlMs)) {
        return csvCache[url].data;
    }
    try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 3000);
        
        const response = await fetch(url, { signal: controller.signal });
        clearTimeout(timeoutId);

        const csvText = await response.text();
        if (csvText && csvText.trim().length > 0) {
            csvCache[url] = { data: csvText, timestamp: now };
            return csvText;
        }
    } catch (err) {
        console.warn("CSV Fetch timeout/cache fallback:", err);
        if (csvCache[url]) return csvCache[url].data;
    }
    return csvCache[url]?.data || "";
}
