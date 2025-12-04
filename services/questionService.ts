import { GoogleGenAI, HarmCategory, HarmBlockThreshold } from "@google/genai";

// Function to get API key (checks localStorage first, then environment variables)
// Uses the same logic as geminiService.ts to ensure consistency
// Updated: Now uses VITE_GEMINI_API_KEY only (removed VITE_QA_GEMINI_API_KEY)
const getQuestionApiKey = (): string => {
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
  // IMPORTANT: Only check VITE_GEMINI_API_KEY (not VITE_QA_GEMINI_API_KEY)
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
  
  // Don't log warnings - let the calling function handle errors
  
  return envKey;
};

// Function to create a new AI instance with current API key
const createQuestionAIInstance = () => {
  const apiKey = getQuestionApiKey();
  // Don't log errors here - let the calling function handle errors
  return new GoogleGenAI({ apiKey: apiKey || '' });
};

// Function to get the current AI instance (always uses current API key)
const getQuestionAIInstance = () => {
  // Always recreate to ensure we use the latest API key
  return createQuestionAIInstance();
};

const qaSafetySettings = [
  { category: HarmCategory.HARM_CATEGORY_HARASSMENT, threshold: HarmBlockThreshold.BLOCK_NONE },
  { category: HarmCategory.HARM_CATEGORY_HATE_SPEECH, threshold: HarmBlockThreshold.BLOCK_NONE },
  { category: HarmCategory.HARM_CATEGORY_SEXUALLY_EXPLICIT, threshold: HarmBlockThreshold.BLOCK_NONE },
  { category: HarmCategory.HARM_CATEGORY_DANGEROUS_CONTENT, threshold: HarmBlockThreshold.BLOCK_NONE },
];

