import type { CaseType, Question } from './types';

export const CASE_TYPE_DETAILS: Record<CaseType, string> = {
  'i-130-adjustment': 'Family Petition I-130 w/ Adjustment of Status',
  'u-visa-certification': 'U-Visa Certification Request',
  'vawa': 'VAWA Self-Petition',
  'u-visa-application': 'U-Visa Application',
  't-visa': 'T-Visa Application',
  'naturalization': 'Naturalization Application'
};

export const QUESTIONS: Record<CaseType, Question[]> = {
  'i-130-adjustment': [
    { label: 'Petitioner\'s Full Name', type: 'text', id: 'petitioner_name', extract_key: 'petitioner_name' },
    { label: 'Petitioner\'s Date of Birth', type: 'date', id: 'petitioner_dob', extract_key: 'petitioner_dob' },
    { label: 'Petitioner\'s Gender', type: 'select', id: 'petitioner_gender', options: ['-- Select --', 'Female', 'Male'], extract_key: 'petitioner_gender' },
    { label: 'Beneficiary\'s Full Name', type: 'text', id: 'beneficiary_name', extract_key: 'beneficiary_name' },
    { label: 'Beneficiary\'s Date of Birth', type: 'date', id: 'beneficiary_dob', extract_key: 'beneficiary_dob' },
    { label: 'Relationship between Petitioner and Beneficiary', type: 'select', id: 'relationship', options: ['-- Select --', 'Spouse', 'Child'], extract_key: 'relationship_pet_ben' },
    { label: 'Sponsor\'s Full Name', type: 'text', id: 'sponsor_name', extract_key: 'sponsor_name' },
    { label: 'Sponsor\'s Date of Birth', type: 'date', id: 'sponsor_dob', extract_key: 'sponsor_dob' },
    { label: 'Check this box if Sponsor is the Petitioner', type: 'checkbox', id: 'sponsor_is_petitioner' }
  ],
  'u-visa-certification': [
    { label: 'Victim\'s Full Name', type: 'text', id: 'victim_name', extract_key: 'victim_name' },
    { label: 'Victim\'s Gender', type: 'select', id: 'victim_gender', options: ['-- Select --', 'Female', 'Male', 'Other'], extract_key: 'victim_gender' },
    { label: 'Paste Victim\'s Declaration Here', type: 'textarea', id: 'pasted_narrative', extract_key: 'pasted_narrative' }
  ],
  'vawa': [
    { label: 'Petitioner\'s Full Name (Victim)', type: 'text', id: 'petitioner_name', extract_key: 'petitioner_name' },
    { label: 'Petitioner\'s Date of Birth', type: 'date', id: 'petitioner_dob', extract_key: 'petitioner_dob' },
    { label: 'Petitioner\'s Gender', type: 'select', id: 'petitioner_gender', options: ['-- Select --', 'Female', 'Male'], extract_key: 'petitioner_gender' },
    { label: 'Abuser\'s Full Name', type: 'text', id: 'abuser_name', extract_key: 'abuser_name' },
    { label: 'Abuser\'s Date of Birth', type: 'date', id: 'abuser_dob', extract_key: 'abuser_dob' },
    { label: 'Abuser\'s Status', type: 'select', id: 'abuser_status', options: ['-- Select --', 'U.S. Citizen', 'Lawful Permanent Resident'], extract_key: 'abuser_status' },
    { label: 'Relationship to Abuser', type: 'select', id: 'relationship', options: ['-- Select --', 'Spouse', 'Child'], extract_key: 'relationship_pet_abuser' },
    { label: 'Abuser\'s Gender', type: 'select', id: 'abuser_gender', options: ['-- Select --', 'Female', 'Male'], extract_key: 'abuser_gender' },
    { label: 'Paste Petitioner\'s Declaration Here', type: 'textarea', id: 'pasted_narrative', extract_key: 'pasted_narrative' }
  ],
  'u-visa-application': [
    { label: 'Petitioner\'s Full Name', type: 'text', id: 'petitioner_name', extract_key: 'petitioner_name' },
    { label: 'Petitioner\'s Date of Birth', type: 'date', id: 'petitioner_dob', extract_key: 'petitioner_dob' },
    { label: 'Petitioner\'s Gender', type: 'select', id: 'petitioner_gender', options: ['-- Select --', 'Female', 'Male', 'Other'], extract_key: 'petitioner_gender' },
    { label: 'Paste Petitioner\'s Declaration Here', type: 'textarea', id: 'pasted_narrative', extract_key: 'pasted_narrative' }
  ],
  't-visa': [
    { label: 'Applicant\'s Full Name', type: 'text', id: 'client_name', extract_key: 'client_name' },
    { label: 'Applicant\'s Date of Birth', type: 'date', id: 'applicant_dob', extract_key: 'applicant_dob' },
    { label: 'Applicant\'s Gender', type: 'select', id: 'applicant_gender', options: ['-- Select --', 'Female', 'Male', 'Other'], extract_key: 'applicant_gender' },
    { label: 'Country of Origin', type: 'text', id: 'country_of_origin', extract_key: 'country_of_origin' },
    { label: 'Trafficking Type', type: 'select', id: 'trafficking_type', options: ['-- Select --', 'Sex Trafficking', 'Labor Trafficking'], extract_key: 'trafficking_type' },
    { label: 'Entry Date to United States', type: 'date', id: 'entry_date', extract_key: 'entry_date' },
    { label: 'Trafficker\'s Name', type: 'text', id: 'trafficker_name', extract_key: 'trafficker_name' },
    { label: 'Original Promise/Recruitment Method', type: 'textarea', id: 'original_promise', extract_key: 'original_promise', placeholder: 'e.g., promised a waitress job, romantic relationship, etc.' },
    { label: 'Derivative Names (if applicable)', type: 'textarea', id: 'derivative_names', extract_key: 'derivative_names', placeholder: 'List names separated by commas, or leave blank if none' },
    { label: 'Inadmissibility Grounds (if any)', type: 'textarea', id: 'inadmissibility_grounds', extract_key: 'inadmissibility_grounds', placeholder: 'e.g., unlawful presence, working without authorization, etc.' },
    { label: 'Paste Applicant\'s Declaration Here', type: 'textarea', id: 'pasted_narrative', extract_key: 'pasted_narrative' }
  ],
  'naturalization': [
    { label: 'Applicant\'s Full Name', type: 'text', id: 'applicant_name', extract_key: 'applicant_name' },
    { label: 'Applicant\'s Date of Birth', type: 'date', id: 'applicant_dob', extract_key: 'applicant_dob' },
    { label: 'Date of Permanent Residence', type: 'date', id: 'permanent_residence_date', extract_key: 'permanent_residence_date' },
    { label: 'Applicant\'s Gender', type: 'select', id: 'applicant_gender', options: ['-- Select --', 'Female', 'Male'], extract_key: 'applicant_gender' }
  ]
};