
import React, { useState } from 'react';
import Button from './Button';

interface IntakeUploaderProps {
  onExtract: (file: File) => void;
  isExtracting: boolean;
  feedback: { message: string; type: 'success' | 'error' | 'info' } | null;
}

const IntakeUploader: React.FC<IntakeUploaderProps> = ({ onExtract, isExtracting, feedback }) => {
  const [intakeFile, setIntakeFile] = useState<File | null>(null);

  const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      setIntakeFile(file);
    }
  };

  const handleExtractClick = () => {
    if (intakeFile) {
      onExtract(intakeFile);
    }
  };

  const feedbackClasses = {
    success: 'text-green-600',
    error: 'text-red-600',
    info: 'text-gray-600',
  };

  return (
    <div className="mb-6 p-6 border border-gray-200 rounded-lg bg-gray-50">
      <h2 className="text-lg font-semibold mb-3 text-gray-700">Too much to type? No worries!</h2>
      <p className="text-sm text-gray-600 mb-4">Upload any document with your client's information and I will fill out the empty fields for you!</p>
      <div className="flex flex-col sm:flex-row items-start sm:items-center gap-3">
        <input
          type="file"
          id="intake-file-upload"
          accept=".pdf,.docx"
          onChange={handleFileChange}
          className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm text-sm text-gray-800 file:mr-4 file:py-2 file:px-4 file:rounded-md file:border-0 file:text-sm file:font-semibold file:bg-orange-50 file:text-orange-700 hover:file:bg-orange-100"
        />
        <Button
          onClick={handleExtractClick}
          variant="secondary"
          isLoading={isExtracting}
          disabled={!intakeFile || isExtracting}
          className="w-full sm:w-auto"
        >
          Extract & Fill
        </Button>
      </div>
      {intakeFile && !feedback && <div className="mt-2 text-sm text-gray-600">Selected: {intakeFile.name}</div>}
      {feedback && <div className={`mt-2 text-sm font-medium ${feedbackClasses[feedback.type]}`}>{feedback.message}</div>}
    </div>
  );
};

export default IntakeUploader;
