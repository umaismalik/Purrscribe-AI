import React, { useState, useRef } from "react";
import { Button } from "../../components/ui/button";
import { Upload, File, Check } from "lucide-react";
import { FileItem } from "./FileManager";
import { Progress } from "../../components/ui/progress";

interface FileUploaderProps {
  onUpload: (files: FileItem[]) => void;
}

// ✅ ADD API BASE URL (FileManager se copy karo)
const API_BASE = import.meta.env.VITE_API_BASE || 'https://mliapi.ddns.net:5000';
const API_URL = `${API_BASE}/api`;

export const FileUploader = ({ onUpload }: FileUploaderProps) => {
  const [isDragging, setIsDragging] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [selectedFiles, setSelectedFiles] = useState<File[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // ✅ FIX: Direct token access
  const getTokenDirect = (): string => {
    const token = localStorage.getItem('auth_token');
    console.log('🔐 FileUploader getTokenDirect:', token ? 'Present' : 'NULL');
    if (!token) {
      throw new Error('No authentication token found');
    }
    return token;
  };

  const handleDragOver = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = () => {
    setIsDragging(false);
  };

  const handleDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragging(false);

    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      handleFiles(Array.from(e.dataTransfer.files));
    }
  };

  const handleFileInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      handleFiles(Array.from(e.target.files));
    }
  };

  const handleFiles = (files: File[]) => {
    setSelectedFiles(files);
  };

  const handleUpload = async () => {
    if (selectedFiles.length === 0) return;
    
    setUploading(true);
    setUploadProgress(0);

    try {
      for (let i = 0; i < selectedFiles.length; i++) {
        const file = selectedFiles[i];
        await uploadSingleFile(file);
        
        // Progress update
        const progress = ((i + 1) / selectedFiles.length) * 100;
        setUploadProgress(progress);
      }
      
      setSelectedFiles([]);
      setUploadProgress(100);
      setTimeout(() => setUploadProgress(0), 2000);
      
    } catch (error) {
      console.error('❌ Upload error:', error);
      alert(`Upload failed: ${error.message}`);
    } finally {
      setUploading(false);
    }
  };

  const uploadSingleFile = async (file: File) => {
    try {
      const token = getTokenDirect();
      console.log('📤 Uploading file:', file.name, 'Size:', file.size);

      const formData = new FormData();
      formData.append('file', file);

      // ✅ Now API_URL is defined
      const response = await fetch(`${API_URL}/upload`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
        },
        body: formData
      });

      console.log('📤 Upload response status:', response.status);

      if (!response.ok) {
        const errorText = await response.text();
        console.error('❌ Upload failed:', errorText);
        throw new Error(`Upload failed: ${response.status}`);
      }

      const result = await response.json();
      console.log('✅ Upload successful:', result);
      
      onUpload([result.file]);
      
    } catch (error) {
      console.error('❌ Upload error:', error);
      throw error;
    }
  };

  const triggerFileInput = () => {
    fileInputRef.current?.click();
  };

  return (
    <div className="w-full space-y-6">
      <div
        className={`border-2 border-dashed rounded-lg p-8 text-center ${isDragging ? "border-primary bg-primary/10" : "border-muted-foreground/25"}`}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
      >
        <input
          type="file"
          ref={fileInputRef}
          onChange={handleFileInputChange}
          multiple
          className="hidden"
          accept=".pdf,.doc,.docx,.xls,.xlsx,.jpg,.jpeg,.png"
        />

        <div className="flex flex-col items-center justify-center space-y-4">
          <Upload size={40} className="text-muted-foreground" />
          <div>
            <h3 className="text-lg font-medium">Drag and drop files here</h3>
            <p className="text-sm text-muted-foreground">
              or{" "}
              <button
                type="button"
                className="text-primary hover:underline"
                onClick={triggerFileInput}
              >
                browse
              </button>{" "}
              to upload
            </p>
          </div>
          <p className="text-xs text-muted-foreground">
            Supported formats: PDF, DOC, DOCX, XLS, XLSX, JPG, PNG
          </p>
        </div>
      </div>

      {selectedFiles.length > 0 && (
        <div className="space-y-4">
          <h3 className="text-lg font-medium">Selected Files</h3>
          <div className="space-y-2">
            {selectedFiles.map((file, index) => (
              <div
                key={index}
                className="flex items-center p-3 border rounded-md bg-background"
              >
                <File size={20} className="mr-2 text-muted-foreground" />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium truncate">{file.name}</p>
                  <p className="text-xs text-muted-foreground">
                    {(file.size / 1024 / 1024).toFixed(2)} MB
                  </p>
                </div>
              </div>
            ))}
          </div>

          {uploading ? (
            <div className="space-y-2">
              <Progress value={uploadProgress} className="w-full" />
              <p className="text-sm text-center text-muted-foreground">
                Uploading... {Math.round(uploadProgress)}%
              </p>
            </div>
          ) : (
            <Button onClick={handleUpload} className="w-full">
              <Upload size={16} className="mr-2" />
              Upload {selectedFiles.length}{" "}
              {selectedFiles.length === 1 ? "file" : "files"}
            </Button>
          )}
        </div>
      )}

      {uploadProgress === 100 && !uploading && (
        <div className="flex items-center justify-center p-3 text-sm text-green-600 bg-green-50 rounded-md">
          <Check size={16} className="mr-2" />
          Files uploaded successfully!
        </div>
      )}
    </div>
  );
};