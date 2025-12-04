import React, { useState, useEffect } from 'react';
import Button from './Button';

interface SupplementBUploaderProps {
  onFileChange: (file: File | null) => void;
  feedback?: { message: string; type: 'success' | 'error' | 'info' } | null;
}

const SupplementBUploader: React.FC<SupplementBUploaderProps> = ({ onFileChange, feedback }) => {
  const [fileName, setFileName] = useState<string>('');

  const handleFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) {
      onFileChange(null);
      return;
    }
    
    // Accept PDF and Word documents
    const isValidFile = file.name.endsWith('.pdf') || 
                       file.name.endsWith('.docx') || 
                       file.name.endsWith('.doc');
    
    if (!isValidFile) {
      onFileChange(null);
      return;
    }
    
    setFileName(file.name);
    onFileChange(file);
  };

  const handleClear = () => {
    setFileName('');
    onFileChange(null);
  };

  // Update fileName when feedback indicates success
  useEffect(() => {
    if (feedback?.type === 'success' && !fileName) {
      // File was processed successfully
    }
  }, [feedback, fileName]);

  return (
    <div className="my-6 p-6 border border-blue-200 rounded-lg bg-blue-50">
      <h2 className="text-lg font-semibold mb-3 text-gray-800">Upload Form I-918 Supplement B (U Nonimmigrant Status Certification)</h2>
      <p className="text-sm text-gray-600 mb-4">
        Upload the completed Form I-918 Supplement B to automatically extract information (crime type, jurisdiction, etc.) and fill the template placeholders.
      </p>
      <div className="flex flex-col sm:flex-row items-start sm:items-center gap-3">
        <input
          type="file"
          accept=".pdf,.docx,.doc,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document,application/msword"
          onChange={handleFile}
          className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm text-sm text-gray-800 file:mr-4 file:py-2 file:px-4 file:rounded-md file:border-0 file:text-sm file:font-semibold file:bg-blue-50 file:text-blue-700 hover:file:bg-blue-100"
        />
        {fileName && (
          <Button variant="secondary" onClick={handleClear} className="w-full sm:w-auto">
            Clear
          </Button>
        )}
      </div>
      {fileName && <div className="mt-2 text-sm text-gray-600">Selected: {fileName}</div>}
      {feedback && (
        <div className={`mt-2 text-sm ${
          feedback.type === 'success' ? 'text-green-700' : 
          feedback.type === 'error' ? 'text-red-700' : 
          'text-blue-600'
        }`}>
          {feedback.message}
        </div>
      )}
    </div>
  );
};

export default SupplementBUploader;
