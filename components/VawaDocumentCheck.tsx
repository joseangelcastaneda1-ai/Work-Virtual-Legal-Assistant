import React from 'react';

interface VawaDocumentCheckProps {
  checkResult: { hasMinimumDocuments: boolean; missingDocuments: string[] } | null;
}

const VawaDocumentCheck: React.FC<VawaDocumentCheckProps> = ({ checkResult }) => {
  if (!checkResult) {
    return null;
  }

  if (checkResult.hasMinimumDocuments) {
    return (
      <div className="mt-8 p-6 border-2 border-green-500 rounded-lg bg-green-50">
        <h3 className="text-xl font-bold text-green-700 mb-2">
          ✅ GOOD NEWS, your case has the minimum documents to be sent to Paralegal Review!
        </h3>
        <p className="text-sm text-green-600">
          All required documents have been identified in your uploaded evidence.
        </p>
      </div>
    );
  }

  return (
    <div className="mt-8 p-6 border-2 border-red-500 rounded-lg bg-red-50">
      <h3 className="text-xl font-bold text-red-700 mb-3">
        ⚠️ WARNING! This case is still missing important documents!
      </h3>
      <div className="bg-white rounded-md p-4 border border-red-200 mt-3">
        <p className="text-sm font-semibold text-gray-800 mb-2">Missing Documents:</p>
        <ul className="list-disc list-inside space-y-1">
          {checkResult.missingDocuments.map((doc, index) => (
            <li key={index} className="text-sm text-gray-700">
              {doc}
            </li>
          ))}
        </ul>
      </div>
      <p className="text-xs text-red-600 mt-3">
        💡 <strong>Tip:</strong> Please ensure all required documents are uploaded before sending to paralegal review.
      </p>
    </div>
  );
};

export default VawaDocumentCheck;

