// FileManager.tsx - Fixed version
import React, { useState, useEffect } from "react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "../../components/ui/tabs";
import { FileUploader } from "./FileUploader";
import { FileList } from "./FileList";
import { FileViewer } from "./FileViewer"; // ✅ Import FileViewer
import { useAuth } from "../../context/AuthContext";
import { Button } from "../../components/ui/button";
import { Download, Eye, X, RefreshCw, Loader, Search } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "../../components/ui/dialog";
import { Input } from "../../components/ui/input";
import { useToast } from "../../components/ui/use-toast";

export interface FileItem {
  id: string;
  name: string;
  type: string;
  size: number;
  uploadDate: Date;
  url: string;
}

const API_BASE = import.meta.env.VITE_API_BASE || 'https://mliapi.ddns.net:5000';
const API_URL = `${API_BASE}/api`;

const FileManager = () => {
  const [files, setFiles] = useState<FileItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [viewFile, setViewFile] = useState<FileItem | null>(null);
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedType, setSelectedType] = useState<string>("all");
  const { user } = useAuth();
  const { toast } = useToast();

  const getTokenDirect = (): string => {
    const token = localStorage.getItem('auth_token');
    console.log('🔐 FileManager getTokenDirect:', token ? 'Present' : 'NULL');
    if (!token) {
      throw new Error('No authentication token found');
    }
    return token;
  };

  const fetchFiles = async () => {
    if (!user) return;
    
    try {
      setLoading(true);
      const token = getTokenDirect();
      
      const response = await fetch(`${API_URL}/files`, {
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
      });
      
      console.log('📁 Response status:', response.status);
      
      if (response.ok) {
        const data = await response.json();
        console.log('📁 Files fetched:', data);
        
        const filesWithDates = data.map((file: any) => {
          const uploadDate = new Date(file.uploadDate);
          return {
            ...file,
            uploadDate: isNaN(uploadDate.getTime()) ? new Date() : uploadDate,
            // ✅ FIX: Ensure URL is properly constructed
            url: `${API_URL}/files/view/${file.id}?token=${encodeURIComponent(token)}`
          };
        });
        setFiles(filesWithDates);
      } else {
        throw new Error('Failed to fetch files');
      }
    } catch (error) {
      console.error('❌ Error fetching files:', error);
      toast({
        title: "Error",
        description: "Failed to load files. Please try again.",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchFiles();
  }, [user]);

  const filteredFiles = files.filter((file) => {
    const matchesSearch = file.name.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesType = selectedType === "all" || file.type.includes(selectedType);
    return matchesSearch && matchesType;
  });

  const handleFileUpload = async (newFiles: FileItem[]) => {
    setFiles((prevFiles) => [...newFiles, ...prevFiles]);
    toast({
      title: "Success",
      description: "Files uploaded successfully.",
    });
  };

  const handleFileDelete = async (fileId: string) => {
    try {
      const token = getTokenDirect();
      const response = await fetch(`${API_URL}/files/${fileId}`, {
        method: 'DELETE',
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });
      
      if (response.ok) {
        setFiles((prevFiles) => prevFiles.filter((file) => file.id !== fileId));
        toast({
          title: "Success",
          description: "File deleted successfully.",
        });
      } else {
        throw new Error('Failed to delete file');
      }
    } catch (error) {
      console.error('❌ Error deleting file:', error);
      toast({
        title: "Error",
        description: "Failed to delete file. Please try again.",
        variant: "destructive",
      });
    }
  };

  // ✅ FIXED: Download function - Complete working solution
const handleDownload = async (file: FileItem) => {
  try {
    const token = getTokenDirect();
    console.log('🚀 Starting download for file:', file.name);
    console.log('📁 File ID:', file.id);
    console.log('🔑 Token present:', !!token);

    // ✅ Try different download approaches
    let downloadSuccessful = false;

    // Approach 1: Direct download endpoint
    try {
      console.log('🔄 Trying Approach 1: Direct download endpoint');
      const response = await fetch(`${API_URL}/files/${file.id}/download`, {
        headers: {
          'Authorization': `Bearer ${token}`,
        },
      });

      console.log('📥 Response status:', response.status);
      
      if (response.ok) {
        const blob = await response.blob();
        console.log('📦 Blob size:', blob.size, 'bytes');
        
        if (blob.size > 0) {
          const blobUrl = window.URL.createObjectURL(blob);
          const link = document.createElement('a');
          link.href = blobUrl;
          link.download = file.name;
          document.body.appendChild(link);
          link.click();
          document.body.removeChild(link);
          window.URL.revokeObjectURL(blobUrl);
          
          console.log('✅ Download successful via Approach 1');
          downloadSuccessful = true;
          
          toast({
            title: "Success",
            description: "File downloaded successfully!",
          });
        }
      }
    } catch (error) {
      console.log('❌ Approach 1 failed:', error);
    }

    // Approach 2: View endpoint with download
    if (!downloadSuccessful) {
      try {
        console.log('🔄 Trying Approach 2: View endpoint');
        const viewUrl = `${API_URL}/files/view/${file.id}?token=${encodeURIComponent(token)}`;
        console.log('🔗 Opening URL:', viewUrl);
        
        // Open in new tab for download
        window.open(viewUrl, '_blank');
        
        console.log('✅ File opened in new tab for download');
        downloadSuccessful = true;
        
        toast({
          title: "Info",
          description: "File opened in new tab. You can save it from there.",
        });
      } catch (error) {
        console.log('❌ Approach 2 failed:', error);
      }
    }

    // Approach 3: Simple anchor tag download
    if (!downloadSuccessful) {
      try {
        console.log('🔄 Trying Approach 3: Direct link download');
        const downloadUrl = `${API_URL}/files/view/${file.id}?token=${encodeURIComponent(token)}&download=true`;
        
        const link = document.createElement('a');
        link.href = downloadUrl;
        link.download = file.name;
        link.target = '_blank';
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        
        console.log('✅ Download initiated via Approach 3');
        downloadSuccessful = true;
        
        toast({
          title: "Success",
          description: "Download started!",
        });
      } catch (error) {
        console.log('❌ Approach 3 failed:', error);
      }
    }

    // If all approaches failed
    if (!downloadSuccessful) {
      console.error('❌ All download approaches failed');
      throw new Error('Unable to download file. Please try again.');
    }

  } catch (error) {
    console.error('💥 Final download error:', error);
    toast({
      title: "Error",
      description: "Failed to download file. Please try again.",
      variant: "destructive",
    });
  }
};

  // ✅ FIXED: View function
  const handleView = async (file: FileItem) => {
    try {
      const token = getTokenDirect();
      
      // ✅ FIX: Create proper URL for viewing
      const fileWithUrl = {
        ...file,
        url: `${API_URL}/files/view/${file.id}?token=${encodeURIComponent(token)}`
      };
      
      setViewFile(fileWithUrl);
      
    } catch (error) {
      console.error('❌ Error loading file:', error);
      toast({
        title: "Error",
        description: "Failed to load file for viewing.",
        variant: "destructive",
      });
    }
  };

  const handleRefresh = () => {
    fetchFiles();
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader className="h-8 w-8 animate-spin" />
      </div>
    );
  }

  return (
    <div className="container mx-auto py-6">
      <div className="flex flex-col gap-4 items-start sm:flex-row sm:justify-between sm:items-center bg-gradient-to-r from-[#F0F4FF] to-[#E0ECFF] rounded-xl w-full p-0 sm:p-5 shadow-sm mb-8">
        <h1 className="text-2xl font-bold">File Management</h1>
        <Button onClick={handleRefresh} variant="outline">
          <RefreshCw size={16} className="mr-2" />
          Refresh
        </Button>
      </div>

      <div className="flex flex-col md:flex-row items-center justify-between gap-4 mb-6">
        <div className="relative w-full md:max-w-md">
          <Search
            className="absolute left-3 top-1/2 transform -translate-y-1/2 text-muted-foreground"
            size={18}
          />
          <Input
            placeholder="Search files by name"
            className="pl-10"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
        </div>

        <select 
          value={selectedType} 
          onChange={(e) => setSelectedType(e.target.value)}
          className="w-[180px] p-2 border rounded-md"
        >
          <option value="all">All Types</option>
          <option value="pdf">PDF</option>
          <option value="image">Images</option>
          <option value="text">Text</option>
          <option value="audio">Audio</option>
        </select>
      </div>

      <Tabs defaultValue="upload" className="w-full">
        <TabsList className="grid w-full max-w-md grid-cols-1 sm:grid-cols-2 gap-2 mb-12">
          <TabsTrigger value="upload">Upload Files</TabsTrigger>
          <TabsTrigger value="manage">Manage Files</TabsTrigger>
        </TabsList>

        <TabsContent value="upload" className="p-4 border rounded-lg bg-card">
          <FileUploader onUpload={handleFileUpload} />
        </TabsContent>

        <TabsContent value="manage" className="p-4 border rounded-lg bg-card">
          {filteredFiles.length === 0 ? (
            <div className="text-center py-10">
              <p className="text-muted-foreground">
                No files found. Try adjusting your search or upload new files.
              </p>
            </div>
          ) : (
            <FileList 
              files={filteredFiles}
              onDelete={handleFileDelete}
              onDownload={handleDownload}
              onView={handleView}
            />
          )}
        </TabsContent>
      </Tabs>
      
      {/* ✅ FIXED: File Viewer Dialog */}
      <Dialog open={!!viewFile} onOpenChange={(open) => !open && setViewFile(null)}>
        <DialogContent className="max-w-4xl max-h-[90vh] overflow-hidden flex flex-col">
          <DialogHeader>
            <DialogTitle>{viewFile?.name}</DialogTitle>
            <DialogDescription>
              File preview for {viewFile?.name}
            </DialogDescription>
          </DialogHeader>
          
          <div className="flex-1 overflow-auto min-h-[60vh]">
            {viewFile && <FileViewer file={viewFile} />}
          </div>
          
          <div className="flex justify-between items-center pt-4 border-t">
            <div className="text-sm text-gray-500">
              Size: {(viewFile ? viewFile.size / 1024 / 1024 : 0).toFixed(2)} MB | 
              Type: {viewFile?.type}
            </div>
            <div className="flex space-x-2">
              <Button 
                variant="outline" 
                size="sm" 
                onClick={() => viewFile && handleDownload(viewFile)}
              >
                <Download size={16} className="mr-2" />
                Download
              </Button>
              <Button variant="ghost" size="sm" onClick={() => setViewFile(null)}>
                <X size={16} />
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default FileManager;