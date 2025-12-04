import React, { useState, useEffect, useRef } from 'react';
import Button from './Button';
import './ApiKeySettings.css';

interface ApiKeySettingsProps {
  isOpen: boolean;
  onClose: () => void;
}

const ApiKeySettings: React.FC<ApiKeySettingsProps> = ({ isOpen, onClose }) => {
  const [apiKey, setApiKey] = useState<string>('');
  const [showKey, setShowKey] = useState<boolean>(false);
  const [message, setMessage] = useState<{ text: string; type: 'success' | 'error' } | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (isOpen) {
      // Load existing API key from localStorage
      const storedKey = localStorage.getItem('user_gemini_api_key') || '';
      setApiKey(storedKey);
      setShowKey(false);
      setMessage(null);
    }
  }, [isOpen]);

  // Force black text color directly on the DOM element
  useEffect(() => {
    if (inputRef.current) {
      inputRef.current.style.setProperty('color', '#000000', 'important');
      inputRef.current.style.setProperty('-webkit-text-fill-color', '#000000', 'important');
      inputRef.current.style.setProperty('caret-color', '#000000', 'important');
      inputRef.current.style.setProperty('background-color', '#ffffff', 'important');
    }
  }, [isOpen, showKey, apiKey]);

  const handleSave = () => {
    if (!apiKey.trim()) {
      setMessage({ text: 'Please enter an API key', type: 'error' });
      return;
    }

    try {
      // Store in localStorage
      localStorage.setItem('user_gemini_api_key', apiKey.trim());
      // Also set it in window for immediate use
      (window as any).GEMINI_API_KEY = apiKey.trim();
      setMessage({ text: 'API key saved successfully! The app will use your personal API key.', type: 'success' });
      
      // Reload the page to reinitialize the AI instance with new key
      setTimeout(() => {
        window.location.reload();
      }, 1500);
    } catch (error: any) {
      setMessage({ text: `Failed to save API key: ${error.message}`, type: 'error' });
    }
  };

  const handleClear = () => {
    localStorage.removeItem('user_gemini_api_key');
    (window as any).GEMINI_API_KEY = undefined;
    setApiKey('');
    setMessage({ text: 'API key cleared. The app will use the default API key from environment variables.', type: 'success' });
    setTimeout(() => {
      window.location.reload();
    }, 1500);
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center px-4 py-10">
      <div className="relative w-full max-w-2xl bg-white rounded-3xl shadow-2xl border border-indigo-100 flex flex-col max-h-[90vh]">
        <button
          onClick={onClose}
          className="absolute top-4 right-4 text-gray-400 hover:text-gray-600 font-semibold text-xl"
        >
          ×
        </button>
        
        <div className="px-8 pt-8 pb-6">
          <h2 className="text-2xl font-bold text-indigo-700 mb-2">API Key Settings</h2>
          <p className="text-sm text-gray-600">
            Enter your personal Gemini API key to use your own quota. Your key is stored locally in your browser and will be used for all AI operations.
          </p>
        </div>

        <div className="flex-1 overflow-y-auto px-8 pb-8 space-y-4">
          <div>
            <label htmlFor="apiKey" className="block text-sm font-medium text-gray-700 mb-2">
              Gemini API Key
            </label>
            <div className="relative">
              <input
                ref={inputRef}
                type={showKey ? 'text' : 'password'}
                id="apiKey"
                name="apiKey"
                value={apiKey}
                onChange={(e) => setApiKey(e.target.value)}
                placeholder="Enter your Gemini API key"
                autoComplete="new-password"
                style={{
                  color: '#000000',
                  backgroundColor: '#ffffff',
                  WebkitTextFillColor: '#000000',
                  caretColor: '#000000',
                  opacity: 1,
                } as React.CSSProperties}
                className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 pr-12 api-key-input"
              />
              <button
                type="button"
                onClick={() => setShowKey(!showKey)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500 hover:text-gray-700 text-sm font-medium z-10"
              >
                {showKey ? 'Hide' : 'Show'}
              </button>
            </div>
            <p className="mt-2 text-xs text-gray-500">
              Get your API key from{' '}
              <a 
                href="https://aistudio.google.com/app/apikey" 
                target="_blank" 
                rel="noopener noreferrer"
                className="text-indigo-600 hover:text-indigo-800 underline"
              >
                Google AI Studio
              </a>
            </p>
          </div>

          {message && (
            <div className={`p-4 rounded-lg ${
              message.type === 'success' 
                ? 'bg-green-50 border border-green-200 text-green-700' 
                : 'bg-red-50 border border-red-200 text-red-700'
            }`}>
              {message.text}
            </div>
          )}

          <div className="flex gap-3 pt-4">
            <Button onClick={handleSave} className="flex-1">
              Save API Key
            </Button>
            {apiKey && (
              <Button variant="secondary" onClick={handleClear} className="flex-1">
                Clear & Use Default
              </Button>
            )}
          </div>

          <div className="mt-6 p-4 bg-gray-50 rounded-lg">
            <h3 className="text-sm font-semibold text-gray-700 mb-2">Security Note:</h3>
            <p className="text-xs text-gray-600">
              Your API key is stored locally in your browser's localStorage. It is never sent to our servers and is only used to make direct API calls to Google's Gemini service from your browser.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};

export default ApiKeySettings;

