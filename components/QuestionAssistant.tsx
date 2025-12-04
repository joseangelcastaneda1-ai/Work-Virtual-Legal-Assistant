import React, { useState } from 'react';
import ReactMarkdown from 'react-markdown';
import Button from './Button';
import Spinner from './Spinner';
import { askImmigrationQuestion } from '../services/questionService';

const DISCLAIMER_TEXT = "This application uses AI to generate responses and draft materials. All outputs are AI-generated and may contain inaccuracies. The content does not constitute legal advice and should not be relied upon without independent verification. Users are solely responsible for reviewing and validating all AI-generated material. The AI system does not establish an attorney-client relationship. Confidential information should not be entered into the system. Use implies acceptance of these terms.";

const QuestionAssistant: React.FC = () => {
  const [question, setQuestion] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [answer, setAnswer] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [showModal, setShowModal] = useState(false);
  const [showDisclaimer, setShowDisclaimer] = useState(false);
  const [pendingAnswer, setPendingAnswer] = useState<string | null>(null);
  const [copySuccess, setCopySuccess] = useState('');

  const handleCopy = async () => {
    if (!answer) return;
    
    try {
      await navigator.clipboard.writeText(answer);
      setCopySuccess('Copied!');
      setTimeout(() => setCopySuccess(''), 2000);
    } catch (err) {
      console.error('Failed to copy text: ', err);
      setCopySuccess('Failed to copy');
    }
  };

  const handleSubmit = async () => {
    if (!question.trim()) {
      setError('Please enter a question for your virtual legal assistant.');
      return;
    }

    setIsSubmitting(true);
    setAnswer(null);
    setError(null);
    setShowModal(false);
    setShowDisclaimer(false);
    setPendingAnswer(null);

    try {
      const response = await askImmigrationQuestion(question.trim());
      // Show disclaimer before displaying answer
      setPendingAnswer(response);
      setShowDisclaimer(true);
    } catch (e: any) {
      setError(e.message || 'The assistant could not answer your question. Please try again.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="bg-white/10 rounded-3xl shadow-lg p-8 border border-white/15 flex flex-col">
      <h3 className="text-2xl font-bold">Do you have a specific question?</h3>
      <p className="text-sm text-blue-100 mt-3 leading-relaxed">
        Ask your virtual legal assistant anything about your client’s immigration matter. The answer will be tailored
        for an immigration attorney and grounded in current statutes and case law whenever applicable.
      </p>

      <textarea
        value={question}
        onChange={(e) => setQuestion(e.target.value)}
        placeholder="Type your question here"
        className="mt-6 flex-1 w-full bg-white/95 text-[#0a3e82] rounded-2xl p-4 text-sm outline-none focus:ring-2 focus:ring-blue-300"
        rows={6}
      />

      <div className="mt-4 flex justify-end">
        <Button onClick={handleSubmit} isLoading={isSubmitting} disabled={isSubmitting}>
          Ask the Assistant
        </Button>
      </div>

      {answer && !isSubmitting && (
        <div className="mt-2 flex justify-end">
          <Button variant="secondary" onClick={() => setShowModal(true)}>
            View Last Answer
          </Button>
        </div>
      )}

      {isSubmitting && (
        <div className="mt-4 flex items-center gap-2 text-blue-100">
          <Spinner />
          <span className="font-medium">The assistant is reviewing immigration sources...</span>
        </div>
      )}

      {error && (
        <div className="mt-4 p-4 rounded-lg bg-red-50 border border-red-200 text-sm text-red-700">
          {error}
        </div>
      )}

      {/* Disclaimer Modal - shown before answer */}
      {showDisclaimer && pendingAnswer && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg shadow-xl max-w-2xl w-full max-h-[90vh] overflow-y-auto">
            <div className="p-6">
              <h3 className="text-xl font-bold mb-4 text-gray-800">Disclaimer</h3>
              <div className="mb-6 text-sm text-gray-700 leading-relaxed">
                <p>{DISCLAIMER_TEXT}</p>
              </div>
              <div className="flex justify-end space-x-3">
                <Button onClick={() => { setShowDisclaimer(false); setPendingAnswer(null); }} variant="secondary">
                  Cancel
                </Button>
                <Button onClick={() => { setAnswer(pendingAnswer); setShowModal(true); setShowDisclaimer(false); setPendingAnswer(null); }} variant="success">
                  Agree
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}

      {showModal && answer && (
        <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center px-4 py-10">
          <div className="relative w-full max-w-3xl max-h-[85vh] bg-white rounded-3xl shadow-2xl border border-indigo-100 flex flex-col">
            <button
              onClick={() => setShowModal(false)}
              className="absolute top-3 right-4 text-indigo-600 hover:text-indigo-800 font-semibold text-sm uppercase tracking-wide"
            >
              Close
            </button>
            <div className="px-8 pt-8 pr-12 flex justify-between items-center">
              <h4 className="text-2xl font-bold text-indigo-700 mb-4">Assistant’s Answer</h4>
              <button
                onClick={handleCopy}
                className="text-sm font-medium text-indigo-600 hover:text-indigo-800 flex items-center gap-1 mb-4"
              >
                {copySuccess ? (
                  <span className="text-green-600">✓ {copySuccess}</span>
                ) : (
                  <>
                    <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 5H6a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2v-1M8 5a2 2 0 002 2h2a2 2 0 002-2M8 5a2 2 0 012-2h2a2 2 0 012 2m0 0h2a2 2 0 012 2v3m2 4H10m0 0l3-3m-3 3l3 3" />
                    </svg>
                    Copy Answer
                  </>
                )}
              </button>
            </div>
            <div className="flex-1 overflow-y-auto px-8 pb-8 pr-12 space-y-4">
              <ReactMarkdown className="prose prose-sm sm:prose-base max-w-none text-gray-900">
                {answer}
              </ReactMarkdown>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default QuestionAssistant;

