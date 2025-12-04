import React from 'react';

const EnvDebug: React.FC = () => {
  if (typeof window === 'undefined') return null;
  
  const debugInfo = {
    hasLocalStorageKey: !!localStorage.getItem('user_gemini_api_key'),
    localStorageKeyLength: localStorage.getItem('user_gemini_api_key')?.length || 0,
    hasWindowKey: !!(window as any).GEMINI_API_KEY,
    importMetaEnvKeys: typeof import.meta !== 'undefined' 
      ? Object.keys((import.meta as any).env || {}).filter((k: string) => 
          k.includes('GEMINI') || k.includes('API') || k.includes('VITE')
        )
      : [],
    importMetaEnvVITE_GEMINI_API_KEY: typeof import.meta !== 'undefined' 
      ? !!(import.meta as any).env?.VITE_GEMINI_API_KEY 
      : false,
    importMetaEnvVITE_GEMINI_API_KEY_Length: typeof import.meta !== 'undefined' 
      ? (import.meta as any).env?.VITE_GEMINI_API_KEY?.length || 0
      : 0,
    processEnvKeys: typeof process !== 'undefined' 
      ? Object.keys(process.env || {}).filter((k: string) => 
          k.includes('GEMINI') || k.includes('API') || k.includes('VITE')
        )
      : [],
  };

  // Don't show debug info in production - only show if explicitly enabled via localStorage
  const showDebug = localStorage.getItem('show_env_debug') === 'true';
  
  if (!showDebug) return null;

  return (
    <div className="fixed bottom-4 right-4 bg-yellow-100 border border-yellow-400 rounded-lg p-4 text-xs max-w-md z-50 shadow-lg">
      <h4 className="font-bold text-yellow-800 mb-2">Environment Debug Info</h4>
      <pre className="text-xs overflow-auto max-h-64">
        {JSON.stringify(debugInfo, null, 2)}
      </pre>
      <p className="mt-2 text-yellow-700">
        {!debugInfo.hasLocalStorageKey && !debugInfo.importMetaEnvVITE_GEMINI_API_KEY && (
          <strong>⚠️ No API key found! Set VITE_GEMINI_API_KEY in Vercel or use Settings menu.</strong>
        )}
      </p>
    </div>
  );
};

export default EnvDebug;

