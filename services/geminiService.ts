// FIX: Corrected import. 'BlockThreshold' is not a valid export, it should be 'HarmBlockThreshold'.
import { GoogleGenAI, Type, HarmCategory, HarmBlockThreshold } from "@google/genai";
import type { CaseType, FormData, AnalyzedDocInfo, InconsistencyReport } from '../types';
import { withSchemaRetry, textIncludesExact, preClassifyEvidence, withRateLimitRetry } from './aiUtils';

// Function to get the current API key (checks localStorage first, then environment variables)
const getApiKey = (): string => {
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
  
  // Debug logging in production to help diagnose Vercel issues
  if (typeof window !== 'undefined') {
    const debugInfo = {
      hasEnvKey: !!envKey,
      envKeyLength: envKey?.length || 0,
      hasLocalStorageKey: !!localStorage.getItem('user_gemini_api_key'),
      importMetaEnv: typeof import.meta !== 'undefined' ? Object.keys((import.meta as any).env || {}).filter((k: string) => k.includes('GEMINI') || k.includes('API')) : [],
      processEnv: typeof process !== 'undefined' ? Object.keys(process.env || {}).filter((k: string) => k.includes('GEMINI') || k.includes('API')) : [],
    };
    
    if (!envKey && !localStorage.getItem('user_gemini_api_key')) {
      console.warn('Gemini API Key Debug Info:', debugInfo);
      console.warn('No API key found. Please set VITE_GEMINI_API_KEY in Vercel environment variables, or use the Settings menu to enter your API key.');
    }
  }
  
  return envKey;
};

// Function to create a new AI instance with current API key
const createAIInstance = () => {
  const apiKey = getApiKey();
  if (!apiKey) {
    console.error("Gemini API key not found. Set VITE_GEMINI_API_KEY (preferred) or GEMINI_API_KEY in .env.local, or use the Settings menu to enter your API key.");
  }
  return new GoogleGenAI({ apiKey: apiKey || '' });
};

// Create initial AI instance
let ai = createAIInstance();

// Function to get the current AI instance (always uses current API key)
const getAIInstance = () => {
  // Always recreate to ensure we use the latest API key
  // This is safe because GoogleGenAI instances are lightweight
  return createAIInstance();
};

// Function to update API key and recreate AI instance
export const updateApiKey = (newKey: string) => {
  if (typeof window !== 'undefined') {
    localStorage.setItem('user_gemini_api_key', newKey);
    (window as any).GEMINI_API_KEY = newKey;
  }
  ai = createAIInstance();
};

// FIX: Use the corrected 'HarmBlockThreshold' enum for safety settings.
const safetySettings = [
    { category: HarmCategory.HARM_CATEGORY_HARASSMENT, threshold: HarmBlockThreshold.BLOCK_NONE },
    { category: HarmCategory.HARM_CATEGORY_HATE_SPEECH, threshold: HarmBlockThreshold.BLOCK_NONE },
    { category: HarmCategory.HARM_CATEGORY_SEXUALLY_EXPLICIT, threshold: HarmBlockThreshold.BLOCK_NONE },
    { category: HarmCategory.HARM_CATEGORY_DANGEROUS_CONTENT, threshold: HarmBlockThreshold.BLOCK_NONE }
];

// FIX: Removed deprecated and unused model variable.

export const extractIntakeData = async (fileText: string, caseType: CaseType): Promise<any> => {
    let extractionPrompt = '';
    let responseSchema: any;

    switch (caseType) {
        case 'i-130-adjustment':
            responseSchema = {
                type: Type.OBJECT, properties: {
                    // FIX: Ensured all description values are correctly quoted strings to prevent parsing errors.
                    "petitioner_name": { "type": Type.STRING, "description": "Petitioner's full name" },
                    "petitioner_dob": { "type": Type.STRING, "description": "Petitioner's date of birth (any common format like MM/DD/YYYY, Month DD, YYYY, etc.)" },
                    "petitioner_gender": { "type": Type.STRING, "description": "Petitioner's gender (Male or Female)" },
                    "beneficiary_name": { "type": Type.STRING, "description": "Beneficiary's full name" },
                    "beneficiary_dob": { "type": Type.STRING, "description": "Beneficiary's date of birth" },
                    "relationship_pet_ben": { "type": Type.STRING, "description": "Relationship (Spouse or Child)" },
                    "sponsor_name": { "type": Type.STRING, "description": "Sponsor's full name (might be same as Petitioner)" },
                    "sponsor_dob": { "type": Type.STRING, "description": "Sponsor's date of birth" }
                }
            };
            extractionPrompt = `Analyze the following intake form text for an I-130 Adjustment case. Extract the required information and return it as a JSON object matching the provided schema. For dates, return them in any common format found in the text. For gender/relationship, return 'Male', 'Female', 'Spouse', or 'Child'. If information is missing, use null for the value. Text: \n\n${fileText}`;
            break;
        case 'u-visa-certification':
            responseSchema = {
                type: Type.OBJECT, properties: {
                    "victim_name": { "type": Type.STRING, "description": "Victim's full name" },
                    "victim_gender": { "type": Type.STRING, "description": "Victim's gender (Male, Female, or Other)" },
                    "pasted_narrative": { "type": Type.STRING, "description": "The combined narrative from the criminal activity and substantial abuse sections." }
                }
            };
            extractionPrompt = `
You are an expert paralegal AI. Analyze the following document for a U-Visa Certification request. The document could be a client questionnaire, police report, victim statement, or other related document.

Your task is to extract the following information:
1.  The victim's full name and gender.
2.  The narrative text describing the criminal activity and/or abuse suffered.

**Document to Analyze:**
"""
${fileText}
"""

**Instructions for Gender Extraction:**
- First, look for the victim's gender explicitly stated in the document (e.g., "Gender: Male", "Sex: F", "Male/Female").
- If the gender is not explicitly stated, you MUST analyze the victim's full name to infer their gender.
- If the name is typically female (e.g., Maria, Jane, Ana, Rosa), set \`victim_gender\` to "Female".
- If the name is typically male (e.g., Jose, John, Carlos, Juan), set \`victim_gender\` to "Male".
- If the name is ambiguous or you cannot determine the gender, set \`victim_gender\` to "Other".

**Instructions for Narrative Extraction:**
The document may be in different formats. Extract narrative information from ANY of the following:

**If it's a Questionnaire:**
- Find sections like "1. Information about the qualifying criminal activity:" or "Criminal Activity:" and extract all text that follows.
- Find sections like "2. Has the victim suffered substantial physical or mental abuse..." or "Abuse suffered:" and extract all text that follows.
- Combine both sections into a single narrative.

**If it's a Police Report:**
- Extract the "Narrative", "Description", "Details", "Incident Description", "Victim Statement", or "Summary" sections.
- Extract any sections describing what happened, the crime, or the incident.
- Extract victim statements or witness statements if they describe the crime or abuse.
- Combine all relevant narrative sections into a single continuous string.

**If it's a Victim Statement or Declaration:**
- Extract the main narrative describing the criminal activity and abuse.
- Extract any sections describing what happened, when it happened, and how the victim was affected.

**If it's another document type:**
- Look for any sections that describe:
  * The criminal activity or crime that occurred
  * What happened to the victim
  * Physical or mental abuse suffered
  * Details about the incident
- Extract and combine all such narrative sections.

**CRITICAL:**
- Extract ALL narrative text that describes the crime, incident, or abuse - be thorough.
- If the document contains multiple narrative sections, combine them all into one continuous string.
- Preserve the content and details - do not summarize or shorten it.
- If you find narrative text, include it even if it's incomplete or partial.

**REQUIRED INFORMATION (return as JSON):**
- **victim_name**: The victim's full name (extract from the document - look for "Victim:", "Complainant:", "Name:", or similar fields).
- **victim_gender**: The victim's gender ('Male', 'Female', or 'Other'), inferred from the name if not explicitly stated.
- **pasted_narrative**: The combined narrative text describing the criminal activity and/or abuse. If no narrative is found, return null.

**IMPORTANT:**
- Return ONLY a single, valid JSON object that follows the provided schema.
- If a value cannot be found after thoroughly searching the document, use \`null\` for that field only.
- Do NOT return the string "null" - use actual JSON null value.
- Be thorough in extracting narrative - it's critical for the U-Visa application.
`;
            break;
        case 'u-visa-application':
            responseSchema = {
                type: Type.OBJECT, properties: {
                    "petitioner_name": { "type": Type.STRING, "description": "Petitioner's full name" },
                    "petitioner_dob": { "type": Type.STRING, "description": "Petitioner's date of birth (any common format)" },
                    "petitioner_gender": { "type": Type.STRING, "description": "Petitioner's gender (Male, Female, or Other)" },
                    "pasted_narrative": { "type": Type.STRING, "description": "The petitioner's declaration narrative describing the crime and abuse suffered" }
                }
            };
            extractionPrompt = `
You are an expert paralegal AI. Analyze the following document, which is likely a client questionnaire for a U-Visa Application (Form I-918).

Your task is to extract the following information:
1. The petitioner's full name, date of birth, and gender.
2. The narrative text describing the crime and the substantial physical or mental abuse suffered.

**Document to Analyze:**
"""
${fileText}
"""

**Instructions for Gender Extraction:**
- First, look for the petitioner's gender explicitly stated in the document.
- If the gender is not explicitly stated, analyze the petitioner's full name to infer their gender.
- If the name is typically female (e.g., Maria, Jane), set \`petitioner_gender\` to "Female".
- If the name is typically male (e.g., Jose, John), set \`petitioner_gender\` to "Male".
- If the name is ambiguous or you cannot determine the gender, set \`petitioner_gender\` to "Other".

**Instructions for Narrative Extraction:**
- Find sections describing the qualifying criminal activity and the substantial physical or mental abuse.
- Extract all narrative text that describes what happened, when, where, and how the petitioner was affected.
- Combine this into a single, continuous string for the 'pasted_narrative' field.

**REQUIRED INFORMATION (return as JSON):**
- **petitioner_name**: The petitioner's full name.
- **petitioner_dob**: The petitioner's date of birth.
- **petitioner_gender**: The petitioner's gender ('Male', 'Female', or 'Other').
- **pasted_narrative**: The combined narrative text describing the crime and abuse.

**IMPORTANT:**
- Return ONLY a single, valid JSON object that follows the provided schema.
- If a value cannot be found, use \`null\`.
`;
            break;
        case 'vawa': {
            responseSchema = {
                type: Type.OBJECT, properties: {
                    // FIX: Ensured all description values are correctly quoted strings to prevent parsing errors.
                    "petitioner_name": { "type": Type.STRING, "description": "Petitioner's (victim's) full name" },
                    "petitioner_dob": { "type": Type.STRING, "description": "Petitioner's date of birth" },
                    "petitioner_gender": { "type": Type.STRING, "description": "Petitioner's gender (Male or Female)" },
                    "abuser_name": { "type": Type.STRING, "description": "Abuser's full name" },
                    "abuser_dob": { "type": Type.STRING, "description": "Abuser's date of birth" },
                    "abuser_status": { "type": Type.STRING, "description": "Abuser's status ('U.S. Citizen' or 'Lawful Permanent Resident')" },
                    "relationship_pet_abuser": { "type": Type.STRING, "description": "Relationship ('Spouse' or 'Child')" },
                    "abuser_gender": { "type": Type.STRING, "description": "Abuser's gender ('Male' or 'Female')" },
                    "pasted_narrative": { "type": Type.STRING, "description": "The combined text from the 'Mutual Residence' and 'Bona Fide Relationship' sections of the declaration." }
                }
            };
            // Truncate fileText if too long to prevent response truncation
            const truncatedFileText = fileText.length > 30000 ? fileText.substring(0, 30000) : fileText;
            
            extractionPrompt = `
You are an expert paralegal AI. Analyze the following document for a VAWA case. Your primary task is to identify the **petitioner (the victim)** and the **abuser**.

**CRITICAL: Identifying the Petitioner**
The petitioner is ALWAYS the person writing the declaration. Look for phrases like:
- "I, [NAME]" at the beginning of the declaration
- "Declaration of [NAME]" in the title
- First-person statements like "I am...", "I have...", "My [relationship]..."
The petitioner is the VICTIM who is filing the VAWA petition.

**CRITICAL: Identifying the Abuser**
The abuser is the person who has abused the petitioner. Look for:
- References to "my son", "my daughter", "my husband", "my wife"
- Names mentioned in the context of abuse
- The person whose citizenship status is mentioned (U.S. Citizen or LPR)

**DOCUMENT:**
"""
${truncatedFileText}
"""

**Extraction Instructions & Reasoning:**
1.  **Identify Petitioner FIRST:** The petitioner is the person writing "I, [NAME]" or "Declaration of [NAME]". Extract ALL their information.
2.  **Identify Abuser SECOND:** The abuser is the person who abused the petitioner. Extract ALL their information.
3.  **Determine Relationship:** Read carefully to understand the relationship. Look for phrases like "my son," "my daughter," "my husband," "my wife," "I married him," "he is my child," etc.
4.  **Categorize Relationship:** Based on your reading, you MUST categorize the relationship as either "Spouse" or "Child". This is the value you will use for the \`relationship_pet_abuser\` field.

**REQUIRED INFORMATION (return as JSON - ALL fields are REQUIRED):**
- **petitioner_name**: The full name of the petitioner/victim (the person writing the declaration). This is CRITICAL - look for "I, [NAME]" or "Declaration of [NAME]".
- **petitioner_dob**: The petitioner's/victim's date of birth. Search the entire document carefully.
- **petitioner_gender**: The petitioner's/victim's gender. First, look for explicitly stated gender. If not found, infer from the name (e.g., Maria, Ana, Rosa → Female; Jose, Juan, Carlos → Male). Return "Male" or "Female".
- **abuser_name**: The full name of the abuser (the person who abused the petitioner).
- **abuser_dob**: The abuser's date of birth.
- **abuser_status**: The abuser's immigration status (e.g., 'U.S. Citizen' or 'Lawful Permanent Resident'). Look for "USC", "U.S. Citizen", "LPR", "Lawful Permanent Resident".
- **relationship_pet_abuser**: The petitioner's relationship TO the abuser, categorized as either 'Spouse' or 'Child'. This is CRITICAL - read the document carefully to determine this.
- **abuser_gender**: The abuser's gender. First, look for explicitly stated gender. If not found, infer from the name. Return "Male" or "Female".
- **pasted_narrative**: The full text of the petitioner's declaration, especially sections about "Mutual Residence" or "Bona Fide Relationship". IMPORTANT: If the narrative is very long, truncate it to approximately 10000 characters maximum to ensure valid JSON.

**IMPORTANT:**
- You MUST extract ALL fields. Do not return null unless the information truly cannot be found anywhere in the document.
- The petitioner is ALWAYS the person writing the declaration (look for "I, [NAME]").
- Return ONLY a single, valid JSON object that follows the provided schema.
- CRITICAL: Ensure all JSON strings are properly escaped. Use \\\\n for newlines within strings.
`;
            break;
        }
        case 'naturalization': {
            responseSchema = {
                type: Type.OBJECT, properties: {
                    "applicant_name": { "type": Type.STRING, "description": "Applicant's full name" },
                    "applicant_dob": { "type": Type.STRING, "description": "Applicant's date of birth (any common format)" },
                    "permanent_residence_date": { "type": Type.STRING, "description": "Date when applicant became a Lawful Permanent Resident" },
                    "applicant_gender": { "type": Type.STRING, "description": "Applicant's gender (Male or Female)" }
                }
            };
            // Truncate file text if too long to avoid token limits (increased limit for better extraction)
            const maxFileLength = 100000; // Limit to ~100k characters for better context
            const naturalizationFileText = fileText.length > maxFileLength 
              ? fileText.substring(0, maxFileLength) + '\n\n[... document truncated ...]'
              : fileText;
            
            extractionPrompt = `You are an expert paralegal AI. Your task is to EXTRACT information that EXISTS in the document below. DO NOT make up, infer, or guess information that is not explicitly stated or clearly visible in the document.

**CRITICAL ANTI-HALLUCINATION RULES:**
- ONLY extract information that you can SEE in the document text below
- If information is NOT in the document, return null (not a guess or inference)
- DO NOT create fake names, dates, or information
- DO NOT infer information unless explicitly instructed below
- If you cannot find information after carefully reading the document, return null
- Be honest: it's better to return null than to hallucinate incorrect information

**Document to Analyze:**
"""
${naturalizationFileText}
"""

**Document to Analyze:**
"""
${naturalizationFileText}
"""

**EXTRACTION INSTRUCTIONS:**
- Read the ENTIRE document text above carefully - information may be in any section
- Look for information that is EXPLICITLY stated or clearly visible in the document
- Check form fields, headers, signatures, and all text sections
- Extract information exactly as it appears - do not modify or interpret it
- If information is not found after thorough reading, return null (do not guess)

**Your Task:**
Extract ONLY the following information that EXISTS in the document. For each field:
1. Search the document text carefully
2. If found, extract it exactly as written
3. If NOT found, return null (do not make up information)

1. **Applicant's Full Name (applicant_name)**:
   - Search the document for the full legal name of the person applying for naturalization
   - Look for fields labeled: "Name", "Full Name", "Applicant Name", "Legal Name", "Client Name", "Petitioner Name", "First Name", "Last Name"
   - Check form fields, headers, signatures, or any place where a name appears
   - Extract the complete name exactly as written (first, middle if present, last name)
   - If multiple names appear, identify which one is the applicant (usually the primary person mentioned)
   - **IMPORTANT**: Only extract if you can clearly see a name in the document. Do not make up names.

2. **Applicant's Date of Birth (applicant_dob)**:
   - Search the document for the date of birth
   - Look for fields labeled: "Date of Birth", "DOB", "Birth Date", "Date of Birth (DOB)", "Born", "Birthday", "Birth"
   - Accept ANY common date format: MM/DD/YYYY, DD/MM/YYYY, Month DD YYYY, YYYY-MM-DD, etc.
   - Look in form fields, identification documents, or biographical sections
   - Extract the date exactly as it appears in the document
   - **IMPORTANT**: Only extract if you can clearly see a date. Do not guess dates.

3. **Date of Permanent Residence (permanent_residence_date)**:
   - Search the document for the date when the applicant became a Lawful Permanent Resident (LPR)
   - Look for fields labeled: "Date of Permanent Residence", "LPR Date", "Green Card Date", "Date Became Permanent Resident", "Resident Since", "Permanent Resident Since", "Date of Admission as LPR", "Resident Since Date", "LPR Since"
   - Check Form I-551 (Green Card) information if present
   - Check immigration records, visa stamps, or any immigration documents
   - Accept ANY common date format
   - **IMPORTANT**: Only extract if you can clearly see this date. Do not guess or infer.

4. **Applicant's Gender (applicant_gender)**:
   - Extract the applicant's gender from the document.
   - First, look for explicitly stated gender (check fields labeled "Gender", "Sex", "M/F", "Male/Female", etc.).
   - If not explicitly stated, infer gender from the applicant's name (same logic as VAWA):
     * Common female names: Maria, Ana, Rosa, Carmen, Sofia, Elena, Laura, etc. → Return "Female"
     * Common male names: Jose, Juan, Carlos, Miguel, Luis, Pedro, etc. → Return "Male"
   - Return "Male" or "Female" (capitalized).
   - If you cannot determine gender, return null.

**Extraction Strategy:**
- Read the ENTIRE document text carefully from start to finish
- Check form fields, headers, footers, signatures, and all text sections systematically
- For dates, look in multiple formats and locations
- For name, verify it's the applicant's name (not a spouse, child, or other person)
- For gender, prioritize explicit statements, then use name inference ONLY if name is found
- **CRITICAL**: If you cannot find information after thorough reading, return null - do not guess

**Return a JSON object with the following structure:**
{
    "applicant_name": "Full name as it appears in the document (or null if not found)",
    "applicant_dob": "Date of birth in any format found (or null if not found)",
    "permanent_residence_date": "Date of permanent residence in any format found (or null if not found)",
    "applicant_gender": "The applicant's gender. First, look for explicitly stated gender. If not found, infer from the applicant's name (e.g., Maria, Ana, Rosa → Female; Jose, Juan, Carlos → Male). Return 'Male' or 'Female' (capitalized). If you cannot determine, return null."
}

**CRITICAL JSON FORMATTING RULES:**
- Return ONLY a valid JSON object matching the schema exactly
- Use JSON null (not the string "null") if you cannot find the information in the document
- Example of correct null: "applicant_name": null (if NO name appears in the document)
- Example of INCORRECT null: "applicant_name": "null" (DO NOT DO THIS)
- For gender, return exactly "Male" or "Female" (capitalized) or null - never use abbreviations
- Be thorough - check every section of the document carefully
- Extract information that EXISTS in the document - do not make up information
- DO NOT return the string "null" - use actual JSON null value
- **ANTI-HALLUCINATION**: Better to return null than to guess or make up information`;
            break;
        }
        case 't-visa': {
            responseSchema = {
                type: Type.OBJECT, properties: {
                    "client_name": { "type": Type.STRING, "description": "Applicant's full name" },
                    "applicant_dob": { "type": Type.STRING, "description": "Applicant's date of birth (any common format)" },
                    "applicant_gender": { "type": Type.STRING, "description": "Applicant's gender (Male, Female, or Other)" },
                    "country_of_origin": { "type": Type.STRING, "description": "Country of origin/nationality" },
                    "trafficking_type": { "type": Type.STRING, "description": "Type of trafficking (Sex Trafficking or Labor Trafficking)" },
                    "entry_date": { "type": Type.STRING, "description": "Date of LAST/MOST RECENT entry into United States. CRITICAL: Look for phrases like 'I have not left the United States since [DATE]' or 'I have not left the United States since then' - extract the date mentioned BEFORE this phrase. If that phrase is not found, find ALL entry dates mentioned and extract ONLY the chronologically LAST/MOST RECENT one. This is the date that explains their current physical presence in the U.S." },
                    "trafficker_name": { "type": Type.STRING, "description": "Name of the trafficker" },
                    "original_promise": { "type": Type.STRING, "description": "What the trafficker originally promised (e.g., job, romantic relationship)" },
                    "derivative_names": { "type": Type.STRING, "description": "MUST be null UNLESS someone is EXPLICITLY and TEXTUALLY listed as a 'derivative' or 'derivative beneficiary' in the document. Do NOT extract children's names just because they are mentioned. Do NOT extract family members unless they are explicitly called 'derivative'. The document must contain words like 'derivative' or 'derivative beneficiary' in relation to specific names. If you see children mentioned but they are NOT called 'derivative', return null. Format as comma-separated names or null." },
                    "inadmissibility_grounds": { "type": Type.STRING, "description": "Any grounds of inadmissibility (e.g., unlawful presence, working without authorization)" },
                    "pasted_narrative": { "type": Type.STRING, "description": "The applicant's declaration narrative describing the trafficking victimization" }
                }
            };
            // Increase limit for declarations which can be very long - allow up to 100k characters
            const truncatedFileText = fileText.length > 100000 ? fileText.substring(0, 100000) + '\n\n[... document truncated for length ...]' : fileText;
            
            extractionPrompt = `
You are an expert paralegal AI analyzing a client's declaration for a T-Visa Application (Form I-914). T-Visa is for victims of severe forms of trafficking in persons.

**CRITICAL: Read this document like a human paralegal would - carefully, thoroughly, and contextually. Look for information in ALL sections of the document, not just obvious fields.**

**Document to Analyze:**
"""
${truncatedFileText}
"""

**Your Analysis Process:**

1. **Read the ENTIRE document carefully** - Information may be scattered throughout:
   - Check headers, titles, and signatures
   - Read all paragraphs and sections
   - Look for dates, names, and locations mentioned anywhere
   - Pay attention to context clues

2. **Extract Applicant's Personal Information:**
   - **client_name**: Find the applicant's full name. Look for:
     * "I, [NAME]" at the beginning
     * "Declaration of [NAME]" in title
     * Name in signature line
     * Name mentioned in first-person statements ("My name is...", "I am...")
   - **applicant_dob**: Find date of birth. Look for:
     * "Date of Birth", "DOB", "Born", "Birth Date"
     * Dates near the name or biographical section
     * Any date format (MM/DD/YYYY, Month DD YYYY, etc.)
   - **applicant_gender**: 
     * First, look for explicitly stated gender ("I am a woman/man", "Gender: Female/Male")
     * If not found, infer from the applicant's name:
       - Common female names: Maria, Ana, Rosa, Carmen, Sofia, Elena, Laura, Jane, Sarah, etc. → "Female"
       - Common male names: Jose, Juan, Carlos, Miguel, Luis, Pedro, John, Michael, etc. → "Male"
     * If truly ambiguous, use "Other"
   - **country_of_origin**: Find nationality/country. Look for:
     * "I am from [Country]", "Nationality: [Country]", "Country of origin"
     * References to being "Mexican", "Honduran", "Guatemalan", etc.
     * Birth certificate references mentioning country
     * Entry documents mentioning country

3. **Extract Trafficking Details:**
   - **trafficking_type**: Determine if it's Sex Trafficking or Labor Trafficking:
     * **Sex Trafficking indicators**: forced prostitution, commercial sex acts, forced to have sex, sold for sex, forced into sex work, brothel, strip club, escort service
     * **Labor Trafficking indicators**: forced to work, unpaid work, debt bondage, forced labor, involuntary servitude, working against will, held to work, forced to clean/cook/work without pay
     * Read the narrative carefully - look for what the trafficker forced them to do
   - **entry_date**: Find when they LAST entered the United States (MOST RECENT entry date):
     * **CRITICAL**: The client may have entered the U.S. multiple times. You MUST identify the LAST/MOST RECENT entry date.
     * **KEY INDICATOR**: Look for phrases like:
       - "I have not left the United States since [DATE]" or "I have not left the United States since then"
       - "I have not left the country since [DATE]" or "I have not left the country since then"
       - "I have remained in the U.S. since [DATE]"
       - "Since [DATE], I have been in the United States"
       - The date mentioned BEFORE these phrases is typically the last entry date
     * **SEARCH STRATEGY**:
       1. **PRIMARY METHOD**: Look for the phrase "I have not left the United States since" or "I have not left the country since" - the date mentioned BEFORE this phrase is the last entry date
       2. **SECONDARY METHOD**: If that phrase is not found, look for ALL mentions of entry:
          - "I entered the U.S. on [DATE]", "I arrived in [DATE]", "I came to America on [DATE]"
          - "I crossed the border on [DATE]", "I came to the United States on [DATE]"
          - "In [DATE], I entered...", "On [DATE], I arrived..."
          - "I entered the United States in [MONTH] [YEAR]" (look for this pattern)
          - Any date mentioned near words like "entered", "arrived", "crossed", "came to U.S.", "came to America"
       3. If multiple entry dates are found:
          - List ALL entry dates chronologically
          - Identify which is the LAST/MOST RECENT date
          - Extract ONLY the most recent entry date
     * **DATE FORMAT**: Extract the date as written in the document. If only month and year are available (e.g., "October 2023"), extract that. If a full date is available (e.g., "October 15, 2023"), extract the full date.
     * **VERIFICATION**: The last entry date should be the most recent date mentioned in relation to entry/arrival, and it should be the date that explains their current presence in the U.S.
     * If only one entry date is mentioned, use that one
   - **trafficker_name**: Find the trafficker's name:
     * Look for names mentioned in context of abuse, control, or exploitation
     * "A man named [NAME]", "My trafficker [NAME]", "[NAME] forced me"
     * May be mentioned multiple times - extract the main trafficker's name
   - **original_promise**: What did the trafficker promise/recruit them with:
     * "He promised me a job as...", "She said I would work as...", "He told me I would..."
     * "I was recruited to work as...", "He offered me...", "She promised..."
     * Examples: waitress job, nanny job, restaurant work, romantic relationship, marriage, better life, etc.

4. **Extract Derivative Information:**
   - **derivative_names**: 
     * **ABSOLUTELY CRITICAL RULE**: This field MUST be null UNLESS someone is EXPLICITLY and TEXTUALLY listed as a "derivative" or "derivative beneficiary" in the document.
     * **WHAT TO LOOK FOR** (only extract if you see these exact patterns):
       - "Derivative beneficiaries: [NAMES]" or "Derivatives: [NAMES]"
       - "Family members applying as derivatives: [NAMES]"
       - "The following are derivative beneficiaries: [NAMES]"
       - A section header titled "Derivatives" or "Derivative Beneficiaries" followed by names
       - Text that explicitly says "[NAME] is a derivative beneficiary" or "[NAME] is applying as a derivative"
     * **WHAT NOT TO EXTRACT** (these should result in null):
       - Children's names mentioned anywhere in the document (e.g., "I have three children: John, Jane, Bob")
       - Family members mentioned in biographical sections
       - Names listed under "Children" or "Family Members" sections
       - Any names that are NOT explicitly called "derivative" or "derivative beneficiary"
     * **EXAMPLES OF WHAT TO RETURN NULL FOR**:
       - Document says "I have three children: Jennifer, Brithanny, Abigail" → return null (not explicitly called derivatives)
       - Document lists children's names but never uses the word "derivative" → return null
       - Document mentions family members but doesn't call them derivatives → return null
     * **ONLY EXTRACT IF**: The document explicitly uses words like "derivative", "derivative beneficiary", "applying as derivative", etc. in relation to specific names
     * If no one is explicitly and textually listed as a derivative, you MUST return null
     * Format as comma-separated: "John Doe, Jane Doe" or null

5. **Extract Inadmissibility Information:**
   - **inadmissibility_grounds**: Look for any immigration violations:
     * "I entered without inspection", "I worked without authorization", "I overstayed my visa"
     * "I was undocumented", "I entered illegally"
     * If none mentioned, return null

6. **Extract the Full Narrative:**
   - **pasted_narrative**: Extract the COMPLETE declaration text:
     * Start from the beginning of the narrative (after "I, [NAME]" or "Declaration of [NAME]")
     * Include ALL paragraphs describing:
       - How they were recruited
       - What happened during trafficking
       - Force, fraud, or coercion used
       - Physical and mental abuse
       - How they escaped or were rescued
       - Cooperation with law enforcement
     * Preserve ALL details - do NOT summarize or shorten
     * Include the entire story from start to finish
     * If the document is very long, include as much as possible (up to reasonable length)

**CRITICAL EXTRACTION RULES:**
- Read the document MULTIPLE times if needed to find all information
- Information may be implied or mentioned indirectly - use context clues
- Dates may be in various formats - extract them as written
- Names may appear multiple times - extract the correct ones based on context
- **CRITICAL FOR ENTRY DATE**: 
  * The entry date MUST be the LAST/MOST RECENT date the client entered the United States
  * **PRIMARY METHOD**: Look for the phrase "I have not left the United States since [DATE]" or "I have not left the United States since then" - the date mentioned BEFORE this phrase is the last entry date
  * **SECONDARY METHOD**: If that phrase is not found, find ALL entry dates mentioned and select the chronologically LAST/MOST RECENT one
  * This is essential for T-Visa applications - the last entry date determines physical presence eligibility
- If information truly cannot be found after thorough reading, use null
- For the narrative, be COMPREHENSIVE - include everything relevant

**REQUIRED INFORMATION (return as JSON):**
- Extract ALL fields listed above
- If information is not found after thorough analysis, use null (not the string "null")
- **CRITICAL FOR DERIVATIVE_NAMES**: This field MUST be null UNLESS someone is EXPLICITLY and TEXTUALLY listed as a "derivative" or "derivative beneficiary". Do NOT extract children's names just because they are mentioned in the document. Do NOT extract family members unless the document explicitly uses the word "derivative" or "derivative beneficiary" in relation to them. If you see children mentioned (e.g., "I have three children: John, Jane, Bob") but they are NOT explicitly called "derivative", you MUST return null. The document must contain the actual word "derivative" or "derivative beneficiary" in relation to specific names for this field to have a value.
- For inadmissibility_grounds, if none are mentioned, return null
- For pasted_narrative, extract the FULL narrative - this is critical

**IMPORTANT:**
- Return ONLY a single, valid JSON object
- Be thorough and human-like in your analysis
- Read contextually - don't just look for exact phrases
- The narrative extraction is especially important - include ALL details
- Do not make up information - only extract what exists in the document
- **CRITICAL FOR DERIVATIVE_NAMES**: This field MUST be null UNLESS the document EXPLICITLY and TEXTUALLY uses the word "derivative" or "derivative beneficiary" in relation to specific names. Do NOT extract children's names just because they are mentioned. Do NOT extract family members unless they are explicitly called "derivative". Examples that should result in null: "I have three children: John, Jane, Bob" (no mention of "derivative"), "My children are..." (no mention of "derivative"), any biographical information about family members that doesn't use the word "derivative". Only extract if the document explicitly says something like "Derivative beneficiaries: [NAMES]" or "[NAME] is a derivative beneficiary".
`;
            break;
        }
        default:
            throw new Error("Intake extraction not implemented for this case type.");
    }
    
    let response: any = null;
    try {
        // FIX: `safetySettings` must be passed within the `config` object.
        // Use Pro model for better accuracy in extraction (especially for N-400 and T-Visa declarations)
        const modelToUse = (caseType === 'naturalization' || caseType === 't-visa') ? 'gemini-2.5-pro' : 'gemini-2.5-flash';
        
        response = await getAIInstance().models.generateContent({
            model: modelToUse,
            contents: [{ parts: [{ text: extractionPrompt }] }],
            config: {
                systemInstruction: caseType === 't-visa' 
                    ? "You are an expert paralegal assistant analyzing client declarations for T-Visa applications. Read the declaration like a human would - carefully, thoroughly, and contextually. Extract all information that exists in the document, including information that may be implied or mentioned indirectly. Use context clues to find information. For the narrative, extract the COMPLETE story. CRITICAL FOR ENTRY DATE: Look for phrases like 'I have not left the United States since [DATE]' or 'I have not left the United States since then' - the date mentioned BEFORE this phrase is the last entry date. If that phrase is not found, find ALL entry dates and extract ONLY the LAST/MOST RECENT one chronologically. CRITICAL FOR DERIVATIVE_NAMES: This field MUST be null UNLESS the document EXPLICITLY and TEXTUALLY uses the word 'derivative' or 'derivative beneficiary' in relation to specific names. Do NOT extract children's names just because they are mentioned. Do NOT extract family members unless the document explicitly uses the word 'derivative' or 'derivative beneficiary' in relation to them. If you see children mentioned but they are NOT explicitly called 'derivative', you MUST return null. The document must contain the actual word 'derivative' or 'derivative beneficiary' in relation to specific names for this field to have a value. Return ONLY a valid JSON object with no extra text, comments, or markdown formatting. If information truly cannot be found after thorough analysis, use null."
                    : "You are an expert paralegal assistant extracting key information from client intake forms. Your primary responsibility is ACCURACY. Only extract information that exists in the document. Do not make up, guess, or infer information. Return ONLY a valid JSON object with no extra text, comments, or markdown formatting. If information is not found, use null.",
                responseMimeType: "application/json",
                responseSchema: responseSchema,
                safetySettings: safetySettings,
                temperature: caseType === 't-visa' ? 0.1 : 0.0, // Slightly higher temperature for T-Visa to allow contextual understanding
                topK: 20, // Reduced from 40 for more focused responses
                topP: 0.8, // Added for better control
            },
        });
        
        let text = response.text;
        
        if (!text) {
            console.error('No text in response:', response);
            throw new Error('AI returned an empty response. Please try again.');
        }
        
        // Remove markdown code blocks if present
        if (text.startsWith('```json')) {
            text = text.replace(/^```json\s*/, '').replace(/\s*```$/, '');
        } else if (text.startsWith('```')) {
            text = text.replace(/^```\s*/, '').replace(/\s*```$/, '');
        }
        text = text.trim();
        
        console.log('Parsing JSON response, length:', text.length);
        console.log('JSON preview:', text.substring(0, 200));
        
        // Enhanced logging for T-Visa extraction
        if (caseType === 't-visa') {
            console.log('🔍 T-Visa Extraction Debug Info:');
            console.log('  - Document length:', fileText.length, 'characters');
            console.log('  - Model used:', modelToUse);
            console.log('  - Response text length:', text.length);
        }
        
        const parsed = parseJsonPayload(text);
        
        // Clean up string "null" values - convert to actual null
        if (parsed && typeof parsed === 'object') {
          Object.keys(parsed).forEach(key => {
            if (parsed[key] === 'null' || parsed[key] === 'Null' || parsed[key] === 'NULL') {
              parsed[key] = null;
            }
          });
        }
        
        return parsed;
    } catch (error) {
        console.error('Gemini Intake Extraction Error:', error);
        if (response && response.text) {
            console.error('Response text preview:', response.text.substring(0, 500));
        }
        if (error instanceof Error && error.message.includes('500')) {
             throw new Error(`AI generation failed with a server error. This may be a temporary issue. Please try again. Details: ${error.message}`);
        }
        if (error instanceof SyntaxError && error.message.includes('JSON')) {
            const fullResponse = response?.text || 'No response text';
            console.error('Full response that failed to parse:', fullResponse);
            throw new Error(`Failed to parse AI response as JSON. The AI may have returned invalid JSON. Please try again. Full response logged to console.`);
        }
        throw new Error('AI failed to extract data. See console for details.');
    }
};

