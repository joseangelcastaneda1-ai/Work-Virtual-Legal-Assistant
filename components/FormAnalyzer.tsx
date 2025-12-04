
import React, { useState } from 'react';
import Button from './Button';
import Spinner from './Spinner';
import { readPdfAsText } from '../services/fileService';
import { analyzeFormsForInconsistencies } from '../services/geminiService';
import type { InconsistencyReport } from '../types';

interface FormAnalyzerProps {
  declarationText: string | null;
}

const FormAnalyzer: React.FC<FormAnalyzerProps> = ({ declarationText }) => {
  const [formFiles, setFormFiles] = useState<File[]>([]);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [analysisResult, setAnalysisResult] = useState<InconsistencyReport[] | null>(null);
  const [analysisError, setAnalysisError] = useState<string | null>(null);
  const hasDeclaration = typeof declarationText === 'string' && declarationText.trim().length > 0;

  const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    if (event.target.files) {
      setFormFiles(Array.from(event.target.files));
    }
  };

  const handleAnalyze = async () => {
    if (!hasDeclaration) {
      setAnalysisError("The client's declaration is missing. Please upload it in 'Too much to type? No worries!' first.");
      return;
    }
    if (formFiles.length === 0) {
      setAnalysisError("Please select one or more completed immigration forms to analyze.");
      return;
    }

    setIsAnalyzing(true);
    setAnalysisResult(null);
    setAnalysisError(null);

    try {
      const formsData = await Promise.all(
        formFiles.map(async (file) => ({
          fileName: file.name,
          fileText: await readPdfAsText(file),
        }))
      );

      const results = await analyzeFormsForInconsistencies(declarationText, formsData);
      setAnalysisResult(results);
    } catch (error: any) {
      setAnalysisError(`Analysis failed: ${error.message}`);
    } finally {
      setIsAnalyzing(false);
    }
  };

  return (
    <div className="my-8 p-6 border border-gray-200 rounded-lg bg-gray-50">
      {/* Declaration status */}
      {!hasDeclaration && (
        <div className="mb-4 p-3 rounded border border-yellow-300 bg-yellow-50 text-sm text-yellow-800">
          Declaration not found. Upload your client's declaration in the section above before analyzing forms.
        </div>
      )}
      {hasDeclaration && (
        <div className="mb-4 p-3 rounded border border-green-300 bg-green-50 text-xs text-gray-700">
          <span className="font-semibold text-gray-800">Declaration loaded:</span> {Math.min(declarationText!.length, 200)} chars preview
          <div className="mt-1 italic text-gray-600 truncate">{declarationText!.slice(0, 200)}</div>
        </div>
      )}
      <h2 className="text-xl font-semibold mb-3 text-gray-800">Upload the forms that will be submitted for your client and I will review them for you!</h2>

      <div className="flex flex-col sm:flex-row items-start sm:items-center gap-3">
        <input
          type="file"
          id="form-analyzer-upload"
          multiple
          accept=".pdf"
          onChange={handleFileChange}
          className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm text-sm text-gray-800 file:mr-4 file:py-2 file:px-4 file:rounded-md file:border-0 file:text-sm file:font-semibold file:bg-orange-50 file:text-orange-700 hover:file:bg-orange-100"
        />
        <Button
          onClick={handleAnalyze}
          variant="success"
          isLoading={isAnalyzing}
          disabled={isAnalyzing || formFiles.length === 0}
          className="w-full sm:w-auto"
        >
          Analyze Forms
        </Button>
      </div>

      {formFiles.length > 0 && (
          <div className="mt-2 text-sm text-gray-600">
              Selected: {formFiles.map(f => f.name).join(', ')}
          </div>
      )}

      {isAnalyzing && (
        <div className="mt-4 flex items-center justify-center text-gray-700">
          <Spinner />
          <span className="ml-3 font-medium">AI is reviewing documents for errors...</span>
        </div>
      )}

      {analysisError && (
        <div className="mt-4 p-4 bg-red-100 border border-red-300 text-red-800 rounded-md text-sm">
          {analysisError}
        </div>
      )}

      {analysisResult && (
        <div className="mt-6">
          <h3 className="text-lg font-semibold text-gray-800 mb-3">
            {analysisResult.length === 0 ? "✅ No Inconsistencies Found" : "⚠️ Inconsistencies Found"}
          </h3>
          {analysisResult.length > 0 ? (
            <div className="space-y-4">
              {analysisResult.map((item, index) => (
                <div key={index} className="p-4 bg-white border border-yellow-300 rounded-lg shadow-sm">
                  <p className="font-bold text-gray-800">{item.inconsistentField}</p>
                  <p className="text-sm text-gray-600 mt-1">
                    In <strong className="font-medium text-gray-900">{item.formName}</strong>, the value is <strong className="text-red-600">"{item.valueInForm}"</strong>.
                  </p>
                  <p className="text-sm text-gray-600">
                    However, the declaration states it should be <strong className="text-green-700">"{item.correctValueFromDeclaration}"</strong>.
                  </p>
                   <p className="text-xs text-gray-500 mt-2 p-2 bg-gray-50 rounded">
                     <strong>AI Note:</strong> {item.explanation}
                   </p>
                </div>
              ))}
            </div>
          ) : (
             <p className="text-sm text-gray-600">The AI compared all uploaded forms with the client's declaration and found no discrepancies in names, dates of birth, addresses, or travel history.</p>
          )}
        </div>
      )}
    </div>
  );
};

export default FormAnalyzer;
