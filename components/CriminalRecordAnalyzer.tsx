import React, { useState } from 'react';
import ReactMarkdown from 'react-markdown';
import { readPdfAsText } from '../services/fileService';
import { analyzeCriminalRecords } from '../services/geminiService';
import Button from './Button';
import Spinner from './Spinner';

interface CriminalRecordAnalyzerProps {
  clientName?: string;
}

interface CriminalAnalysis {
  charges: string[];
  analysis: string;
  immigrationImplications: string;
  relevantINASections: string[];
  caseLawReferences: string[];
}

const DISCLAIMER_TEXT = "This application uses AI to generate responses and draft materials. All outputs are AI-generated and may contain inaccuracies. The content does not constitute legal advice and should not be relied upon without independent verification. Users are solely responsible for reviewing and validating all AI-generated material. The AI system does not establish an attorney-client relationship. Confidential information should not be entered into the system. Use implies acceptance of these terms.";

const CriminalRecordAnalyzer: React.FC<CriminalRecordAnalyzerProps> = ({ clientName }) => {
  const [criminalRecordFiles, setCriminalRecordFiles] = useState<File[]>([]);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [analysis, setAnalysis] = useState<CriminalAnalysis | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [showDisclaimer, setShowDisclaimer] = useState(false);
  const [pendingAnalysis, setPendingAnalysis] = useState<CriminalAnalysis | null>(null);
  const [copySuccess, setCopySuccess] = useState('');

  const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    if (event.target.files) {
      const filesArray = Array.from(event.target.files);
      setCriminalRecordFiles(filesArray);
      setAnalysis(null);
      setError(null);
      setCopySuccess('');
    }
  };

  const handleCopy = async () => {
    if (!analysis) return;
    
    const textToCopy = `
Identified Charges:
${analysis.charges.join('\n')}

Charge Analysis:
${analysis.analysis}

Immigration Implications:
${analysis.immigrationImplications}

Relevant INA Sections:
${analysis.relevantINASections.join('\n')}

Relevant Case Law:
${analysis.caseLawReferences.join('\n')}
    `.trim();

    try {
      await navigator.clipboard.writeText(textToCopy);
      setCopySuccess('Copied!');
      setTimeout(() => setCopySuccess(''), 2000);
    } catch (err) {
      console.error('Failed to copy text: ', err);
      setCopySuccess('Failed to copy');
    }
  };

  const handleAnalyze = async () => {
    if (criminalRecordFiles.length === 0) {
      setError('Please upload at least one criminal record file.');
      return;
    }

    setIsAnalyzing(true);
    setError(null);
    setAnalysis(null);

    try {
      // Read all criminal record files
      const recordTexts = await Promise.all(
        criminalRecordFiles.map(async (file) => {
          const text = await readPdfAsText(file);
          return { fileName: file.name, text };
        })
      );

      // Combine all records into a single text
      const combinedText = recordTexts
        .map((record) => `--- START OF DOCUMENT: ${record.fileName} ---\n${record.text}\n--- END OF DOCUMENT: ${record.fileName} ---`)
        .join('\n\n');

      // Analyze with AI
      const result = await analyzeCriminalRecords(combinedText, clientName || 'the client');

      // Show disclaimer before displaying results
      setPendingAnalysis(result);
      setShowDisclaimer(true);
    } catch (err: any) {
      setError(err.message || 'Failed to analyze criminal records. Please try again.');
      console.error('Criminal record analysis error:', err);
    } finally {
      setIsAnalyzing(false);
    }
  };

  return (
    <div className="mt-8 p-6 bg-gray-50 rounded-lg border border-gray-200">
      <h2 className="text-2xl font-bold text-gray-800 mb-4">Are you worried about your Client's criminal history? No worries! Upload the criminal record and I'll tell you how they will impact your client's case!</h2>
      <p className="text-sm text-gray-600 mb-4">
        Upload criminal records to analyze immigration implications based on the Immigration and Nationality Act (INA) and relevant case law.
      </p>

      <div className="mb-4">
        <label htmlFor="criminal-record-upload" className="block text-sm font-medium text-gray-700 mb-2">
          Upload Criminal Records (PDF only):
        </label>
        <input
          type="file"
          id="criminal-record-upload"
          multiple
          accept=".pdf"
          onChange={handleFileChange}
          disabled={isAnalyzing}
          className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm text-sm text-gray-700 file:mr-4 file:py-2 file:px-4 file:rounded-md file:border-0 file:text-sm file:font-semibold file:bg-blue-50 file:text-blue-700 hover:file:bg-blue-100 disabled:opacity-50 disabled:cursor-not-allowed"
        />
        {criminalRecordFiles.length > 0 && (
          <div className="mt-3 text-sm text-gray-600 space-y-1">
            <p className="font-medium">Selected files:</p>
            <ul className="list-disc list-inside">
              {criminalRecordFiles.map((file, index) => (
                <li key={index}>{file.name}</li>
              ))}
            </ul>
          </div>
        )}
      </div>

      <div className="mb-4">
        <Button onClick={handleAnalyze} isLoading={isAnalyzing} disabled={isAnalyzing || criminalRecordFiles.length === 0}>
          Analyze Criminal Records
        </Button>
      </div>

      {isAnalyzing && (
        <div className="mt-4 flex items-center gap-2 text-blue-600">
          <Spinner />
          <p>AI is analyzing criminal records, researching INA provisions, and reviewing case law...</p>
        </div>
      )}

      {error && (
        <div className="mt-4 p-4 bg-red-50 border border-red-200 rounded-md">
          <p className="text-sm text-red-800">{error}</p>
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
        <div className="mt-6 space-y-6">
          <div className="flex justify-end">
             <button
              onClick={handleCopy}
              className="text-sm font-medium text-blue-600 hover:text-blue-800 flex items-center gap-1"
            >
              {copySuccess ? (
                <span className="text-green-600">✓ {copySuccess}</span>
              ) : (
                <>
                  <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 5H6a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2v-1M8 5a2 2 0 002 2h2a2 2 0 002-2M8 5a2 2 0 012-2h2a2 2 0 012 2m0 0h2a2 2 0 012 2v3m2 4H10m0 0l3-3m-3 3l3 3" />
                  </svg>
                  Copy Analysis
                </>
              )}
            </button>
          </div>

          <div className="bg-white p-6 rounded-lg border border-gray-200 shadow-sm">
            <h3 className="text-xl font-bold text-gray-800 mb-4">Identified Charges</h3>
            {analysis.charges.length > 0 ? (
              <ul className="list-disc list-inside space-y-2 text-gray-700">
                {analysis.charges.map((charge, index) => (
                  <li key={index}>{charge}</li>
                ))}
              </ul>
            ) : (
              <p className="text-gray-600">No specific charges identified in the records.</p>
            )}
          </div>

          <div className="bg-white p-6 rounded-lg border border-gray-200 shadow-sm">
            <h3 className="text-xl font-bold text-gray-800 mb-4">Charge Analysis</h3>
            <ReactMarkdown className="prose max-w-none text-gray-700">
              {analysis.analysis}
            </ReactMarkdown>
          </div>

          <div className="bg-white p-6 rounded-lg border border-gray-200 shadow-sm">
            <h3 className="text-xl font-bold text-gray-800 mb-4">Immigration Implications</h3>
            <ReactMarkdown className="prose max-w-none text-gray-700">
              {analysis.immigrationImplications}
            </ReactMarkdown>
          </div>

          {analysis.relevantINASections.length > 0 && (
            <div className="bg-white p-6 rounded-lg border border-gray-200 shadow-sm">
              <h3 className="text-xl font-bold text-gray-800 mb-4">Relevant INA Sections</h3>
              <ul className="list-disc list-inside space-y-2 text-gray-700">
                {analysis.relevantINASections.map((section, index) => (
                  <li key={index}>{section}</li>
                ))}
              </ul>
            </div>
          )}

          {analysis.caseLawReferences.length > 0 && (
            <div className="bg-white p-6 rounded-lg border border-gray-200 shadow-sm">
              <h3 className="text-xl font-bold text-gray-800 mb-4">Relevant Case Law</h3>
              <ul className="list-disc list-inside space-y-2 text-gray-700">
                {analysis.caseLawReferences.map((reference, index) => (
                  <li key={index}>{reference}</li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default CriminalRecordAnalyzer;

