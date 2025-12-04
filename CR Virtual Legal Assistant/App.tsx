import React, { useState } from 'react';
import CaseSelector from './components/CaseSelector';
import IntakeUploader from './components/IntakeUploader';
import DynamicForm from './components/DynamicForm';
import FormAnalyzer from './components/FormAnalyzer';
import EvidenceUploader from './components/EvidenceUploader';
import OutputDisplay from './components/OutputDisplay';
import Button from './components/Button';
import TemplateUploader from './components/TemplateUploader';
import SupplementBUploader from './components/SupplementBUploader';
import ApiKeySettings from './components/ApiKeySettings';
import AliasesDisplay from './components/AliasesDisplay';
import VawaDocumentCheck from './components/VawaDocumentCheck';
import I130DocumentCheck from './components/I130DocumentCheck';
import NaturalizationDocumentCheck from './components/NaturalizationDocumentCheck';
import CriminalRecordAnalyzer from './components/CriminalRecordAnalyzer';
import FoiaAnalyzer from './components/FoiaAnalyzer';
import QuestionAssistant from './components/QuestionAssistant';
import { CASE_TYPE_DETAILS, QUESTIONS } from './constants';
import type { CaseType, FormData, ClassifiedDocuments, TaxYears, AnalyzedDocInfo } from './types';
import { readPdfAsText, readDocxAsText } from './services/fileService';
import { extractIntakeData, analyzeI130Document, fillUvisaTemplate, generateVawaAbuseSummary, generateVawaDocumentList, extractVawaAliases, checkVawaMinimumDocuments, generateNaturalizationDocumentList, generateNaturalizationLegalArgument, generateI130DocumentList, checkI130MinimumDocuments, checkNaturalizationMinimumDocuments, generateUvisaLegalArgument, extractSupplementBData, generateTvisaCoverLetter, generateTvisaLegalArgument } from './services/geminiService';

/**
 * Parses a date string from various common formats and returns it in YYYY-MM-DD format.
 * @param dateString The date string to parse.
 * @returns The formatted date string or an empty string if parsing fails.
 */
const normalizeDateForInput = (dateString: string): string => {
  if (!dateString || typeof dateString !== 'string') {
    return '';
  }

  // Try to handle MM/DD/YYYY or similar ambiguous formats first, assuming US context
  const mmDdYyyy = dateString.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{4})$/);
  if (mmDdYyyy) {
    const [, month, day, year] = mmDdYyyy;
    // Check for plausible month/day values
    if (parseInt(month, 10) <= 12 && parseInt(day, 10) <= 31) {
      return `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`;
    }
  }

  // Handle month-year formats like "October 2023" or "October, 2023"
  const monthYearMatch = dateString.match(/^([A-Za-z]+)\s*,?\s*(\d{4})$/);
  if (monthYearMatch) {
    const [, monthName, year] = monthYearMatch;
    const monthIndex = new Date(`${monthName} 1, ${year}`).getMonth();
    if (!isNaN(monthIndex)) {
      const yearNum = parseInt(year, 10);
      if (yearNum > 1900 && yearNum < new Date().getFullYear() + 5) {
        // Default to the first day of the month for month-year only dates
        return `${yearNum}-${String(monthIndex + 1).padStart(2, '0')}-01`;
      }
    }
  }

  // For other formats (like "January 5, 1990" or "1990-01-05"), Date.parse is usually fine.
  const timestamp = Date.parse(dateString);
  if (!isNaN(timestamp)) {
    const date = new Date(timestamp);
    // Using UTC methods to prevent timezone shifts from altering the date
    const year = date.getUTCFullYear();
    const month = String(date.getUTCMonth() + 1).padStart(2, '0');
    const day = String(date.getUTCDate()).padStart(2, '0');

    if (year > 1900 && year < new Date().getFullYear() + 5) {
      return `${year}-${month}-${day}`;
    }
  }

  console.warn(`Could not parse date "${dateString}" into YYYY-MM-DD format. Leaving field blank.`);
  return ''; // Return empty string if parsing fails
};