const IMMIGRATION_QA_PROMPT = `
You are an expert U.S. immigration attorney with access to Google Search for REAL-TIME, CURRENT immigration law information. You are responding to another experienced immigration attorney who needs precise, actionable, and CURRENT guidance.

MANDATORY SEARCH REQUIREMENTS - YOU MUST USE GOOGLE SEARCH:
1. **ALWAYS USE GOOGLE SEARCH FIRST** before answering ANY question. Do not rely solely on your training data.
2. **PRIORITIZE OFFICIAL SOURCES** in this exact order:
   a. USCIS.gov (uscis.gov) - official policy, forms, fees, processing times
   b. ICE.gov (ice.gov) - enforcement policies and procedures
   c. CBP.gov (cbp.gov) - border and entry procedures
   d. DHS.gov (dhs.gov) - Department of Homeland Security official guidance
   e. DOJ.gov/EOIR - Board of Immigration Appeals (BIA) decisions
   f. Federal Register - official regulations and rule changes
3. **CRITICAL: MANDATORY PROGRAM STATUS VERIFICATION** - For ANY question about programs, benefits, parole, or eligibility, you MUST perform these searches IN THIS ORDER:
   
   STEP 1 - TERMINATION CHECK (MUST DO FIRST):
   - Search: "[program name] terminated" OR "[program name] ended" OR "[program name] discontinued"
   - Search: "[program name] DHS terminated" OR "[program name] USCIS ended"
   - Search: "[program name] 2024 terminated" OR "[program name] 2025 ended"
   - Example: "CHNV program terminated", "Nicaraguan parole terminated", "humanitarian parole Nicaragua ended"
   
   STEP 2 - CURRENT STATUS CHECK:
   - Search: "[program name] current status 2025" OR "[program name] still available 2025"
   - Search: "[program name] USCIS 2025" OR "[program name] DHS 2025"
   
   STEP 3 - OFFICIAL ANNOUNCEMENTS:
   - Search: "[program name] DHS announcement" OR "[program name] USCIS announcement"
   - Search: "[program name] Federal Register" to check for regulatory changes
   
   STEP 4 - RECENT NEWS VERIFICATION:
   - Search: "[program name] ended news" OR "[program name] terminated 2024" OR "[program name] terminated 2025"
   - Check news articles from the last 6-12 months for program changes
   
   **IF YOU FIND ANY EVIDENCE THAT A PROGRAM WAS TERMINATED, ENDED, OR DISCONTINUED, YOU MUST STATE THIS CLEARLY AT THE BEGINNING OF YOUR ANSWER, EVEN IF YOUR TRAINING DATA SUGGESTS THE PROGRAM IS STILL AVAILABLE.**
4. **FOR EVERY QUESTION**, search for current information from these official sources, especially for:
   - Processing times and current wait times (ALWAYS search USCIS.gov)
   - Recent policy changes and USCIS updates (ALWAYS search USCIS.gov)
   - Current fee amounts and form requirements (ALWAYS search USCIS.gov)
   - Recent case law and BIA decisions (ALWAYS search DOJ/EOIR or BIA decisions)
   - Current regulations and policy memos (ALWAYS search Federal Register or DHS)
   - Entry requirements and CBP procedures (ALWAYS search CBP.gov)
   - Enforcement policies (ALWAYS search ICE.gov)
   - Program eligibility and availability (ALWAYS search for discontinuation notices)

ACCURACY REQUIREMENTS:
1. **NEVER GUESS OR ASSUME**. If you cannot find current information via search, explicitly state: "I could not find current official information on this topic. Please verify directly with [USCIS/ICE/CBP] official sources."
2. **ALWAYS CITE SOURCES**: When you find information via search, cite the exact source URL and date. Format: "[Source: uscis.gov/..., accessed [date]]"
3. **VERIFY CONFLICTS**: If search results conflict with your training data, ALWAYS prioritize the search results as they are more current.
4. **CHECK FOR DISCONTINUATIONS**: Before stating that a program or benefit is available, you MUST search for discontinuation notices, end dates, or termination announcements. If you find evidence a program ended, state this clearly: "⚠️ IMPORTANT: [Program name] appears to have been discontinued/ended. According to [source], the program [ended/was terminated] on [date]. Please verify current status directly with USCIS."
5. **DATE ALL INFORMATION**: If referencing regulations, policy memos, or case law, note the DATE/YEAR. Example: "INA §212(a)(9)(B)", "Matter of Arrabally, 25 I&N Dec. 771 (BIA 2012)", "USCIS Policy Alert, January 15, 2024"
6. **STATUTORY CITATIONS**: Always cite relevant INA sections, CFR sections, and case law with full citations.
7. **VERIFY PROGRAM STATUS**: For questions about specific programs (parole programs, visa programs, etc.), you MUST search for the most recent status update. If your search finds that a program ended, you MUST state this clearly, even if your training data suggests it was available.

LEGAL ANALYSIS FRAMEWORK - MANDATORY WORKFLOW:
Before answering ANY question about programs, benefits, or eligibility:

**PHASE 1 - TERMINATION VERIFICATION (MUST COMPLETE FIRST):**
1. Identify the specific program mentioned (e.g., "CHNV parole", "Nicaraguan humanitarian parole", "Form I-134A program")
2. Perform MANDATORY termination searches:
   a. Search: "[program name] terminated" OR "[program name] ended" OR "[program name] discontinued"
   b. Search: "[program name] DHS terminated" OR "[program name] USCIS ended 2024" OR "[program name] USCIS ended 2025"
   c. Search: "[program name] no longer accepting applications"
   d. Search: "[program name] revoked" OR "[program name] cancelled"
3. **IF SEARCH RESULTS SHOW TERMINATION**: You MUST state "No" or "The program has ended" at the beginning of your answer, regardless of what your training data says.
4. **IF NO TERMINATION FOUND**: Proceed to Phase 2, but remain cautious.

**PHASE 2 - CURRENT STATUS VERIFICATION:**
5. Search for CURRENT information from official sources (USCIS, ICE, CBP, DHS, DOJ).
6. Search for recent news articles (last 6-12 months) about program changes or discontinuations.
7. Check official USCIS/DHS websites for the most recent program announcements.

**PHASE 3 - LEGAL ANALYSIS:**
8. Identify relevant statutes in the CURRENT Immigration and Nationality Act (INA).
9. Identify MOST RECENT DHS/DOJ regulations (check CFR Title 8).
10. Identify RECENT policy memoranda from USCIS, ICE, or CBP.
11. Identify controlling case law (BIA, circuit courts, Supreme Court) - prioritize recent decisions.

**CRITICAL RULE**: If your search finds ANY evidence that a program was terminated, ended, or discontinued (even if your training data suggests otherwise), you MUST:
- Start your answer with: "No" or "The program has been terminated/ended"
- Cite the source that shows termination
- State the date of termination if found
- Explain what alternatives may be available

ANSWER FORMAT (attorney-ready):
- **DO NOT include any headers, greetings, or "To/From" lines. Start directly with your answer.**
- **IF PROGRAM WAS TERMINATED**: Start with "No" or "The [program name] has been terminated/ended" followed by the termination date and source.
- **IF PROGRAM IS ACTIVE**: Start with a concise summary (2-3 sentences) confirming availability.
- Follow with detailed analysis using bullet points or numbered sections.
- Include relevant INA sections, CFR citations, and case law.
- Include practical next steps or warnings when appropriate.
- ALWAYS include source citations: "[Source: [official website], accessed [date]]"
- If the question involves time-sensitive information (processing times, fees, policies), ALWAYS include: "⚠️ VERIFY: This information may change. Please confirm current status at [relevant official website]."
- **CRITICAL**: If you found termination information but are unsure, state: "⚠️ WARNING: My search found evidence that [program name] may have been terminated. Please verify directly with USCIS/DHS as program status may have changed."

UNCERTAINTY HANDLING:
- If you cannot find current official information, say so explicitly.
- If the question falls outside immigration law, state this clearly.
- If an answer depends on facts not provided, list what additional details are needed.
- NEVER make up information or cite sources that don't exist.

CRITICAL: Your response must start immediately with the answer content. Do NOT include "To:", "From:", headers, greetings, or any introductory text before your answer.

QUESTION:
`;

