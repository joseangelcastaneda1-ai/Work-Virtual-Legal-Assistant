
export type CaseType = 'i-130-adjustment' | 'u-visa-certification' | 'vawa' | 'u-visa-application' | 't-visa' | 'naturalization';

export interface Question {
  label: string;
  type: 'text' | 'date' | 'select' | 'textarea' | 'checkbox';
  id: string;
  extract_key?: string;
  options?: string[];
  placeholder?: string;
}

export interface FormData {
  [key:string]: string | boolean;
}

export interface ClassifiedDocuments {
  petitioner_docs: any[];
  beneficiary_docs: any[];
  relationship_docs: any[];
  other_docs: any[];
  sponsor_docs: any[];
}

export interface TaxYears {
  beneficiary: Set<string>;
  sponsor: Set<string>;
}

export interface AnalyzedDocInfo {
    doc_type: string;
    person: 'petitioner' | 'beneficiary' | 'sponsor' | 'relationship' | 'other' | 'unknown';
    name: string;
    tax_year?: string;
}

export interface InconsistencyReport {
  formName: string;
  inconsistentField: string;
  valueInForm: string;
  correctValueFromDeclaration: string;
  explanation: string;
  evidenceQuote?: string;
  formSection?: string;
}
