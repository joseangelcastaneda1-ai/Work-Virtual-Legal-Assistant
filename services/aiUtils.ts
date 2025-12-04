export function normalizeName(value: string): string {
  return (value || '')
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
    .toLowerCase();
}

export function normalizeDateToYmd(value: string): string {
  if (!value) return '';
  const tryIso = Date.parse(value);
  if (!isNaN(tryIso)) {
    const d = new Date(tryIso);
    const y = d.getUTCFullYear();
    const m = String(d.getUTCMonth() + 1).padStart(2, '0');
    const day = String(d.getUTCDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
  }
  const mdy = value.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{2,4})$/);
  if (mdy) {
    const [, m, d, y] = mdy;
    const year = y.length === 2 ? `20${y}` : y;
    return `${year}-${m.padStart(2, '0')}-${d.padStart(2, '0')}`;
  }
  return value.trim();
}

export function normalizeAddress(value: string): string {
  return (value || '')
    .replace(/[.,]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

export function textIncludesExact(haystack: string, needle: string): boolean {
  if (!needle) return false;
  return haystack.includes(needle);
}

export async function withSchemaRetry<T>(fn: () => Promise<string>, validate: (json: any) => boolean, maxRetries = 2): Promise<T> {
  let lastErr: any;
  for (let i = 0; i <= maxRetries; i++) {
    try {
      const raw = await fn();
      const parsed = JSON.parse(raw);
      if (validate(parsed)) return parsed as T;
      lastErr = new Error('Schema validation failed');
    } catch (e) {
      lastErr = e;
    }
  }
  throw lastErr;
}

/**
 * Retry a function with exponential backoff for rate limit errors (429)
 * @param fn The async function to retry
 * @param maxRetries Maximum number of retries (default: 3)
 * @param baseDelay Base delay in milliseconds (default: 1000)
 * @returns The result of the function
 */
export async function withRateLimitRetry<T>(
  fn: () => Promise<T>,
  maxRetries = 3,
  baseDelay = 1000
): Promise<T> {
  let lastError: any;
  
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await fn();
    } catch (error: any) {
      lastError = error;
      
      // Check if it's a rate limit error (429)
      const errorMessage = error?.message || '';
      const errorCode = error?.error?.code || error?.code || '';
      const errorStatus = error?.error?.status || error?.status || '';
      
      const isRateLimit = 
        errorCode === 429 ||
        errorStatus === 'RESOURCE_EXHAUSTED' ||
        errorMessage.includes('429') ||
        errorMessage.includes('Resource has been exhausted') ||
        errorMessage.includes('quota') ||
        errorMessage.includes('rate limit');
      
      if (isRateLimit && attempt < maxRetries) {
        // Exponential backoff: 1s, 2s, 4s, etc.
        const delay = baseDelay * Math.pow(2, attempt);
        console.warn(`Rate limit hit (attempt ${attempt + 1}/${maxRetries + 1}). Retrying in ${delay}ms...`);
        await new Promise(resolve => setTimeout(resolve, delay));
        continue;
      }
      
      // If not a rate limit error or we've exhausted retries, throw
      throw error;
    }
  }
  
  throw lastError;
}

export type PreclassResult = {
  hintedType?: string;
  hintedTab?: 'A' | 'B' | 'C' | 'D' | 'E';
  hints: string[];
};

export function preClassifyEvidence(fileName: string, fileText: string): PreclassResult {
  const lowerName = (fileName || '').toLowerCase();
  const lowerText = (fileText || '').toLowerCase();
  const hints: string[] = [];
  let hintedType: string | undefined;
  let hintedTab: 'A' | 'B' | 'C' | 'D' | 'E' | undefined;

  // passports vs consular ID
  if (/(passport|pasaporte)/.test(lowerName) || /(passport|pasaporte)/.test(lowerText)) {
    hintedType = 'passport';
    hints.push('passport keyword');
  }
  if (/(consular|matr[íi]cula)/.test(lowerName) || /(consular|matr[íi]cula)/.test(lowerText)) {
    hintedType = 'consular_identification';
    hints.push('consular id keyword');
  }

  // FBI / police background
  if (/fbi/.test(lowerName) || /federal bureau of investigation/.test(lowerText)) {
    hintedType = 'fbi_background';
    hintedTab = 'D';
    hints.push('fbi background');
  }
  if (/(police|criminal background|clearance)/.test(lowerName) || /(police|criminal background|clearance)/.test(lowerText)) {
    hintedType = hintedType || 'police_clearance';
    hintedTab = 'D';
    hints.push('police clearance');
  }

  // photos → Tab C
  if (/(photos|pictures|imagenes|fotos)/.test(lowerName) || /(photos|pictures|imagenes|fotos)/.test(lowerText)) {
    hintedTab = 'C';
    hints.push('family photos');
  }

  // utilities, bank, lease → Tab C
  if (/(utility|bill|statement|bank|lease)/.test(lowerName) || /(utility|bill|statement|bank|lease)/.test(lowerText)) {
    hintedTab = 'C';
    hints.push('cohabitation doc');
  }

  return { hintedType, hintedTab, hints };
}


