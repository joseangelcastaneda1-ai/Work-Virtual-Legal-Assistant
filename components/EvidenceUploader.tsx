
import React from 'react';

interface EvidenceUploaderProps {
  label: React.ReactNode;
  onFilesChange: (files: File[]) => void;
}

const EvidenceUploader: React.FC<EvidenceUploaderProps> = ({ label, onFilesChange }) => {
    const [selectedFiles, setSelectedFiles] = React.useState<File[]>([]);

    const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
        if (event.target.files) {
            const filesArray = Array.from(event.target.files);
            setSelectedFiles(filesArray);
            onFilesChange(filesArray);
        }
    };

    return (
        <div className="mt-6">
            <label htmlFor="evidence-file-upload" className="block font-medium text-gray-700 mb-2">
                {label}
            </label>
            <input
                type="file"
                id="evidence-file-upload"
                multiple
                accept=".pdf"
                onChange={handleFileChange}
                className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm text-sm text-gray-700 file:mr-4 file:py-2 file:px-4 file:rounded-md file:border-0 file:text-sm file:font-semibold file:bg-blue-50 file:text-blue-700 hover:file:bg-blue-100"
            />
            {selectedFiles.length > 0 && (
                <div id="evidence-file-list" className="mt-3 text-sm text-gray-600 space-y-1">
                    <p className="font-medium">Selected files:</p>
                    <ul className="list-disc list-inside">
                        {selectedFiles.map((file, index) => (
                            <li key={index}>{file.name}</li>
                        ))}
                    </ul>
                </div>
            )}
        </div>
    );
};

export default EvidenceUploader;
