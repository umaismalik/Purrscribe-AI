import React, { useState, useRef, ChangeEvent, useEffect } from "react";
import { Upload, X, Image as ImageIcon, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import { SUPPORTED_IMAGE_FORMATS, MAX_UPLOAD_SIZE } from "@/config/apiConfig";
import { useAuth } from "@/context/AuthContext";

interface ImageUploaderProps {
  imageUrl?: string;
  onImageChange: (url: string) => void;
  onFileUpload: (fileData: {imageData: string, imageType: string, previewUrl: string}) => void;
  className?: string;
  label?: string;
  placeholder?: string;
  disabled?: boolean;
}

export function ImageUploader({
  imageUrl = "",
  onImageChange,
  onFileUpload,
  className,
  label = "Image",
  placeholder = "Enter image URL or upload an image",
  disabled = false,
}: ImageUploaderProps) {
  const [url, setUrl] = useState<string>(imageUrl);
  const [isUploading, setIsUploading] = useState<boolean>(false);
  const [error, setError] = useState<string>("");
  const [preview, setPreview] = useState<string>(imageUrl);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { getToken, logout } = useAuth();

  // Sync with parent imageUrl changes
  useEffect(() => {
    setUrl(imageUrl);
    setPreview(imageUrl);
  }, [imageUrl]);

  const handleUrlChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newUrl = e.target.value;
    setUrl(newUrl);
    setPreview(newUrl);
    onImageChange(newUrl);
    setError("");
  };

  const handleFileSelect = () => {
    if (fileInputRef.current) {
      fileInputRef.current.click();
    }
  };

// In your ImageUploader component, update the handleFileChange function:

const handleFileChange = async (e: ChangeEvent<HTMLInputElement>) => {
  const file = e.target.files?.[0];
  if (!file) return;

  // Validate file type
  if (!SUPPORTED_IMAGE_FORMATS.includes(file.type)) {
    setError(`Unsupported file format. Supported formats: ${SUPPORTED_IMAGE_FORMATS.join(', ')}`);
    return;
  }

  // Validate file size (5MB)
  const MAX_SIZE = 5 * 1024 * 1024;
  if (file.size > MAX_SIZE) {
    setError(`File too large. Maximum size: 5MB`);
    return;
  }

  try {
    setIsUploading(true);
    setError("");

    // Compress image if needed
    let processedFile = file;
    if (file.size > 1 * 1024 * 1024) {
      processedFile = await compressImage(file);
    }

    // Convert file to base64 AND create object URL for preview
    const reader = new FileReader();
    reader.onload = (e) => {
      const base64Data = e.target?.result as string;
      const base64Content = base64Data.split(',')[1];
      
      // Create object URL for immediate preview
      const objectUrl = URL.createObjectURL(processedFile);
      
      // Set preview using object URL for better performance
      setPreview(objectUrl);
      
      // Send both base64 data for storage AND object URL for immediate use
      onFileUpload({
        imageData: base64Content,
        imageType: processedFile.type,
        previewUrl: objectUrl // Add this for immediate display
      });
    };
    reader.readAsDataURL(processedFile);
    
  } catch (err) {
    console.error("File conversion failed:", err);
    setError(err instanceof Error ? err.message : "Failed to process image");
  } finally {
    setIsUploading(false);
  }
};
// ✅ UPDATED: Improved compression function for larger files
const compressImage = async (file: File): Promise<File> => {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.src = URL.createObjectURL(file);
    
    img.onload = () => {
      const canvas = document.createElement('canvas');
      const ctx = canvas.getContext('2d');
      
      // ✅ UPDATED: Calculate new dimensions (max 1200px for better quality)
      let width = img.width;
      let height = img.height;
      
      const MAX_DIMENSION = 1200; // Increased from 800 to 1200
      if (width > height && width > MAX_DIMENSION) {
        height = Math.round((height * MAX_DIMENSION) / width);
        width = MAX_DIMENSION;
      } else if (height > MAX_DIMENSION) {
        width = Math.round((width * MAX_DIMENSION) / height);
        height = MAX_DIMENSION;
      }
      
      canvas.width = width;
      canvas.height = height;
      
      ctx?.drawImage(img, 0, 0, width, height);
      
      // ✅ UPDATED: Better quality settings for 5MB files
      canvas.toBlob(
        (blob) => {
          if (!blob) {
            reject(new Error('Canvas toBlob failed'));
            return;
          }
          
          const compressedFile = new File([blob], file.name, {
            type: 'image/jpeg',
            lastModified: Date.now(),
          });
          
          console.log(`Original: ${(file.size / 1024 / 1024).toFixed(2)}MB, Compressed: ${(compressedFile.size / 1024 / 1024).toFixed(2)}MB`);
          
          resolve(compressedFile);
        },
        'image/jpeg',
        0.8 // ✅ Increased quality from 0.7 to 0.8 for better images
      );
    };
    
    img.onerror = () => reject(new Error('Image loading failed'));
  });
};

  const handleClear = () => {
    setUrl("");
    setPreview("");
    onImageChange("");
    setError("");
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  };

  return (
    <div className={cn("space-y-2", className)}>
      <Label htmlFor="image-url">{label}</Label>
      <div className="flex flex-col gap-4">
        <div className="flex gap-2">
          <div className="relative flex-1">
            <Input
              id="image-url"
              type="text"
              placeholder={placeholder}
              value={url}
              onChange={handleUrlChange}
              disabled={disabled || isUploading}
              className="pr-8"
            />
            {url && (
              <button
                type="button"
                onClick={handleClear}
                className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                disabled={disabled || isUploading}
              >
                <X size={16} />
              </button>
            )}
          </div>
          <Button
            type="button"
            variant="outline"
            size="icon"
            onClick={handleFileSelect}
            disabled={disabled || isUploading}
          >
            {isUploading ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Upload className="h-4 w-4" />
            )}
          </Button>
          <input
            ref={fileInputRef}
            type="file"
            accept={SUPPORTED_IMAGE_FORMATS.join(",")}
            onChange={handleFileChange}
            className="hidden"
            disabled={disabled || isUploading}
          />
        </div>

        {error && <p className="text-sm text-destructive">{error}</p>}

        <div className="relative mt-2 rounded-md border border-border overflow-hidden">
          <div className="aspect-video relative bg-muted flex items-center justify-center">
            {preview ? (
              <img
                src={preview}
                alt="Preview"
                className="max-h-full max-w-full object-contain"
                onError={(e) => {
                  console.error("Image failed to load:", preview);
                  setError("Failed to load image preview");
                  setPreview("");
                }}
              />
            ) : (
              <ImageIcon className="h-10 w-10 text-muted-foreground" />
            )}
          </div>
        </div>
      </div>
    </div>
  );
}