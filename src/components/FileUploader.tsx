import React from 'react';
import './FileUploader.css';

interface FileUploaderProps {
  onFileLoad: (content: string, filename: string) => void;
}

export const FileUploader: React.FC<FileUploaderProps> = ({ onFileLoad }) => {
  const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (e) => {
      const content = e.target?.result as string;
      onFileLoad(content, file.name);
    };
    reader.readAsText(file);
  };

  const handleDrop = (event: React.DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    event.stopPropagation();

    const file = event.dataTransfer.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (e) => {
      const content = e.target?.result as string;
      onFileLoad(content, file.name);
    };
    reader.readAsText(file);
  };

  const handleDragOver = (event: React.DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    event.stopPropagation();
  };

  return (
    <div className="file-uploader">
      <div 
        className="drop-zone"
        onDrop={handleDrop}
        onDragOver={handleDragOver}
      >
        <div className="drop-zone-content">
          <svg 
            className="upload-icon" 
            fill="none" 
            stroke="currentColor" 
            viewBox="0 0 24 24"
            width="48"
            height="48"
          >
            <path 
              strokeLinecap="round" 
              strokeLinejoin="round" 
              strokeWidth={2} 
              d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" 
            />
          </svg>
          <h3>Upload JSON Document</h3>
          <p>Drag and drop your JSON file here, or click to browse</p>
          <input
            type="file"
            accept=".json,application/json"
            onChange={handleFileChange}
            className="file-input"
            id="file-input"
          />
          <label htmlFor="file-input" className="browse-button">
            Browse Files
          </label>
        </div>
      </div>
    </div>
  );
};
