import React from 'react';

interface AliasesDisplayProps {
  aliases: string[];
  petitionerName: string;
}

const AliasesDisplay: React.FC<AliasesDisplayProps> = ({ aliases, petitionerName }) => {
  if (!aliases || aliases.length === 0) {
    return null;
  }

  // Filter out the primary name and show only variations
  const uniqueAliases = Array.from(new Set(aliases.map(a => a.trim()).filter(a => a.length > 0)));
  const variations = uniqueAliases.filter(alias => 
    alias.toLowerCase() !== petitionerName.toLowerCase()
  );

  // If no variations found (only primary name), don't show the section
  if (variations.length === 0 && uniqueAliases.length === 1) {
    return null;
  }

  return (
    <div className="mt-8 p-6 border border-gray-300 rounded-lg bg-blue-50">
      <h3 className="text-lg font-semibold text-gray-800 mb-3">
        📋 Aliases and Name Variations Found
      </h3>
      <p className="text-sm text-gray-600 mb-4">
        The AI found the following aliases and name variations for <strong>{petitionerName}</strong> in the uploaded evidence documents:
      </p>
      <div className="bg-white rounded-md p-4 border border-gray-200">
        <ul className="space-y-2">
          {uniqueAliases.map((alias, index) => (
            <li key={index} className="flex items-start">
              <span className="mr-2 text-orange-600">•</span>
              <span className={`text-gray-800 ${alias.toLowerCase() === petitionerName.toLowerCase() ? 'font-semibold' : ''}`}>
                {alias}
                {alias.toLowerCase() === petitionerName.toLowerCase() && (
                  <span className="ml-2 text-xs text-gray-500">(Primary Name)</span>
                )}
              </span>
            </li>
          ))}
        </ul>
      </div>
      <p className="text-xs text-gray-500 mt-4">
        💡 <strong>Tip:</strong> Ensure all these aliases are listed in Form I-485 (Part 1, Item 4) and Form I-765 (Part 2, Items 5-7) to avoid inconsistencies.
      </p>
    </div>
  );
};

export default AliasesDisplay;

