
import React, { useEffect } from 'react';
import type { Question, FormData } from '../types';

interface DynamicFormProps {
  questions: Question[];
  formData: FormData;
  setFormData: React.Dispatch<React.SetStateAction<FormData>>;
  caseType: string;
}

const DynamicForm: React.FC<DynamicFormProps> = ({ questions, formData, setFormData, caseType }) => {
  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
    const { id, value, type } = e.target;
    const isCheckbox = type === 'checkbox';
    // The following casting is safe because we know the type is 'checkbox'
    const checked = isCheckbox ? (e.target as HTMLInputElement).checked : false;

    setFormData(prev => ({
      ...prev,
      [id]: isCheckbox ? checked : value,
    }));
  };
  
  // Special logic for "Sponsor is Petitioner" checkbox
  useEffect(() => {
    if (caseType === 'i-130-adjustment') {
        const isChecked = formData.sponsor_is_petitioner;
        if (isChecked) {
            setFormData(prev => ({
                ...prev,
                sponsor_name: prev.petitioner_name || '',
                sponsor_dob: prev.petitioner_dob || '',
            }));
        }
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [formData.sponsor_is_petitioner, formData.petitioner_name, formData.petitioner_dob, caseType, setFormData]);


  const renderInput = (q: Question) => {
    const value = formData[q.id] || '';

    switch (q.type) {
      case 'textarea':
        return <textarea id={q.id} value={value as string} onChange={handleChange} rows={6} placeholder={q.placeholder} className="w-full p-2 border border-gray-300 rounded-md focus:ring-blue-500 focus:border-blue-500" />;
      case 'select':
        return (
          <select id={q.id} value={value as string} onChange={handleChange} className="w-full p-2 border border-gray-300 rounded-md focus:ring-blue-500 focus:border-blue-500 bg-white">
            {q.options?.map(opt => {
              // Use the option value as-is, but handle "-- Select --" specially
              const optionValue = opt === '-- Select --' ? '' : opt;
              return <option key={opt} value={optionValue}>{opt}</option>;
            })}
          </select>
        );
      case 'checkbox':
        return (
            <div className="flex items-center">
                <input type="checkbox" id={q.id} checked={!!value} onChange={handleChange} className="h-4 w-4 text-blue-600 border-gray-300 rounded focus:ring-blue-500" />
                 <label htmlFor={q.id} className="ml-2 block text-sm text-gray-900">{q.label}</label>
            </div>
        );
      default: // text, date
        const isDisabled = caseType === 'i-130-adjustment' && formData.sponsor_is_petitioner && (q.id === 'sponsor_name' || q.id === 'sponsor_dob');
        return <input type={q.type} id={q.id} value={value as string} onChange={handleChange} placeholder={q.placeholder} disabled={isDisabled} className="w-full p-2 border border-gray-300 rounded-md focus:ring-blue-500 focus:border-blue-500 disabled:bg-gray-100" />;
    }
  };

  return (
    <div className="space-y-6">
      {questions.map(q => (
        <div key={q.id}>
          {q.type !== 'checkbox' && <label htmlFor={q.id} className="block text-sm font-medium text-gray-700 mb-1">{q.label}</label>}
          {renderInput(q)}
        </div>
      ))}
    </div>
  );
};

export default DynamicForm;
