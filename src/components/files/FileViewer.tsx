import React from "react";
import { FileItem } from "./FileManager";

interface FileViewerProps {
  file: FileItem;
}

export const FileViewer = ({ file }: FileViewerProps) => {
  const renderFileContent = () => {
    // PDF Preview
    if (file.type.includes("pdf") || file.name.toLowerCase().endsWith(".pdf")) {
      return (
        <div className="w-full h-[70vh]">
          <iframe
            src={file.url}
            title={file.name}
            className="w-full h-full rounded-md"
            frameBorder="0"
          />
        </div>
      );
    }
    // Image Preview
    else if (
      file.type.includes("image") ||
      file.name.toLowerCase().match(/\.(jpg|jpeg|png|gif|webp|bmp)$/i)
    ) {
      return (
        <div className="flex items-center justify-center h-full p-4">
          <img
            src={file.url}
            alt={file.name}
            className="max-w-full max-h-[70vh] object-contain rounded-md"
            onError={(e) => {
              console.error('Image load error:', file.url);
              e.currentTarget.alt = 'Failed to load image';
            }}
          />
        </div>
      );
    }
    // Text File Preview
    else if (
      file.type.includes("text") || 
      file.name.toLowerCase().match(/\.(txt|json|xml|html|css|js|md|log)$/i)
    ) {
      return (
        <div className="p-4 text-center">
          <p className="mb-4">Text files need to be downloaded to view.</p>
          <a
            href={file.url}
            target="_blank"
            rel="noopener noreferrer"
            className="text-primary hover:underline"
          >
            Download to view
          </a>
        </div>
      );
    }
    // Word Document Notice
    else if (
      file.type.includes("word") ||
      file.type.includes("doc") ||
      file.name.toLowerCase().match(/\.(doc|docx)$/i)
    ) {
      return (
        <div className="p-4 text-center">
          <p className="mb-4">Word documents cannot be previewed directly.</p>
          <a
            href={file.url}
            target="_blank"
            rel="noopener noreferrer"
            className="text-primary hover:underline"
          >
            Download to view
          </a>
        </div>
      );
    }
    // Excel/Spreadsheet Notice
    else if (
      file.type.includes("sheet") ||
      file.type.includes("excel") ||
      file.name.toLowerCase().match(/\.(xls|xlsx|csv)$/i)
    ) {
      return (
        <div className="p-4 text-center">
          <p className="mb-4">Spreadsheets cannot be previewed directly.</p>
          <a
            href={file.url}
            target="_blank"
            rel="noopener noreferrer"
            className="text-primary hover:underline"
          >
            Download to view
          </a>
        </div>
      );
    }
    // Default - Unknown file type
    else {
      return (
        <div className="p-4 text-center">
          <p className="mb-4">This file type cannot be previewed directly.</p>
          <a
            href={file.url}
            target="_blank"
            rel="noopener noreferrer"
            className="text-primary hover:underline"
          >
            Download to view
          </a>
        </div>
      );
    }
  };

  return (
    <div className="bg-white rounded-md overflow-hidden h-full">
      {renderFileContent()}
    </div>
  );
};