const App: React.FC = () => {
  const [selectedCaseType, setSelectedCaseType] = useState<CaseType | null>(null);
  const [formData, setFormData] = useState<FormData>({});
  const [isExtracting, setIsExtracting] = useState(false);
  const [extractionFeedback, setExtractionFeedback] = useState<{ message: string; type: 'success' | 'error' | 'info' } | null>(null);
  const [declarationText, setDeclarationText] = useState<string | null>(null);

  const [evidenceFiles, setEvidenceFiles] = useState<File[]>([]);
  const [isGenerating, setIsGenerating] = useState(false);
  const [generationStatus, setGenerationStatus] = useState('');
  const [generatedCoverLetter, setGeneratedCoverLetter] = useState('');
  const [generatedLegalArgument, setGeneratedLegalArgument] = useState('');
  const [generationError, setGenerationError] = useState<string | null>(null);
  const [templateFile, setTemplateFile] = useState<File | null>(null);
  const [activeUtility, setActiveUtility] = useState<'none' | 'criminal' | 'foia'>('none');
  const [vawaAliases, setVawaAliases] = useState<string[]>([]);
  const [vawaDocumentCheck, setVawaDocumentCheck] = useState<{ hasMinimumDocuments: boolean; missingDocuments: string[] } | null>(null);
  const [i130DocumentCheck, setI130DocumentCheck] = useState<{ hasMinimumDocuments: boolean; missingDocuments: string[] } | null>(null);
  const [naturalizationDocumentCheck, setNaturalizationDocumentCheck] = useState<{ hasMinimumDocuments: boolean; missingDocuments: string[] } | null>(null);
  const [supplementBFile, setSupplementBFile] = useState<File | null>(null);
  const [supplementBData, setSupplementBData] = useState<{ crimeType?: string; jurisdiction?: string; certifyingAgency?: string; [key: string]: any } | null>(null);
  const [supplementBFeedback, setSupplementBFeedback] = useState<{ message: string; type: 'success' | 'error' | 'info' } | null>(null);
  const [showApiKeySettings, setShowApiKeySettings] = useState<boolean>(false);

  const resetWorkflowState = () => {
    setFormData({});
    setExtractionFeedback(null);
    setDeclarationText(null);
    setEvidenceFiles([]);
    setGeneratedCoverLetter('');
    setGeneratedLegalArgument('');
    setGenerationStatus('');
    setGenerationError(null);
    setTemplateFile(null);
    setIsGenerating(false);
    setIsExtracting(false);
    setVawaAliases([]);
    setVawaDocumentCheck(null);
    setI130DocumentCheck(null);
    setNaturalizationDocumentCheck(null);
    setSupplementBFile(null);
    setSupplementBData(null);
    setSupplementBFeedback(null);
  };

  const landingCaseOrder: CaseType[] = [
    'naturalization',
    'i-130-adjustment',
    't-visa',
    'u-visa-certification',
    'u-visa-application',
    'vawa',
  ];

  const landingCaseLabels: Partial<Record<CaseType, string>> = {
    naturalization: 'NATURALIZATION APPLICATION (N-400)',
    'i-130-adjustment': 'I-130 PETITION WITH ADJUSTMENT OF STATUS',
    't-visa': 'T-VISA PETITION',
    'u-visa-certification': 'U-VISA CERTIFICATION REQUEST',
    'u-visa-application': 'U-VISA APPLICATION',
    vawa: 'VAWA SELF-PETITION',
  };

  const handleCaseSelect = (caseType: CaseType) => {
    resetWorkflowState();
    setActiveUtility('none');
    setSelectedCaseType(caseType);
  };

  const openUtility = (utility: 'criminal' | 'foia') => {
    resetWorkflowState();
    setSelectedCaseType(null);
    setActiveUtility(utility);
  };

  const goBackToDashboard = () => {
    resetWorkflowState();
    setSelectedCaseType(null);
    setActiveUtility('none');
  };

  const handleSupplementBUpload = async (file: File | null) => {
    setSupplementBFile(file);
    if (!file) {
      setSupplementBData(null);
      return;
    }

    try {
      setSupplementBFeedback({ message: 'Reading Form I-918 Supplement B...', type: 'info' });
      let fileText = '';
      if (file.type === 'application/pdf') {
        fileText = await readPdfAsText(file);
      } else if (file.type === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document') {
        fileText = await readDocxAsText(file);
      } else {
        throw new Error('Unsupported file type. Please upload a PDF or Word document.');
      }

      if (!fileText.trim()) {
        throw new Error('Could not extract text from file.');
      }

      setSupplementBFeedback({ message: 'Extracting information from Supplement B...', type: 'info' });
      const extractedData = await extractSupplementBData(fileText);
      setSupplementBData(extractedData);
      setSupplementBFeedback({ message: `Successfully extracted information! Crime Type: ${extractedData.crimeType || 'N/A'}, Jurisdiction: ${extractedData.jurisdiction || extractedData.certifyingAgency || 'N/A'}`, type: 'success' });
    } catch (error: any) {
      setSupplementBFeedback({ message: `Error extracting Supplement B: ${error.message}`, type: 'error' });
      setSupplementBData(null);
    }
  };

  const isLandingView = !selectedCaseType && activeUtility === 'none';

  const handleExtract = async (file: File) => {
    if (!selectedCaseType) return;
    setIsExtracting(true);
    setDeclarationText(null);
    setExtractionFeedback({ message: 'Reading file...', type: 'info' });
    try {
      let fileText = '';
      if (file.type === 'application/pdf') {
        fileText = await readPdfAsText(file);
      } else if (file.type === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document') {
        fileText = await readDocxAsText(file);
      } else {
        throw new Error('Unsupported file type.');
      }

      if (!fileText.trim()) throw new Error('Could not extract text from file.');

      // Debug: Log document preview
      const previewLength = Math.min(500, fileText.length);
      const preview = fileText.substring(0, previewLength);
      console.log('📄 Document text preview (first 500 chars):', preview);
      console.log('📄 Document total length:', fileText.length, 'characters');
      
      // Check if document appears to be readable text
      const hasReadableText = fileText.trim().length > 50 && /[a-zA-Z]{3,}/.test(fileText);
      if (!hasReadableText) {
        console.warn('⚠️ Warning: Document may not contain readable text. Is this a scanned PDF?');
        setExtractionFeedback({ 
          message: 'Warning: The document may not contain readable text. If this is a scanned PDF, please use a document with selectable text.', 
          type: 'error' 
        });
        setIsExtracting(false);
        return;
      }

      setDeclarationText(fileText);
      setExtractionFeedback({ message: 'Extracting information with AI...', type: 'info' });
      
      let extractedData: any;
      try {
        extractedData = await extractIntakeData(fileText, selectedCaseType);
        console.log('✅ Extraction successful. Extracted Data:', extractedData);
        console.log('📋 Questions for case type:', QUESTIONS[selectedCaseType]);
      } catch (extractionError: any) {
        console.error('❌ Extraction failed:', extractionError);
        throw new Error(`Failed to extract data: ${extractionError.message || 'Unknown error'}`);
      }

      if (!extractedData || typeof extractedData !== 'object') {
        throw new Error('AI returned invalid data format. Please try again.');
      }

      let fieldsPopulated = 0;
      const newFormData = { ...formData };
      const skippedFields: string[] = [];

      QUESTIONS[selectedCaseType].forEach(q => {
        const extractKey = q.extract_key || '';
        let value = extractedData[extractKey];
        
        // Handle string "null" values - convert to actual null
        if (value === 'null' || value === 'Null' || value === 'NULL') {
          value = null;
        }
        
        console.log(`Processing field ${q.id} (extract_key: ${extractKey}):`, value, `Type: ${typeof value}`);
        
        if (value === undefined || value === null || value === '' || (typeof value === 'string' && value.trim() === '')) {
          skippedFields.push(`${q.label} (no value)`);
          return; // Skip if no value from AI
        }

        let finalValue: string | boolean = value;
        let isPopulated = true;

        if (q.type === 'select' && typeof value === 'string') {
          // Clean the value - remove extra whitespace, quotes, etc.
          const cleanedValue = value.trim().replace(/^["']|["']$/g, '');
          const lowerCaseValue = cleanedValue.toLowerCase().trim();
          console.log(`  → Matching select field "${q.id}" with value "${value}" (cleaned: "${cleanedValue}", lowercase: "${lowerCaseValue}")`);
          console.log(`  → Available options:`, q.options);
          
          // Enhanced matching for gender fields specifically - check this FIRST
          if (q.id === 'applicant_gender' || q.id === 'petitioner_gender' || q.id === 'victim_gender') {
            console.log(`  → This is a gender field - using enhanced matching`);
            
            // Try to find a match with multiple strategies
            let genderMatch: string | undefined = undefined;
            
            // Strategy 1: Direct case-insensitive match (excluding "-- Select --")
            genderMatch = q.options?.find(opt => {
              const optLower = opt.toLowerCase().trim();
              return optLower !== '-- select --' && optLower === lowerCaseValue;
            });
            
            if (genderMatch) {
              console.log(`  → Found direct match: "${genderMatch}"`);
              finalValue = genderMatch;
            } else {
              // Strategy 2: Capitalized match (Male/Female)
              const capitalized = lowerCaseValue.charAt(0).toUpperCase() + lowerCaseValue.slice(1);
              genderMatch = q.options?.find(opt => {
                const optLower = opt.toLowerCase().trim();
                return optLower !== '-- select --' && optLower === capitalized.toLowerCase();
              });
              
              if (genderMatch) {
                console.log(`  → Found capitalized match: "${genderMatch}"`);
                finalValue = genderMatch;
              } else {
                // Strategy 3: Abbreviation matches (M -> Male, F -> Female)
                if (lowerCaseValue === 'm' || lowerCaseValue === 'male') {
                  genderMatch = q.options?.find(opt => opt.toLowerCase().trim() === 'male');
                } else if (lowerCaseValue === 'f' || lowerCaseValue === 'female') {
                  genderMatch = q.options?.find(opt => opt.toLowerCase().trim() === 'female');
                }
                
                if (genderMatch) {
                  console.log(`  → Found abbreviation match: "${genderMatch}"`);
                  finalValue = genderMatch;
                } else {
                  // Strategy 4: Partial/starts-with matches
                  genderMatch = q.options?.find(opt => {
                    const optLower = opt.toLowerCase().trim();
                    if (optLower === '-- select --') return false;
                    return optLower.startsWith(lowerCaseValue) || lowerCaseValue.startsWith(optLower);
                  });
                  
                  if (genderMatch) {
                    console.log(`  → Found partial match: "${genderMatch}"`);
                    finalValue = genderMatch;
                  } else {
                    // Strategy 5: Force match based on common patterns (last resort)
                    // If value contains "male" or "m", try to match Male
                    // If value contains "female" or "f", try to match Female
                    if (lowerCaseValue.includes('male') || lowerCaseValue.includes('m')) {
                      genderMatch = q.options?.find(opt => opt.toLowerCase().trim() === 'male');
                    } else if (lowerCaseValue.includes('female') || lowerCaseValue.includes('f')) {
                      genderMatch = q.options?.find(opt => opt.toLowerCase().trim() === 'female');
                    }
                    
                    if (genderMatch) {
                      console.log(`  → Found pattern match: "${genderMatch}"`);
                      finalValue = genderMatch;
                    } else {
                      console.warn(`  → ❌ No match found for gender value "${value}" (cleaned: "${cleanedValue}"). Available options:`, q.options);
                      console.warn(`  → Tried: direct match, capitalized match, abbreviation match, partial match, pattern match`);
                      skippedFields.push(`${q.label} (value "${value}" doesn't match options)`);
                      isPopulated = false;
                    }
                  }
                }
              }
            }
          } else {
            // Standard matching for non-gender select fields
            const matchingOption = q.options?.find(opt => {
              const optLower = opt.toLowerCase().replace('-- select --', '').trim();
              return optLower === lowerCaseValue;
            });
            
            if (matchingOption) {
              finalValue = matchingOption;
            } else {
              // Try capitalized version
              const capitalized = lowerCaseValue.charAt(0).toUpperCase() + lowerCaseValue.slice(1);
              const capitalizedMatch = q.options?.find(opt => {
                const optLower = opt.toLowerCase().replace('-- select --', '').trim();
                return optLower === capitalized.toLowerCase();
              });
              
              if (capitalizedMatch) {
                finalValue = capitalizedMatch;
              } else {
                // Last resort: partial matches
                const partialMatch = q.options?.find(opt => {
                  const optLower = opt.toLowerCase().replace('-- select --', '').trim();
                  return (optLower.startsWith(lowerCaseValue)) ||
                         (lowerCaseValue.startsWith(optLower));
                });
                
                if (partialMatch) {
                  finalValue = partialMatch;
                } else {
                  console.warn(`Value "${value}" from AI does not match any option for field "${q.id}". Available options:`, q.options);
                  skippedFields.push(`${q.label} (value "${value}" doesn't match options)`);
                  isPopulated = false;
                }
              }
            }
          }
          
          if (isPopulated && finalValue) {
            console.log(`  → ✓ Successfully matched "${value}" to "${finalValue}"`);
          }
        } else if (q.type === 'date' && typeof value === 'string') {
          const normalizedDate = normalizeDateForInput(value);
          if (normalizedDate) {
            finalValue = normalizedDate;
          } else {
            console.warn(`Could not normalize date "${value}" for field "${q.id}"`);
            skippedFields.push(`${q.label} (invalid date format: "${value}")`);
            isPopulated = false; // Don't populate if date is invalid
          }
        }

        if (isPopulated) {
          newFormData[q.id] = finalValue;
          fieldsPopulated++;
          console.log(`✓ Populated ${q.id} with value:`, finalValue);
        }
      });

      setFormData(newFormData);

      if (fieldsPopulated > 0) {
        const skippedMsg = skippedFields.length > 0 ? ` (${skippedFields.length} fields skipped: ${skippedFields.join(', ')})` : '';
        setExtractionFeedback({ 
          message: `Successfully populated ${fieldsPopulated} field${fieldsPopulated > 1 ? 's' : ''}.${skippedMsg}`, 
          type: 'success' 
        });
      } else {
        // Show what was actually extracted to help debug
        const extractedValues = Object.entries(extractedData)
          .map(([key, value]) => `${key}: ${value === null ? 'null' : value === '' ? '(empty)' : JSON.stringify(value)}`)
          .join(', ');
        const debugInfo = `Extracted: ${extractedValues}. All fields were null or empty. Please check: 1) Does the document contain the required information? 2) Is the document text readable (not scanned image)? 3) Try a different document format.`;
        setExtractionFeedback({ 
          message: `AI could not find matching information in the document. ${debugInfo}`, 
          type: 'error' 
        });
      }

    } catch (error: any) {
      setExtractionFeedback({ message: `Error: ${error.message}`, type: 'error' });
    } finally {
      setIsExtracting(false);
    }
  };

  const formatDate = (dateString: string): string => {
    if (!dateString) return '';
    try {
      const date = new Date(dateString + 'T00:00:00'); // Assume UTC to prevent timezone shifts
      if (isNaN(date.getTime())) {
        // Try parsing MM/DD/YYYY
        const parts = dateString.split('/');
        if (parts.length === 3) {
          const [month, day, year] = parts.map(p => parseInt(p, 10));
          if (year && month && day && year > 1900 && month > 0 && month <= 12 && day > 0 && day <= 31) {
            return `${String(month).padStart(2, '0')}/${String(day).padStart(2, '0')}/${year}`;
          }
        }
        return dateString; // Fallback
      }
      const month = (date.getUTCMonth() + 1).toString().padStart(2, '0');
      const day = date.getUTCDate().toString().padStart(2, '0');
      const year = date.getUTCFullYear();
      return `${month}/${day}/${year}`;
    } catch {
      return dateString;
    }
  };


  const generateI130CoverLetter = async () => {
    const names = {
      petitioner: formData.petitioner_name as string,
      beneficiary: formData.beneficiary_name as string,
      sponsor: formData.sponsor_name as string,
    };
    if (!names.petitioner || !names.beneficiary || !names.sponsor) {
      throw new Error("Please fill out all Petitioner, Beneficiary, and Sponsor names.");
    }

    setGenerationStatus('Reading evidence files...');
    const evidence = await Promise.all(
      evidenceFiles.map(async (file) => {
        setGenerationStatus(`Reading ${file.name}...`);
        const text = await readPdfAsText(file);
        return { fileName: file.name, fileText: text };
      })
    );

    setGenerationStatus('AI is analyzing documents and generating document list...');
    const documentList = await generateI130DocumentList(evidence, names);

    // Classify documents by tab for validation
    const classifiedDocs: { [key: string]: string[] } = { A: [], B: [], C: [], D: [], E: [] };
    documentList.forEach(doc => {
        if (classifiedDocs[doc.tab]) {
            classifiedDocs[doc.tab].push(doc.description);
        } else {
            classifiedDocs['E'].push(doc.description); // Fallback to Tab E if tab is unknown
        }
    });

    // Check minimum required documents
    setGenerationStatus('Checking minimum required documents...');
    try {
        const documentCheck = await checkI130MinimumDocuments(classifiedDocs);
        setI130DocumentCheck(documentCheck);
    } catch (error: any) {
        console.error('Failed to check minimum documents:', error);
        // Don't fail the entire generation if document check fails
        setI130DocumentCheck({ hasMinimumDocuments: false, missingDocuments: ['Unable to verify documents'] });
    }

    setGenerationStatus('Assembling cover letter...');

    const coverLetterTemplate = `{{TODAY'S DATE}}

USCIS
Attn: I-130 (Box 4053)
2500 Westfield Drive
Elgin, IL 60124-7836

RE: I-130 Petition for Alien Relative and I-485 Adjustment of Status
Petitioner: {{PETITITONER'S NAME}} DOB: {{PETITIONER'S DOB}}
Beneficiary: {{BENEFICIARY'S NAME}} DOB: {{BENEFICIARY'S DOB}}

To Whom It May Concern:

Please find enclosed an I-130 and I-485 application packet with {{BENEFICIARY'S NAME}} as beneficiary, being petitioned by {{PETITIONER'S PRONOUN}} United States citizen {{PETITTIONER'S RELATIONSHIP}}, {{PETITITONER'S NAME}}. Please find attached to the packet the following forms:
- Form G-28, Notice of Entry of Appearance as Attorney or Accredited Representative for Petitioner;
- Form G-28, Notice of Entry of Appearance as Attorney or Accredited Representative for Beneficiary;
- Form I-130, Petition for Alien Relative;
- Form I-485, Application To Register Permanent Residence or Adjust Status;
- Form I-765, Application For Employment Authorization; and
- Form I-864, Affidavit of Support Under Section 213A Of The INA for Sponsor.

TAB A – DOCUMENTS ESTABLISHING IDENTITY, NATIONALITY, AND INCOME OF PETITIONER
{{LIST OF PETITIONER DOCUMENTS}}

TAB B - DOCUMENTS ESTABLISHING IDENTITY, NATIONALITY, AND LAWFUL ENTRY TO THE UNITED STATES OF BENEFICIARY
{{LIST OF BENEFICIARY DOCUMENTS}}

TAB C - DOCUMENTS ESTABLISHING BONA-FIDE RELATIONSHIP OF BENEFICIARY AND PETITIONER
{{LIST OF RELATIONSHIP DOCUMENTS}}

TAB D – DOCUMENTS ESTABLISHING BENEFICIARY'S GOOD MORAL CHARACTER AND TIES TO THE UNITED STATES
{{LIST OF BENEFICIARY GMC DOCUMENTS}}

TAB E - DOCUMENTS ESTABLISHING IDENTITY, NATIONALITY, AND INCOME OF SPONSOR
{{LIST OF SPONSOR DOCUMENTS}}

Should you need anything further, please do not hesitate to contact me. We appreciate your timely attention to this matter.

Respectfully,

_______________________
Attorney's Name
Attorney at Law`;

    const todaysDate = new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
    const { relationship, petitioner_gender } = formData;
    // Normalize gender for comparison
    const petitionerGenderNormalized = (petitioner_gender as string || '').toLowerCase().trim();
    const isPetitionerMale = petitionerGenderNormalized === 'male' || petitionerGenderNormalized === 'm';
    const isPetitionerFemale = petitionerGenderNormalized === 'female' || petitionerGenderNormalized === 'f';
    
    const relationshipText = relationship === 'spouse' 
      ? (isPetitionerMale ? 'husband' : (isPetitionerFemale ? 'wife' : 'spouse'))
      : (isPetitionerMale ? 'son' : (isPetitionerFemale ? 'daughter' : 'child'));
    const petitionerPronoun = isPetitionerMale ? 'his' : (isPetitionerFemale ? 'her' : 'their');

    // Format document lists by tab
    const formatDocList = (tab: string) => {
      const docs = documentList.filter(d => d.tab === tab).map(d => `- ${d.description}`);
      return docs.length > 0 ? docs.join('\n') : '- [No Documents Classified for this Tab]';
    };

    const petitionerDocs = formatDocList('A');
    const beneficiaryDocs = formatDocList('B');
    const relationshipDocs = formatDocList('C');
    const beneficiaryGmcDocs = formatDocList('D');
    const sponsorDocs = formatDocList('E');

    let filledTemplate = coverLetterTemplate
      .replace(/{{TODAY'S DATE}}/g, todaysDate)
      .replace(/{{PETITITONER'S NAME}}/g, names.petitioner)
      .replace(/{{PETITIONER'S DOB}}/g, formatDate(formData.petitioner_dob as string))
      .replace(/{{BENEFICIARY'S NAME}}/g, names.beneficiary)
      .replace(/{{BENEFICIARY'S DOB}}/g, formatDate(formData.beneficiary_dob as string))
      .replace(/{{PETITIONER'S PRONOUN}}/g, petitionerPronoun)
      .replace(/{{PETITTIONER'S RELATIONSHIP}}/g, relationshipText)
      .replace('{{LIST OF PETITIONER DOCUMENTS}}', petitionerDocs)
      .replace('{{LIST OF BENEFICIARY DOCUMENTS}}', beneficiaryDocs)
      .replace('{{LIST OF RELATIONSHIP DOCUMENTS}}', relationshipDocs)
      .replace('{{LIST OF BENEFICIARY GMC DOCUMENTS}}', beneficiaryGmcDocs)
      .replace('{{LIST OF SPONSOR DOCUMENTS}}', sponsorDocs);

    setGeneratedCoverLetter(filledTemplate);
  };

  const generateUvisaRequest = async () => {
    setGenerationStatus('Reading evidence files...');
    let evidenceText = '';
    for (const file of evidenceFiles) {
        evidenceText += `--- START OF DOCUMENT: ${file.name} ---\n`;
        evidenceText += await readPdfAsText(file);
        evidenceText += `\n--- END OF DOCUMENT: ${file.name} ---\n\n`;
    }
    
    setGenerationStatus("AI is analyzing documents and writing the letter...");

    const { victim_name, victim_gender, pasted_narrative } = formData;
    
    const missingFields: string[] = [];
    if (!victim_name) missingFields.push("Victim's Full Name");
    if (!victim_gender) missingFields.push("Victim's Gender");
    if (!pasted_narrative) missingFields.push("Victim's Declaration");

    if (missingFields.length > 0) {
      throw new Error(`Please fill out the following required fields before generating: ${missingFields.join(', ')}.`);
    }

    const uVisaTemplate = `{{TODAY'S DATE}}

{{WRITE THE NAME OF THE LAW ENFORCEMENT AGENCY LISTED IN THE POLICE REPORT}}
{{FIND WHO IS THE HEAD OF THE LAW ENFORCEMENT AGENY IN THE POLICE REPORT AND WRITE HIS NAME HERE}}
{{FIND THE MAILING ADDRESS OF THE LAW ENFORCEMENT AGENY IN THE POLICE REPORT AND WRITE IT HERE}}

Dear {{FIND WHO IS THE HEAD OF THE LAW ENFORCEMENT AGENY IN THE POLICE REPORT AND WRITE HIS NAME HERE}}:

Law Firm Name represents {{CLIENT'S NAME}} in {{IDENTIFY IF CLIENT IS MALE OR FEMALE AND WRITE him IF HE IS MALE OR her IF IT IS FEMALE}} immigration case. I am writing to respectfully request that your office issue a U-Visa certification for {{CLIENT'S NAME}}, a direct victim of a crime that occurred on {{WRITE THE DATE OF THE POLICE REPORT IN HERE}}, in {{WRITE THE JURISDICTION OF THE LAW ENFORCEMENT AGENCY IN THE POLICE REPORT HERE}}, {{WIRTE THE STATE WHERE THE LAW ENFORCEMENT AGENCY IS LOCATED IN HERE}}.

Under federal law, a U-Visa is available to victims of certain qualifying crimes who have suffered substantial physical or mental abuse as a result of a crime that occurred within the United States, possess information about the crime, and have been helpful, are being helpful, or are likely to be helpful in the investigation or prosecution of the crime. The U-Visa statute requires a certification from a law enforcement official, local prosecutor, Federal or State judge, or other Federal, State, or local authorities investigating or prosecuting the qualifying criminal activity confirming the victim's helpfulness in the investigation or prosecution of the crime. This certification is a prerequisite for the U-Visa application. In {{CLIENT'S NAME HERE}}'s case, the facts as well as the applicable federal and state law, demonstrate that {{CLIENT'S NAME HERE}} meets the eligibility requirements for a U-Visa certification.

Background and Victimization

{{WIRTE A DETAILED FACTUAL RECITATION OF THE CLIENT'S NARRATIVE OF EVENTS IN HERE. BE AS THROUGHOUT AS POSSIBLE}}

{{WRITE HOW THE CLIENT WAS EMOTIONALLY, PHYSICALLY, OR FINANCIALLY IMPACTED IN HERE}}

Conclusion

In consideration of the above, I respectfully request that the {{WRITE THE JURISDICTION OF THE LAW ENFORCEMENT AGENCY IN THE POLICE REPORT HERE}}'s Office issues the U-Visa certification for {{CLIENT'S NAME}}. The certification will enable her to proceed with her U-Visa application, which is critical for {{IDENTIFY IF CLIENT IS MALE OR FEMALE AND WRITE him IF HE IS MALE OR her IF IT IS FEMALE}} to obtain the protection and stability she needs as a victim. Your office's cooperation in this matter is greatly appreciated as a vital step in ensuring justice and support for victims of crimes. Enclosed you will find two copies of Form 918 Supplement B, U Nonimmigrant Status Certification, one completed and the other one blank if you wish to complete it, instructions to complete the form, police of the incident as described above, and a prepaid envelope for your convenience.

Thank you for your cooperation. Should you have any questions, please do not hesitate to contact me.

Respectfully,

_______________________
Attorney's Name
Attorney at Law`;

    const filledTemplate = await fillUvisaTemplate({
        evidenceText: evidenceText,
        declarationText: pasted_narrative as string,
        clientName: victim_name as string,
        clientGender: victim_gender as string,
        template: uVisaTemplate,
    });

    setGeneratedCoverLetter(filledTemplate);
  };

  const generateUvisaApplication = async () => {
    const { petitioner_name, petitioner_dob, petitioner_gender, pasted_narrative } = formData;

    if (!petitioner_name) {
      throw new Error("Please fill out the Petitioner's Full Name.");
    }

    setGenerationStatus('Reading evidence files...');
    const evidenceForAnalysis = await Promise.all(
      evidenceFiles.map(async (file) => {
        setGenerationStatus(`Reading: ${file.name}`);
        const fileText = await readPdfAsText(file);
        return { fileName: file.name, fileText: fileText };
      })
    );

    // Get Form I-918 Supplement B text - prioritize uploaded file, then check evidence
    let supplementBText = '';
    if (supplementBFile) {
      setGenerationStatus('Reading uploaded Form I-918 Supplement B...');
      if (supplementBFile.type === 'application/pdf') {
        supplementBText = await readPdfAsText(supplementBFile);
      } else if (supplementBFile.type === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document') {
        supplementBText = await readDocxAsText(supplementBFile);
      }
    } else {
      // Check evidence files for Supplement B
      const supplementBFileInEvidence = evidenceForAnalysis.find(e => 
        e.fileName.toLowerCase().includes('supplement b') || 
        e.fileName.toLowerCase().includes('i-918 supplement b') ||
        e.fileName.toLowerCase().includes('certification')
      );
      if (supplementBFileInEvidence) {
        supplementBText = supplementBFileInEvidence.fileText;
      }
    }

    setGenerationStatus('Generating legal argument...');
    // Use extracted crime type from Supplement B data if available
    const crimeType = supplementBData?.crimeType || (supplementBText ? '[Crime type will be extracted from Supplement B]' : '[Crime type will be extracted from declaration]');
    const legalArgument = await generateUvisaLegalArgument(
      petitioner_name as string,
      crimeType,
      supplementBText,
      pasted_narrative as string || ''
    );

    setGenerationStatus('AI is analyzing documents and generating document list...');
    // TODO: Create AI function to classify documents into tabs
    // For now, use basic classification

    setGenerationStatus('Assembling cover letter...');

    const todaysDate = new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
    
    // Normalize gender for comparison
    const petitionerGenderNormalized = (petitioner_gender as string || '').toLowerCase().trim();
    const isPetitionerMale = petitionerGenderNormalized === 'male' || petitionerGenderNormalized === 'm';
    const isPetitionerFemale = petitionerGenderNormalized === 'female' || petitionerGenderNormalized === 'f';
    
    const petitionerPronoun = isPetitionerMale ? 'his' : (isPetitionerFemale ? 'her' : 'their');
    const petitionerPronounSubj = isPetitionerMale ? 'he' : (isPetitionerFemale ? 'she' : 'they');

    // Build Tab C biographic documents list (will be populated by AI analysis)
    const tabCDocs: string[] = [];

    // Build Tab E good moral character documents (will be populated by AI analysis)
    const tabEDocs: string[] = [];

    // Build Tab F physical presence documents (utility bills, etc.)
    const tabFDocs: string[] = [];
    evidenceForAnalysis.forEach(e => {
      const lowerName = e.fileName.toLowerCase();
      if (lowerName.includes('utility') || lowerName.includes('bill') || lowerName.includes('electric') || lowerName.includes('water') || lowerName.includes('gas')) {
        // Extract company name from filename if possible
        const companyMatch = e.fileName.match(/([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*)\s+(?:bill|utility|statement)/i);
        const companyName = companyMatch ? companyMatch[1] : '[Company Name]';
        tabFDocs.push(`${companyName} bill of Petitioner`);
      } else if (lowerName.includes('birth') && lowerName.includes('child')) {
        tabFDocs.push(`Birth certificate of Petitioner's child${pasted_narrative ? ' (with English translation)' : ''}`);
      }
    });

    const coverLetterTemplate = `{{TODAY'S DATE}}

USCIS Nebraska Service Center
Attn: I-918
850 S St.
Lincoln, NE 68508

RE: I-918, Petition for U Nonimmigrant Status
Petitioner: {{PETITIONER_NAME}}
DOB: {{PETITIONER_DOB}}

To Whom It May Concern:

Law Firm Name represents {{PETITIONER_NAME}} in ${petitionerPronoun} Petition for U Nonimmigrant Status. The Petitioner qualifies for the I-918 because ${petitionerPronounSubj} was a direct victim of {{CRIME_TYPE}}.

Attached, please find the following forms and supporting documents:

Forms of Petitioner and Derivative:
- Form G-28, Notice of Entry of Appearance as Attorney or Accredited Representative for Petitioner;
- Form I-192, Advance for Permission to Enter as a Nonimmigrant of Petitioner;
- Form I-765, Application for Employment Authorization of Petitioner; and
- Form I-918, Petition for U Nonimmigrant Status of Petitioner.

TAB A - DOCUMENTS ESTABLISHING THE QUALIFYING CRIME AND SUBSTANTIAL PHYSICAL OR MENTAL ABUSE

- Declaration of Petitioner
- Form I-918 Supplement B, U Nonimmigrant Status Certification Completed and Signed (refer to Tab A)
{{JURISDICTION_REPORT}}
{{TAB_A_DOCS}}

TAB B - DOCUMENTS ESTABLISHING EVIDENCE OF THE PETITIONER'S COOPERATION WITH THE AUTHORITIES

{{TAB_B_DOCS}}

TAB C - BIOGRAPHIC INFORMATION OF PETITIONER

{{TAB_C_DOCS}}

TAB E - DOCUMENTS ESTABLISHING GOOD MORAL CHARACTER OF THE PETITIONER

{{TAB_E_DOCS}}

TAB F - DOCUMENTS PROVING PHYSICAL PRESENCE AND TIES TO THE UNITED STATES OF PETITIONER

{{TAB_F_DOCS}}

LEGAL ARGUMENT

{{LEGAL_ARGUMENT}}

Should you need anything further, please do not hesitate to contact me. We appreciate your timely attention to this matter.

Respectfully,

_______________________
Attorney's Name
Attorney for the Petitioner`;

    const formatDocList = (docs: string[]) => {
      if (docs.length === 0) {
        return '';
      }
      return docs.map(doc => `- ${doc}`).join('\n');
    };

    // Use extracted data from Supplement B if available
    const crimeTypeForTemplate = supplementBData?.crimeType || 'a qualifying criminal activity';
    const jurisdictionReport = supplementBData?.jurisdiction || supplementBData?.certifyingAgency 
      ? `- ${supplementBData.jurisdiction || supplementBData.certifyingAgency} report of Petitioner's victimization`
      : '';

    let filledTemplate = coverLetterTemplate
      .replace(/{{TODAY'S DATE}}/g, todaysDate)
      .replace(/{{PETITIONER_NAME}}/g, petitioner_name as string)
      .replace(/{{PETITIONER_DOB}}/g, formatDate(petitioner_dob as string) || '[DOB Not Provided]')
      .replace(/{{CRIME_TYPE}}/g, crimeTypeForTemplate)
      .replace('{{JURISDICTION_REPORT}}', jurisdictionReport)
      .replace('{{TAB_A_DOCS}}', formatDocList([])) // Will be populated by AI analysis
      .replace('{{TAB_B_DOCS}}', formatDocList([])) // Will be populated by AI analysis
      .replace('{{TAB_C_DOCS}}', formatDocList(tabCDocs))
      .replace('{{TAB_E_DOCS}}', formatDocList(tabEDocs))
      .replace('{{TAB_F_DOCS}}', formatDocList(tabFDocs))
      .replace('{{LEGAL_ARGUMENT}}', legalArgument);

    setGeneratedCoverLetter(filledTemplate);
    setGeneratedLegalArgument(legalArgument);
  };

  const generateVawaPacket = async () => {
    setGenerationStatus('Summarizing declaration...');
    let summaryResult;
    try {
      summaryResult = await generateVawaAbuseSummary(formData.pasted_narrative as string);
      console.log('✅ Abuse summary generated successfully:', summaryResult);
      console.log('Abuse summary structure:', {
        hasAbuseSummary: !!summaryResult?.abuse_summary,
        psychological: summaryResult?.abuse_summary?.psychological?.length || 0,
        verbal: summaryResult?.abuse_summary?.verbal?.length || 0,
        physical: summaryResult?.abuse_summary?.physical?.length || 0,
        financial: summaryResult?.abuse_summary?.financial?.length || 0,
      });
    } catch (error: any) {
      console.error('❌ Error generating abuse summary:', error);
      throw error;
    }

    setGenerationStatus('Reading evidence files...');
    const evidenceForAnalysis = await Promise.all(
      evidenceFiles.map(async (file) => {
        setGenerationStatus(`Reading: ${file.name}`);
        const fileText = await readPdfAsText(file);
        return { fileName: file.name, fileText: fileText };
      })
    );
    
    setGenerationStatus('AI is analyzing all evidence...');
    const documentList = await generateVawaDocumentList(evidenceForAnalysis, formData);

    const classifiedDocs: { [key: string]: string[] } = { A: [], B: [], C: [], D: [], E: [] };
    documentList.forEach(doc => {
        if (classifiedDocs[doc.tab]) {
            classifiedDocs[doc.tab].push(doc.description);
        } else {
            classifiedDocs['E'].push(doc.description); // Fallback to Tab E if tab is unknown
        }
    });

    // Extract aliases from evidence documents
    setGenerationStatus('Extracting name aliases from evidence...');
    try {
        const aliases = await extractVawaAliases(evidenceForAnalysis, formData.petitioner_name as string || '');
        setVawaAliases(aliases);
    } catch (error: any) {
        console.error('Failed to extract aliases:', error);
        // Don't fail the entire generation if alias extraction fails
        setVawaAliases([]);
    }

    // Check minimum required documents
    setGenerationStatus('Checking minimum required documents...');
    try {
        const documentCheck = await checkVawaMinimumDocuments(
            classifiedDocs,
            formData.abuser_name as string || '',
            formData.petitioner_name as string || ''
        );
        setVawaDocumentCheck(documentCheck);
    } catch (error: any) {
        console.error('Failed to check minimum documents:', error);
        // Don't fail the entire generation if document check fails
        setVawaDocumentCheck({ hasMinimumDocuments: false, missingDocuments: ['Unable to verify documents'] });
    }

    setGenerationStatus('Assembling final document...');

    if (!summaryResult || !summaryResult.abuse_summary) {
      throw new Error("AI call failed or returned incomplete data. Expected 'abuse_summary' object.");
    }
    const vawaTemplate = `{{TODAY’S DATE}}

U.S. Department of Homeland Security
Nebraska Services Center
USCIS
850 S St
Lincoln, NE 68508-1225

RE: I-360 with Adjustment of Status Application
Petitioner: {{PETITIONER_NAME}}
DOB: {{PETITIONER_DOB}}

To Whom it May Concern:

Law Firm Name represents {{PETITIONER_NAME}} in {{PETITIONER_PRONOUN}} petition for a battered or abused parent of a United States citizen and accompanying application for Adjustment of Status. 

The Petitioner qualifies for the I-360 with Adjustment of Status because {{PETITIONER_PRONOUN}} {{ABUSER_RELATIONSHIP}}, {{ABUSER_NAME}}, herein referred to as “{{ABUSER_FIRST_NAME}}”, has abused {{PETITIONER_PRONOUN_OBJ}} as follows:

{{ABUSE_SUMMARY}}

VAWA I-360 SELF-PETITION 

Attached please find the following documents in support of Petitioner’s petition and application:

Forms:
- Form G-28, Notice of Entry of Appearance as Attorney or Accredited Representative
- Form I-360, Petition for a Battered or Abused Parent of a United States Citizen;
- Form I-485, Application to Register Permanent Residence or Adjust Status;
- Form I-693, Report of Immigration Medical Examination and Vaccination Record, and
- Form I-765, Application for Employment Authorization.

TAB A – DOCUMENTS ESTABLISHING IDENTITY & CURRENT STATUS OF PETITIONER

{{TAB_A_DOCS}}

TAB B – DOCUMENTS ESTABLISHING PROOF OF ABUSIVE {{ABUSER_RELATIONSHIP_UPPER}}’S CITZENSHIP STATUS & THE CHILD IS OVER THE AGE OF TWENTY-ONE.

- Birth certificate of Petitioner’s abusive USC {{ABUSER_RELATIONSHIP}}, {{ABUSER_NAME}} proving United States citizenship
{{TAB_B_DOCS}}

TAB C – DOCUMENTS ESTABLISHING THE QUALIFYING RELATIONSHIP, RESIDENCE WITH ABUSIVE {{ABUSER_RELATIONSHIP_UPPER}} & ABUSE/CRUELTY

- Declaration of Petitioner
{{TAB_C_DOCS}}

TAB D – DOCUMENTS ESTABLISHING GOOD MORAL CHARACTER OF PETITIONER

{{TAB_D_DOCS}}

TAB E – DOCUMENTS FURTHER ESTABLISHING PETITIONER’S TIES TO THE UNITED STATES

{{TAB_E_DOCS}}

TAB F – ADJUSTMENT OF STATUS APPLICATION OF PETITIONER

- Form I-485, Application to Register Permanent Residence or Adjust Status

LEGAL ARGUMENT

Pursuant to 8 CFR §204.2(c), the Petitioner may file a self-petition under §§204(a)(1)(A)(iii)(II)(aa)(AA) or 204(a)(1)(A)(v)(ii) of the Immigration and Nationality Act (“INA” or “the Act”) for her classification as an immediate relative or as a preference immigrant if she: 

(A) Is the child of a citizen of the UnitedS States; 
(B) Is eligible for immigrant classification under §§201(b)(2)(A)(i) or 203(a)(2)(A) of the Act based on that relationship; 
(C) Is residing in the United States; 
(D) Has resided in the United States with the citizen or lawful permanent resident child 
(E) Has been battered by, or has been the subject of extreme cruelty perpetrated by, the citizen during the relationship; 
(F) Is a person of good moral character; (G) Is a person whose deportation would result in extreme hardship to herself; and 
(H) Entered into the relationship to the citizen in good faith. 

The Victims of Trafficking and Violence Prevention Act of 2000 (“VTVPA”) eliminated the extreme hardship requirement for self-petitioners. See Victims of Trafficking and Violence Prevention Act of 2000, 114 Stat. 1464, Pub. L. No. 106-386 (Oct. 28, 2000). See also 8 CFR §§204.2(c)(1)(i)(G), (c)(1)(viii), and (c)(2)(vi). 

Furthermore, the Secretary of Homeland Security may waive the permanent bar under INA §212(a)(9)(C) in the case of any individual who is a VAWA self-petitioner if there is a connection between the individual’s battering or subjection to extreme cruelty and the individual’s departure from the United States or reentry into the United States. The AAO further found that the waiver is available where the departure or reentry was connected to the abuse by a former partner and need not be connected to the abuse of the partner that is the basis for the VAWA claim. See Matter of ___ , (AAO Spokane, Feb. 4, 2013), reported in 18 Bender's Immigr. Bull. 483, 507 (May 1, 2013); see also Matter of ___ (AAO Spokane Feb. 4, 2013).

A. The Petitioner Is the Parent of a United States Citizen {{ABUSER_RELATIONSHIP}}
Pursuant to 8 CFR §§204.2(c)(2)(ii) and (e)(2)(ii), a self-petitioner must submit proof of the abuser’s status as a United States citizen. The enclosed copy of {{ABUSER_NAME}}’s birth certificate proves that the Petitioner’s abusive {{ABUSER_RELATIONSHIP}} is a United States citizen.

B. The Petitioner Shared a Residence with {{PETITIONER_POSSESSIVE_PRONOUN}}  United States Citizen {{ABUSER_RELATIONSHIP}}
Although the Petitioner need not have lived in the United States, {{PETITIONER_PERSONAL_PRONOUN}} must show that {{PETITIONER_PERSONAL_PRONOUN}} has resided with the abuser. INA §§204(a)(1)(A)(iii)(II)(dd) and 204(a)(1)(B)(ii)(II)(dd). The Petitioner has resided with {{PETITIONER_POSSESSIVE_PRONOUN}} child since {{ABUSER_DOB_PLACEHOLDER}}. The Petitioner currently resides with {{PETITIONER_POSSESSIVE_PRONOUN}} {{ABUSER_RELATIONSHIP}}, {{ABUSER_NAME}}, at {{COHABITATION_ADDRESS}}.

C. The Petitioner Is a Person of Good Moral Character
The Petitioner is a person of good moral character who deserves to remain in the United States, where {{PETITIONER_PERSONAL_PRONOUN}} can heal from the abuse she suffered, remain close to {{PETITIONER_POSSESSIVE_PRONOUN}} family, and build a happy life. The Petitioner is a kind, responsible, hard-working individual. The people who know the Petitioner value her as a helpful, hard-working, caring individual of high moral character. 

Additionally, the Petitioner has done {{PETITIONER_POSSESSIVE_PRONOUN}} best to comply with the laws of the United States. The Petitioner wants to remain in the United States to become a productive member of society here. Based on the qualities {{PETITIONER_PERSONAL_PRONOUN}} exhibits to all who know {{HIM/HER DEPENDING ON PETITITIONER'S GENDER}}, the Petitioner is of the highest moral character and deserves to remain in the United States.

D. The Petitioner’s United States Citizen {{ABUSER_RELATIONSHIP}} Subjected {{HIM/HER DEPENDING ON PETITITIONER'S GENDER}} to Extreme Cruelty and Abuse for the Duration of Their Relationship
A self-petitioner must be “battered” or “the subject of extreme cruelty”. INA §204(a)(1)(A)(iii)(I)(bb) and (iv). These terms are defined as follows: 

“[W]as battered by or was the subject of extreme cruelty” includes, but is not limited to being the victim of any act or threatened act of violence, including forceful detention, which results or threatens to result in physical or mental injury. Psychological or sexual abuse or exploitation, including rape, molestation, incest (if the victim was a minor), or forced prostitution shall be considered acts of violence. Other abusive actions may also be acts of violence under certain circumstances, including acts that in and of themselves, may not initially appear violent but are part of an overall pattern of violence” 8 CFR §§204.2(c)(1)(vi) and (e)(1)(vi). 

Evidence of battering or extreme cruelty may include “any credible evidence.” INA §204(a)(1(J). Specifically, “evidence of abuse may include but is not limited to, reports, and affidavits from police judges and other court officials, medical personnel, school officials, clergy, social workers, and other social service agency personnel.” 8 CFR §§204.2(c)(2)(iv) and (e)(2)(iv). 

The Petitioner’s declaration describes the abuse that {{PETITIONER_PERSONAL_PRONOUN}} endured while she lived with {{PETITIONER_POSSESSIVE_PRONOUN}} {{ABUSER_RELATIONSHIP}}. The various abuses the Petitioner suffers are typical forms of abuse. Mayo Clinic lists multiple forms of abuse, including when an individual calls the victim names, insults her, or puts her down. Here, the Petitioner has suffered each one of these abuses, in addition to other abuses not listed, such as threats. The Petitioner’s {{ABUSER_RELATIONSHIP}} has repeatedly subjected {{HIM/HER DEPENDING ON PETITITIONER'S GENDER}} to extreme cruelty and abuse.

E. The Petitioner Will Suffer Extreme Hardship If {{PETITIONER_PERSONAL_PRONOUN}} Cannot Remain in the United States.
When evaluating extreme hardship, the adjudicator must look at various factors, including the Petitioner’s family ties in the United States and abroad, her health and medical conditions, the conditions in the country of removal, both economic and political, the Petitioner’s immigration history, and {{PETITIONER_POSSESSIVE_PRONOUN}} position ties to the community. Matter of Anderson , 16 I&N Dec. 596 (BIA 1978). In Matter of Ige , 20 I&N Dec. 880, 882 (BIA 1994), the BIA found that “relevant factors though not extreme in themselves, must be considered in the aggregate in determining whether extreme hardship exists.” See also Matter of O-J-O- , 21 I&N Dec. 381 (BIA 1996). 

Here, the Petitioner must remain in the United States where {{PETITIONER_PERSONAL_PRONOUN}} can be with {{PETITIONER_POSSESSIVE_PRONOUN}} friends, community and extended family and where {{PETITIONER_PERSONAL_PRONOUN}} can continue to seek mental health treatment and heal from the abuse {{PETITIONER_PERSONAL_PRONOUN}} has suffered. As outlined in the Petitioner’s declaration, {{PETITIONER_PERSONAL_PRONOUN}} will likely lose contact with {{PETITIONER_POSSESSIVE_PRONOUN}} church, local community, home environment, and friends who provide a crucial support system to {{HIM/HER DEPENDING ON PETITITIONER'S GENDER}}. 

Finally, the Petitioner must remain in the United States where {{PETITIONER_PERSONAL_PRONOUN}} can seek mental health treatment. The Petitioner suffers from poor borderline depression and very poor self-esteem due to abuse {{PETITIONER_PERSONAL_PRONOUN}} suffered during {{PETITIONER_POSSESSIVE_PRONOUN}} abusive relationship with {{PETITIONER_POSSESSIVE_PRONOUN}} abusive United States citizen {{ABUSER_RELATIONSHIP}}. {{PETITIONER_PERSONAL_PRONOUN}} can only receive professional support and treatment in the United States within a safe and non-toxic environment. Furthermore, the Petitioner has suffered significant mental and emotional abuse in {{PETITIONER_POSSESSIVE_PRONOUN}} parenting to {{ABUSER_NAME}}. Because the Petitioner's {{ABUSER_RELATIONSHIP}} is still involved in {{PETITIONER_POSSESSIVE_PRONOUN}} life, there is no way for Petitioner to seek mental health treatment while still subjected to the abuse from {{ABUSER_RELATIONSHIP}}, {{ABUSER_NAME}}. As {{PETITIONER_PERSONAL_PRONOUN}} begins healing, {{PETITIONER_PERSONAL_PRONOUN}} must remain in the United States, close to {{PETITIONER_POSSESSIVE_PRONOUN}} family, church and {{PETITIONER_POSSESSIVE_PRONOUN}} friends, who will all offer invaluable support that is not available to {{PETITIONER_PERSONAL_PRONOUN}} in Mexico.

CONCLUSION
The Petitioner is eligible to file a self-petition as the abused parent of a United States citizen and, accordingly, USCIS should approve {{PETITIONER_POSSESSIVE_PRONOUN}} I-360 petition.

Should you need anything further, please do not hesitate to contact me. We appreciate your timely attention to this matter.

Respectfully,

________________________
Attorney's Name
Attorney for the Petitioner`;

    const todaysDate = new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
    const formatDateAsText = (dateString: string) => {
      if (!dateString) return '[Date Missing]';
      try {
        const date = new Date(dateString + 'T00:00:00');
        return date.toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric', timeZone: 'UTC' });
      } catch { return dateString; }
    };

    // Normalize gender value for comparison (handle both "Male"/"male" and "Female"/"female")
    const petitionerGender = (formData.petitioner_gender as string || '').toLowerCase().trim();
    const isMale = petitionerGender === 'male' || petitionerGender === 'm';
    const isFemale = petitionerGender === 'female' || petitionerGender === 'f';
    
    console.log('🔍 Gender check:', {
      raw: formData.petitioner_gender,
      normalized: petitionerGender,
      isMale,
      isFemale
    });
    
    const petitionerPronoun = isMale ? 'his' : (isFemale ? 'her' : 'their');
    const petitionerPronounObj = isMale ? 'him' : (isFemale ? 'her' : 'them');
    const petitionerPersonalPronoun = isMale ? 'he' : (isFemale ? 'she' : 'they');
    const petitionerPossessivePronoun = isMale ? 'his' : (isFemale ? 'her' : 'their');
    const himHerPronoun = isMale ? 'him' : (isFemale ? 'her' : 'them');
    
    // Normalize abuser gender for comparison
    const abuserGender = (formData.abuser_gender as string || '').toLowerCase().trim();
    const abuserIsMale = abuserGender === 'male' || abuserGender === 'm';
    const abuserIsFemale = abuserGender === 'female' || abuserGender === 'f';
    
    const abuserRelationship = formData.relationship === 'spouse' 
      ? (abuserIsMale ? 'husband' : (abuserIsFemale ? 'wife' : 'spouse'))
      : (abuserIsMale ? 'son' : (abuserIsFemale ? 'daughter' : 'child'));
    const abuserFirstName = (formData.abuser_name as string || '').split(' ')[0];

    const formatDocList = (list: string[] = []) => list.map(item => `- ${item}`).join('\n') || '- [No Documents Classified for this Tab]';
    const formatAbuseList = (list: any[] = []) => {
      if (!list || list.length === 0) return '- [No abuse items found in this category]';
      return list.map(item => {
        const subtitle = item?.subtitle || item?.title || '[No subtitle]';
        const description = item?.description || item?.text || '[No description]';
        return `• **${subtitle}:** ${description}`;
      }).join('\n');
    };

    // Build abuse summary with fallbacks for empty arrays
    console.log('Building abuse summary from:', summaryResult?.abuse_summary);
    
    const psychologicalAbuse = formatAbuseList(summaryResult.abuse_summary?.psychological || []);
    const verbalAbuse = formatAbuseList(summaryResult.abuse_summary?.verbal || []);
    const physicalAbuse = formatAbuseList(summaryResult.abuse_summary?.physical || []);
    const financialAbuse = formatAbuseList(summaryResult.abuse_summary?.financial || []);
    
    console.log('Formatted abuse lists:', {
      psychological: psychologicalAbuse.substring(0, 100),
      verbal: verbalAbuse.substring(0, 100),
      physical: physicalAbuse.substring(0, 100),
      financial: financialAbuse.substring(0, 100),
    });

    const abuseSummary = `• **<u>Psychological Abuse</u>**
${psychologicalAbuse}

• **<u>Verbal Abuse</u>**
${verbalAbuse}

• **<u>Physical Abuse</u>**
${physicalAbuse}

• **<u>Financial Abuse</u>**
${financialAbuse}`;

    // Debug: Log abuse summary to verify it's populated
    console.log('✅ Final Abuse Summary (first 500 chars):', abuseSummary.substring(0, 500));
    console.log('✅ Abuse Summary length:', abuseSummary.length);
    
    // CRITICAL VALIDATION: Ensure abuse summary is not empty
    if (!abuseSummary || abuseSummary.trim().length === 0) {
      console.error('❌ ERROR: Abuse summary is empty!');
      console.error('Psychological abuse items:', psychologicalAbuse);
      console.error('Verbal abuse items:', verbalAbuse);
      console.error('Physical abuse items:', physicalAbuse);
      console.error('Financial abuse items:', financialAbuse);
      throw new Error('Abuse summary is empty. Please check that the declaration contains abuse details.');
    }
    
    // Validate that abuse summary contains actual content (not just headers)
    const hasContent = psychologicalAbuse.length > 0 || verbalAbuse.length > 0 || 
                       physicalAbuse.length > 0 || financialAbuse.length > 0;
    if (!hasContent) {
      console.warn('⚠️ WARNING: Abuse summary has headers but no content items');
    }

    let filledTemplate = vawaTemplate
      .replace(/{{TODAY['\u2019']S DATE}}/g, todaysDate) // Match both straight (') and curly (') apostrophes
      .replace(/{{PETITIONER_NAME}}/g, formData.petitioner_name as string || '[Petitioner Name Missing]')
      .replace(/{{PETITIONER_DOB}}/g, formatDate(formData.petitioner_dob as string))
      .replace(/{{PETITIONER_PRONOUN}}/g, petitionerPronoun)
      .replace(/{{PETITIONER_PRONOUN_OBJ}}/g, petitionerPronounObj)
      .replace(/{{PETITIONER_PERSONAL_PRONOUN}}/g, petitionerPersonalPronoun)
      .replace(/{{PETITIONER_POSSESSIVE_PRONOUN}}/g, petitionerPossessivePronoun)
      .replace(/{{PETITIONER_POSSESIVE_PRONOUN}}/g, petitionerPossessivePronoun) // Fix typo: POSSESIVE -> POSSESSIVE
      .replace(/{{PETITIONER_POSSESSIVEL_PRONOUN}}/g, petitionerPossessivePronoun) // Fix typo: POSSESSIVEL -> POSSESSIVE
      .replace(/{{HIM\/HER DEPENDING ON PETITITIONER['']S GENDER}}/g, himHerPronoun) // Match both apostrophe types
      .replace(/{{ABUSER_NAME}}/g, formData.abuser_name as string || '[Abuser Name Missing]')
      .replace(/{{ABUSER_FIRST_NAME}}/g, abuserFirstName || '[Abuser First Name Missing]')
      .replace(/{{ABUSER_RELATIONSHIP}}/g, abuserRelationship || '[Relationship Missing]')
      .replace(/{{ABUSER_RELATIONSHIP_UPPER}}/g, abuserRelationship.toUpperCase() || '[RELATIONSHIP MISSING]')
      .replace(/{{ABUSE_SUMMARY}}/g, abuseSummary) // Use global flag to replace all occurrences
      .replace('{{TAB_A_DOCS}}', formatDocList(classifiedDocs.A))
      .replace('{{TAB_B_DOCS}}', formatDocList(classifiedDocs.B))
      .replace('{{TAB_C_DOCS}}', formatDocList(classifiedDocs.C))
      .replace('{{TAB_D_DOCS}}', formatDocList(classifiedDocs.D))
      .replace('{{TAB_E_DOCS}}', formatDocList(classifiedDocs.E))
      .replace('{{COHABITATION_ADDRESS}}', summaryResult.cohabitation_address || '[Address not found in declaration]')
      .replace(/{{ABUSER_DOB_PLACEHOLDER}}/g, formatDateAsText(formData.abuser_dob as string));

    setGeneratedCoverLetter(filledTemplate);
  };

  const generateNaturalizationCoverLetter = async () => {
    const applicantName = formData.applicant_name as string;
    const applicantDOB = formData.applicant_dob as string;
    const permanentResidenceDate = formData.permanent_residence_date as string;
    const applicantGender = formData.applicant_gender as string;

    if (!applicantName) {
      throw new Error("Please fill out the Applicant's Full Name.");
    }

    setGenerationStatus('Analyzing evidence documents...');
    
    // Analyze evidence documents if provided
    let tabADocs: string[] = [];
    let tabBDocs: string[] = [];
    
    if (evidenceFiles.length > 0) {
      const evidenceForAnalysis = await Promise.all(
        evidenceFiles.map(async (file) => {
          setGenerationStatus(`Reading: ${file.name}`);
          const fileText = await readPdfAsText(file);
          return { fileName: file.name, fileText: fileText };
        })
      );
      
      setGenerationStatus('AI is analyzing and classifying documents...');
      const documentList = await generateNaturalizationDocumentList(evidenceForAnalysis, applicantName);
      tabADocs = documentList.tabA;
      tabBDocs = documentList.tabB;
    }

    // Check minimum required documents (even if no files uploaded, to show what's missing)
    setGenerationStatus('Checking minimum required documents...');
    try {
      const documentCheck = await checkNaturalizationMinimumDocuments(tabADocs, tabBDocs);
      setNaturalizationDocumentCheck(documentCheck);
    } catch (error: any) {
      console.error('Failed to check minimum documents:', error);
      // Don't fail the entire generation if document check fails
      setNaturalizationDocumentCheck({ hasMinimumDocuments: false, missingDocuments: ['Unable to verify documents'] });
    }

    setGenerationStatus('Generating legal argument...');
    const legalArgument = await generateNaturalizationLegalArgument(
      applicantName,
      applicantDOB || '[DOB Not Provided]',
      permanentResidenceDate || '[Date Not Provided]',
      applicantGender || 'Unknown'
    );

    setGenerationStatus('Assembling cover letter...');

    const todaysDate = new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
    const applicantPronoun = applicantGender === 'male' ? 'his' : applicantGender === 'female' ? 'her' : 'their';

    const coverLetterTemplate = `{{DATE}}

U.S. Department of Homeland Security
USCIS
Attn: N-400 (Box 21251)
2108 E. Elliot Rd.
Tempe, AZ 85284-1806

RE: N-400 Application
Applicant: {{APPLICANT'S NAME}}
DOB: {{APPLICANT_DOB}}

To Whom It May Concern:

Law Firm Name represents {{APPLICANT'S NAME}}, in ${applicantPronoun} application for naturalization.

Our firm is filing Form N-400 and in support of this application, please find the following documents enclosed:
- Form G-28
- Form N-400
- Filing Fee of $760

TAB A - DOCUMENTS ESTABLISHING IDENTITY & CURRENT STATUS OF THE APPLICANT:
{{TAB_A_DOCUMENTS}}

TAB B - DOCUMENTS ESTABLISHING GOOD MORAL CHARACTER, RESIDENCE AND TIES TO THE UNITED STATES OF THE APPLICANT:
{{TAB_B_DOCUMENTS}}

LEGAL ARGUMENT

{{LEGAL_ARGUMENT}}

Should you need anything further, please do not hesitate to contact me. We appreciate your timely attention to this matter.

Respectfully,

_______________________
Attorney's Name
Attorney for the Petitioner`;

    const formatDocList = (docs: string[]) => {
      if (docs.length === 0) {
        return '- [No documents classified for this tab]';
      }
      return docs.map(doc => `- ${doc}`).join('\n');
    };

    let filledTemplate = coverLetterTemplate
      .replace(/{{DATE}}/g, todaysDate)
      .replace(/{{APPLICANT'S NAME}}/g, applicantName)
      .replace(/{{APPLICANT_DOB}}/g, formatDate(applicantDOB) || '[DOB Not Provided]')
      .replace('{{TAB_A_DOCUMENTS}}', formatDocList(tabADocs))
      .replace('{{TAB_B_DOCUMENTS}}', formatDocList(tabBDocs))
      .replace('{{LEGAL_ARGUMENT}}', legalArgument);

    setGeneratedCoverLetter(filledTemplate);
    setGeneratedLegalArgument(legalArgument);
  };

  const generateTvisaApplication = async () => {
    const clientName = (formData.client_name as string) || '';
    const traffickingType = formData.trafficking_type as string;
    const declarationText = formData.pasted_narrative as string;

    if (!clientName || !clientName.trim()) {
      throw new Error("Please fill out the Applicant's Full Name.");
    }

    if (!traffickingType || traffickingType === '-- Select --') {
      throw new Error("Please select the Trafficking Type.");
    }

    if (!declarationText) {
      throw new Error("Please paste the Applicant's Declaration.");
    }

    setGenerationStatus('Reading evidence files...');
    const evidenceForAnalysis = await Promise.all(
      evidenceFiles.map(async (file) => {
        setGenerationStatus(`Reading: ${file.name}`);
        const fileText = await readPdfAsText(file);
        return { fileName: file.name, fileText: fileText };
      })
    );

    setGenerationStatus('Generating cover letter...');
    const coverLetter = await generateTvisaCoverLetter(
      formData,
      evidenceForAnalysis,
      declarationText
    );

    setGenerationStatus('Generating legal argument...');
    const legalArgument = await generateTvisaLegalArgument(
      clientName,
      traffickingType,
      declarationText
    );

    setGeneratedCoverLetter(coverLetter);
    setGeneratedLegalArgument(legalArgument);
  };

  const handleGenerate = async () => {
    if (!selectedCaseType) return;
    setIsGenerating(true);
    setGeneratedCoverLetter('');
    setGeneratedLegalArgument('');
    setGenerationError(null);
    setGenerationStatus('Preparing to generate...');
    try {
      switch (selectedCaseType) {
        case 'i-130-adjustment':
          await generateI130CoverLetter();
          break;
        case 'u-visa-certification':
          await generateUvisaRequest();
          break;
        case 'u-visa-application':
          await generateUvisaApplication();
          break;
        case 'vawa':
          await generateVawaPacket();
          break;
        case 'naturalization':
          await generateNaturalizationCoverLetter();
          break;
        case 't-visa':
          await generateTvisaApplication();
          break;
        default:
          throw new Error("This case type is not yet implemented.");
      }
    } catch (error: any) {
      setGenerationError(error.message);
    } finally {
      setIsGenerating(false);
      setGenerationStatus('');
    }
  };

  // Logic to determine if and what label the EvidenceUploader should have
  let evidenceUploaderLabel: React.ReactNode = '';
  let shouldShowEvidenceUploader = false;
  if (selectedCaseType) {
    switch (selectedCaseType) {
      case 'i-130-adjustment':
        evidenceUploaderLabel = 'Upload I-130 evidence (PDF only):';
        shouldShowEvidenceUploader = true;
        break;
      case 'u-visa-certification':
        evidenceUploaderLabel = 'REQUIRED: Upload Police Report (PDF only):';
        shouldShowEvidenceUploader = true;
        break;
      case 'u-visa-application':
        evidenceUploaderLabel = 'Upload U-Visa Application evidence (PDF only):';
        shouldShowEvidenceUploader = true;
        break;
      case 'vawa':
        evidenceUploaderLabel = (
          <span className="block text-xl font-bold text-red-600">
            REQUIRED: Upload VAWA evidence (PDF only):
          </span>
        );
        shouldShowEvidenceUploader = true;
        break;
      case 'naturalization':
        evidenceUploaderLabel = 'Upload Naturalization evidence (PDF only):';
        shouldShowEvidenceUploader = true;
        break;
      case 't-visa':
        evidenceUploaderLabel = 'Upload T-Visa evidence (PDF only):';
        shouldShowEvidenceUploader = true;
        break;
    }
  }


  return (
    <div className="min-h-screen bg-gradient-to-br from-[#0b4a90] via-[#083b7a] to-[#052c63] text-white gradient-bg" style={{background: 'linear-gradient(to bottom right, #0b4a90, #083b7a, #052c63)'}}>
      <div className="max-w-6xl mx-auto py-12 px-4 sm:px-6 lg:px-0">
        <div className="flex flex-col sm:flex-row items-center justify-center sm:justify-start gap-6 mb-10 text-center relative">
          <img
            src="/jac-logo.png"
            alt="JAC Virtual Legal Assistant logo"
            className="h-24 w-auto drop-shadow-xl"
          />
          <div className="text-center ml-10 sm:ml-24">
            <p className="text-3xl sm:text-4xl md:text-5xl font-bold mt-1 drop-shadow-[0_8px_16px_rgba(0,0,0,0.5)]">What are we working on today?</p>
          </div>
          <button
            onClick={() => setShowApiKeySettings(true)}
            className="absolute top-0 right-0 sm:relative sm:ml-auto px-4 py-2 text-sm font-medium text-white bg-white/20 hover:bg-white/30 rounded-lg border border-white/30 transition"
            title="API Key Settings"
          >
            ⚙️ Settings
          </button>
        </div>

        {isLandingView ? (
          <>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              <div className="bg-white/10 rounded-3xl shadow-lg p-8 border border-white/15">
                <h2 className="text-2xl font-bold">Preparing a case file?</h2>
                <p className="text-sm text-blue-100 mt-1">Select the case type</p>
                <div className="mt-6 space-y-3">
                  {landingCaseOrder.map((caseType) => (
                    <button
                      key={caseType}
                      onClick={() => handleCaseSelect(caseType)}
                      className="w-full bg-white text-[#0a3e82] font-semibold uppercase tracking-wide rounded-full py-3 px-6 shadow-md hover:bg-blue-50 transition"
                    >
                      {landingCaseLabels[caseType] || CASE_TYPE_DETAILS[caseType]}
                    </button>
                  ))}
                </div>
              </div>

              <div className="space-y-6">
                <div className="bg-white/10 rounded-3xl shadow-lg p-8 border border-white/15">
                  <h3 className="text-2xl font-bold">Client with criminal records?</h3>
                  <p className="text-sm text-blue-100 mt-3 leading-relaxed">
                    I can help you analyze criminal records and determine the immigration implications based on INA and case law!
                  </p>
                  <button
                    onClick={() => openUtility('criminal')}
                    className="mt-6 inline-flex items-center justify-center w-full bg-white text-[#0a3e82] font-semibold uppercase tracking-wide rounded-full py-3 px-6 shadow-md hover:bg-blue-50 transition"
                  >
                    Analyze Criminal Records
                  </button>
                </div>

                <div className="bg-white/10 rounded-3xl shadow-lg p-8 border border-white/15">
                  <h3 className="text-2xl font-bold">Client with FOIA?</h3>
                  <p className="text-sm text-blue-100 mt-3 leading-relaxed">
                    Upload FOIA disclosures and I&apos;ll help surface the information that matters most to your strategy.
                  </p>
                  <button
                    onClick={() => openUtility('foia')}
                    className="mt-6 inline-flex items-center justify-center w-full bg-white text-[#0a3e82] font-semibold uppercase tracking-wide rounded-full py-3 px-6 shadow-md hover:bg-blue-50 transition"
                  >
                    Analyze FOIA
                  </button>
                </div>
              </div>

              <div>
                <QuestionAssistant />
              </div>
            </div>
          </>
        ) : (
          <div className="bg-white text-gray-800 rounded-3xl shadow-2xl p-8">
            <div className="flex items-center justify-between">
              <button
                onClick={goBackToDashboard}
                className="text-sm font-semibold text-indigo-600 hover:text-indigo-800 transition"
              >
                ← Back to Dashboard
              </button>
        {selectedCaseType && (
                <span className="text-xs sm:text-sm font-semibold uppercase tracking-wide text-indigo-600">
                  {CASE_TYPE_DETAILS[selectedCaseType]}
                </span>
              )}
            </div>

            <div className="mt-6">
              {selectedCaseType ? (
                <>
                  <CaseSelector selectedCaseType={selectedCaseType} onSelect={handleCaseSelect} />

                  <div className="mt-6">
                    <h2 className="text-2xl font-bold text-gray-900 mb-1">
                      Let&apos;s create a cover letter and/or legal argument for your packet
                    </h2>
                    <p className="text-base text-gray-600">
                      Fill out the fields to generate a cover letter / legal argument for your case!
                    </p>
                  </div>

            <IntakeUploader
                    key={selectedCaseType}
              onExtract={handleExtract}
              isExtracting={isExtracting}
              feedback={extractionFeedback}
            />

            {selectedCaseType === 'u-visa-application' && (
              <SupplementBUploader onFileChange={handleSupplementBUpload} feedback={supplementBFeedback} />
            )}

            <div className="mt-8">
              <DynamicForm questions={QUESTIONS[selectedCaseType]} formData={formData} setFormData={setFormData} caseType={selectedCaseType} />

                    {selectedCaseType !== 'u-visa-certification' && (
              <FormAnalyzer key={`${selectedCaseType}-analyzer`} declarationText={declarationText} />
                    )}

              <TemplateUploader onTemplateReady={setTemplateFile} />

              {shouldShowEvidenceUploader && (
                <EvidenceUploader
                        key={`evidence-${selectedCaseType}`}
                  label={evidenceUploaderLabel}
                  onFilesChange={setEvidenceFiles}
                />
              )}

              <div className="mt-8 text-center">
                <Button onClick={handleGenerate} isLoading={isGenerating} disabled={isGenerating}>
                  Generate Documents
                </Button>
              </div>
            </div>

            <OutputDisplay
              coverLetter={generatedCoverLetter}
              legalArgument={generatedLegalArgument}
              isLoading={isGenerating}
              error={generationError}
              caseType={selectedCaseType}
              generationStatus={generationStatus}
              templateFile={templateFile}
            />

            {selectedCaseType === 'vawa' && !isGenerating && generatedCoverLetter && (
              <>
                <AliasesDisplay 
                  aliases={vawaAliases}
                  petitionerName={formData.petitioner_name as string || 'Petitioner'}
                />
                <VawaDocumentCheck checkResult={vawaDocumentCheck} />
              </>
            )}

            {selectedCaseType === 'i-130-adjustment' && !isGenerating && generatedCoverLetter && (
              <I130DocumentCheck checkResult={i130DocumentCheck} />
            )}

            {selectedCaseType === 'naturalization' && !isGenerating && generatedCoverLetter && (
              <NaturalizationDocumentCheck checkResult={naturalizationDocumentCheck} />
            )}
          </>
              ) : null}

              {!selectedCaseType && activeUtility === 'criminal' && (
                <CriminalRecordAnalyzer />
              )}

              {!selectedCaseType && activeUtility === 'foia' && (
                <FoiaAnalyzer />
              )}
            </div>
          </div>
        )}
        <footer className="mt-8 mb-4 bg-white/10 border border-white/15 rounded-xl p-4 text-sm leading-relaxed text-blue-50/90 space-y-2">
          <h4 className="text-sm font-semibold uppercase tracking-wide text-white/90">Disclaimer</h4>
          <p className="text-sm">
            This application uses AI to generate responses and draft materials. All outputs are AI-generated and may contain inaccuracies. The content does not constitute legal advice and should not be relied upon without independent verification. Users are solely responsible for reviewing and validating all AI-generated material. The AI system does not establish an attorney-client relationship. Confidential information should not be entered into the system. Use implies acceptance of these terms.
          </p>
        </footer>
        <div className="mt-4 mb-8 bg-white/10 border border-white/15 rounded-xl p-4 text-sm leading-relaxed text-blue-50/90 space-y-2 font-bold">
          <p>
            © 2025 Virtual Legal Assistant. Developed by Jose Castaneda, 2027 J.D. Candidate at the University of Houston Law Center, with the aid of large language models, guidance and instruction from Seth J. Chandler.
          </p>
          <p>
            For inquiries, licensing, or access requests: joseangelcastaneda1@gmail.com
          </p>
          <p>
            All Rights Reserved. No part of this software may be reproduced, distributed, or transmitted in any form or by any means, including photocopying, recording, or other electronic or mechanical methods, without the prior written permission of the developer.
          </p>
        </div>
      </div>
      <ApiKeySettings isOpen={showApiKeySettings} onClose={() => setShowApiKeySettings(false)} />
    </div>
  );
};

export default App;