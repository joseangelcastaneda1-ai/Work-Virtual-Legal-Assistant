import React, { useState } from 'react';
import Button from './Button';
import Spinner from './Spinner';
import { downloadDocx } from '../services/fileService';

interface OutputDisplayProps {
  coverLetter: string;
  legalArgument?: string;
  isLoading: boolean;
  error: string | null;
  caseType: string | null;
  generationStatus: string;
  templateFile?: File | null;
}

const DISCLAIMER_TEXT = "This application uses AI to generate responses and draft materials. All outputs are AI-generated and may contain inaccuracies. The content does not constitute legal advice and should not be relied upon without independent verification. Users are solely responsible for reviewing and validating all AI-generated material. The AI system does not establish an attorney-client relationship. Confidential information should not be entered into the system. Use implies acceptance of these terms.";

const OutputDisplay: React.FC<OutputDisplayProps> = ({ coverLetter, legalArgument, isLoading, error, caseType, generationStatus, templateFile }) => {
  const [copyStatus, setCopyStatus] = useState<'cover' | 'legal' | null>(null);
  const [showDisclaimer, setShowDisclaimer] = useState(false);
  const [pendingDownload, setPendingDownload] = useState<{ text: string; filename: string } | null>(null);

  const copyToClipboard = (text: string, type: 'cover' | 'legal') => {
    navigator.clipboard.writeText(text).then(() => {
      setCopyStatus(type);
      setTimeout(() => setCopyStatus(null), 2000);
    });
  };

  const handleDownloadClick = (text: string, filename: string) => {
    setPendingDownload({ text, filename });
    setShowDisclaimer(true);
  };

  const handleAgree = () => {
    if (pendingDownload) {
      downloadDocx(pendingDownload.text, pendingDownload.filename, templateFile || undefined);
      setPendingDownload(null);
    }
    setShowDisclaimer(false);
  };

  const handleCancel = () => {
    setPendingDownload(null);
    setShowDisclaimer(false);
  };
  
  const getCoverLetterTitle = () => {
      switch (caseType) {
          case 'i-130-adjustment': return 'Cover Letter';
          case 'u-visa-certification': return 'Certification Request';
          case 'u-visa-application': return 'Application Packet';
          case 'vawa': return 'VAWA Packet (Cover Letter & Argument)';
          default: return 'Generated Document';
      }
  }

  if (isLoading) {
    return (
      <div className="mt-8 p-6 border border-gray-200 rounded-lg bg-gray-50 flex items-center justify-center">
        <Spinner />
        <p className="ml-4 text-gray-700 font-medium">{generationStatus || 'AI is generating your documents...'}</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="mt-8 p-6 border border-red-300 rounded-lg bg-red-50">
        <h2 className="text-xl font-semibold mb-2 text-red-800">Generation Error</h2>
        <pre className="text-red-700 text-sm whitespace-pre-wrap font-mono bg-red-100 p-3 rounded">{error}</pre>
      </div>
    );
  }

  if (!coverLetter) return null;

  return (
    <div className="mt-8 p-6 border border-gray-200 rounded-lg bg-gray-50">
      <h2 className="text-2xl font-bold mb-4 text-gray-800">Generated Documents</h2>
      <div className="mb-6">
        <h3 className="text-lg font-medium text-gray-800 mb-2">{getCoverLetterTitle()}</h3>
        <div className="p-4 bg-white rounded-md shadow-sm whitespace-pre-wrap border border-gray-200 max-h-96 overflow-y-auto">
          {coverLetter}
        </div>
        <div className="mt-3 space-x-3">
          <Button onClick={() => copyToClipboard(coverLetter, 'cover')} variant="secondary">
            {copyStatus === 'cover' ? 'Copied!' : 'Copy Text'}
          </Button>
          <Button onClick={() => handleDownloadClick(coverLetter, 'Cover_Letter.docx')} variant="success">
            Download .docx
          </Button>
        </div>
      </div>

      {legalArgument && (
        <div>
          <h3 className="text-lg font-medium text-gray-800 mb-2">Legal Argument</h3>
          <div className="p-4 bg-white rounded-md shadow-sm whitespace-pre-wrap border border-gray-200 max-h-96 overflow-y-auto">
            {legalArgument}
          </div>
          <div className="mt-3 space-x-3">
            <Button onClick={() => copyToClipboard(legalArgument, 'legal')} variant="secondary">
              {copyStatus === 'legal' ? 'Copied!' : 'Copy Argument'}
            </Button>
            <Button onClick={() => handleDownloadClick(legalArgument, 'Legal_Argument.docx')} variant="success">
                Download .docx
            </Button>
          </div>
        </div>
      )}

      {/* Disclaimer Modal */}
      {showDisclaimer && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg shadow-xl max-w-2xl w-full max-h-[90vh] overflow-y-auto">
            <div className="p-6">
              <h3 className="text-xl font-bold mb-4 text-gray-800">Disclaimer</h3>
              <div className="mb-6 text-sm text-gray-700 leading-relaxed">
                <p>{DISCLAIMER_TEXT}</p>
              </div>
              <div className="flex justify-end space-x-3">
                <Button onClick={handleCancel} variant="secondary">
                  Cancel
                </Button>
                <Button onClick={handleAgree} variant="success">
                  Agree
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default OutputDisplay;