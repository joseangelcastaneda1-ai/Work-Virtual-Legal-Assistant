
import React from 'react';
import { CASE_TYPE_DETAILS } from '../constants';
import type { CaseType } from '../types';

interface CaseSelectorProps {
  selectedCaseType: CaseType | null;
  onSelect: (caseType: CaseType) => void;
  extraOption?: React.ReactNode;
}

const CaseSelector: React.FC<CaseSelectorProps> = ({ selectedCaseType, onSelect, extraOption }) => {
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 mb-8">
      {Object.entries(CASE_TYPE_DETAILS).map(([key, value]) => (
        <button
          key={key}
          onClick={() => onSelect(key as CaseType)}
          className={`p-4 w-full rounded-lg font-medium text-left transition-all duration-200 border-2 text-gray-800 hover:border-orange-500 hover:bg-orange-50 focus:outline-none focus:ring-2 focus:ring-orange-500 focus:ring-offset-2
            ${selectedCaseType === key
              ? 'bg-orange-100 border-orange-600 text-orange-800 font-bold shadow-md'
              : 'bg-white border-gray-300'
            }`
          }
        >
          {value}
        </button>
      ))}
      {extraOption}
    </div>
  );
};

export default CaseSelector;
