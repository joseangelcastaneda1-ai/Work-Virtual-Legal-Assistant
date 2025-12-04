import React, { useState } from 'react';
import ReactMarkdown from 'react-markdown';
import Button from './Button';
import Spinner from './Spinner';
import { readPdfAsText } from '../services/fileService';
import { analyzeFoiaDocuments } from '../services/foiaService';

interface FoiaAnalyzerProps {
  clientName?: string;
}

const DISCLAIMER_TEXT = "This application uses AI to generate responses and draft materials. All outputs are AI-generated and may contain inaccuracies. The content does not constitute legal advice and should not be relied upon without independent verification. Users are solely responsible for reviewing and validating all AI-generated material. The AI system does not establish an attorney-client relationship. Confidential information should not be entered into the system. Use implies acceptance of these terms.";

const FoiaAnalyzer: React.FC<FoiaAnalyzerProps> = ({ clientName }) => {
  const [foiaFiles, setFoiaFiles] = useState<File[]>([]);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [analysis, setAnalysis] = useState<string | null>(null);
  const [analysisError, setAnalysisError] = useState<string | null>(null);
  const [clientAlias, setClientAlias] = useState(clientName ?? '');
  const [showDisclaimer, setShowDisclaimer] = useState(false);
  const [pendingAnalysis, setPendingAnalysis] = useState<string | null>(null);
  const [copySuccess, setCopySuccess] = useState('');

  const handleCopy = async () => {
    if (!analysis) return;
    
    try {
      await navigator.clipboard.writeText(analysis);
      setCopySuccess('Copied!');
      setTimeout(() => setCopySuccess(''), 2000);
    } catch (err) {
      console.error('Failed to copy text: ', err);
      setCopySuccess('Failed to copy');
    }
  };

  const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    if (event.target.files) {
      const filesArray = Array.from(event.target.files);
      setFoiaFiles(filesArray);
      setAnalysis(null);
      setAnalysisError(null);
      setCopySuccess('');
    }
  };

  const handleAnalyze = async () => {
    if (foiaFiles.length === 0) {
      setAnalysisError('Please upload at least one FOIA PDF to analyze.');
      return;
    }

    setIsAnalyzing(true);
    setAnalysis(null);
    setAnalysisError(null);

    try {
      const documents = await Promise.all(
        foiaFiles.map(async (file) => ({
          fileName: file.name,
          text: await readPdfAsText(file),
        }))
      );

      const summary = await analyzeFoiaDocuments(documents, clientAlias || undefined);
      // Show disclaimer before displaying results
      setPendingAnalysis(summary);
      setShowDisclaimer(true);
    } catch (error: any) {
      setAnalysisError(error.message || 'Failed to analyze FOIA documents. Please try again.');
    } finally {
      setIsAnalyzing(false);
    }
  };

  return (
    <div className="mt-6 space-y-6">
      <div>
        <label htmlFor="foia-client-name" className="block text-sm font-semibold text-gray-700 mb-1">
          Client Name or Alias (optional)
        </label>
        <input
          id="foia-client-name"
          type="text"
          value={clientAlias}
          onChange={(event) => setClientAlias(event.target.value)}
          placeholder="Enter the client’s name or preferred identifier"
          className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm text-sm text-gray-800 focus:outline-none focus:ring-2 focus:ring-indigo-400"
        />
      </div>

      <div>
        <label htmlFor="foia-upload" className="block text-sm font-semibold text-gray-700 mb-2">
          Upload FOIA Records (PDF only)
        </label>
        <input
          id="foia-upload"
          type="file"
          accept=".pdf"
          multiple
          onChange={handleFileChange}
          className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm text-sm text-gray-800 file:mr-4 file:py-2 file:px-4 file:rounded-md file:border-0 file:text-sm file:font-semibold file:bg-indigo-50 file:text-indigo-700 hover:file:bg-indigo-100"
        />
        {foiaFiles.length > 0 && (
          <div className="mt-3 text-sm text-gray-600 space-y-1">
            <p className="font-medium">Selected files:</p>
            <ul className="list-disc list-inside">
              {foiaFiles.map((file, index) => (
                <li key={index}>{file.name}</li>
              ))}
            </ul>
          </div>
        )}
      </div>

      <div className="flex justify-end">
        <Button
          onClick={handleAnalyze}
          isLoading={isAnalyzing}
          disabled={isAnalyzing || foiaFiles.length === 0}
        >
          Analyze FOIA
        </Button>
      </div>

      {isAnalyzing && (
        <div className="flex items-center gap-3 text-indigo-600">
          <Spinner />
          <span className="font-medium">AI is reviewing FOIA documents and preparing the summary...</span>
        </div>
      )}

      {analysisError && (
        <div className="p-4 rounded-md border border-red-300 bg-red-50 text-sm text-red-700">
          {analysisError}
        </div>
      )}

      {/* Disclaimer Modal */}
      {showDisclaimer && pendingAnalysis && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg shadow-xl max-w-2xl w-full max-h-[90vh] overflow-y-auto">
            <div className="p-6">
              <h3 className="text-xl font-bold mb-4 text-gray-800">Disclaimer</h3>
              <div className="mb-6 text-sm text-gray-700 leading-relaxed">
                <p>{DISCLAIMER_TEXT}</p>
              </div>
              <div className="flex justify-end space-x-3">
                <Button onClick={() => { setShowDisclaimer(false); setPendingAnalysis(null); }} variant="secondary">
                  Cancel
                </Button>
                <Button onClick={() => { setAnalysis(pendingAnalysis); setShowDisclaimer(false); setPendingAnalysis(null); }} variant="success">
                  Agree
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}

      {analysis && (
        <div className="p-6 rounded-xl border border-indigo-200 bg-white shadow-sm">
          <div className="flex justify-between items-center mb-3">
            <h3 className="text-xl font-semibold text-indigo-700">FOIA Summary</h3>
            <button
              onClick={handleCopy}
              className="text-sm font-medium text-indigo-600 hover:text-indigo-800 flex items-center gap-1"
            >
              {copySuccess ? (
                <span className="text-green-600">✓ {copySuccess}</span>
              ) : (
                <>
                  <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 5H6a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2v-1M8 5a2 2 0 002 2h2a2 2 0 002-2M8 5a2 2 0 012-2h2a2 2 0 012 2m0 0h2a2 2 0 012 2v3m2 4H10m0 0l3-3m-3 3l3 3" />
                  </svg>
                  Copy Summary
                </>
              )}
            </button>
          </div>
          <ReactMarkdown className="prose prose-sm max-w-none text-gray-900">
            {analysis}
          </ReactMarkdown>
        </div>
      )}
    </div>
  );
};

export default FoiaAnalyzer;