/**
 * Clean malformed escape sequences from JSON strings that can break parsing
 * Specifically handles cases like \\b\\b\\b... which appear in corrupted JSON responses
 * These escape sequences can break JSON parsing when they appear in string values
 */
const cleanMalformedEscapes = (text: string): string => {
    if (!text) return text;
    
    // Remove problematic \\b (backslash-backslash-b) sequences that break JSON parsing
    // These appear when model responses get corrupted or truncated
    // In JSON strings, \\b represents an escaped backslash followed by 'b', which is invalid
    // We need to match \\b (two backslashes + b) and remove it completely
    // Pattern '\\\\\\\\b+' matches literal backslash-backslash followed by one or more 'b'
    const backspacePattern = new RegExp('\\\\\\\\b+', 'g');
    let cleaned = text.replace(backspacePattern, '');
    
    // Fix over-escaped sequences: reduce multiple backslashes to single escape
    // Pattern: match 2+ backslashes followed by quote, newline, tab, etc.
    // Replace with proper single escape
    
    // Fix over-escaped quotes: \\\" or \\\\\" etc. -> \"
    // Match: 2+ backslashes followed by escaped quote (\" in regex)
    cleaned = cleaned.replace(/(\\){2,}\\"/g, '\\"');
    
    // Fix over-escaped newlines: \\\\n -> \n
    cleaned = cleaned.replace(/(\\){2,}n/g, '\\n');
    
    // Fix over-escaped tabs: \\\\t -> \t
    cleaned = cleaned.replace(/(\\){2,}t/g, '\\t');
    
    // Fix over-escaped backslashes: reduce 4+ consecutive backslashes to 2 (valid escape)
    // This handles cases like \\\\\\\ becoming \\\\
    cleaned = cleaned.replace(/(\\){4,}/g, '\\\\');
    
    // Clean up any orphaned backslashes that might have been left behind
    // This handles cases where removing \\b left a trailing backslash
    // Replace any backslash not followed by a valid JSON escape character
    // Valid JSON escapes: ", \, /, b, f, n, r, t, u (for \uXXXX)
    cleaned = cleaned.replace(/\\(?![nrtbf"\\/u0-9a-fA-F])/g, '');
    
    // Also handle cases where there might be many consecutive backslashes
    // Reduce 3+ consecutive backslashes to double backslash (valid escape)
    // But preserve valid escapes like \\n, \\t, \\"
    cleaned = cleaned.replace(/(?<![nrtbf"\\/u0-9a-fA-F])\\{3,}/g, '\\\\');
    
    return cleaned;
};

const parseJsonPayload = (rawText: string) => {
    const attempts: string[] = [];
    const trimmed = rawText.trim();
    attempts.push(trimmed);

    const codeBlockMatch = trimmed.match(/```(?:json)?([\s\S]*?)```/i);
    if (codeBlockMatch && codeBlockMatch[1]) {
        attempts.push(codeBlockMatch[1].trim());
    }

    const objectMatch = trimmed.match(/\{[\s\S]*\}/);
    if (objectMatch) {
        attempts.push(objectMatch[0]);
    }

    const arrayMatch = trimmed.match(/\[[\s\S]*\]/);
    if (arrayMatch) {
        attempts.push(arrayMatch[0]);
    }

    const uniqueAttempts = Array.from(new Set(attempts.filter(Boolean)));
    for (const candidate of uniqueAttempts) {
        // Clean malformed escapes first
        let cleanedCandidate = cleanMalformedEscapes(candidate);
        
        // Additional aggressive fix for over-escaped quotes in string values
        // Fix patterns like \\\\\" (4+ backslashes + quote) to \"
        // This handles cases where quotes are triple or more escaped
        cleanedCandidate = cleanedCandidate.replace(/(\\){3,}\\"/g, '\\"');
        
        // Fix patterns like \\\" (2 backslashes + quote) to \"
        cleanedCandidate = cleanedCandidate.replace(/(\\){2}\\"/g, '\\"');
        
        const repairAttempts = [cleanedCandidate, repairTruncatedJson(cleanedCandidate)];
        const seen = new Set<string>();
        for (const attempt of repairAttempts) {
            if (!attempt || seen.has(attempt)) continue;
            seen.add(attempt);
            try {
                return JSON.parse(attempt);
            } catch (err) {
                console.warn('Failed JSON parse attempt, trying next candidate.', { candidatePreview: attempt.substring(0, 120) });
            }
        }
    }

    throw new SyntaxError('Unable to parse JSON payload from model response.');
};

const repairTruncatedJson = (raw: string): string => {
    if (!raw) return raw;
    let text = raw.trim();

    // Remove trailing markdown fences
    if (text.endsWith('```')) {
        text = text.slice(0, -3).trimEnd();
    }

    // Attempt to fix truncated property strings (e.g., ,"field":"value...)
    const truncatedPropRegex = /,\s*"([^"]+)"\s*:\s*"([^"\\]|\\.)*$/;
    const truncatedMatch = text.match(truncatedPropRegex);
    if (truncatedMatch) {
        const propName = truncatedMatch[1];
        const prefix = text.slice(0, truncatedMatch.index);
        text = `${prefix},"${propName}":"[TRUNCATED]"}`
    }

    // Balance braces if possible
    const openBraces = (text.match(/\{/g) || []).length;
    const closeBraces = (text.match(/\}/g) || []).length;
    if (openBraces > closeBraces) {
        text += '}'.repeat(openBraces - closeBraces);
    }

    // Balance brackets for array responses
    const openBrackets = (text.match(/\[/g) || []).length;
    const closeBrackets = (text.match(/\]/g) || []).length;
    if (openBrackets > closeBrackets) {
        text += ']'.repeat(openBrackets - closeBrackets);
    }

    return text;
};

export const analyzeI130Document = async (fileText: string, fileName: string, names: { petitioner: string, beneficiary: string, sponsor: string }): Promise<AnalyzedDocInfo> => {
    const prompt = `
        You are an expert paralegal classifying immigration documents. Your task is to analyze the text from a document named "${fileName}" for an I-130 petition.
        
        The parties involved are:
        - Petitioner: ${names.petitioner}
        - Beneficiary: ${names.beneficiary}
        - Sponsor: ${names.sponsor}

        Based on the document's filename and its text content, you must determine the document type and who it belongs to.
        Return a single, valid JSON object that strictly adheres to the following structure.

        **JSON Structure:**
        {
            "doc_type": "...", // MUST be one of: "passport", "birth_certificate", "marriage_certificate", "tax", "lease", "bank_statement", "photo", "criminal", "naturalization", "id", "other"
            "person": "...", // MUST be one of: "petitioner", "beneficiary", "sponsor", "relationship", or "other"
            "name": "...", // A descriptive name for the document, e.g., "Petitioner's U.S. Passport", "2022 Joint Tax Return", "Marriage Certificate"
            "tax_year": "..." // ONLY if doc_type is "tax", provide the 4-digit year (e.g., "2023"). Otherwise, this field MUST be omitted.
        }

        **Document Text to Analyze:**
        ${fileText.substring(0, 8000)}
    `;

    const responseSchema = {
        type: Type.OBJECT,
        properties: {
            "doc_type": { "type": Type.STRING },
            "person": { "type": Type.STRING },
            "name": { "type": Type.STRING },
            "tax_year": { "type": Type.STRING, nullable: true },
        }
    };
    
    try {
        // FIX: `safetySettings` must be passed within the `config` object.
        const response = await getAIInstance().models.generateContent({
            model: 'gemini-2.5-flash',
            contents: [{ parts: [{ text: prompt }] }],
            config: {
                responseMimeType: "application/json",
                responseSchema: responseSchema,
                safetySettings: safetySettings,
                temperature: 0.1,
                topK: 40,
            },
        });
        const text = response.text;
        return JSON.parse(text);
    } catch (error) {
        console.error(`Error analyzing document ${fileName}:`, error);
        return { doc_type: 'error', person: 'unknown', name: `Error analyzing ${fileName}`, tax_year: undefined };
    }
};

/**
 * AI Task: Fills a U-Visa letter template using provided context.
 */
export const fillUvisaTemplate = async (context: {
    evidenceText: string;
    declarationText: string;
    clientName: string;
    clientGender: string;
    template: string;
}): Promise<string> => {
    const prompt = `
    **Persona:** You are an expert AI paralegal with years of experience. Your task is to act as a human assistant and complete a document.

    **Core Task:**
    You have been given a letter template with placeholders like {{INSTRUCTION}}. You have also been provided with supporting documents: a police report and the victim's declaration. You must read and understand all the provided information to accurately fill in the placeholders in the template.

    **Context and Supporting Documents:**
    1.  **Client/Victim Name:** ${context.clientName}
    2.  **Client/Victim Gender:** ${context.clientGender}
    3.  **Police Report / Evidence Text:**
        """
        ${context.evidenceText}
        """
    4.  **Victim's Declaration Text:**
        """
        ${context.declarationText}
        """

    **Template to Complete:**
    """
    ${context.template}
    """

    **Instructions:**
    -   Read each placeholder's instruction carefully (e.g., "{{WRITE THE NAME OF THE LAW ENFORCEMENT AGENCY...}}").
    -   **CRITICAL - Law Firm Name:** The template contains the text "Law Firm Name" (without placeholder brackets). You MUST keep this text exactly as written: "Law Firm Name". DO NOT replace it with any actual law firm name, even if you see a law firm name in the evidence documents or context. Keep it literally as "Law Firm Name".
    -   **Use of Documents:** The Victim's Declaration is the primary source for the narrative of events. The Police Report is the primary source for factual details like dates, agency names, and jurisdictions.
    -   **CRITICAL DATE FORMATTING RULE:** ALL dates in your output MUST be written in the format "Day of Week, Month Day, Year" (e.g., "Monday, January 1, 2001", "Friday, December 25, 2023"). NEVER use numeric date formats like "01/01/2001", "01-01-2001", or "1/1/2001". If you find a date in numeric format, convert it to this format.
    -   **SPECIFIC INSTRUCTION for Crime Date:** When filling the placeholder for the date the crime occurred (e.g., "{{WRITE THE DATE OF THE POLICE REPORT IN HERE}}"), if the date is not clearly stated in the victim's narrative, you MUST search for it in the Police Report. The date is often found after phrases like "occur to date:", "dated of incident:", "date occurred:", "report date:", "reported on:", or similar sentences. Find the most plausible date of the actual incident. Format it as "Day of Week, Month Day, Year" (e.g., "Monday, January 1, 2001").
    -   **CRITICAL STEP for Agency Information:** If you cannot find the **Law Enforcement Agency's Name, the Head of the Agency, or the Mailing Address** directly in the provided documents, you MUST follow this process:
        1.  Identify the name of the law enforcement agency or jurisdiction from the police report (e.g., "Santa Fe Police Department", "Cook County Sheriff's Office").
        2.  Use your search capabilities to find the official, current information online for that agency.
        3.  Use the information you find online to fill in the placeholders.
    -   Replace EACH placeholder with the information you find. The final output MUST NOT contain any "{{...}}" brackets.
    -   For placeholders like "{{IDENTIFY IF CLIENT IS MALE OR FEMALE...}}", use the provided client gender to write "him" or "her" as appropriate.
    -   For "{{TODAY'S DATE}}", use the current date in the format "Day of Week, Month Day, Year" (e.g., "Monday, January 1, 2001"). Calculate the day of the week correctly.
    -   If, after searching online, you still cannot find a piece of information, you MUST replace the placeholder with a clear note, such as "[Information not found online]". Do not leave the placeholder brackets in the final text.
    -   Your final output must be ONLY the completed letter text. Do not include any other commentary or explanations.

    **Final Output:**
    Return the fully completed letter as a single block of text.
    `;

    try {
        const response = await getAIInstance().models.generateContent({
            model: 'gemini-2.5-pro', // Use the more powerful model for this complex task
            contents: [{ parts: [{ text: prompt }] }],
            config: {
                tools: [{googleSearch: {}}],
                safetySettings: safetySettings,
                temperature: 0.2,
                topK: 40,
            },
        });
        return response.text;
    } catch (error: any) {
        console.error("U-Visa AI Template Filling Error:", error);
        throw new Error(`AI failed to generate the request letter: ${error.message}`);
    }
};

/**
 * AI Task 1: Summarize the declaration and extract the cohabitation address for a VAWA case.
 */
export const generateVawaAbuseSummary = async (pastedNarrative: string) => {
    const prompt = `
    You are an expert paralegal. Your first task is to analyze the provided VAWA declaration.
    Your goal is to comprehensively summarize ALL instances of abuse into four categories and find the cohabitation address.

    --- CRITICAL INSTRUCTIONS ---
    1.  **abuse_summary** - COMPREHENSIVE ANALYSIS REQUIRED:
        -   Read the ENTIRE declaration carefully from beginning to end. Do not skip any sections.
        -   Identify and extract ALL instances of abuse mentioned in the declaration, no matter how small or subtle.
        -   Categorize each instance into one of four required categories: "psychological", "verbal", "physical", and "financial".
        -   For EACH instance of abuse, create a separate object in the appropriate category array.
        -   Each object MUST have:
            *   "subtitle": A short, descriptive 1-5 word title that captures the essence of that specific abuse instance (e.g., "Emotional Manipulation", "Threats and Intimidation", "Financial Control", "Physical Intimidation")
            *   "description": A DETAILED, comprehensive summary (at least 2-3 sentences) that includes:
                - What happened (specific actions, words, or behaviors)
                - When it happened (if mentioned)
                - How it affected the petitioner (emotional, physical, or financial impact)
                - Context and details from the declaration
        -   IMPORTANT: Extract MULTIPLE instances. If the declaration mentions 10 different incidents of psychological abuse, create 10 separate objects in the psychological array.
        -   Be thorough: Include incidents that may seem minor - they all matter for the case.
        -   If a category truly has no details in the declaration, return an empty array for it, like this: "physical": [].

    2.  **cohabitation_address**:
        -   Read the declaration carefully and find the address where the petitioner and abuser lived together.
        -   Look for phrases like "we live at", "we reside at", "our address is", "we currently live together at", etc.
        -   Return it as a single string in full format (street address, city, state, zip code if available).
        -   If it is not found, return an empty string "".

    --- EXAMPLES OF GOOD ABUSE ENTRIES ---
    {
        "subtitle": "Threats and Intimidation",
        "description": "The abuser repeatedly threatened the petitioner, saying 'Leave me alone! I know what to do' and 'I don't want to talk about it!' whenever the petitioner tried to discuss important matters. These threats occurred multiple times, particularly when the petitioner attempted to address the abuser's irresponsible behavior. The petitioner felt intimidated and powerless, unable to have normal conversations without fear of the abuser's angry reactions."
    }

    {
        "subtitle": "Financial Exploitation",
        "description": "The petitioner works full-time and pays all household bills, while the abuser works part-time but contributes nothing financially. The abuser spends money on entertainment and sports games instead of helping with expenses. When the petitioner tries to discuss financial responsibility, the abuser stays silent and looks annoyed, showing no willingness to contribute or help."
    }

    --- DECLARATION TEXT ---
    ${pastedNarrative}
    `;

    const responseSchema = {
        type: Type.OBJECT,
        properties: {
            abuse_summary: {
                type: Type.OBJECT,
                properties: {
                    psychological: { type: Type.ARRAY, items: { type: Type.OBJECT, properties: { subtitle: { type: Type.STRING }, description: { type: Type.STRING } } } },
                    verbal: { type: Type.ARRAY, items: { type: Type.OBJECT, properties: { subtitle: { type: Type.STRING }, description: { type: Type.STRING } } } },
                    physical: { type: Type.ARRAY, items: { type: Type.OBJECT, properties: { subtitle: { type: Type.STRING }, description: { type: Type.STRING } } } },
                    financial: { type: Type.ARRAY, items: { type: Type.OBJECT, properties: { subtitle: { type: Type.STRING }, description: { type: Type.STRING } } } },
                }
            },
            cohabitation_address: { type: Type.STRING },
        }
    };

    try {
        console.log('📝 Generating abuse summary for narrative length:', pastedNarrative?.length || 0);
        // FIX: `safetySettings` must be passed within the `config` object.
        const response = await getAIInstance().models.generateContent({
            model: 'gemini-2.5-pro', // Use more powerful model for comprehensive analysis
            contents: [{ parts: [{ text: prompt }] }],
            config: {
                systemInstruction: "You are an expert paralegal assistant specializing in VAWA cases. Your task is to comprehensively analyze declarations and extract ALL instances of abuse with detailed descriptions. Be thorough - extract every incident mentioned, no matter how small. Each abuse instance should be a separate entry with a detailed description (2-3 sentences minimum) that includes what happened, when it happened (if mentioned), and how it affected the petitioner. Return ONLY a valid JSON object matching the requested structure.",
                responseMimeType: "application/json",
                responseSchema: responseSchema,
                safetySettings: safetySettings,
                temperature: 0.2, // Slightly higher temperature for more detailed responses
                topK: 40,
            },
        });
        const text = response.text;
        console.log('📄 Abuse summary response length:', text?.length || 0);
        console.log('📄 Abuse summary response preview:', text?.substring(0, 500));
        const parsed = JSON.parse(text);
        console.log('✅ Parsed abuse summary:', {
            hasAbuseSummary: !!parsed?.abuse_summary,
            psychological: parsed?.abuse_summary?.psychological?.length || 0,
            verbal: parsed?.abuse_summary?.verbal?.length || 0,
            physical: parsed?.abuse_summary?.physical?.length || 0,
            financial: parsed?.abuse_summary?.financial?.length || 0,
        });
        return parsed;
    } catch (error: any) {
        console.error("❌ VAWA AI Summarization Error:", error);
        console.error("Error details:", {
            message: error?.message,
            stack: error?.stack,
            response: error?.response,
        });
        throw new Error(`AI failed to summarize declaration: ${error.message}`);
    }
};

/**
 * AI Task 2: Analyze the CONTENT of a all VAWA documents to classify and describe them.
 */
export const generateVawaDocumentList = async (evidence: {fileName: string, fileText: string}[], answers: FormData): Promise<{ tab: string; description: string }[]> => {
    let abuserRelationship = '';
    if (answers.relationship === 'spouse') {
        abuserRelationship = answers.abuser_gender === 'male' ? 'husband' : 'wife';
    } else {
        abuserRelationship = answers.abuser_gender === 'male' ? 'son' : 'daughter';
    }

    // Build text with modest chunking to increase coverage
    const allDocsText = evidence.map(doc => {
        const text = doc.fileText || '';
        const chunks: string[] = [];
        for (let i = 0; i < text.length; i += 3000) {
            chunks.push(text.slice(i, i + 3000));
            if (chunks.length >= 3) break; // cap
        }
        return `--- Filename: ${doc.fileName} ---\n${chunks.join('\n')}\n--- End of ${doc.fileName} ---\n`;
    }).join('\n');


    const prompt = `
    You are an expert AI paralegal, a master file clerk. Your task is to analyze a batch of evidence documents for a VAWA case. You must read all documents to understand the full context, classify each piece of evidence, create a precise description, and intelligently de-duplicate related items (like a document and its translation).

    **Case Details:**
    - Petitioner: "${answers.petitioner_name}"
    - Abuser: "${answers.abuser_name}" (Petitioner's ${abuserRelationship})

    **Evidence Documents Provided:**
    ${allDocsText}

    **Your Process:**
    1.  **Holistic Review:** Read through ALL provided documents first to understand the complete picture of the evidence.
    2.  **CRITICAL - Only Identify Documents That Actually Exist:** You MUST ONLY identify documents that are ACTUALLY PRESENT in the evidence files provided. DO NOT invent, assume, infer, or create documents that are not explicitly shown in the evidence. If a document is not clearly visible in the text or filename, DO NOT include it in your output. This is extremely important - false positives are unacceptable. Only list documents you can actually see and verify in the provided evidence.
    3.  **Identify & Group:** Identify what each document is. Pay special attention to documents that are translations of other documents.
    4.  **De-duplicate & Combine:** Your primary goal is to produce a clean, final list. If you find a document (e.g., "passport.pdf") and its translation (e.g., "passport_trans.pdf"), you MUST represent them as a single item in your output. The description for this combined item should be based on the original document but MUST end with "(with English translation)".
    5.  **Classify & Describe:** For each unique piece of evidence, determine its correct Tab (A, B, C, D, or E) and write a description following the strict rules below.

    **CRITICAL RULES & FORMATTING:**
    - **Affidavits of Petitioner:** This is extremely important.
        - When you identify an affidavit from the client/Petitioner, you MUST determine what it acknowledges:
            1) **If the affidavit acknowledges COHABITATION** with the abusive USC, classify it under **Tab C** and format as: "Affidavit of Petitioner acknowledging cohabitation with abusive USC ${abuserRelationship}".
            2) **If the affidavit acknowledges the CITIZENSHIP or LPR STATUS** of the abusive USC, classify it under **Tab B** and format as: "Affidavit of Petitioner acknowledging citizenship of abusive USC ${abuserRelationship}".
        - Read the affidavit content carefully to determine which type it is. Look for keywords like "cohabitation", "lived together", "resided together" for cohabitation affidavits, or "citizen", "citizenship", "LPR", "legal permanent resident", "United States citizen" for status affidavits.
    - **Family Photos:**
        - If the document text or filename indicates it contains photographs of the family (e.g., "photos", "pictures", "family images"), you MUST classify it under **Tab C**.
        - The description MUST be exactly: "Family photos of Petitioner with abusive USC ${abuserRelationship}". Do not add any other details.
    - **Letters of Recommendation:** This is extremely important.
        - You MUST list each letter of recommendation as a separate item. Do not group them.
        - If the document is a letter of recommendation, you MUST identify the author's full name. Look for the name in these places, in order of priority: 1) The signature section, 2) The first sentence (e.g., "My name is Jane Doe..."), or 3) an ID document attached to the letter.
        - The description MUST be exactly: "Letter of recommendation from [Author's Full Name] in support of Petitioner". Example: "Letter of recommendation from Jane Doe in support of Petitioner".
    - **Passport vs. Consular ID:** This is a critical distinction.
        - If the document text contains the word "Passport" or "Pasaporte", you MUST classify the document as a "passport".
        - If the document text contains "Consular Identification" or "Matrícula Consular", you MUST classify it as a "consular identification".
        - Do not confuse them. Use this classification to create the description. Example: "Mexican passport of Petitioner".
    - **FBI Background Check:** If the content confirms it's an FBI check, the description MUST be "FBI background check of Petitioner" and the tab MUST be "D".
    - **Tab A (Petitioner's ID):**
        - For birth certificates, passports, or consular IDs of the Petitioner.
        - Format: "[Nationality/State] [Document Type] of Petitioner". Example: "Mexican passport of Petitioner".
        - **Birth Certificate Format (CRITICAL):** When listing birth certificates, first describe the document type ("Birth Certificate"), then specify to whom it pertains. Example: "Birth Certificate of Petitioner" or "Birth Certificate of Petitioner's child, [Child's Name]".
    - **Tab B (Abuser's Status):**
        - For the Abuser's U.S. Passport or Naturalization Certificate.
        - DO NOT put the Abuser's birth certificate here.
        - **Birth Certificate Format (CRITICAL):** If you identify the abuser's birth certificate, first write "Birth Certificate of", then specify to whom it pertains. Example: "Birth Certificate of abusive USC ${abuserRelationship}, ${answers.abuser_name}".
        - **Affidavit Format (Tab B):** If you identify an affidavit of the client/Petitioner that acknowledges the citizenship or LPR status of the abusive USC, you MUST format it as: "Affidavit of Petitioner acknowledging citizenship of abusive USC ${abuserRelationship}". Example: "Affidavit of Petitioner acknowledging citizenship of abusive USC husband".
    - **Government Documents Format (CRITICAL):**
        - When identifying government documents such as Marriage Certificates, Divorce Decrees, or Birth Certificates, you MUST follow this format:
            1. First, write the document type: "Marriage Certificate", "Divorce Decree", or "Birth Certificate"
            2. Then, specify the relationship: "of Petitioner" or "of Petitioner and [Other Party Name]" or "to whom the Petitioner was married" or "from whom the Petitioner was divorced" or "pertaining to [Person's Name]"
        - Examples:
            - "Marriage Certificate of Petitioner and ${answers.abuser_name}"
            - "Divorce Decree of Petitioner from [Spouse Name]"
            - "Birth Certificate of Petitioner"
            - "Birth Certificate of Petitioner's child, [Child's Name]"
    - **Tab C (Cohabitation/Relationship):**
        - For joint documents like leases, bank statements, or utility bills. Also for Family Photos (see rule above).
        - **CRITICAL FORMATTING RULE FOR ALL TAB C DOCUMENTS:** Every document listed under Tab C MUST include an explanation indicating why it is placed under Tab C. This means you MUST state the address of cohabitation and the relationship to the abusive USC.
        - **Bank Statement Format (CRITICAL):** When you identify a bank statement, you MUST write it as: "[BANK NAME] bank account statement of Petitioner with address of cohabitation with abusive USC ${abuserRelationship}". OR if the statement belongs to the abuser: "[BANK NAME] account statement of Petitioner's abusive USC ${abuserRelationship} with address of cohabitation with Petitioner". Examples: 
            - "Wells Fargo bank account statement of Petitioner with address of cohabitation with abusive USC daughter"
            - "Capital One account statement of Petitioner's abusive USC daughter with address of cohabitation with Petitioner"
        - **Utility Bill Format (CRITICAL):** When you identify a utility bill, you MUST first write the name of the company issuing the bill, followed by "bill of Petitioner with address of cohabitation with abusive USC ${abuserRelationship}". Example: "SoColGas bill of Petitioner with address of cohabitation with abusive USC son". Always include the company name first.
        - **Lease/Rental Agreement Format:** Format as: "[Document Type] of Petitioner with abusive USC ${abuserRelationship} with address of cohabitation" or "[Document Type] showing address of cohabitation with abusive USC ${abuserRelationship}". Example: "Lease agreement of Petitioner with abusive USC husband with address of cohabitation".
        - **Affidavit Format (Tab C):** If you identify an affidavit of the client/Petitioner that acknowledges cohabitation with the abusive USC, you MUST format it as: "Affidavit of Petitioner acknowledging cohabitation with abusive USC ${abuserRelationship}". Example: "Affidavit of Petitioner acknowledging cohabitation with abusive USC husband".
        - **REMINDER:** Every Tab C document description MUST include the phrase "with address of cohabitation with abusive USC ${abuserRelationship}" or a similar explanation that clearly indicates why the document is evidence of cohabitation.
    - **Tab D (Petitioner's Good Moral Character):**
        - For FBI checks, police clearances, and letters of recommendation.
        - **FBI Check Format:** "FBI background check of Petitioner".
        - **Police Clearance Format:** "[Issuing Agency] criminal background check of Petitioner".
        - **ORDERING RULE (STRICT):** When listing Tab D items, ALWAYS sort in this order:
            1) Tax records (any tax/IRS/return/W-2/1099 related documents),
            2) FBI background check of Petitioner (if found),
            3) Local criminal history/clearance of Petitioner (e.g., police department clearance) (if found),
            4) Letters of recommendation (if found).
    - **Tab E (Other Supporting Documents):**
        - USE ONLY IF THE DOCUMENT FITS NOWHERE ELSE.
        - **FORBIDDEN:** Do NOT list the Petitioner's main IDs (passport, birth certificate) or the Abuser's birth certificate here.
        - **Children's Docs:** Format as "[Document Type] of Petitioner's child" or "[Document Type] of Petitioner's son/daughter, [Child's Name]". Example: "Immunization record of Petitioner's child".

    **Output Requirement:**
    You MUST return a single, valid JSON array of objects. Each object represents one unique piece of evidence from the final, de-duplicated list. If you find no documents, return an empty array.
    `;

    const responseSchema = {
        type: Type.ARRAY,
        items: {
            type: Type.OBJECT,
            properties: {
                tab: { type: Type.STRING, enum: ['A','B','C','D','E'] as any },
                description: { type: Type.STRING },
                sourceFilename: { type: Type.STRING },
                confidence: { type: Type.NUMBER },
            },
            required: ["tab", "description"]
        }
    };

    try {
        const response = await withRateLimitRetry(async () => {
            return await getAIInstance().models.generateContent({
                model: 'gemini-2.5-pro',
                contents: [{ parts: [{ text: prompt }] }],
                config: {
                    systemInstruction: "You are an expert paralegal assistant. Return ONLY a valid JSON array matching the requested structure.",
                    responseMimeType: "application/json",
                    responseSchema: responseSchema,
                    safetySettings: safetySettings,
                    temperature: 0.1,
                    topK: 40,
                },
            });
        });
        const text = response.text;
        const parsed: Array<any> = JSON.parse(text);

        // Apply rules-first constraints post-processing
        let filtered = parsed
          .filter(item => item && item.tab && item.description)
          .map(item => {
            // Enforce critical exact descriptions when applicable
            const desc = String(item.description);
            const file = String(item.sourceFilename || '');
            // Basic file-based hints
            const doc = evidence.find(e => e.fileName === file) || null;
            const hints = doc ? preClassifyEvidence(doc.fileName, doc.fileText) : { hints: [] };
            return {
              tab: String(item.tab),
              description: desc,
              sourceFilename: file,
              confidence: typeof item.confidence === 'number' ? item.confidence : 0.7,
              _hints: hints.hints,
            };
          })
          .filter(item => item.confidence >= 0.5);

        // Apply Tab D ordering rule locally (deterministic)
        const priorityForD = (desc: string): number => {
          const d = (desc || '').toLowerCase();
          if (/(tax|irs|return|w-2|1099)/.test(d)) return 0; // Tax records first
          if (/fbi/.test(d)) return 1; // FBI background
          if (/(criminal|police|clearance|background)/.test(d)) return 2; // local criminal history
          if (/letter of recommendation/.test(d)) return 3; // letters
          return 4; // others
        };
        const dItems = filtered.filter(i => i.tab === 'D').sort((a, b) => priorityForD(a.description) - priorityForD(b.description));
        const nonD = filtered.filter(i => i.tab !== 'D');
        filtered = [...nonD, ...dItems];

        // Strip extras to preserve existing UI expectations
        return filtered.map(i => ({ tab: i.tab, description: i.description }));
    } catch (error: any) {
        console.error(`VAWA AI Document List Generation Error:`, error);
        
        // Provide user-friendly error messages for rate limits
        const errorMessage = error?.message || '';
        const errorCode = error?.error?.code || error?.code || '';
        const errorStatus = error?.error?.status || error?.status || '';
        
        if (errorCode === 429 || errorStatus === 'RESOURCE_EXHAUSTED' || 
            errorMessage.includes('429') || errorMessage.includes('Resource has been exhausted') ||
            errorMessage.includes('quota')) {
            throw new Error('API rate limit exceeded. Your API key has reached its quota limit. Please wait a few minutes and try again, or check your Google Cloud Console to increase your quota.');
        }
        
        throw new Error(`AI analysis of evidence failed: ${error.message}`);
    }
};

/**
 * Generate comprehensive I-130 document list with detailed formatting rules
 * Similar to VAWA but adapted for I-130 petition structure
 */
export const generateI130DocumentList = async (
    evidence: {fileName: string, fileText: string}[],
    names: { petitioner: string, beneficiary: string, sponsor: string }
): Promise<{ tab: string; description: string }[]> => {
    // Build text with modest chunking to increase coverage
    const allDocsText = evidence.map(doc => {
        const text = doc.fileText || '';
        const chunks: string[] = [];
        for (let i = 0; i < text.length; i += 3000) {
            chunks.push(text.slice(i, i + 3000));
            if (chunks.length >= 3) break; // cap
        }
        return `--- Filename: ${doc.fileName} ---\n${chunks.join('\n')}\n--- End of ${doc.fileName} ---\n`;
    }).join('\n');

    const prompt = `
    You are an expert AI paralegal, a master file clerk. Your task is to analyze a batch of evidence documents for an I-130 Petition for Alien Relative case. You must read all documents to understand the full context, classify each piece of evidence, create a precise description, and intelligently de-duplicate related items (like a document and its translation).

    **CRITICAL - Analyze Documents Like a Human Being:**
    - Read each document carefully and thoroughly, just as a human paralegal would do.
    - Look at ALL details in the document: names, dates, document types, issuing authorities, and any other identifying information.
    - Take your time to understand the context and meaning of each document.
    - Do not rush or make assumptions. Read the entire document before classifying it.
    - Pay attention to subtle details that might indicate who the document belongs to or what type of document it is.
    - Think critically about what you're reading - if something doesn't make sense, re-read it carefully.

    **Case Details:**
    - Petitioner: "${names.petitioner}"
    - Beneficiary: "${names.beneficiary}"
    - Sponsor: "${names.sponsor}"

    **Evidence Documents Provided:**
    ${allDocsText}

    **Your Process:**
    1.  **Holistic Review:** Read through ALL provided documents first to understand the complete picture of the evidence.
    2.  **CRITICAL - Only Identify Documents That Actually Exist:** You MUST ONLY identify documents that are ACTUALLY PRESENT in the evidence files provided. DO NOT invent, assume, or infer documents that are not explicitly shown in the evidence. If a document is not clearly visible in the text or filename, DO NOT include it in your output.
    3.  **Identify & Group:** Identify what each document is. Pay special attention to documents that are translations of other documents.
    4.  **De-duplicate & Combine:** Your primary goal is to produce a clean, final list. If you find a document (e.g., "passport.pdf") and its translation (e.g., "passport_trans.pdf"), you MUST represent them as a single item in your output. The description for this combined item should be based on the original document but MUST end with "(with English translation)".
    5.  **Classify & Describe:** For each unique piece of evidence, determine its correct Tab (A, B, C, D, or E) and write a description following the strict rules below.

    **CRITICAL RULES & FORMATTING:**

    **TAB A - DOCUMENTS ESTABLISHING IDENTITY, NATIONALITY, AND INCOME OF PETITIONER:**
    - **Birth Certificate:** Format as "United States birth certificate of Petitioner proving United States citizenship" or "United States birth certificate of Petitioner proving United States citizenship (with English translation)" if translation exists.
        - **CRITICAL:** When identifying the Petitioner's birth certificate, you MUST always write it as "United States birth certificate of Petitioner proving United States citizenship" (or with translation suffix if applicable). This format is mandatory and must be used exactly as specified.
    - **Identification Documents:** Format as "[Jurisdiction/Country] [Document Type] of Petitioner". Examples:
        - "United States passport of Petitioner"
        - "New Mexico driver's license of Petitioner"
        - "Mexican passport of Petitioner"
        - "Consular identification of Petitioner"
        - Always include the jurisdiction/issuing authority first.
    - **Employment Authorization Card (EAD):** If an Employment Authorization card belongs to the Petitioner, format as "Employment Authorization card of Petitioner" or "Employment Authorization card of Petitioner (with English translation)". 
        - **CRITICAL:** You MUST identify who the Employment Authorization card belongs to by reading the name on the card. Verify the name matches "${names.petitioner}" before including it in Tab A.
    - **Tax Records:** Format as "[YEAR] tax records of Petitioner" or "[YEAR] tax records of Petitioner (with English translation)". Example: "2022, 2023 tax records of Petitioner".
    - **Earning Statements:** Format as "[COMPANY NAME] earning statements of Petitioner" or "[COMPANY NAME] earning statements of Petitioner (with English translation)". Examples:
        - "Wells Fargo earning statements of Petitioner"
        - "ABC Corporation pay stubs of Petitioner"
    - **ORDERING RULE (STRICT):** When listing Tab A items, ALWAYS sort in this order:
        1) United States birth certificate of Petitioner proving United States citizenship (if found),
        2) Identification documents (passport, driver's license, consular ID, etc.),
        3) Tax records (any tax/IRS/return/W-2/1099 related documents),
        4) Earning statements/pay stubs.

    **TAB B - DOCUMENTS ESTABLISHING IDENTITY, NATIONALITY, AND LAWFUL ENTRY TO THE UNITED STATES OF BENEFICIARY:**
    - **CRITICAL RULE:** Tab B MUST ONLY contain documents that belong to the BENEFICIARY. DO NOT include documents belonging to Petitioner's family members, children, relatives, or any other person.
    - **Birth Certificate:** Format as "Birth certificate of Beneficiary" or "Birth certificate of Beneficiary (with English translation)" if translation exists.
        - **CRITICAL:** Only include the Beneficiary's birth certificate here. Birth certificates of Petitioner's children, relatives, or any other family members MUST go to Tab D.
    - **Passport:** Format as "[Country] passport of Beneficiary" or "[Country] passport of Beneficiary (with English translation)". Examples:
        - "Mexican passport of Beneficiary"
        - "Guatemalan passport of Beneficiary"
        - **CRITICAL:** Only include passports that belong to the Beneficiary. Verify the name on the passport matches "${names.beneficiary}" before including it.
    - **Consular Identification:** Format as "Consular identification of Beneficiary" or "Consular identification of Beneficiary (with English translation)".
        - **CRITICAL:** Only include consular IDs that belong to the Beneficiary. Verify the name matches "${names.beneficiary}".
    - **Driver's License:** Format as "[State/Country] driver's license of Beneficiary" or "[State/Country] driver's license of Beneficiary (with English translation)". Example: "Texas driver's license of Beneficiary".
        - **CRITICAL:** Only include driver's licenses that belong to the Beneficiary. Verify the name matches "${names.beneficiary}". DO NOT invent or assume driver's licenses that are not present in the evidence.
    - **Employment Authorization Card (EAD):** Format as "Employment Authorization card of [OWNER OF DOCUMENT]" or "Employment Authorization card of [OWNER OF DOCUMENT] (with English translation)". 
        - **CRITICAL:** You MUST identify who the Employment Authorization card belongs to by reading the name on the card. The owner could be Petitioner, Beneficiary, Sponsor, or any other person.
        - Examples:
            - "Employment Authorization card of Beneficiary"
            - "Employment Authorization card of Petitioner"
            - "Employment Authorization card of Sponsor"
            - "Employment Authorization card of Petitioner's son, [Child's Name]"
        - Verify the name on the card matches the person you're assigning it to.
    - **ORDERING RULE (STRICT):** When listing Tab B items, ALWAYS sort in this order:
        1) Birth certificate of Beneficiary (if found),
        2) Passport,
        3) Consular identification,
        4) Driver's license,
        5) Employment Authorization Card.

    **TAB C - DOCUMENTS ESTABLISHING BONA-FIDE RELATIONSHIP OF BENEFICIARY AND PETITIONER:**
    - **Family Photos:** Format as "Family photos of Petitioner with Beneficiary" or "Family photos of Petitioner with Beneficiary (with English translation)".
    - **Joint Bank Statements:** Format as "[BANK NAME] bank account statements of Petitioner and Beneficiary" or "[BANK NAME] bank account statements of Petitioner and Beneficiary (with English translation)". Examples:
        - "Wells Fargo bank account statements of Petitioner and Beneficiary"
        - "Chase bank account statements of Petitioner and Beneficiary"
    - **Joint Bills/Utility Bills:** Format as "[COMPANY NAME] bill of Petitioner and Beneficiary" or "[COMPANY NAME] bill of Petitioner and Beneficiary (with English translation)". Examples:
        - "SoColGas bill of Petitioner and Beneficiary"
        - "AT&T bill of Petitioner and Beneficiary"
    - **Joint Leases/Rental Agreements:** Format as "Lease agreement of Petitioner and Beneficiary" or "Rental agreement of Petitioner and Beneficiary" or with "(with English translation)" if applicable.
    - **Any Document Showing Both Names:** Format as "[Document Type] of Petitioner and Beneficiary" or "[Document Type] of Petitioner and Beneficiary (with English translation)". Examples:
        - "Marriage certificate of Petitioner and Beneficiary"
        - "Joint tax return of Petitioner and Beneficiary"
    - **CRITICAL:** Every Tab C document MUST clearly indicate that it shows both Petitioner and Beneficiary together or proves their relationship.

    **TAB D - DOCUMENTS ESTABLISHING BENEFICIARY'S GOOD MORAL CHARACTER AND TIES TO THE UNITED STATES:**
    - **FBI Background Check:** Format as "FBI background check of Beneficiary" or "FBI background check of Beneficiary (with English translation)".
    - **Police Criminal Records:** Format as "[FULL NAME OF LAW ENFORCEMENT AGENCY] criminal records of Beneficiary" or "[FULL NAME OF LAW ENFORCEMENT AGENCY] criminal records of Beneficiary (with English translation)". Examples:
        - "El Paso Police Department criminal records of Beneficiary"
        - "Cook County Sheriff's Office criminal records of Beneficiary"
        - CRITICAL: Use the FULL, COMPLETE name of the agency as it appears in the document. Do not abbreviate or shorten it.
    - **Letters of Recommendation:** Format as "Letter of recommendation from [Author's Full Name] in support of Beneficiary". Example: "Letter of recommendation from Jane Doe in support of Beneficiary".
        - You MUST list each letter of recommendation as a separate item. Do not group them.
        - Identify the author's full name from the signature section, first sentence, or attached ID document.
    - **Birth Certificates of Family Members:** Format as "Birth certificate of [Person's Name]" or "Birth certificate of [Person's Name] (with English translation)". Examples:
        - "Birth certificate of Petitioner's son, [Child's Name]"
        - "Birth certificate of Petitioner's daughter, [Child's Name]"
        - "Birth certificate of [Relative's Name]"
        - **CRITICAL:** Birth certificates of Petitioner's children, relatives, or any family members (other than Beneficiary) MUST be listed here in Tab D, NOT in Tab B.
    - **Marriage Certificates:** Format as "Marriage certificate of [Person(s)]" or "Marriage certificate of [Person(s)] (with English translation)". Examples:
        - "Marriage certificate of Petitioner and [Spouse Name]"
        - "Marriage certificate of [Person's Name]"
        - **CRITICAL:** Marriage certificates that do NOT show both Petitioner and Beneficiary together MUST be listed here in Tab D, NOT in Tab C.
    - **Divorce Certificates:** Format as "Divorce certificate of [Person(s)]" or "Divorce certificate of [Person(s)] (with English translation)". Examples:
        - "Divorce certificate of Petitioner from [Spouse Name]"
        - "Divorce certificate of [Person's Name]"
        - **CRITICAL:** All divorce certificates MUST be listed here in Tab D.
    - **Other Documents:** Any other documents that establish good moral character or ties to the United States that don't fit in other tabs.
    - **ORDERING RULE (STRICT):** When listing Tab D items, ALWAYS sort in this order:
        1) FBI background check of Beneficiary (if found),
        2) Local criminal history/clearance of Beneficiary (e.g., police department clearance) (if found),
        3) Letters of recommendation (if found),
        4) Birth certificates of family members (if found),
        5) Marriage certificates (if found),
        6) Divorce certificates (if found),
        7) Other supporting documents (if found).

    **TAB E - DOCUMENTS ESTABLISHING IDENTITY, NATIONALITY, AND INCOME OF SPONSOR:**
    - **CRITICAL ORDERING RULE:** Sponsor documents MUST ALWAYS be listed in this exact order:
        1) Birth certificate OR Naturalization certificate (ALWAYS FIRST):
            - Format as "Birth certificate of Sponsor proving United States citizenship" or "Birth certificate of Sponsor proving United States citizenship (with English translation)"
            - OR "Naturalization certificate of Sponsor proving United States citizenship" or "Naturalization certificate of Sponsor proving United States citizenship (with English translation)"
        2) Identification documents (passport, driver's license, LPR card):
            - Format as "[Jurisdiction/Country] [Document Type] of Sponsor". Examples:
                - "United States passport of Sponsor"
                - "New Mexico driver's license of Sponsor"
                - "California driver's license of Sponsor"
                - "Legal Permanent Resident card of Sponsor"
            - ALWAYS first explain the jurisdiction issuing the identification.
        3) Tax records:
            - Format as "[YEAR] tax records of Sponsor" or "[YEAR] tax records of Sponsor (with English translation)". Example: "2022, 2023 tax records of Sponsor".
        4) Earning statements:
            - Format as "[COMPANY NAME] earning statements of Sponsor" or "[COMPANY NAME] earning statements of Sponsor (with English translation)". Examples:
                - "Wells Fargo earning statements of Sponsor"
                - "ABC Corporation pay stubs of Sponsor"

    **GENERAL RULES:**
    - **CRITICAL - Only List Documents That Actually Exist:** You MUST ONLY identify and list documents that are ACTUALLY PRESENT in the evidence files provided. DO NOT invent, assume, infer, or create documents that are not explicitly shown in the evidence. If you cannot clearly see a document in the text or filename, DO NOT include it in your output. This is extremely important - false positives are unacceptable.
    - **Name Verification:** When identifying who a document belongs to, you MUST carefully read the document and verify the name matches the person you're assigning it to. Compare names character-by-character:
        - For Beneficiary documents: Verify the name matches "${names.beneficiary}"
        - For Petitioner documents: Verify the name matches "${names.petitioner}"
        - For Sponsor documents: Verify the name matches "${names.sponsor}"
        - If a document shows a different name (e.g., a child's name, relative's name), it does NOT belong to that person.
    - **Translation Detection:** If a document appears to be an English translation of another document (e.g., filename contains "_trans", "translation", "translated", or the document text indicates it's a translation), set "has_translation" to true and append "(with English translation)" to the description.
    - **Specificity is CRITICAL:** NEVER use vague descriptions like "identification document", "undefined", or generic terms. ALWAYS be specific:
        - BAD: "identification document"
        - GOOD: "Mexican passport of Beneficiary"
        - BAD: "bank statement"
        - GOOD: "Wells Fargo bank account statements of Petitioner and Beneficiary"
    - **Name Matching:** When identifying who a document belongs to, carefully compare names in the document with the provided names (Petitioner, Beneficiary, Sponsor). Be aware of name variations, middle names, and nicknames, but DO NOT assume a document belongs to someone if the name doesn't match.
    - **Relationship Documents:** For Tab C, documents must clearly show both Petitioner and Beneficiary together or prove their relationship. If a document only shows one person's name, it does NOT belong in Tab C.
    - **Family Member Documents:** Documents belonging to Petitioner's children, relatives, or other family members (other than Beneficiary) should be listed in Tab D, NOT in Tab B. Tab B is ONLY for Beneficiary's documents.

    **Output Requirement:**
    You MUST return a single, valid JSON array of objects. Each object represents one unique piece of evidence from the final, de-duplicated list. If you find no documents, return an empty array.
    `;

    const responseSchema = {
        type: Type.ARRAY,
        items: {
            type: Type.OBJECT,
            properties: {
                tab: { type: Type.STRING, enum: ['A','B','C','D','E'] as any },
                description: { type: Type.STRING },
                sourceFilename: { type: Type.STRING },
                confidence: { type: Type.NUMBER },
            },
            required: ["tab", "description"]
        }
    };

    try {
        const response = await getAIInstance().models.generateContent({
            model: 'gemini-2.5-pro',
            contents: [{ parts: [{ text: prompt }] }],
            config: {
                systemInstruction: "You are an expert paralegal assistant. Return ONLY a valid JSON array matching the requested structure.",
                responseMimeType: "application/json",
                responseSchema: responseSchema,
                safetySettings: safetySettings,
                temperature: 0.1,
                topK: 40,
            },
        });
        const text = response.text;
        const parsed: Array<any> = JSON.parse(text);

        // Apply rules-first constraints post-processing
        let filtered = parsed
          .filter(item => item && item.tab && item.description)
          .map(item => {
            const desc = String(item.description);
            const file = String(item.sourceFilename || '');
            return {
              tab: String(item.tab),
              description: desc,
              sourceFilename: file,
              confidence: typeof item.confidence === 'number' ? item.confidence : 0.7,
            };
          })
          .filter(item => item.confidence >= 0.5);

        // Apply Tab A ordering rule
        const priorityForA = (desc: string): number => {
          const d = (desc || '').toLowerCase();
          if (/birth certificate/.test(d)) return 0;
          if (/(passport|driver|consular|identification|id card)/.test(d)) return 1;
          if (/(tax|irs|return|w-2|1099)/.test(d)) return 2;
          if (/(earning|pay stub|payroll|income)/.test(d)) return 3;
          return 4;
        };
        const aItems = filtered.filter(i => i.tab === 'A').sort((a, b) => priorityForA(a.description) - priorityForA(b.description));
        
        // Apply Tab B ordering rule
        const priorityForB = (desc: string): number => {
          const d = (desc || '').toLowerCase();
          if (/birth certificate/.test(d)) return 0;
          if (/passport/.test(d)) return 1;
          if (/consular/.test(d)) return 2;
          if (/driver/.test(d)) return 3;
          if (/(ead|employment authorization)/.test(d)) return 4;
          return 5;
        };
        const bItems = filtered.filter(i => i.tab === 'B').sort((a, b) => priorityForB(a.description) - priorityForB(b.description));
        
        // Apply Tab D ordering rule
        const priorityForD = (desc: string): number => {
          const d = (desc || '').toLowerCase();
          if (/fbi/.test(d)) return 0;
          if (/(criminal|police|clearance|background)/.test(d)) return 1;
          if (/letter of recommendation/.test(d)) return 2;
          return 3;
        };
        const dItems = filtered.filter(i => i.tab === 'D').sort((a, b) => priorityForD(a.description) - priorityForD(b.description));
        
        // Apply Tab E ordering rule (Sponsor)
        const priorityForE = (desc: string): number => {
          const d = (desc || '').toLowerCase();
          if (/(birth certificate|naturalization certificate)/.test(d)) return 0;
          if (/(passport|driver|consular|identification|id card|lpr|legal permanent)/.test(d)) return 1;
          if (/(tax|irs|return|w-2|1099)/.test(d)) return 2;
          if (/(earning|pay stub|payroll|income)/.test(d)) return 3;
          return 4;
        };
        const eItems = filtered.filter(i => i.tab === 'E').sort((a, b) => priorityForE(a.description) - priorityForE(b.description));
        
        // Tab C doesn't need special ordering
        const cItems = filtered.filter(i => i.tab === 'C');
        
        // Combine all tabs in order
        filtered = [...aItems, ...bItems, ...cItems, ...dItems, ...eItems];

        // Strip extras to preserve existing UI expectations
        return filtered.map(i => ({ tab: i.tab, description: i.description }));
    } catch (error: any) {
        console.error(`I-130 AI Document List Generation Error:`, error);
        throw new Error(`AI analysis of evidence failed: ${error.message}`);
    }
};

/**
 * AI Task: Extract all aliases and name variations of the Petitioner from VAWA evidence documents.
 */
export const extractVawaAliases = async (evidence: {fileName: string, fileText: string}[], petitionerName: string): Promise<string[]> => {
    if (!evidence || evidence.length === 0) {
        return [];
    }

    // Build text from all evidence documents
    const allDocsText = evidence.map(doc => {
        const text = doc.fileText || '';
        const chunks: string[] = [];
        for (let i = 0; i < text.length; i += 5000) {
            chunks.push(text.slice(i, i + 5000));
            if (chunks.length >= 5) break; // cap at reasonable size
        }
        return `--- START OF DOCUMENT: ${doc.fileName} ---\n${chunks.join('\n[CONTINUED...]\n')}\n--- END OF DOCUMENT: ${doc.fileName} ---\n`;
    }).join('\n\n');

    const prompt = `
You are an expert immigration paralegal analyzing VAWA evidence documents to identify all aliases and name variations used for the Petitioner.

**Petitioner's Primary Name:** "${petitionerName}"

**Evidence Documents Provided:**
${allDocsText}

**Your Task:**
Carefully read through all the evidence documents and identify EVERY variation, alias, maiden name, nickname, abbreviated name, or other form of the Petitioner's name that appears in these documents.

**What to Look For:**
- Maiden names
- Nicknames or shortened versions (e.g., "Maria" vs "Maria Elena")
- Abbreviated names (e.g., "John A. Smith" vs "John Alexander Smith")
- Name variations with different spellings
- Names with or without middle names
- Any other name forms that refer to the same person

**Important Rules:**
1. Include the PRIMARY name "${petitionerName}" in your list
2. Include ALL variations you find, even if they seem similar
3. Remove duplicates (e.g., if "Jane Smith" appears multiple times, list it only once)
4. Do NOT include the abuser's name or other people's names
5. Focus ONLY on names that refer to the Petitioner
6. If a name appears in quotes or parentheses, include it as found
7. Be thorough - scan all documents carefully

**Output Format:**
Return a JSON array of strings, where each string is a unique name variation/alias found in the documents. Example:
["Jane Alejandra Doe-Smith", "Jane A. Doe-Smith", "Jane Doe", "Janie Doe", "Jane Smith"]

If you find NO aliases or variations (only the primary name appears), return an array with just the primary name: ["${petitionerName}"]
`;

    const responseSchema = {
        type: Type.ARRAY,
        items: { type: Type.STRING }
    };

    try {
        const response = await getAIInstance().models.generateContent({
            model: 'gemini-2.5-flash',
            contents: [{ parts: [{ text: prompt }] }],
            config: {
                systemInstruction: "You are an expert paralegal assistant. Return ONLY a valid JSON array of name strings, or an empty array if no names are found.",
                responseMimeType: "application/json",
                responseSchema: responseSchema,
                safetySettings: safetySettings,
                temperature: 0.1,
                topK: 40,
            },
        });
        const text = response.text;
        let parsed: string[] = JSON.parse(text);
        
        // Clean and deduplicate the aliases
        parsed = parsed.map(name => name.trim()).filter(name => name.length > 0);
        const uniqueAliases = Array.from(new Set(parsed));
        
        return uniqueAliases;
    } catch (error: any) {
        console.error("VAWA Aliases Extraction Error:", error);
        throw new Error(`AI failed to extract aliases: ${error.message}`);
    }
};

/**
 * Check if VAWA case has minimum required documents for paralegal review.
 * Returns an object with hasMinimumDocuments (boolean) and missingDocuments (string[]).
 */
export const checkVawaMinimumDocuments = async (
    classifiedDocs: { [key: string]: string[] },
    abuserName: string,
    petitionerName: string
): Promise<{ hasMinimumDocuments: boolean; missingDocuments: string[] }> => {
    const missingDocuments: string[] = [];

    // Check 1: Birth certificate of Petitioner (Tab A)
    const hasPetitionerBirthCert = classifiedDocs.A.some(desc => 
        /birth certificate.*petitioner/i.test(desc) || 
        /petitioner.*birth certificate/i.test(desc)
    );
    if (!hasPetitionerBirthCert) {
        missingDocuments.push("Birth certificate of Petitioner");
    }

    // Check 2: Passport OR consular ID OR driver's license (Tab A) - at least one
    const hasPetitionerID = classifiedDocs.A.some(desc => {
        const lowerDesc = desc.toLowerCase();
        return /passport.*petitioner/i.test(desc) ||
               /petitioner.*passport/i.test(desc) ||
               /consular.*identification/i.test(lowerDesc) ||
               /matr[ií]cula.*consular/i.test(lowerDesc) ||
               /driver.*license.*petitioner/i.test(desc) ||
               /petitioner.*driver.*license/i.test(desc) ||
               /driving.*license.*petitioner/i.test(desc);
    });
    if (!hasPetitionerID) {
        missingDocuments.push("Passport, Consular ID, or Driver's License of Petitioner");
    }

    // Check 3: Birth certificate of abuser (could be in Tab B or elsewhere)
    const hasAbuserBirthCert = [...classifiedDocs.B, ...classifiedDocs.A, ...classifiedDocs.E].some(desc => {
        const lowerDesc = desc.toLowerCase();
        return (/birth certificate/i.test(lowerDesc) && new RegExp(abuserName.split(' ')[0], 'i').test(lowerDesc)) ||
               /abuser.*birth certificate/i.test(lowerDesc) ||
               /birth certificate.*abuser/i.test(lowerDesc);
    });
    if (!hasAbuserBirthCert && abuserName) {
        // Also check if it might be referenced in Tab B (abuser's USC status)
        const hasAbuserUSCDoc = classifiedDocs.B.some(desc => 
            /birth certificate/i.test(desc.toLowerCase()) && 
            (new RegExp(abuserName.split(' ')[0], 'i').test(desc) || /citizen/i.test(desc))
        );
        if (!hasAbuserUSCDoc) {
            missingDocuments.push(`Birth certificate of abuser (${abuserName})`);
        }
    } else if (!hasAbuserBirthCert) {
        missingDocuments.push("Birth certificate of abuser");
    }

    // Check 4: One evidence listed under Tab C besides the declaration
    // The declaration is always listed, so we need at least 2 items in Tab C
    const tabCDocs = classifiedDocs.C.filter(desc => 
        !/declaration.*petitioner/i.test(desc.toLowerCase())
    );
    if (tabCDocs.length === 0) {
        missingDocuments.push("At least one additional document under Tab C (besides Declaration of Petitioner)");
    }

    // Check 5: Either FBI background check OR local criminal record (Tab D)
    const hasFBIOrCriminalRecord = classifiedDocs.D.some(desc => {
        const lowerDesc = desc.toLowerCase();
        return /fbi.*background/i.test(lowerDesc) ||
               /fbi.*check/i.test(lowerDesc) ||
               /criminal.*background/i.test(lowerDesc) ||
               /criminal.*history/i.test(lowerDesc) ||
               /criminal.*record/i.test(lowerDesc) ||
               /police.*clearance/i.test(lowerDesc) ||
               /police.*criminal/i.test(lowerDesc) ||
               /clearance.*letter/i.test(lowerDesc);
    });
    if (!hasFBIOrCriminalRecord) {
        missingDocuments.push("FBI background check or local criminal history record of Petitioner");
    }

    const hasMinimumDocuments = missingDocuments.length === 0;
    return { hasMinimumDocuments, missingDocuments };
};

/**
 * Check if I-130 case has minimum required documents
 * Required documents:
 * - Birth certificate for Petitioner (Tab A)
 * - Any form of identification for Petitioner (Tab A)
 * - Birth certificate for Beneficiary (Tab B)
 * - Any form of identification for Beneficiary (Tab B)
 * - Any type of identification for Sponsor (Tab E)
 * - Tax records for Sponsor (Tab E)
 */
export const checkI130MinimumDocuments = async (
    classifiedDocs: { [key: string]: string[] }
): Promise<{ hasMinimumDocuments: boolean; missingDocuments: string[] }> => {
    const missingDocuments: string[] = [];

    // Check 1: Birth certificate of Petitioner (Tab A)
    const hasPetitionerBirthCert = classifiedDocs.A.some(desc => 
        /birth certificate.*petitioner/i.test(desc) || 
        /petitioner.*birth certificate/i.test(desc) ||
        /united states birth certificate.*petitioner.*proving.*united states citizenship/i.test(desc)
    );
    if (!hasPetitionerBirthCert) {
        missingDocuments.push("Birth certificate of Petitioner");
    }

    // Check 2: Any form of identification for Petitioner (Tab A) - passport, driver's license, consular ID, etc.
    const hasPetitionerID = classifiedDocs.A.some(desc => {
        const lowerDesc = desc.toLowerCase();
        return /passport.*petitioner/i.test(desc) ||
               /petitioner.*passport/i.test(desc) ||
               /driver.*license.*petitioner/i.test(desc) ||
               /petitioner.*driver.*license/i.test(desc) ||
               /consular.*identification.*petitioner/i.test(lowerDesc) ||
               /petitioner.*consular/i.test(lowerDesc) ||
               /identification.*petitioner/i.test(lowerDesc);
    });
    if (!hasPetitionerID) {
        missingDocuments.push("Identification document of Petitioner (passport, driver's license, or consular ID)");
    }

    // Check 3: Birth certificate of Beneficiary (Tab B)
    const hasBeneficiaryBirthCert = classifiedDocs.B.some(desc => 
        /birth certificate.*beneficiary/i.test(desc) || 
        /beneficiary.*birth certificate/i.test(desc)
    );
    if (!hasBeneficiaryBirthCert) {
        missingDocuments.push("Birth certificate of Beneficiary");
    }

    // Check 4: Any form of identification for Beneficiary (Tab B) - passport, driver's license, consular ID, EAD, etc.
    const hasBeneficiaryID = classifiedDocs.B.some(desc => {
        const lowerDesc = desc.toLowerCase();
        return /passport.*beneficiary/i.test(desc) ||
               /beneficiary.*passport/i.test(desc) ||
               /driver.*license.*beneficiary/i.test(desc) ||
               /beneficiary.*driver.*license/i.test(desc) ||
               /consular.*identification.*beneficiary/i.test(lowerDesc) ||
               /beneficiary.*consular/i.test(lowerDesc) ||
               /employment authorization.*beneficiary/i.test(lowerDesc) ||
               /beneficiary.*employment authorization/i.test(lowerDesc) ||
               /ead.*beneficiary/i.test(lowerDesc) ||
               /identification.*beneficiary/i.test(lowerDesc);
    });
    if (!hasBeneficiaryID) {
        missingDocuments.push("Identification document of Beneficiary (passport, driver's license, consular ID, or Employment Authorization card)");
    }

    // Check 5: Any type of identification for Sponsor (Tab E) - passport, driver's license, birth certificate, naturalization certificate, etc.
    const hasSponsorID = classifiedDocs.E.some(desc => {
        const lowerDesc = desc.toLowerCase();
        return /passport.*sponsor/i.test(desc) ||
               /sponsor.*passport/i.test(desc) ||
               /driver.*license.*sponsor/i.test(desc) ||
               /sponsor.*driver.*license/i.test(desc) ||
               /birth certificate.*sponsor/i.test(lowerDesc) ||
               /sponsor.*birth certificate/i.test(lowerDesc) ||
               /naturalization.*certificate.*sponsor/i.test(lowerDesc) ||
               /sponsor.*naturalization/i.test(lowerDesc) ||
               /identification.*sponsor/i.test(lowerDesc);
    });
    if (!hasSponsorID) {
        missingDocuments.push("Identification document of Sponsor (passport, driver's license, birth certificate, or naturalization certificate)");
    }

    // Check 6: Tax records for Sponsor (Tab E)
    const hasSponsorTaxRecords = classifiedDocs.E.some(desc => {
        const lowerDesc = desc.toLowerCase();
        return /tax.*record.*sponsor/i.test(lowerDesc) ||
               /sponsor.*tax/i.test(lowerDesc) ||
               /irs.*sponsor/i.test(lowerDesc) ||
               /w-2.*sponsor/i.test(lowerDesc) ||
               /1099.*sponsor/i.test(lowerDesc) ||
               /tax return.*sponsor/i.test(lowerDesc);
    });
    if (!hasSponsorTaxRecords) {
        missingDocuments.push("Tax records of Sponsor");
    }

    const hasMinimumDocuments = missingDocuments.length === 0;
    return { hasMinimumDocuments, missingDocuments };
};

/**
 * Check if Naturalization case has minimum required documents
 * Required documents:
 * - Birth certificate for Applicant (Tab A)
 * - Legal Permanent Residence card of Applicant (Tab A)
 * - Any type of criminal record (Tab B)
 */
export const checkNaturalizationMinimumDocuments = async (
    tabADocs: string[],
    tabBDocs: string[]
): Promise<{ hasMinimumDocuments: boolean; missingDocuments: string[] }> => {
    const missingDocuments: string[] = [];

    // Check 1: Birth certificate of Applicant (Tab A)
    const hasApplicantBirthCert = tabADocs.some(desc => 
        /birth certificate.*applicant/i.test(desc) || 
        /applicant.*birth certificate/i.test(desc) ||
        /birth certificate/i.test(desc)
    );
    if (!hasApplicantBirthCert) {
        missingDocuments.push("Birth certificate of Applicant");
    }

    // Check 2: Legal Permanent Residence card of Applicant (Tab A)
    const hasLPRCard = tabADocs.some(desc => {
        const lowerDesc = desc.toLowerCase();
        return /legal permanent resident/i.test(lowerDesc) ||
               /permanent resident card/i.test(lowerDesc) ||
               /lpr card/i.test(lowerDesc) ||
               /green card/i.test(lowerDesc) ||
               /form i-551/i.test(lowerDesc) ||
               /permanent residence/i.test(lowerDesc);
    });
    if (!hasLPRCard) {
        missingDocuments.push("Legal Permanent Residence card of Applicant");
    }

    // Check 3: Any type of criminal record (Tab B)
    const hasCriminalRecord = tabBDocs.some(desc => {
        const lowerDesc = desc.toLowerCase();
        return /criminal record/i.test(lowerDesc) ||
               /criminal history/i.test(lowerDesc) ||
               /criminal background/i.test(lowerDesc) ||
               /fbi.*background/i.test(lowerDesc) ||
               /fbi.*check/i.test(lowerDesc) ||
               /police.*criminal/i.test(lowerDesc) ||
               /police.*clearance/i.test(lowerDesc) ||
               /clearance.*letter/i.test(lowerDesc) ||
               /criminal.*clearance/i.test(lowerDesc);
    });
    if (!hasCriminalRecord) {
        missingDocuments.push("Criminal record of Applicant (FBI background check, police clearance, or criminal history)");
    }

    const hasMinimumDocuments = missingDocuments.length === 0;
    return { hasMinimumDocuments, missingDocuments };
};

/**
 * AI Task: Analyze immigration forms for inconsistencies against a client's declaration.
 */
export const analyzeFormsForInconsistencies = async (declarationText: string, forms: { fileName: string, fileText: string }[]): Promise<InconsistencyReport[]> => {
    // Use more of the form text - forms can be long, but we need to see all relevant sections
    const formsText = forms.map(form => {
        const text = form.fileText || '';
        // Take up to 30,000 chars, prioritizing the beginning (where most critical info is)
        const textToUse = text.length > 30000 ? text.substring(0, 30000) + '\n\n[... Form continues, but key sections above ...]' : text;
        return `--- START OF FORM: ${form.fileName} ---\n\n${textToUse}\n\n--- END OF FORM: ${form.fileName} ---`;
    }).join('\n\n');
    const formNames = forms.map(f => f.fileName).join(', ');

    const prompt = `
ROLE: You are a meticulous immigration paralegal tasked with comparing USCIS forms against a client's declaration. Your job is to find EVERY error, inconsistency, and discrepancy. The declaration is your source of truth.

METHODOLOGY: Two-Phase Approach

PHASE 1: EXTRACT INFORMATION FROM DECLARATION

**Client's Declaration (Your Source of Truth):**
"""
${declarationText.substring(0, 25000)}
"""

Read the declaration carefully and extract the following information. Write down EXACTLY what you find:

1. **Petitioner's Full Name**: Extract the complete legal name exactly as written (including all middle names, multiple surnames). Example: "Jane Alejandra Maria Doe-Smith"

2. **Petitioner's Date of Birth**: Extract the exact date of birth as written. Note the format used. Example: "05/15/1990" or "May 15, 1990"

3. **Petitioner's Place of Birth**: Extract city and country exactly as written. Example: "Mexico City, Mexico"

4. **Abuser's Full Name**: Extract the abuser's complete name exactly as written. Example: "John Michael Smith"

5. **Abuser's Date of Birth**: Extract the abuser's date of birth if mentioned. Note the format.

6. **Petitioner's Children**: For EACH child mentioned, extract:
   - Child's Full Name: Exactly as written (including middle names)
   - Child's Date of Birth: Exactly as written (note the format)

7. **Last Address of Cohabitation with Abuser**: Extract the complete address where Petitioner last lived with the abuser. Include street, city, state, zip code if provided.

8. **Dates When Petitioner Last Lived with Abuser**: Extract any dates mentioned about when Petitioner cohabited with the abuser. Look for phrases like "lived together from [date] to [date]" or "lived together since [date]" or "lived together until [date]".

9. **Petitioner's Marriages**: For EACH marriage mentioned:
   - Spouse's name (if mentioned)
   - Marriage date (if mentioned)
   - Divorce date (if mentioned)
   - Any other relevant details

10. **Entries and Exits from the United States**: Extract ALL entries and exits mentioned:
    - Date of each entry
    - Port of entry (if mentioned)
    - Date of each exit (if mentioned)
    - Port of exit (if mentioned)
    - Most recent entry date and port

PHASE 2: SYSTEMATIC FORM ANALYSIS

**Forms to Analyze:**
"""
${formsText}
"""

For EACH form, systematically check EVERY piece of information you extracted in Phase 1:

**MANDATORY CHECKS FOR EACH FORM:**

1. **Petitioner's Full Name Check:**
   - Look in Part 1 or equivalent section
   - Compare character-by-character with declaration
   - Check for: missing middle names, abbreviations, misspellings, missing surnames
   - ✓ If ANY difference found, report it

2. **Petitioner's Date of Birth Check:**
   - Find DOB field in the form
   - Compare EXACTLY - same date must appear
   - Note format differences (MM/DD/YYYY vs DD/MM/YYYY)
   - ✓ If ANY difference found, report it

3. **Petitioner's Place of Birth Check:**
   - Find place of birth field
   - Compare city and country exactly
   - ✓ If ANY difference found, report it

4. **Abuser's Name Check:**
   - Find abuser name field (if present in form)
   - Compare exactly with declaration
   - ✓ If ANY difference found, report it

5. **Abuser's Date of Birth Check:**
   - Find abuser DOB field (if present)
   - Compare exactly with declaration
   - ✓ If ANY difference found, report it

6. **Children Information Check:**
   - Find children section (I-360 Part 5, I-485 children section/addendum)
   - For EACH child from declaration:
     - Find the child's name in the form
     - Compare EXACTLY - check spelling, middle names
     - Find the child's DOB in the form
     - Compare EXACTLY - same date must appear
   - ✓ If ANY child's information differs, report it
   - ✓ If any child from declaration is missing from form, report it

7. **Aliases/Other Names Check:**
   - Find alias sections:
     - I-485: Part 1, Item 4 ("Other Names You Have Used Since Birth")
     - I-765: Part 2, Items 5-7 ("Other Names You Have Used")
     - I-360: Any alias fields
   - Check ALL alias fields in the form (including addendum pages)
   - Compare against ALL names/aliases mentioned in declaration
   - ✓ If ANY alias from declaration is missing, report it

8. **Last Address of Cohabitation Check:**
   - Find address fields in the form
   - Compare the address where Petitioner last lived with abuser
   - Check for: different street names, different city, different state, different zip code
   - ✓ If address does not match, report it

9. **Dates of Cohabitation Check:**
   - Look for date fields related to cohabitation or residence
   - Compare with dates extracted from declaration
   - ✓ If dates do not match exactly, report it

10. **Marriage Information Check:**
    - Find marriage/relationship sections in forms
    - Compare marriage information with what was extracted
    - Check spouse names, marriage dates, divorce dates
    - ✓ If ANY difference found, report it

11. **Entry/Exit Dates Check:**
    - Find "Date of Last Arrival" or entry date fields
    - Compare with most recent entry date from declaration
    - Check port of entry if mentioned in form
    - Look in addendum sections too
    - ✓ If entry date does not match exactly, report it
    - ✓ If port of entry differs, report it

CRITICAL RULES FOR COMPARISON:

1. **EXACT MATCHING REQUIRED**: Names, dates, and addresses must match EXACTLY. Any variation is an error.
   - "Jane A. Smith" vs "Jane Alejandra Smith" = ERROR (missing middle name)
   - "Micheal" vs "Michael" = ERROR (misspelling)
   - "05/15/1990" vs "15/05/1990" = ERROR (different date format)
   - "123 Main St" vs "123 Main Street" = POTENTIAL ERROR (check context)

2. **MISSING INFORMATION**: If information from declaration is missing from form, report it.

3. **SPELLING MATTERS**: One letter difference is an error. Report it.

4. **DATE FORMATS**: Different date formats (MM/DD/YYYY vs DD/MM/YYYY) are errors. Report them.

5. **ADDRESSES**: Addresses must match exactly. Different street names, cities, states, or zip codes are errors.

OUTPUT FORMAT:

For each inconsistency found, create a JSON object with:
- **formName**: The filename (e.g., "I-485.pdf")
- **inconsistentField**: What field has the error (e.g., "Petitioner Full Name", "Child 1: Name", "Date of Birth", "Entry Date", "Cohabitation Address")
- **valueInForm**: The EXACT text from the form showing the error (copy word-for-word)
- **correctValueFromDeclaration**: The EXACT value from the declaration
- **explanation**: Clear explanation of the discrepancy
- **evidenceQuote**: The exact quote from the form (same as valueInForm)
- **formSection**: Where you found it (e.g., "I-485 Part 1, Item 1", "I-360 Part 5, Child 1")

EXAMPLES OF WHAT TO REPORT:

1. Name Error: "Form shows 'Jane A. Doe' but declaration states 'Jane Alejandra Doe' (middle name abbreviated in form)"

2. Misspelling: "Form shows 'Micheal Smith' but declaration states 'Michael Smith' (spelling error: missing 'a')"

3. Date Format Error: "Form shows '15/05/1990' but declaration states '05/15/1990' (date format mismatch)"

4. Missing Alias: "Alias 'Maria Lopez' mentioned in declaration is missing from Form I-485, Part 1, Item 4"

5. Child Name Error: "Child 1's name in form shows 'John A. Smith' but declaration states 'John Alexander Smith' (middle name abbreviated)"

6. Address Error: "Form shows address '123 Main Street' but declaration states '123 Main St, Apt 4B' (incomplete address in form)"

7. Entry Date Error: "Form shows last entry date '01/20/2018' but declaration states '01/15/2018' (different date)"

8. Missing Child: "Child 'Sarah Smith' mentioned in declaration is missing from Form I-485 children section"

FINAL INSTRUCTION:

Be systematic. Go through every item from Phase 1 and check it against every form. Don't skip anything. If there's ANY difference, no matter how small, report it. If you cannot find a piece of information in a form that should be there based on the declaration, report it as missing.

Return a JSON array of all inconsistencies found. If no inconsistencies are found after systematic checking, return an empty array [].
    `;

    const responseSchema = {
        type: Type.ARRAY,
        items: {
            type: Type.OBJECT,
            properties: {
                formName: { type: Type.STRING },
                inconsistentField: { type: Type.STRING },
                valueInForm: { type: Type.STRING },
                correctValueFromDeclaration: { type: Type.STRING },
                explanation: { type: Type.STRING },
                evidenceQuote: { type: Type.STRING },
                formSection: { type: Type.STRING },
            },
            required: ["formName", "inconsistentField", "valueInForm", "correctValueFromDeclaration", "explanation", "evidenceQuote", "formSection"]
        }
    };

    try {
        const response = await getAIInstance().models.generateContent({
            model: 'gemini-2.5-pro', // Using a more powerful model for this complex comparison task
            contents: [{ parts: [{ text: prompt }] }],
            config: {
                systemInstruction: "You are an experienced immigration attorney conducting a mandatory quality control review. Your job is to find EVERY error, inconsistency, and missing information. Be thorough and systematic - check every field against the declaration. If there's any doubt about a match, report it as an inconsistency. Common errors include missing middle names, abbreviated names, date format differences, missing aliases, and typos. Return ONLY a valid JSON array of inconsistencies, or an empty array if you have confirmed NO errors exist after systematic checking.",
                responseMimeType: "application/json",
                responseSchema: responseSchema,
                safetySettings: safetySettings,
                temperature: 0.1,
                topK: 40,
            },
        });
        const text = response.text;
        const parsed: InconsistencyReport[] = JSON.parse(text);
        // More flexible verification - allow partial matches and normalize whitespace
        const formIndex: Record<string, string> = Object.fromEntries(
          forms.map(f => [f.fileName, f.fileText || ''])
        );
        const verified = parsed.filter(item => {
          const formText = formIndex[item.formName] || '';
          const quote = item.evidenceQuote || item.valueInForm || '';
          
          if (quote === 'Not provided' || quote === '' || quote.trim() === '') {
            return true; // Missing fields are always valid to report
          }
          
          // Normalize whitespace for comparison
          const normalizedQuote = quote.trim().replace(/\s+/g, ' ');
          const normalizedFormText = formText.replace(/\s+/g, ' ');
          
          // Check for exact match first
          if (normalizedFormText.includes(normalizedQuote)) {
            return true;
          }
          
          // Check for case-insensitive match
          if (normalizedFormText.toLowerCase().includes(normalizedQuote.toLowerCase())) {
            return true;
          }
          
          // For short quotes (likely names or dates), check if a close variation exists
          if (normalizedQuote.length < 50) {
            // Try matching with some flexibility for special characters
            const flexibleQuote = normalizedQuote.replace(/[.,;:]/g, '');
            const flexibleFormText = normalizedFormText.replace(/[.,;:]/g, '');
            if (flexibleFormText.toLowerCase().includes(flexibleQuote.toLowerCase())) {
              return true;
            }
          }
          
          // Last resort: if the quote contains key words from the value, accept it
          const keyWords = normalizedQuote.split(/\s+/).filter(w => w.length > 2);
          if (keyWords.length > 0) {
            const allWordsMatch = keyWords.every(word => 
              normalizedFormText.toLowerCase().includes(word.toLowerCase())
            );
            if (allWordsMatch && keyWords.length >= 2) {
              return true; // If 2+ key words match, likely the same field
            }
          }
          
          // If none of the above, drop it
          console.warn(`Dropping unverifiable quote: "${quote}" from ${item.formName}`);
          return false;
        });
        
        return verified;
    } catch (error: any) {
        console.error("AI Form Inconsistency Analysis Error:", error);
        throw new Error(`AI failed to analyze forms: ${error.message}`);
    }
};

/**
 * AI Task: Analyze criminal records and provide immigration implications based on INA and case law.
 */
export const analyzeCriminalRecords = async (criminalRecordText: string, clientName: string): Promise<{
    charges: string[];
    analysis: string;
    immigrationImplications: string;
    relevantINASections: string[];
    caseLawReferences: string[];
}> => {
    const prompt = `
You are an expert immigration attorney with deep knowledge of the Immigration and Nationality Act (INA) and relevant case law. Your task is to analyze criminal records and provide comprehensive immigration implications.

**Client Name:** ${clientName}

**Criminal Records to Analyze:**
"""
${criminalRecordText.substring(0, 50000)}
"""

**Your Analysis Process:**

1. **Identify All Charges:**
   - Read through the criminal records carefully
   - List ALL criminal charges, offenses, convictions, or pending cases mentioned
   - Include the specific statute or code section if mentioned
   - Note the date of each charge/conviction
   - Note the disposition (convicted, dismissed, pending, etc.)

2. **Analyze Each Charge as a Human Attorney Would:**
   - For each charge, analyze:
     * The nature and severity of the offense
     * Whether it's a misdemeanor or felony
     * The potential sentence or actual sentence imposed
     * Whether it involves moral turpitude
     * Whether it's an aggravated felony under INA §101(a)(43)
     * Whether it's a crime involving domestic violence, stalking, or child abuse
     * Whether it's a controlled substance offense
     * Any other relevant characteristics

3. **Research Immigration and Nationality Act (INA):**
   - You MUST use your search capabilities to access the official U.S. government website (uscis.gov, justice.gov, or congress.gov) to find the current, official text of relevant INA sections
   - Identify which INA sections are relevant to each charge:
     * INA §212(a)(2) - Criminal and related grounds for inadmissibility
     * INA §212(a)(6) - Immigration violations
     * INA §237(a)(2) - Criminal grounds for deportability
     * INA §101(a)(43) - Definition of aggravated felony
     * INA §212(h) - Waiver for certain criminal grounds
     * INA §240A(a) - Cancellation of removal
     * Any other relevant INA provisions
   - For each relevant section, explain how it applies to the specific charges

4. **Research Case Law:**
   - Use your search capabilities to find relevant case law from:
     * Board of Immigration Appeals (BIA) decisions
     * Federal court decisions (especially circuit courts)
     * Supreme Court decisions if applicable
   - Find cases that are factually similar or involve the same or similar charges
   - Cite specific cases with their full citations (e.g., Matter of [Name], [Volume] I&N Dec. [Page] (BIA [Year]))
   - Explain how these cases apply to the client's situation

5. **Provide Immigration Implications:**
   - For each charge, explain:
     * Whether it makes the client inadmissible (barred from entering or adjusting status)
     * Whether it makes the client deportable (subject to removal)
     * Whether any waivers are available (e.g., INA §212(h), INA §240A)
     * The likelihood of success for any available waivers
     * Any other immigration consequences
   - Consider the client's current immigration status (if mentioned in records)
   - Consider whether the client has lawful permanent resident status, is a nonimmigrant, or is undocumented
   - Explain any time-based bars (e.g., 3-year, 10-year bars)
   - Explain any permanent bars

6. **Provide Strategic Recommendations:**
   - If waivers are available, explain the requirements
   - If no waivers are available, explain the consequences clearly
   - Provide any other strategic considerations

**CRITICAL REQUIREMENTS:**
- You MUST use your search capabilities to access official government sources for INA text
- You MUST research actual case law - do not make up case names or citations
- Be thorough and comprehensive - analyze every charge mentioned
- Be specific about INA sections and cite them accurately
- Provide realistic assessments - do not give false hope if the situation is serious
- If you cannot find specific information, state that clearly rather than guessing

**Output Format:**
Return a JSON object with the following structure:
{
    "charges": ["Charge 1 with statute", "Charge 2 with statute", ...],
    "analysis": "Detailed analysis of each charge, explaining what it means, its severity, and characteristics relevant to immigration law. This should be written as a human attorney would analyze it.",
    "immigrationImplications": "Comprehensive explanation of immigration consequences for each charge, including inadmissibility, deportability, available waivers, and strategic recommendations.",
    "relevantINASections": ["INA §212(a)(2)(A)(i)(I) - Crimes involving moral turpitude", "INA §237(a)(2)(A)(iii) - Aggravated felonies", ...],
    "caseLawReferences": ["Matter of Silva-Trevino, 24 I&N Dec. 687 (A.G. 2008)", "Matter of [Case Name], [Citation]", ...]
}
`;

    const responseSchema = {
        type: Type.OBJECT,
        properties: {
            charges: {
                type: Type.ARRAY,
                items: { type: Type.STRING },
                description: "Array of all criminal charges identified in the records"
            },
            analysis: {
                type: Type.STRING,
                description: "Detailed human-like analysis of each charge, explaining what it means, its severity, and characteristics relevant to immigration law"
            },
            immigrationImplications: {
                type: Type.STRING,
                description: "Comprehensive explanation of immigration consequences for each charge, including inadmissibility, deportability, available waivers, and strategic recommendations"
            },
            relevantINASections: {
                type: Type.ARRAY,
                items: { type: Type.STRING },
                description: "List of relevant INA sections with brief descriptions of how they apply"
            },
            caseLawReferences: {
                type: Type.ARRAY,
                items: { type: Type.STRING },
                description: "List of relevant case law citations with full case names and citations"
            }
        },
        required: ["charges", "analysis", "immigrationImplications", "relevantINASections", "caseLawReferences"]
    };

    try {
        const response = await getAIInstance().models.generateContent({
            model: 'gemini-2.5-pro', // Use the same model as questions feature for consistency
            contents: [{ parts: [{ text: prompt }] }],
            config: {
                tools: [{googleSearch: {}}], // Enable Google Search to research INA and case law
                systemInstruction: "You are an expert immigration attorney. You must use your search capabilities to access official government sources for INA text and research actual case law. Be thorough, accurate, and provide realistic assessments. Do not make up case citations - only cite cases you can verify through search.",
                safetySettings: safetySettings,
                temperature: 0.3, // Match questions feature temperature for consistency
                topK: 40,
                topP: 0.95, // Match questions feature topP for better response quality
            },
        });
        
        const text = response.text;
        let parsed = parseJsonPayload(text);
        
        // Ensure all required fields are present
        if (!parsed.charges) parsed.charges = [];
        if (!parsed.analysis) parsed.analysis = "Analysis not available.";
        if (!parsed.immigrationImplications) parsed.immigrationImplications = "Immigration implications not available.";
        if (!parsed.relevantINASections) parsed.relevantINASections = [];
        if (!parsed.caseLawReferences) parsed.caseLawReferences = [];
        
        return parsed;
    } catch (error: any) {
        console.error("Criminal Record Analysis Error:", error);
        throw new Error(`AI failed to analyze criminal records: ${error.message}`);
    }
};

/**
 * Analyze a single Naturalization document to classify it for TAB A or TAB B
 */
/**
 * Generate formatted document lists for TAB A and TAB B using VAWA-style holistic analysis
 * This analyzes ALL documents at once, just like VAWA does
 */
export const analyzeNaturalizationDocument = async (
    fileText: string,
    fileName: string,
    applicantName: string,
    allFileNames?: string[]
): Promise<Array<{ tab: 'A' | 'B'; description: string; doc_type: string; belongs_to_applicant: boolean; has_translation: boolean; relationship_unclear?: boolean; document_owner_name?: string }>> => {
    // This function is kept for compatibility but will be replaced by the holistic approach
    // Return empty array - the real work happens in generateNaturalizationDocumentList
    return [];
};

/**
 * Generate formatted document lists for TAB A and TAB B using VAWA-style holistic analysis
 * This uses the same approach as VAWA: analyze ALL documents at once with a single AI call
 */
export const generateNaturalizationDocumentList = async (
    evidence: { fileName: string; fileText: string }[],
    applicantName: string
): Promise<{ tabA: string[]; tabB: string[] }> => {
    // Build text with increased chunking to ensure full document coverage
    const allDocsText = evidence.map(doc => {
        const text = doc.fileText || '';
        const chunks: string[] = [];
        // Increase chunk size and number to capture more content
        for (let i = 0; i < text.length; i += 5000) {
            chunks.push(text.slice(i, i + 5000));
            if (chunks.length >= 5) break; // Increased from 3 to 5 chunks
        }
        return `--- Filename: ${doc.fileName} ---\n${chunks.join('\n')}\n--- End of ${doc.fileName} ---\n`;
    }).join('\n');
    
    const prompt = `
    You are an expert AI paralegal analyzing evidence documents for an N-400 Application for Naturalization.

    **CRITICAL REQUIREMENT: You MUST analyze EVERY document provided. Do NOT skip any documents. Read ALL filenames and ALL document content carefully.**

    **Case Details:**
    - Applicant: "${applicantName}"

    **Evidence Documents Provided (${evidence.length} files total):**
    ${allDocsText}

    **Your Process:**
    1.  **Count Documents First:** Count how many files are provided above. You MUST analyze ALL of them.
    2.  **Read ALL Documents:** Read through EVERY document completely. Do not skip any.
    3.  **Identify Each Document:** For each document, identify what it is (birth certificate, passport, tax record, letter, etc.).
    4.  **Handle Translations:** If you find a document and its translation, combine them into one item ending with "(with English translation)".
    5.  **Classify & Describe:** For each document, determine if it belongs in Tab A or Tab B and write a description following the rules below.
    6.  **Final Check:** Before returning your response, verify that you have analyzed ALL ${evidence.length} files provided.

    **CRITICAL RULES & FORMATTING:**

**TAB A - DOCUMENTS ESTABLISHING IDENTITY & CURRENT STATUS OF THE APPLICANT:**
This tab is ONLY for documents that belong to the Applicant:
- Birth certificates of the Applicant (NOT children or relatives)
- Identification documents of the Applicant (passports, consular IDs, driver's licenses)
    - Legal Permanent Resident card of the Applicant (Green Card)

**TAB B - DOCUMENTS ESTABLISHING GOOD MORAL CHARACTER, RESIDENCE AND TIES TO THE UNITED STATES:**
This tab is for documents that belong to the Applicant:
- Tax records of the Applicant (income tax returns, W-2s, 1099s, tax transcripts)
- Criminal background checks of the Applicant (FBI, police records)
- Utility bills in the Applicant's name
- Bank statements in the Applicant's name
    - Letters of recommendation
- Other documents showing the Applicant's residence and ties to the U.S.

**IMPORTANT: Documents belonging to children, relatives, or other people should NOT be included in TAB A or TAB B unless they are specifically required for the application (like joint tax returns).**

    **SPECIFIC FORMATTING RULES:**

1. **Birth Certificate (TAB A - ONLY if belongs to Applicant):**
       - **READ CAREFULLY**: Read the ENTIRE birth certificate to identify the nationality/country
       - Identify the nationality/country by looking for: country name in headers/seals, language, city/state names, official stamps
       - Common nationalities: "Mexican", "Cuban", "Honduran", "Guatemalan", "Salvadoran", "Brazilian", "Colombian", etc.
   - Format: "[Nationality] Birth Certificate of Applicant" or "[Nationality] Birth Certificate of Applicant (with English translation)" if translation exists
   - Example: "Mexican Birth Certificate of Applicant" or "Mexican Birth Certificate of Applicant (with English translation)"
       - If you cannot determine nationality, use: "Birth Certificate of Applicant"

2. **Passport vs. Consular ID (TAB A - ONLY if belongs to Applicant):**
       - **READ THE DOCUMENT CAREFULLY**: Look at the entire document to determine what it is
       - If contains "Passport", "Pasaporte", "PASSPORT", or passport numbers → PASSPORT
       - If contains "Consular Identification", "Matrícula Consular", "Consular ID", "Matrícula" → CONSULAR ID
       - **CRITICAL**: DO NOT confuse them! Read the document title/header carefully
       - Identify nationality from country names, flags, or language
       - Format for Passport: "[Nationality] passport of Applicant" or "[Nationality] passport of Applicant (with English translation)"
       - Format for Consular ID: "[Nationality] consular identification of Applicant" or "[Nationality] consular identification of Applicant (with English translation)"
       - Examples: "Mexican passport of Applicant", "Mexican consular identification of Applicant"

    3. **Driver's License (TAB A - ONLY if belongs to Applicant):**
       - **CRITICAL**: You MUST identify the STATE that issued the driver's license
       - **READ THE DOCUMENT CAREFULLY**: Look at the ENTIRE document from top to bottom, not just headers
       - **WHERE TO LOOK FOR STATE NAME** (check ALL of these locations):
         * Look for fields labeled: "State", "Issued by", "Issuing State", "State of Issue", "State:", "Issuing Authority", "State of Issue:", "Issued in", "State Issued"
         * Look for state seals, logos, or state emblems (these often indicate the state)
         * Look for state names in headers or footers
         * Look for state abbreviations followed by the full name (e.g., "TX - Texas")
         * Look for addresses that might indicate the state
         * Look for "Department of Motor Vehicles" or "DMV" followed by state name
         * **READ EVERY LINE** - the state name might be anywhere in the document
       - Common states: Texas, California, New York, Florida, Illinois, Arizona, Nevada, New Mexico, Colorado, Washington, etc.
       - **MANDATORY**: Extract the FULL STATE NAME (e.g., "Texas", "California", "New York", "Florida", "New Mexico") - do NOT use abbreviations like "TX", "CA", "NY", "FL"
       - **IF YOU SEE AN ABBREVIATION**: Convert it to the full state name (TX → Texas, CA → California, NY → New York, FL → Florida, NM → New Mexico, etc.)
       - Format: "[STATE NAME] driver's license of Applicant"
       - Example: "Texas driver's license of Applicant" or "California driver's license of Applicant" or "New Mexico driver's license of Applicant"
       - **IMPORTANT**: Driver's licenses are US documents and are ALREADY in English. Do NOT add "(with English translation)"
       - **CRITICAL**: If you cannot find the state name after reading the ENTIRE document carefully, use: "Driver's license of Applicant" (but you MUST try your absolute hardest to find it - read every single line, check headers, footers, seals, logos, and all text)

    4. **Legal Permanent Resident Card / Green Card (TAB A - ONLY if belongs to Applicant):**
       - **ABSOLUTELY CRITICAL - THIS IS A REQUIRED DOCUMENT**: You MUST identify Green Cards/LPR cards. This is one of the most important documents for naturalization applications.
       - **CRITICAL IDENTIFICATION - CHECK FOR ALL OF THESE INDICATORS** (read the ENTIRE document carefully):
         * "Form I-551" or "I-551" or "I551"
         * "Permanent Resident Card" or "PR Card" or "Permanent Resident"
         * "Green Card" or "green card" or "GreenCard"
         * "Legal Permanent Resident" or "LPR" or "Lawful Permanent Resident"
         * "Alien Registration Number" or "A-Number" or "A#" or "A Number" or "Alien Number"
         * "Resident Since" or "Card Expires" or "Resident Since:" or "Card Expires:"
         * "USCIS" or "United States Citizenship and Immigration Services" or "U.S. Citizenship and Immigration Services"
         * "Category" field (e.g., "IR6", "F21", "C09", "E21", etc.)
         * "CARD#", "Card Number", "Card No"
         * "Department of Homeland Security" or "DHS"
         * "Immigration" or "Immigration Status"
         * "Permanent Resident" appearing anywhere in the document
       - **READ THE ENTIRE DOCUMENT**: Green Cards often have these elements scattered throughout. Read EVERY line, check headers, footers, and all text fields.
       - **MANDATORY**: If you see ANY of these indicators (even just ONE), this is DEFINITELY a Green Card/LPR card. Do NOT miss it.
       - **IF YOU ARE UNSURE**: If a document mentions immigration status, permanent residence, or has USCIS/DHS references, it is likely a Green Card. Include it.
       - Format: "Legal Permanent Resident card of Applicant"
       - **IMPORTANT**: Green Cards/LPR cards are US government documents and are ALREADY in English. Do NOT add "(with English translation)"
       - **CRITICAL REMINDER**: This document is ESSENTIAL for naturalization. If you see ANY immigration card or document that shows permanent resident status, it MUST be included.

    5. **Tax Records (TAB B - ONLY if belongs to Applicant or is joint with Applicant):**
       - **CRITICAL**: Tax records include: tax returns, W-2s, 1099s, tax transcripts, IRS documents, or any document mentioning taxes, income, or IRS.
       - **ABSOLUTELY MANDATORY - ALL YEARS ARE REQUIRED**: Every tax record description MUST start with ALL 4-digit years found (2020, 2021, 2022, 2023, 2024, etc.). NO EXCEPTIONS.
       - **HOW TO FIND ALL YEARS**: 
         * Read the ENTIRE document carefully - scan every line, every page
         * Look for ALL occurrences of: "Tax Year", "Year", "For the year", "Tax period", "Filing year", "Calendar year", "Tax year ending"
         * Look near ALL instances of: "Form 1040", "W-2", "1099", "IRS", "Internal Revenue Service"
         * Check the filename - if it contains multiple 4-digit years (e.g., "tax_2021_2022_2023.pdf"), use ALL of them
         * Look in headers, footers, and anywhere dates appear - scan the ENTIRE document
         * **CRITICAL**: If a document contains multiple tax years (e.g., multiple W-2s from different years, or a multi-year tax return), you MUST list ALL years found
         * Tax documents may contain multiple years - you MUST identify and list ALL of them
       - Format: "[YEAR] tax records of Applicant" (if single year) OR "[YEAR1, YEAR2, YEAR3] tax records of Applicant" (if multiple years) OR "[YEAR] tax records of Applicant (with English translation)" if translation exists
       - **ALWAYS use "tax records"** - do NOT use "tax return", "tax transcript", "W-2", "1099", etc.
       - **CORRECT Examples** (ALL years listed):
         * "2023 tax records of Applicant" ✓ (single year)
         * "2021, 2022, 2023 tax records of Applicant" ✓ (multiple years - ALL listed)
         * "2020, 2021, 2022, 2023 tax records of Applicant" ✓ (multiple years - ALL listed)
         * "2022, 2023 tax records of Applicant (with English translation)" ✓ (multiple years with translation)
       - **INCORRECT Examples** (missing years - DO NOT DO THIS):
         * "2023 tax records of Applicant" ✗ (if document also contains 2022 and 2021 - you missed years!)
         * "tax records of Applicant" ✗ (missing year)
         * "tax return of Applicant" ✗ (missing year, wrong term)
       - **BEFORE RETURNING**: 
         * Check every tax record in your response
         * If a document contains multiple years but your description only lists one, you have made an error - find ALL years and fix it
         * Scan the document again to ensure you didn't miss any years
         * If ANY tax record doesn't start with at least one 4-digit year, you have made an error - find the year and fix it
       - **IMPORTANT**: If you see ANY document that mentions taxes, IRS, income, W-2, 1099, Form 1040, or tax-related terms, it MUST be included as a tax record WITH ALL YEARS FOUND.

    6. **Criminal Records (TAB B - ONLY if belongs to Applicant):**
   - FBI records: "FBI background check of Applicant" or "FBI background check of Applicant (with English translation)" if translation exists
       - Local police records: FIRST, identify the FULL NAME of the law enforcement agency (e.g., "El Paso Police Department", "Cook County Sheriff's Office")
   - Format: "[FULL NAME OF LAW ENFORCEMENT AGENCY] criminal records of Applicant" or "[FULL NAME OF LAW ENFORCEMENT AGENCY] criminal records of Applicant (with English translation)" if translation exists
       - Example: "El Paso Police Department criminal records of Applicant"
       - **CRITICAL**: Use the FULL, COMPLETE name of the agency as it appears in the document. Do not abbreviate or shorten it.

    7. **Utility Bills (TAB B - ONLY if belongs to Applicant):**
       - Identify the COMPANY NAME from the document
   - Format: "[Company Name] bill of Applicant" or "[Company Name] bill of Applicant (with English translation)" if translation exists
   - Example: "El Paso Electric bill of Applicant" or "El Paso Electric bill of Applicant (with English translation)"

    8. **Bank Statements (TAB B - ONLY if belongs to Applicant):**
       - Identify the BANK NAME from the document
   - Format: "[Bank Name] bank account statement of Applicant" or "[Bank Name] bank account statement of Applicant (with English translation)" if translation exists
   - Example: "Wells Fargo bank account statement of Applicant" or "Wells Fargo bank account statement of Applicant (with English translation)"

    9. **Letters of Recommendation (TAB B):**
       - You MUST list each letter of recommendation as a separate item. Do not group them.
       - If a PDF contains multiple letters, count signatures and "To Whom It May Concern" sections - each signature = one letter.
       - If you find a letter and its translation, combine them into one item with "(with English translation)".
       - Format: "Letter of recommendation from [Author's Full Name] in support of Applicant" or "Letter of recommendation from [Author's Full Name] in support of Applicant (with English translation)" if translation exists
       - Extract the author's name from signature lines, first sentence, letterhead, or closing lines.
       - If you cannot identify the author's name, use: "Letter of recommendation in support of Applicant"

    **TRANSLATION DETECTION:**
    - **CRITICAL**: US documents (driver's licenses, Green Cards/LPR cards) are ALREADY in English. Do NOT add "(with English translation)" to these documents.
    - If a document appears to be an English translation (filename contains "_trans", "translation", "translated", or document text indicates it's a translation), add "(with English translation)" to the description
    - If the document is the ORIGINAL foreign document (birth certificate, passport, etc.) and you can identify that there is likely a translation document in the batch, add "(with English translation)" to the description
    - Otherwise, do NOT add translation marker

    **Output Requirement:**
    You MUST return a single, valid JSON array of objects. Each object represents one unique piece of evidence from the final, de-duplicated list. If you find no documents, return an empty array.

    **JSON Structure:**
    [
        {
            "tab": "A" or "B",
            "description": "Formatted description following the rules above",
            "sourceFilename": "filename.pdf"
        },
        ...
    ]
    `;

    const responseSchema = {
        type: Type.ARRAY,
        items: {
        type: Type.OBJECT,
        properties: {
                tab: { type: Type.STRING, enum: ['A', 'B'] as any },
                description: { type: Type.STRING },
                sourceFilename: { type: Type.STRING },
            },
            required: ["tab", "description"]
        }
    };

    try {
        const response = await getAIInstance().models.generateContent({
            model: 'gemini-2.5-flash', // Use Flash model like VAWA - simpler and more reliable
            contents: [{ parts: [{ text: prompt }] }],
            config: {
                systemInstruction: `You are an expert paralegal assistant analyzing documents for an N-400 Application. CRITICAL REQUIREMENTS: 1) Analyze ALL ${evidence.length} documents provided - do NOT skip any, 2) Extract tax years from tax documents - format as "[YEAR] tax records of Applicant", 3) List each letter of recommendation separately, 4) Return ONLY a valid JSON array matching the requested structure. Be thorough and accurate.`,
                responseMimeType: "application/json",
                responseSchema: responseSchema,
                safetySettings: safetySettings,
                temperature: 0.1, // Same as VAWA - slightly higher than 0 for better reasoning
                topK: 40, // Same as VAWA - allows more flexibility
            },
        });
        const text = response.text;
        const parsed: Array<any> = JSON.parse(text);

        // Filter and process results
        let filtered = parsed
            .filter(item => item && item.tab && item.description)
            .map(item => ({
                tab: String(item.tab),
                description: String(item.description),
                sourceFilename: String(item.sourceFilename || ''),
            }));

        // Post-processing validation: Ensure tax records have years
        filtered = filtered.map(item => {
            const desc = item.description.toLowerCase();
            // Check if it's a tax record but missing year at the start
            if ((desc.includes('tax') || desc.includes('w-2') || desc.includes('1099')) && !/^\d{4}/.test(item.description.trim())) {
                console.warn(`⚠️ Tax record missing year: "${item.description}"`);
                // Try to extract year from filename
                const yearMatch = item.sourceFilename.match(/\d{4}/);
                if (yearMatch) {
                    item.description = `${yearMatch[0]} ${item.description}`;
                    console.log(`✓ Added year from filename: ${item.description}`);
                }
            }
            return item;
        });

        // Post-processing validation: Count letters of recommendation per file for debugging
        const letterCountsByFile = new Map<string, number>();
        filtered.forEach(item => {
            const desc = item.description.toLowerCase();
            if (desc.includes('letter of recommendation') || desc.includes('recommendation letter')) {
                const count = letterCountsByFile.get(item.sourceFilename) || 0;
                letterCountsByFile.set(item.sourceFilename, count + 1);
            }
        });
        
        // Log letter counts for debugging
        letterCountsByFile.forEach((count, filename) => {
            console.log(`📝 Letters found in "${filename}": ${count}`);
        });

        // Remove duplicates based on description (normalize for comparison)
        const seenDescriptions = new Set<string>();
        filtered = filtered.filter(item => {
            const normalized = item.description.toLowerCase().trim();
            if (seenDescriptions.has(normalized)) {
                return false;
            }
            seenDescriptions.add(normalized);
            return true;
        });

        // Separate into TAB A and TAB B
    const tabADocs: string[] = [];
    const tabBDocs: { type: 'tax' | 'criminal' | 'other'; description: string; year?: string }[] = [];

        filtered.forEach(item => {
            if (item.tab === 'A') {
                tabADocs.push(item.description);
        } else {
                // Categorize TAB B documents for proper ordering
                const desc = item.description.toLowerCase();
                if (desc.includes('tax') || /\d{4}.*tax/.test(desc)) {
                    const yearMatch = item.description.match(/\d{4}/);
                    // Post-processing validation: warn if tax record is missing year
                    if (!yearMatch) {
                        console.warn(`⚠️ WARNING: Tax record missing year: "${item.description}"`);
                        // Try to extract year from source filename as fallback
                        const filenameYearMatch = item.sourceFilename?.match(/\d{4}/);
                        if (filenameYearMatch) {
                            const fixedDescription = `${filenameYearMatch[0]} ${item.description}`;
                            console.log(`✅ Fixed tax record with year from filename: "${fixedDescription}"`);
                            tabBDocs.push({
                                type: 'tax',
                                description: fixedDescription,
                                year: filenameYearMatch[0]
                            });
                        } else {
                            // Still add it but log warning
                            tabBDocs.push({
                                type: 'tax',
                                description: item.description,
                                year: undefined
                            });
                        }
                    } else {
                        tabBDocs.push({
                            type: 'tax',
                            description: item.description,
                            year: yearMatch[0]
                        });
                    }
                } else if (desc.includes('criminal') || desc.includes('fbi') || desc.includes('police') || desc.includes('background')) {
                    tabBDocs.push({ type: 'criminal', description: item.description });
            } else {
                    tabBDocs.push({ type: 'other', description: item.description });
            }
        }
        });

        // Format TAB A: ALWAYS birth certificates first, then ID documents in order: driver's license, passport, consular ID, LPR card
    const birthCerts = tabADocs.filter(d => d.toLowerCase().includes('birth certificate'));
        const driverLicenses = tabADocs.filter(d => d.toLowerCase().includes('driver'));
        const passports = tabADocs.filter(d => d.toLowerCase().includes('passport') && !d.toLowerCase().includes('consular'));
        const consularIds = tabADocs.filter(d => d.toLowerCase().includes('consular'));
        const lprCards = tabADocs.filter(d => d.toLowerCase().includes('permanent resident') || d.toLowerCase().includes('lpr') || d.toLowerCase().includes('green card'));
        const otherTabA = tabADocs.filter(d => 
            !d.toLowerCase().includes('birth certificate') &&
            !d.toLowerCase().includes('driver') &&
            !d.toLowerCase().includes('passport') &&
            !d.toLowerCase().includes('consular') &&
            !d.toLowerCase().includes('permanent resident') &&
            !d.toLowerCase().includes('lpr') &&
            !d.toLowerCase().includes('green card')
        );
        // Order: Birth certificates first, then IDs in order: driver's license, passport, consular ID, LPR card, then others
        const formattedTabA = [...birthCerts, ...driverLicenses, ...passports, ...consularIds, ...lprCards, ...otherTabA];

    // Format TAB B: Tax records first, then criminal records, then other documents
    const taxRecords = tabBDocs.filter(d => d.type === 'tax').sort((a, b) => {
        const yearA = a.year ? parseInt(a.year) : 0;
        const yearB = b.year ? parseInt(b.year) : 0;
        return yearB - yearA; // Most recent first
    });
    const criminalRecords = tabBDocs.filter(d => d.type === 'criminal');
    const otherDocs = tabBDocs.filter(d => d.type === 'other');

    const formattedTabB = [
        ...taxRecords.map(d => d.description),
        ...criminalRecords.map(d => d.description),
        ...otherDocs.map(d => d.description)
    ];

    return {
        tabA: formattedTabA,
        tabB: formattedTabB
    };
    } catch (error: any) {
        console.error(`N-400 AI Document List Generation Error:`, error);
        throw new Error(`AI analysis of evidence failed: ${error.message}`);
    }
};

/**
 * Generate legal argument for Naturalization application
 */
export const generateNaturalizationLegalArgument = async (
    applicantName: string,
    applicantDOB: string,
    permanentResidenceDate: string,
    applicantGender: string
): Promise<string> => {
    const prompt = `
You are an expert immigration attorney. Your task is to write a brief legal argument explaining why the applicant qualifies to become a United States citizen under the Immigration and Nationality Act (INA).

**Applicant Information:**
- Name: ${applicantName}
- Date of Birth: ${applicantDOB}
- Date of Permanent Residence: ${permanentResidenceDate}
- Gender: ${applicantGender}

**Requirements for Naturalization (INA Section 316):**
1. Must be at least 18 years old
2. Must be a Lawful Permanent Resident for at least 5 years (or 3 years if married to a U.S. citizen)
3. Must have continuous residence in the U.S.
4. Must have physical presence in the U.S. for at least half of the required period
5. Must be a person of good moral character
6. Must be able to read, write, and speak English
7. Must have knowledge of U.S. history and government
8. Must be attached to the principles of the Constitution

**Your Task:**
Write a concise but comprehensive legal argument (approximately 3-5 paragraphs) that:
1. States the applicant's eligibility under INA Section 316
2. Addresses the continuous residence requirement
3. Addresses the physical presence requirement
4. Addresses good moral character
5. Concludes that the applicant meets all requirements

**Style:**
- Use formal legal writing
- Be specific and reference the INA sections where appropriate
- Keep it professional and persuasive
- Do not use placeholders - write the actual argument

**Output:**
Return only the legal argument text, no additional commentary or formatting.
    `;

    try {
        const response = await getAIInstance().models.generateContent({
            model: 'gemini-2.5-pro',
            contents: [{ parts: [{ text: prompt }] }],
            config: {
                safetySettings: safetySettings,
                temperature: 0.3,
                topK: 40,
            },
        });
        return response.text.trim();
    } catch (error: any) {
        console.error("Naturalization Legal Argument Error:", error);
        throw new Error(`AI failed to generate legal argument: ${error.message}`);
    }
};

/**
 * Generate legal argument for U-Visa Application based on Form I-918 Supplement B
 */
export const generateUvisaLegalArgument = async (
    petitionerName: string,
    crimeType: string,
    supplementBText: string,
    declarationText: string
): Promise<string> => {
    // Extract crime type from Supplement B or declaration if not provided
    const crimeTypeContext = crimeType && !crimeType.includes('will be extracted') 
        ? crimeType 
        : supplementBText || declarationText || '';
    
    const prompt = `
You are an expert immigration attorney. Your task is to develop a comprehensive legal argument explaining why the petitioner qualifies for U Nonimmigrant Status (U-Visa) under the Victims of Trafficking and Violence Protection Act of 2000 (VTVPA) and INA §101(a)(15)(U).

**Petitioner Information:**
- Name: ${petitionerName}
${crimeType && !crimeType.includes('will be extracted') ? `- Qualifying Crime: ${crimeType}` : '- Qualifying Crime: [Extract from documents below]'}

**Form I-918 Supplement B (U Nonimmigrant Status Certification) Content:**
"""
${supplementBText || '[Supplement B not provided - use information from declaration]'}
"""

**Petitioner's Declaration:**
"""
${declarationText || '[Declaration not provided]'}
"""

**Legal Requirements for U-Visa Eligibility (INA §101(a)(15)(U)):**
1. The petitioner must be a victim of a qualifying criminal activity
2. The petitioner must have suffered substantial physical or mental abuse as a result of the crime
3. The petitioner must possess information about the criminal activity
4. The petitioner must have been helpful, is being helpful, or is likely to be helpful in the investigation or prosecution of the crime
5. The criminal activity must have violated U.S. law or occurred in the United States
6. The petitioner must be admissible to the United States or qualify for a waiver

**Your Task:**
Develop a comprehensive legal argument (approximately 4-6 paragraphs) that:

1. **Introduction:** State that the petitioner qualifies for U Nonimmigrant Status under INA §101(a)(15)(U) and the VTVPA

2. **Qualifying Criminal Activity:** Explain that the petitioner was a victim of a qualifying criminal activity. Extract the specific crime type from the Form I-918 Supplement B or declaration, and reference the Form I-918 Supplement B certification

3. **Substantial Physical or Mental Abuse:** Detail how the petitioner suffered substantial physical and/or mental abuse as a result of the crime, referencing specific details from the declaration and any medical/psychological evidence

4. **Helpfulness:** Explain how the petitioner has been helpful, is being helpful, or is likely to be helpful in the investigation or prosecution, referencing the certification from law enforcement

5. **Admissibility:** Briefly address that the petitioner is admissible or qualifies for a waiver under INA §212(d)(14)

6. **Conclusion:** Conclude that the petitioner meets all eligibility requirements and USCIS should approve the petition

**Style:**
- Use formal legal writing
- Reference specific INA sections and regulations (8 CFR §214.14)
- Cite the Form I-918 Supplement B certification as evidence
- Be specific and reference details from the declaration
- Keep it professional and persuasive
- Do not use placeholders - write the actual argument

**Important:**
- If Supplement B text is provided, use it as the primary source for information about the crime and helpfulness
- Reference the certifying jurisdiction and their certification
- If Supplement B is not provided, use information from the declaration to develop the argument

**Output:**
Return only the legal argument text, no additional commentary or formatting.
    `;

    try {
        const response = await getAIInstance().models.generateContent({
            model: 'gemini-2.5-pro',
            contents: [{ parts: [{ text: prompt }] }],
            config: {
                safetySettings: safetySettings,
                temperature: 0.3,
                topK: 40,
            },
        });
        return response.text;
    } catch (error: any) {
        console.error("U-Visa Legal Argument Generation Error:", error);
        throw new Error(`Failed to generate legal argument: ${error.message}`);
    }
};

/**
 * Extract information from Form I-918 Supplement B (U Nonimmigrant Status Certification)
 */
export const extractSupplementBData = async (fileText: string): Promise<{
    crimeType?: string;
    jurisdiction?: string;
    certifyingOfficial?: string;
    certifyingAgency?: string;
    dateOfCertification?: string;
    [key: string]: any;
}> => {
    const prompt = `
You are an expert paralegal AI. Analyze the following Form I-918 Supplement B (U Nonimmigrant Status Certification) document and extract key information.

**Document to Analyze:**
"""
${fileText}
"""

**Your Task:**
Extract the following information from Form I-918 Supplement B:

1. **Qualifying Criminal Activity (Crime Type):** Find the type of qualifying criminal activity listed on the form (e.g., "Domestic Violence", "Sexual Assault", "Rape", "Kidnapping", etc.). This is usually found in a section asking about the type of crime or qualifying criminal activity.

2. **Certifying Agency/Jurisdiction:** Find the name of the law enforcement agency, prosecutor's office, court, or other certifying authority that completed and signed the form. This could be:
   - A police department (e.g., "Houston Police Department", "Los Angeles Police Department")
   - A sheriff's office (e.g., "Cook County Sheriff's Office")
   - A prosecutor's office (e.g., "District Attorney's Office")
   - A court (e.g., "Superior Court of California")
   - Other certifying authority

3. **Certifying Official:** Find the name of the person who signed the form (if visible in the text).

4. **Date of Certification:** Find the date when the certification was signed or issued.

**Instructions:**
- Look for form fields, labels, and text that indicate these values
- The crime type might be listed as a checkbox, dropdown selection, or written text
- The jurisdiction/agency name is typically found in letterhead, header, or signature section
- Extract exact text as it appears in the document
- If information is not found, use null for that field

**Return a JSON object with the following structure:**
{
    "crimeType": "The qualifying criminal activity type (e.g., 'Domestic Violence', 'Sexual Assault')",
    "jurisdiction": "The name of the certifying agency/jurisdiction",
    "certifyingOfficial": "Name of the certifying official (if found)",
    "certifyingAgency": "Full name of the certifying agency",
    "dateOfCertification": "Date of certification (if found)"
}

**IMPORTANT:**
- Return ONLY a valid JSON object
- Use null for fields that cannot be found
- Be as specific as possible with agency names (include full names like "Houston Police Department" not just "Houston")
    `;

    const responseSchema = {
        type: Type.OBJECT,
        properties: {
            crimeType: { type: Type.STRING, description: "Type of qualifying criminal activity" },
            jurisdiction: { type: Type.STRING, description: "Name of the certifying jurisdiction/agency" },
            certifyingOfficial: { type: Type.STRING, description: "Name of the certifying official" },
            certifyingAgency: { type: Type.STRING, description: "Full name of the certifying agency" },
            dateOfCertification: { type: Type.STRING, description: "Date when certification was issued" }
        }
    };

    try {
        const response = await getAIInstance().models.generateContent({
            model: 'gemini-2.5-flash',
            contents: [{ parts: [{ text: prompt }] }],
            config: {
                systemInstruction: "You are an expert paralegal assistant. Return ONLY a valid JSON object matching the requested structure.",
                responseMimeType: "application/json",
                responseSchema: responseSchema,
                safetySettings: safetySettings,
                temperature: 0.1,
                topK: 40,
            },
        });
        const text = response.text.trim();
        return JSON.parse(text);
    } catch (error: any) {
        console.error("Supplement B Extraction Error:", error);
        throw new Error(`Failed to extract information from Supplement B: ${error.message}`);
    }
};

/**
 * Generate T-Visa cover letter by filling in the template with AI-generated content
 */
export const generateTvisaCoverLetter = async (
    formData: FormData,
    evidence: { fileName: string; fileText: string }[],
    declarationText: string
): Promise<string> => {
    const clientName = (formData.client_name as string) || '';
    const traffickingType = (formData.trafficking_type as string) || 'Sex Trafficking';
    const applicantGender = (formData.applicant_gender as string || '').toLowerCase().trim();
    const isMale = applicantGender === 'male' || applicantGender === 'm';
    const isFemale = applicantGender === 'female' || applicantGender === 'f';
    const pronoun = isMale ? 'He' : (isFemale ? 'She' : 'They');
    const pronounLower = isMale ? 'he' : (isFemale ? 'she' : 'they');
    const possessivePronoun = isMale ? 'his' : (isFemale ? 'her' : 'their');
    
    const derivativeNames = (formData.derivative_names as string) || 'N/A';
    const derivativeCount = derivativeNames && derivativeNames !== 'N/A' && derivativeNames.trim() 
        ? derivativeNames.split(',').length 
        : 0;
    
    // Build evidence text for AI analysis
    const evidenceText = evidence.map(e => `--- ${e.fileName} ---\n${e.fileText.substring(0, 5000)}\n--- End ${e.fileName} ---`).join('\n\n');
    
    const prompt = `
You are an expert immigration attorney. Your task is to fill in a T-Visa application cover letter template with specific information from the client's case.

**Client Information:**
- Name: ${clientName}
- Trafficking Type: ${traffickingType}
- Gender: ${formData.applicant_gender || 'Unknown'}
- Country of Origin: ${formData.country_of_origin || '[Not provided]'}
- Entry Date: ${formData.entry_date || '[Not provided]'}
- Trafficker Name: ${formData.trafficker_name || '[Not provided]'}
- Original Promise: ${formData.original_promise || '[Not provided]'}
- Inadmissibility Grounds: ${formData.inadmissibility_grounds || '[Not provided]'}
- Derivative Names: ${derivativeNames}

**Applicant's Declaration:**
"""
${declarationText || '[Declaration not provided]'}
"""

**Evidence Documents:**
"""
${evidenceText || '[No evidence provided]'}
"""

**Template Sections to Fill:**

1. **[INSERT_NARRATIVE]** - Generate 1-2 paragraphs summarizing the trafficking acts. Focus on:
   - How the applicant was recruited (use original_promise)
   - What happened during the trafficking
   - Force, fraud, or coercion used
   - Specific examples of each

2. **[DESCRIBE_FORCE]** - Describe how force was used (physical beatings, confinement, etc.)

3. **[DESCRIBE_FRAUD]** - Describe how fraud was used (lying about wages, legal status, etc.)

4. **[DESCRIBE_COERCION]** - Describe how coercion was used (threats of deportation, harm to family, etc.)

5. **[SELECT_OPTION_BELOW]** for Physical Presence - Choose Option 1 if trafficker facilitated entry, Option 2 if entered independently but trafficked here

6. **[SELECT_OPTION_BELOW]** for Compliance - Choose based on evidence:
   - Option 1 if Supplement B is available (evidence will show this)
   - Option 2 if no Supplement B but reported to LEA (evidence will show this)
   - Option 3 if trauma exception applies (evidence will show this)

7. **[LIST_EVIDENCE]** - List evidence documents from the evidence provided, categorized by tab:
   - Tab C: Evidence of severe form of trafficking
   - Tab D: Evidence of physical presence
   - Tab E: Evidence of compliance
   - Tab F: Evidence of extreme hardship

8. **[LIST_DERIVATIVE_DOCUMENTS]** - List derivative documents if applicable

9. **[LIST_INADMISSIBILITY_GROUNDS]** - List inadmissibility grounds from formData

10. **[COUNTRY_OF_ORIGIN]** - Use country_of_origin

**Your Task:**
Fill in all template placeholders with specific, factual information from the client's case. Be detailed and specific. Use the declaration and evidence to provide concrete examples.

**Output Format:**
Return a JSON object with the following structure:
{
    "narrative": "1-2 paragraphs summarizing trafficking acts",
    "describeForce": "Description of force used",
    "describeFraud": "Description of fraud used",
    "describeCoercion": "Description of coercion used",
    "physicalPresenceOption": "1" or "2",
    "complianceOption": "1", "2", or "3",
    "tabCEvidence": ["List of evidence items for Tab C"],
    "tabDEvidence": ["List of evidence items for Tab D"],
    "tabEEvidence": ["List of evidence items for Tab E"],
    "tabFEvidence": ["List of evidence items for Tab F"],
    "derivativeDocuments": ["List of derivative documents"] or [],
    "inadmissibilityGrounds": ["List of inadmissibility grounds"],
    "countryOfOrigin": "Country name"
}
`;

    const responseSchema = {
        type: Type.OBJECT,
        properties: {
            narrative: { type: Type.STRING, description: "1-2 paragraphs summarizing trafficking acts" },
            describeForce: { type: Type.STRING, description: "Description of force used" },
            describeFraud: { type: Type.STRING, description: "Description of fraud used" },
            describeCoercion: { type: Type.STRING, description: "Description of coercion used" },
            physicalPresenceOption: { type: Type.STRING, description: "1 or 2" },
            complianceOption: { type: Type.STRING, description: "1, 2, or 3" },
            tabCEvidence: { type: Type.ARRAY, items: { type: Type.STRING }, description: "List of evidence items for Tab C" },
            tabDEvidence: { type: Type.ARRAY, items: { type: Type.STRING }, description: "List of evidence items for Tab D" },
            tabEEvidence: { type: Type.ARRAY, items: { type: Type.STRING }, description: "List of evidence items for Tab E" },
            tabFEvidence: { type: Type.ARRAY, items: { type: Type.STRING }, description: "List of evidence items for Tab F" },
            derivativeDocuments: { type: Type.ARRAY, items: { type: Type.STRING }, description: "List of derivative documents" },
            inadmissibilityGrounds: { type: Type.ARRAY, items: { type: Type.STRING }, description: "List of inadmissibility grounds" },
            countryOfOrigin: { type: Type.STRING, description: "Country name" }
        }
    };

    try {
        const response = await getAIInstance().models.generateContent({
            model: 'gemini-2.5-pro',
            contents: [{ parts: [{ text: prompt }] }],
            config: {
                systemInstruction: "You are an expert immigration attorney filling in a T-Visa cover letter template. Be specific, factual, and detailed.",
                responseMimeType: "application/json",
                responseSchema: responseSchema,
                safetySettings: safetySettings,
                temperature: 0.3,
                topK: 40,
            },
        });
        
        const aiData = JSON.parse(response.text.trim());
        
        // Now build the cover letter using the template
        const today = new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
        
        // Build the cover letter template
        let coverLetter = `${today}\n\nUSCIS Vermont Service Center\n38 River Road\nEssex Junction, VT 05479-0001\n\nRE:\n    Petitioner: ${clientName}\n    Case Type: Form I-914, Application for T Nonimmigrant Status\n    Derivative(s): ${derivativeNames}\n\nTo the Adjudicating Officer:\n\nThis office represents ${clientName} (hereinafter "Applicant") in the above-referenced matter. Enclosed for your review is the Applicant's Form I-914, Application for T Nonimmigrant Status, along with supporting documentation.\n\nThe Applicant is a victim of a severe form of trafficking in persons, specifically ${traffickingType}. ${pronoun} is physically present in the United States on account of such trafficking, has complied with reasonable requests for assistance in the investigation or prosecution of acts of trafficking (or is exempt), and would suffer extreme hardship involving unusual and severe harm upon removal.\n\nAccordingly, we respectfully request that this application be adjudicated favorably.\n\nFORMS & FEES\n\n- Form G-28, Notice of Entry of Appearance as Attorney or Accredited Representative.\n- Form I-912, Request for Fee Waiver (including supporting documentation) OR Check in the amount of $[AMOUNT].\n- Form I-914, Application for T Nonimmigrant Status.\n`;
        
        if (derivativeCount > 0) {
            coverLetter += `- Form I-914, Supplement A, Application for Family Member of T-1 Recipient (for ${derivativeCount} derivative${derivativeCount > 1 ? 's' : ''}).\n`;
        }
        
        coverLetter += `- Form I-914, Supplement B, Declaration of Law Enforcement Officer for Victim of Trafficking in Persons (if applicable).\n- Form I-192, Application for Advance Permission to Enter as a Nonimmigrant (Waiver of Inadmissibility).\n\nSUPPORTING EVIDENCE\n\nTAB A: Personal Statement of Applicant\n\n- Detailed Declaration of ${clientName} describing the trafficking victimization, physical presence, cooperation with law enforcement, and extreme hardship.\n\nTAB B: Evidence of Identity and Relationship\n\n- Copy of Applicant's Passport / Birth Certificate.\n`;
        
        if (aiData.derivativeDocuments && aiData.derivativeDocuments.length > 0) {
            coverLetter += aiData.derivativeDocuments.map((doc: string) => `- ${doc}`).join('\n') + '\n';
        } else {
            coverLetter += '- [No derivative documents]\n';
        }
        
        coverLetter += `\nTAB C: Evidence of Severe Form of Trafficking\n\n`;
        if (aiData.tabCEvidence && aiData.tabCEvidence.length > 0) {
            coverLetter += aiData.tabCEvidence.map((item: string) => `- ${item}`).join('\n');
        } else {
            coverLetter += '- [Evidence will be listed here]';
        }
        
        coverLetter += `\n\nTAB D: Evidence of Physical Presence on Account of Trafficking\n\n`;
        if (aiData.tabDEvidence && aiData.tabDEvidence.length > 0) {
            coverLetter += aiData.tabDEvidence.map((item: string) => `- ${item}`).join('\n');
        } else {
            coverLetter += '- [Evidence will be listed here]';
        }
        
        coverLetter += `\n\nTAB E: Evidence of Compliance with Reasonable Requests for Assistance\n\n`;
        if (aiData.complianceOption === '1') {
            coverLetter += `Form I-914 Supplement B.\n`;
        } else if (aiData.complianceOption === '2') {
            // No text added for option 2
        } else {
            // No text added for option 3
        }
        if (aiData.tabEEvidence && aiData.tabEEvidence.length > 0) {
            coverLetter += aiData.tabEEvidence.map((item: string) => `- ${item}`).join('\n');
        }
        
        coverLetter += `\n\nTAB F: Evidence of Extreme Hardship\n\n`;
        if (aiData.tabFEvidence && aiData.tabFEvidence.length > 0) {
            coverLetter += aiData.tabFEvidence.map((item: string) => `- ${item}`).join('\n') + '\n';
        }
        
        coverLetter += `\nLEGAL ARGUMENT\n\nI. INTRODUCTION\n\nThe Victims of Trafficking and Violence Protection Act of 2000 (TVPA) created the T Nonimmigrant status to protect victims of severe forms of trafficking. Under INA § 101(a)(15)(T) and 8 C.F.R. § 214.11, an applicant is eligible for T-1 status if they:\n\na) Are a victim of a severe form of trafficking in persons;\nb) Are physically present in the United States on account of such trafficking;\nc) Have complied with any reasonable request for assistance in the investigation or prosecution of acts of trafficking (unless under 18 or unable to cooperate due to trauma); and\nd) Would suffer extreme hardship involving unusual and severe harm upon removal.\n\nAs detailed below, the Applicant satisfies all statutory requirements by a preponderance of the evidence.\n\nII. THE APPLICANT IS A VICTIM OF A SEVERE FORM OF TRAFFICKING IN PERSONS\n\nUnder 22 U.S.C. § 7102(8), a "severe form of trafficking in persons" is defined as either sex trafficking in which a commercial sex act is induced by force, fraud, or coercion, or the recruitment, harboring, transportation, provision, or obtaining of a person for labor or services through the use of force, fraud, or coercion for the purpose of subjection to involuntary servitude, peonage, debt bondage, or slavery.\n\nA. The Applicant was subjected to ${traffickingType}\n\nIn this case, the Applicant was recruited by ${formData.trafficker_name || '[Trafficker Name]'} under the pretense of ${formData.original_promise || '[Original Promise]'}. However, upon arrival, the situation devolved into exploitation.\n\n${aiData.narrative || '[Narrative will be generated here]'}\n\nThe trafficker utilized Force by ${aiData.describeForce || '[Description of force]'}. The trafficker utilized Fraud by ${aiData.describeFraud || '[Description of fraud]'}. The trafficker utilized Coercion by ${aiData.describeCoercion || '[Description of coercion]'}.\n\nThe totality of these circumstances meets the definition of a severe form of trafficking pursuant to 8 C.F.R. § 214.11(f).\n\nIII. THE APPLICANT IS PHYSICALLY PRESENT IN THE U.S. ON ACCOUNT OF TRAFFICKING\n\nPursuant to 8 C.F.R. § 214.11(g), the Applicant must be physically present in the United States on account of such trafficking. The Applicant entered the United States on ${formData.entry_date || '[Entry Date]'}.\n\n`;
        
        if (aiData.physicalPresenceOption === '1') {
            coverLetter += `The Applicant's entry into the United States was facilitated directly by the trafficker for the specific purpose of exploitation. The Applicant has not left the United States since escaping the trafficking situation.\n\n`;
        } else {
            coverLetter += `While the Applicant entered the U.S. voluntarily, ${pronounLower} became a victim of trafficking shortly after arrival. The Applicant is currently present in the U.S. because ${pronounLower} was liberated from the trafficking situation and lacks the means to depart, or is currently participating in investigative activities related to the crime.\n\n`;
        }
        
        coverLetter += `Therefore, the "physical presence" requirement is satisfied.\n\nIV. THE APPLICANT HAS COMPLIED WITH REASONABLE REQUESTS FOR ASSISTANCE\n\nUnder 8 C.F.R. § 214.11(h), an applicant must comply with reasonable requests for assistance from a Law Enforcement Agency (LEA) in the investigation or prosecution of the acts of trafficking.\n\n`;
        
        if (aiData.complianceOption === '1') {
            coverLetter += `Attached as Exhibit C is Form I-914, Supplement B. This declaration confirms the Applicant's cooperation.\n\n`;
        } else if (aiData.complianceOption === '2') {
            coverLetter += `The Applicant contacted law enforcement to report the crime. Although a Supplement B was not obtained, the Applicant has remained willing and available to assist. See attached correspondence and police report in Exhibit C.\n\n`;
        } else {
            coverLetter += `The Applicant is unable to cooperate with law enforcement due to physical or psychological trauma. 8 C.F.R. § 214.11(h)(4). As evidenced by the clinical evaluation in Exhibit F, the Applicant suffers from severe trauma and recalling the events causes significant psychological distress, rendering cooperation impossible at this time.\n\n`;
        }
        
        coverLetter += `V. THE APPLICANT WOULD SUFFER EXTREME HARDSHIP INVOLVING UNUSUAL AND SEVERE HARM UPON REMOVAL\n\nRemoval of the Applicant would result in extreme hardship involving unusual and severe harm, surpassing the typical hardship associated with deportation. 8 C.F.R. § 214.11(i).\n\nA. Medical and Psychological Necessity\nThe Applicant is currently receiving treatment for trauma resulting from the trafficking. Removal to ${aiData.countryOfOrigin || formData.country_of_origin || '[Country]'} would sever access to this critical care, as evidenced by the attached Country Conditions Report (Tab F), which indicates a lack of resources for trafficking victims.\n\nB. Likelihood of Re-victimization or Retaliation\nThe Applicant faces a credible threat of retaliation by the trafficker or their associates should ${pronounLower} return to ${aiData.countryOfOrigin || formData.country_of_origin || '[Country]'}. Furthermore, the lack of social protections in the home country makes the Applicant highly vulnerable to re-trafficking.\n\nVI. WAIVER OF INADMISSIBILITY (FORM I-192)\n\nThe Applicant acknowledges potential grounds of inadmissibility under INA § 212(a), specifically ${aiData.inadmissibilityGrounds && aiData.inadmissibilityGrounds.length > 0 ? aiData.inadmissibilityGrounds.join(', ') : (formData.inadmissibility_grounds || '[Inadmissibility grounds]')}.\n\nPursuant to INA § 212(d)(13) and (d)(3), the Applicant requests a waiver of these grounds. It is in the national interest to grant this waiver to encourage the reporting of trafficking crimes. Furthermore, the adverse factors are directly connected to the victimization.\n\nVII. CONCLUSION\n\nThe Applicant has demonstrated by a preponderance of the evidence that ${pronounLower} meets all statutory eligibility requirements for T Nonimmigrant Status. We respectfully request that this application be approved.\n\nRespectfully Submitted,\n\n_________________________\n\nAttorney's Signature`;
        
        return coverLetter;
    } catch (error: any) {
        console.error("T-Visa Cover Letter Generation Error:", error);
        throw new Error(`Failed to generate T-Visa cover letter: ${error.message}`);
    }
};

/**
 * Generate legal argument for T-Visa Application
 */
export const generateTvisaLegalArgument = async (
    clientName: string,
    traffickingType: string,
    declarationText: string,
    supplementBText?: string
): Promise<string> => {
    const prompt = `
You are an expert immigration attorney. Your task is to develop a comprehensive legal argument explaining why the applicant qualifies for T Nonimmigrant Status (T-Visa) under the Victims of Trafficking and Violence Protection Act of 2000 (TVPA) and INA § 101(a)(15)(T).

**Applicant Information:**
- Name: ${clientName}
- Trafficking Type: ${traffickingType}

**Applicant's Declaration:**
"""
${declarationText || '[Declaration not provided]'}
"""

**Legal Requirements for T-Visa Eligibility (INA § 101(a)(15)(T) and 8 C.F.R. § 214.11):**
1. The applicant must be a victim of a severe form of trafficking in persons (as defined in 22 U.S.C. § 7102(8))
2. The applicant must be physically present in the United States on account of such trafficking
3. The applicant must have complied with any reasonable request for assistance in the investigation or prosecution of acts of trafficking (unless under 18 or unable to cooperate due to trauma)
4. The applicant would suffer extreme hardship involving unusual and severe harm upon removal

**Your Task:**
Develop a comprehensive legal argument (approximately 4-6 paragraphs) that:

1. **Introduction:** State that the applicant qualifies for T Nonimmigrant Status under INA § 101(a)(15)(T) and the TVPA

2. **Severe Form of Trafficking:** Explain that the applicant was a victim of a severe form of trafficking. Detail how the trafficking involved force, fraud, or coercion. Reference specific examples from the declaration.

3. **Physical Presence:** Explain how the applicant is physically present in the United States on account of trafficking. Detail the entry circumstances and current presence.

4. **Compliance with Law Enforcement:** Explain how the applicant has complied with reasonable requests for assistance, or qualifies for an exception. Reference evidence of cooperation from the declaration.

5. **Extreme Hardship:** Detail how removal would result in extreme hardship involving unusual and severe harm, including medical/psychological necessity and risk of re-victimization.

6. **Conclusion:** Conclude that the applicant meets all eligibility requirements and USCIS should approve the application

**Style:**
- Use formal legal writing
- Reference specific INA sections and regulations (8 C.F.R. § 214.11)
- Be specific and reference details from the declaration
- Keep it professional and persuasive
- Do not use placeholders - write the actual argument

**Output:**
Return only the legal argument text, no additional commentary or formatting.
    `;

    try {
        const response = await getAIInstance().models.generateContent({
            model: 'gemini-2.5-pro',
            contents: [{ parts: [{ text: prompt }] }],
            config: {
                safetySettings: safetySettings,
                temperature: 0.3,
                topK: 40,
            },
        });
        return response.text.trim();
    } catch (error: any) {
        console.error("T-Visa Legal Argument Generation Error:", error);
        throw new Error(`Failed to generate T-Visa legal argument: ${error.message}`);
    }
};