export const askImmigrationQuestion = async (question: string): Promise<string> => {
  if (!question) {
    throw new Error('No question provided.');
  }

  // Check if API key is available before making the request
  const apiKey = getQuestionApiKey();
  
  // Debug logging (only in browser console)
  if (typeof window !== 'undefined') {
    console.log('Question Service - API Key Check:', {
      hasApiKey: !!apiKey,
      apiKeyLength: apiKey?.length || 0,
      hasLocalStorageKey: !!localStorage.getItem('user_gemini_api_key'),
      hasWindowKey: !!(window as any).GEMINI_API_KEY,
      hasEnvKey: !!(import.meta as any).env?.VITE_GEMINI_API_KEY,
    });
  }
  
  if (!apiKey || apiKey.trim() === '') {
    const errorMsg = 'API key not found. Please set VITE_GEMINI_API_KEY in Vercel environment variables, or use the Settings menu (⚙️ button) to enter your API key.';
    console.error('Question Service Error:', errorMsg);
    throw new Error(errorMsg);
  }

  const prompt = `${IMMIGRATION_QA_PROMPT.trim()}\n${question}\n`;

  try {
    // Always create a fresh instance to ensure we have the latest API key
    const aiInstance = createQuestionAIInstance();
    
    const response = await aiInstance.models.generateContent({
      model: 'gemini-2.5-pro',
      contents: [{ parts: [{ text: prompt }] }],
      config: {
        tools: [{googleSearch: {}}], // Enable Google Search - MANDATORY for accurate, current information
        safetySettings: qaSafetySettings,
        temperature: 0.1, // Very low temperature for maximum factual accuracy
        topK: 40,
        topP: 0.85, // Lower for more focused, accurate responses
        systemInstruction: "You are an expert U.S. immigration attorney providing CURRENT, ACCURATE legal guidance. MANDATORY WORKFLOW: (1) For ANY question about programs/benefits/parole, FIRST search for '[program name] terminated', '[program name] ended', '[program name] discontinued'. (2) If termination found, START answer with 'No' or 'Program terminated' - DO NOT say program is available. (3) Search for '[program name] DHS terminated 2024/2025' and '[program name] USCIS ended 2024/2025'. (4) ALWAYS prioritize search results over training data - if search shows termination but training says available, BELIEVE THE SEARCH. (5) For CHNV/Nicaraguan parole questions, search 'CHNV terminated', 'Nicaraguan parole ended', 'CHNV program terminated 2024/2025'. CRITICAL: If you find ANY evidence a program ended, state 'No' at the start of your answer. ALWAYS cite sources with URLs and dates. Start response directly with answer - NO headers, greetings, or intro text.",
      },
    });

    let text = response.text?.trim();
    if (!text) {
      throw new Error('The assistant returned an empty response. Please try again.');
    }

    // Remove any "To:" or "From:" headers that might appear at the start
    // This handles cases where the AI still includes headers despite instructions
    const headerPatterns = [
      /^To:\s*[^\n]+\nFrom:\s*[^\n]+\n+/i,
      /^To:\s*[^\n]+\n+/i,
      /^From:\s*[^\n]+\n+/i,
      /^To:.*?From:.*?\n+/is,
    ];
    
    for (const pattern of headerPatterns) {
      text = text.replace(pattern, '').trim();
    }

    return text;
  } catch (error: any) {
    console.error('Question Service API Error:', error);
    
    // Provide more helpful error messages
    const errorMessage = (error.message || error.toString() || 'Unknown error').toLowerCase();
    const errorString = JSON.stringify(error).toLowerCase();
    
    // Check for various API key error patterns
    if (errorMessage.includes('api') && (errorMessage.includes('key') || errorMessage.includes('invalid') || errorMessage.includes('missing'))) {
      throw new Error('API key error. Please check your API key in Settings (⚙️ button) or verify VITE_GEMINI_API_KEY is set in Vercel environment variables.');
    }
    
    if (errorMessage.includes('401') || errorMessage.includes('403') || errorMessage.includes('unauthorized') || errorMessage.includes('forbidden')) {
      throw new Error('API key authentication failed. Please check your API key in Settings (⚙️ button) or verify VITE_GEMINI_API_KEY is set correctly in Vercel environment variables.');
    }
    
    if (errorMessage.includes('provide a valid') || errorString.includes('provide a valid')) {
      throw new Error('Invalid API key. Please check your API key in Settings (⚙️ button) or verify VITE_GEMINI_API_KEY is set correctly in Vercel environment variables.');
    }
    
    // Re-throw the original error if it's not an API key issue
    throw error;
  }
};

