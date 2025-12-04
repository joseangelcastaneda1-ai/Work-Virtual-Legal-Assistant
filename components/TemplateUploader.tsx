import React, { useState } from 'react';
import Button from './Button';

interface TemplateUploaderProps {
  onTemplateReady: (file: File | null) => void;
}

const TemplateUploader: React.FC<TemplateUploaderProps> = ({ onTemplateReady }) => {
  const [fileName, setFileName] = useState<string>('');
  const [isProcessing, setIsProcessing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    
    // Only accept Word documents
    if (!file.name.endsWith('.docx') && !file.name.endsWith('.doc')) {
      setError('Please upload a Word document (.docx or .doc)');
      onTemplateReady(null);
      return;
    }
    
    setError(null);
    setFileName(file.name);
    setIsProcessing(true);
    try {
      onTemplateReady(file);
    } catch (err: any) {
      setError(err.message || 'Failed to process template.');
      onTemplateReady(null);
    } finally {
      setIsProcessing(false);
    }
  };

  const handleClear = () => {
    setFileName('');
    setError(null);
    onTemplateReady(null);
  };

  return (
    <div className="my-6 p-6 border border-gray-200 rounded-lg bg-gray-50">
      <h2 className="text-lg font-semibold mb-3 text-gray-800">Optional: Personalize your cover letter using your firm&apos;s letterhead!</h2>
      <p className="text-sm text-gray-600 mb-4">
        Upload a Word document (.docx) with your firm letterhead already embedded. The generated content will be inserted into this template.
      </p>
      <div className="flex flex-col sm:flex-row items-start sm:items-center gap-3">
        <input
          type="file"
          accept=".docx,.doc,application/vnd.openxmlformats-officedocument.wordprocessingml.document,application/msword"
          onChange={handleFile}
          className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm text-sm text-gray-800 file:mr-4 file:py-2 file:px-4 file:rounded-md file:border-0 file:text-sm file:font-semibold file:bg-orange-50 file:text-orange-700 hover:file:bg-orange-100"
        />
        {fileName && (
          <Button variant="secondary" onClick={handleClear} className="w-full sm:w-auto">
            Clear
          </Button>
        )}
      </div>
      {fileName && <div className="mt-2 text-sm text-gray-600">Selected: {fileName}</div>}
      {error && <div className="mt-2 text-sm text-red-700">{error}</div>}
    </div>
  );
};

export default TemplateUploader;

