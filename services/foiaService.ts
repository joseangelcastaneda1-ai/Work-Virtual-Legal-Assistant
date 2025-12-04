import { GoogleGenAI, HarmCategory, HarmBlockThreshold } from "@google/genai";

// Function to get API key (checks localStorage first, then environment variables)
// Uses the same logic as geminiService.ts to ensure consistency
// Updated: Now uses VITE_GEMINI_API_KEY only (removed VITE_FOIA_GEMINI_API_KEY)
const getFoiaApiKey = (): string => {
  // Check localStorage first (user-provided key)
  if (typeof window !== 'undefined') {
    const userKey = localStorage.getItem('user_gemini_api_key');
    if (userKey) {
      return userKey;
    }
    // Check window object (set dynamically)
    if ((window as any).GEMINI_API_KEY) {
      return (window as any).GEMINI_API_KEY;
    }
  }
  
  // Fall back to environment variables
  // In Vite, only variables prefixed with VITE_ are exposed to client code
  let envKey = '';
  
  // Check import.meta.env (Vite's way of accessing env vars)
  // IMPORTANT: Only check VITE_GEMINI_API_KEY (not VITE_FOIA_GEMINI_API_KEY)
  if (typeof import.meta !== 'undefined' && (import.meta as any).env) {
    envKey = (import.meta as any).env.VITE_GEMINI_API_KEY || 
             (import.meta as any).env.GEMINI_API_KEY || 
             '';
  }
  
  // Fallback to process.env (for Node.js environments)
  if (!envKey && typeof process !== 'undefined' && process.env) {
    envKey = process.env.VITE_GEMINI_API_KEY || 
             process.env.GEMINI_API_KEY || 
             process.env.API_KEY || 
             '';
  }
  
  return envKey;
};

// Function to create a new AI instance with current API key
const createFoiaAIInstance = () => {
  const apiKey = getFoiaApiKey();
  if (!apiKey || apiKey.trim() === '') {
    // Don't log error here - let the calling function handle it
  }
  return new GoogleGenAI({ apiKey: apiKey || '' });
};

// Create initial AI instance
let foiaAi = createFoiaAIInstance();

// Function to get the current AI instance (always uses current API key)
const getFoiaAIInstance = () => {
  // Always recreate to ensure we use the latest API key
  return createFoiaAIInstance();
};

const foiaSafetySettings = [
  { category: HarmCategory.HARM_CATEGORY_HARASSMENT, threshold: HarmBlockThreshold.BLOCK_NONE },
  { category: HarmCategory.HARM_CATEGORY_HATE_SPEECH, threshold: HarmBlockThreshold.BLOCK_NONE },
  { category: HarmCategory.HARM_CATEGORY_SEXUALLY_EXPLICIT, threshold: HarmBlockThreshold.BLOCK_NONE },
  { category: HarmCategory.HARM_CATEGORY_DANGEROUS_CONTENT, threshold: HarmBlockThreshold.BLOCK_NONE },
];

export const analyzeFoiaDocuments = async (
  documents: { fileName: string; text: string }[],
  clientName?: string
): Promise<string> => {
  if (!documents || documents.length === 0) {
    throw new Error('No FOIA documents provided for analysis.');
  }

  const compiledFoiaText = documents
    .map((doc) => {
      const sanitized = doc.text?.trim() || '[No text extracted]';
      return `--- START OF DOCUMENT: ${doc.fileName} ---\n${sanitized}\n--- END OF DOCUMENT: ${doc.fileName} ---`;
    })
    .join('\n\n');

  const analysisPrompt = `
You are an immigration attorney reviewing a client's immigration FOIA disclosure.

Client Name / Alias: ${clientName || '[Not provided]'}

Carefully read every page of the FOIA records. Think step-by-step as a seasoned practitioner. Identify and summarize the key events, filings, petitions, or contacts the client has had with immigration authorities.

Pay extremely close attention to:
- Exact dates of events
- All aliases or name variations used by the client
- Every entry and exit to/from the United States (include ports if stated)
- Any deportations, voluntary departures, removals, or removal proceedings
- Forms or petitions filed (I-130, I-485, I-589, N-400, EOIR filings, etc.)
- Detentions, arrests, or any interactions with CBP, ICE, USCIS, EOIR, DOS, or local law enforcement tied to immigration

Provide your output in Markdown with the following sections:
1. **Executive Summary** – Brief overview (2-3 bullet points).
2. **Timeline of Key Events** – Chronological list with dates and a short description.
3. **Immigration Filings & Outcomes** – Include form numbers, dates, outcomes.
4. **Entries & Exits** – List dates, locations, statuses used.
5. **Aliases & Identifiers** – Every alias, A-number, or identifier mentioned.
6. **Enforcement Actions & Proceedings** – Detentions, NTAs, removal hearings, voluntary departures, etc.
7. **Notable Notes / Red Flags** – Anything that needs attorney follow-up (inconsistencies, missing pages, issues).

If a section has no information, explicitly state “Not mentioned in FOIA.”

FOIA DOCUMENTS:
${compiledFoiaText}
`;

  // Check if API key is available before making the request
  const apiKey = getFoiaApiKey();
  if (!apiKey || apiKey.trim() === '') {
    throw new Error('API key not found. Please set VITE_GEMINI_API_KEY in Vercel environment variables, or use the Settings menu (⚙️ button) to enter your API key.');
  }

  const response = await getFoiaAIInstance().models.generateContent({
    model: 'gemini-2.5-pro',
    contents: [{ parts: [{ text: analysisPrompt }] }],
    config: {
      safetySettings: foiaSafetySettings,
      temperature: 0.2,
      topK: 40,
    },
  });

  const text = response.text?.trim();
  if (!text) {
    throw new Error('AI returned an empty response for FOIA analysis. Please try again.');
  }

  return text;
};


