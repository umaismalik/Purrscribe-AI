import React, { useState, useEffect, useRef, useCallback } from "react";
import { motion } from "framer-motion";
import {
  Search,
  SortDesc,
  SortAsc,
  Calendar,
  FileText,
  Edit,
  Trash2,
  Share,
  Printer,
  Copy,
  Check,
  Phone,
  Mic,
  Play,
  Pause,
  Volume2,
  Download,
  FileAudio,
  AlertCircle,
  Upload,
  RefreshCw,
  Clock 
} from "lucide-react";
import { format } from "date-fns";

import { Button } from "../../components/ui/button";
import { Input } from "../../components/ui/input";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "../../components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "../../components/ui/dialog";
import { Tabs, TabsList, TabsTrigger } from "../../components/ui/tabs";
import { Badge } from "../../components/ui/badge";
import { Separator } from "../../components/ui/separator";
import { Slider } from "../../components/ui/slider";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "../../components/ui/alert-dialog";

import {
  getCallRecordings,
  CallRecording,
} from "../../services/callService";
import { useAuth } from '../../context/AuthContext';

const API_BASE = import.meta.env.VITE_API_BASE || 'http://localhost:5000';
const API_URL = `${API_BASE}/api`;

interface Transcription {
  id: string;
  title: string;
  content: string;
  date: Date;
  format: "SOAP" | "Annual Checkup" | "Raw Text" | "Call Recording" | "Others" | "Medical Notes";
  petName?: string;
  clinicName?: string;
  ownerName?: string;
  duration?: number;
  audioUrl?: string;
  summary?: string;
  isCallRecording?: boolean;
  recordingDuration?: number;
  transcription?: string;
  visitType?: string;
  templateName?: string;
}

interface AudioFile {
  id: string;
  name: string;
  url: string;
  type: string;
  size: number;
  duration?: number;
  uploadDate: string;
  blobName?: string;
  streamUrl?: string;
}

// ✅ IMPROVED AudioPlayer Component with better error handling
const AudioPlayer: React.FC<{ 
  audioUrl: string; 
  duration?: number; 
  fileId?: string;
  fileName?: string;
}> = ({ audioUrl, duration, fileId, fileName }) => {
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [volume, setVolume] = useState(0.7);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [audioDuration, setAudioDuration] = useState(duration || 0);
  
  const audioRef = useRef<HTMLAudioElement>(null);
  const { getToken } = useAuth();

  // ✅ IMPROVED: Better URL handling for both new and old files
  const getStreamingUrl = useCallback(() => {
    if (!fileId) {
      // Agar fileId nahi hai (purani files), direct audioUrl use karen
      console.log('Using direct audio URL:', audioUrl);
      return audioUrl;
    }
    
    const token = getToken();
    // Multiple streaming endpoints try karen
    const streamingUrls = [
      `${API_URL}/audio-files/stream/${fileId}?token=${token}&t=${Date.now()}`,
      `${API_URL}/files/view/${fileId}?token=${token}&t=${Date.now()}`,
      `${API_URL}/audio-files/download/${fileId}?token=${token}`
    ];
    
    return streamingUrls[0]; // Pehla URL try karen
  }, [fileId, audioUrl, getToken]);

  // ✅ IMPROVED: Audio setup with better error handling
  const setupAudio = useCallback(async () => {
    if (!audioRef.current) return;
    
    try {
      setIsLoading(true);
      setError(null);
      
      const streamingUrl = getStreamingUrl();
      console.log('🎵 Setting up audio with URL:', streamingUrl);
      
      // Audio element reset karen
      audioRef.current.pause();
      audioRef.current.src = '';
      audioRef.current.load();
      
      // New source set karen
      audioRef.current.src = streamingUrl;
      audioRef.current.preload = 'metadata';
      audioRef.current.volume = volume;
      
      // Event listeners add karen
      const handleLoad = () => {
        console.log('✅ Audio loaded successfully');
        setIsLoading(false);
        setError(null);
      };
      
      const handleError = (e: Event) => {
        console.error('❌ Audio loading error:', audioRef.current?.error);
        const errorMsg = audioRef.current?.error?.message || 'Audio format not supported';
        setError(`Cannot play: ${errorMsg}`);
        setIsLoading(false);
      };
      
      audioRef.current.addEventListener('loadeddata', handleLoad);
      audioRef.current.addEventListener('canplaythrough', handleLoad);
      audioRef.current.addEventListener('error', handleError);
      
      // Load the audio
      await audioRef.current.load();
      
    } catch (err) {
      console.error('Error setting up audio:', err);
      setError('Failed to load audio file');
      setIsLoading(false);
    }
  }, [getStreamingUrl, volume]);

  useEffect(() => {
    if (!audioUrl && !fileId) return;
    
    setupAudio();
    
    return () => {
      if (audioRef.current) {
        audioRef.current.pause();
        audioRef.current.src = '';
      }
    };
  }, [audioUrl, fileId, setupAudio]);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;

    const updateTime = () => setCurrentTime(audio.currentTime);
    const handleEnd = () => setIsPlaying(false);
    const handleLoadedMetadata = () => {
      setAudioDuration(audio.duration || duration || 0);
      console.log('Audio duration:', audio.duration);
    };
    const handleError = (e: Event) => {
      console.error('Audio playback error:', audio.error);
      setError(`Playback error: ${audio.error?.message || 'Format not supported'}`);
      setIsPlaying(false);
    };
    const handleCanPlay = () => {
      console.log('🎶 Audio can play');
      setError(null);
    };

    audio.addEventListener('timeupdate', updateTime);
    audio.addEventListener('ended', handleEnd);
    audio.addEventListener('loadedmetadata', handleLoadedMetadata);
    audio.addEventListener('error', handleError);
    audio.addEventListener('canplay', handleCanPlay);

    return () => {
      audio.removeEventListener('timeupdate', updateTime);
      audio.removeEventListener('ended', handleEnd);
      audio.removeEventListener('loadedmetadata', handleLoadedMetadata);
      audio.removeEventListener('error', handleError);
      audio.removeEventListener('canplay', handleCanPlay);
    };
  }, [duration]);

  const togglePlayback = async () => {
    if (!audioRef.current) return;

    try {
      if (isPlaying) {
        audioRef.current.pause();
        setIsPlaying(false);
      } else {
        if (error) {
          await setupAudio();
        }
        
        await audioRef.current.play();
        setIsPlaying(true);
        setError(null);
      }
    } catch (playError) {
      console.error('Play error:', playError);
      setError('Cannot play this audio file in browser');
      setIsPlaying(false);
    }
  };

  const handleSeek = (value: number[]) => {
    if (audioRef.current && audioDuration > 0) {
      const seekTime = (value[0] / 100) * audioDuration;
      audioRef.current.currentTime = seekTime;
      setCurrentTime(seekTime);
    }
  };

  const handleVolumeChange = (value: number[]) => {
    const newVolume = value[0];
    setVolume(newVolume);
    if (audioRef.current) {
      audioRef.current.volume = newVolume;
    }
  };

  // ✅ IMPROVED: Download function with multiple endpoints
  const handleDownload = async () => {
    try {
      if (!fileId) {
        // Agar fileId nahi hai, direct audioUrl se download try karen
        if (audioUrl) {
          const a = document.createElement('a');
          a.href = audioUrl;
          a.download = fileName || 'audio_recording';
          document.body.appendChild(a);
          a.click();
          document.body.removeChild(a);
          return;
        }
        throw new Error('No file ID available');
      }
      
      const token = getToken();
      const downloadUrls = [
        `${API_URL}/audio-files/download/${fileId}?token=${token}`,
        `${API_URL}/files/download/${fileId}?token=${token}`,
        `${API_URL}/audio-files/download-token/${fileId}?token=${token}`,
        `${API_URL}/files/view/${fileId}?token=${token}`
      ];
      
      let success = false;
      
      for (const downloadUrl of downloadUrls) {
        try {
          console.log(`🔄 Trying download from: ${downloadUrl}`);
          
          // HEAD request se check karen ke endpoint working hai ya nahi
          const response = await fetch(downloadUrl, { method: 'HEAD' });
          
          if (response.ok) {
            // Direct download link use karen
            const a = document.createElement('a');
            a.href = downloadUrl;
            a.download = fileName || 'audio_recording';
            a.style.display = 'none';
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            
            success = true;
            console.log('✅ Download started successfully');
            break;
          }
        } catch (err) {
          console.log(`❌ Download failed from ${downloadUrl}:`, err);
          continue;
        }
      }
      
      if (!success) {
        // Last resort: audioUrl se direct download
        if (audioUrl && audioUrl.startsWith('http')) {
          const a = document.createElement('a');
          a.href = audioUrl;
          a.download = fileName || 'audio_recording';
          a.style.display = 'none';
          document.body.appendChild(a);
          a.click();
          document.body.removeChild(a);
          success = true;
        }
        
        if (!success) {
          setError('Failed to download - all endpoints failed');
        }
      }
    } catch (err) {
      console.error('❌ Error downloading file:', err);
      setError('Download failed - please try again');
    }
  };

  const formatTime = (seconds: number) => {
    if (!seconds || isNaN(seconds)) return '0:00';
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  const getFileFormat = () => {
    if (!audioUrl && !fileName) return 'Unknown';
    
    const name = fileName || audioUrl;
    const ext = name.split('.').pop()?.toLowerCase();
    
    const formats: { [key: string]: string } = {
      'mp3': 'MP3',
      'wav': 'WAV', 
      'ogg': 'OGG',
      'webm': 'WEBM',
      'm4a': 'M4A',
      'aac': 'AAC',
      'flac': 'FLAC'
    };
    
    return formats[ext || ''] || ext?.toUpperCase() || 'Audio';
  };

  const progress = audioDuration > 0 ? (currentTime / audioDuration) * 100 : 0;
  const displayDuration = audioDuration || duration || 0;

  return (
    <div className="bg-gray-50 rounded-lg p-4 space-y-3 border">
      <audio 
        ref={audioRef}
        className="hidden"
        crossOrigin="anonymous"
      />

      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 px-3 py-2 rounded text-sm">
          <div className="flex items-center gap-2">
            <AlertCircle size={16} />
            <span>{error}</span>
          </div>
          <div className="flex gap-2 mt-2">
            <button 
              onClick={setupAudio}
              className="text-sm text-red-600 underline"
            >
              Try reloading audio
            </button>
            <button 
              onClick={handleDownload}
              className="text-sm text-red-600 underline"
            >
              Download instead
            </button>
          </div>
        </div>
      )}

      {isLoading && (
        <div className="flex items-center gap-2 text-blue-600 text-sm">
          <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-blue-600"></div>
          Loading audio...
        </div>
      )}

      <div className="flex items-center gap-4">
        <Button
          onClick={togglePlayback}
          variant="outline"
          size="icon"
          className="rounded-full h-12 w-12 flex-shrink-0"
          disabled={isLoading || !!error}
        >
          {isLoading ? (
            <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-primary"></div>
          ) : isPlaying ? (
            <Pause size={20} />
          ) : (
            <Play size={20} />
          )}
        </Button>

        <div className="flex-1 space-y-1">
          <div className="flex justify-between text-xs text-gray-500">
            <span>{formatTime(currentTime)}</span>
            <span>{formatTime(displayDuration)}</span>
          </div>
          <Slider
            value={[progress]}
            max={100}
            step={0.1}
            onValueChange={handleSeek}
            className="w-full"
            disabled={!audioRef.current || !!error || isLoading}
          />
        </div>

        <div className="flex items-center gap-2 w-20">
          <Volume2 size={16} className="text-gray-500 flex-shrink-0" />
          <Slider
            value={[volume]}
            max={1}
            step={0.1}
            onValueChange={handleVolumeChange}
            className="w-full"
          />
        </div>

        <Button
          onClick={handleDownload}
          variant="ghost"
          size="icon"
          title="Download audio"
          className="flex-shrink-0"
          disabled={!fileId && !audioUrl}
        >
          <Download size={18} />
        </Button>
      </div>

      <div className="flex items-center justify-between text-xs text-gray-500">
        <div className="flex items-center gap-2">
          <span>Format: {getFileFormat()}</span>
          {displayDuration > 0 && (
            <>
              <span>•</span>
              <span>Duration: {formatTime(displayDuration)}</span>
            </>
          )}
        </div>
        
        {(fileId || audioUrl) && (
          <Badge variant="outline" className="text-xs">
            {fileId ? 'Ready to play' : 'Direct URL'}
          </Badge>
        )}
      </div>
    </div>
  );
};

// ✅ IMPROVED AudioFilesComponent with better download handling
const AudioFilesComponent = () => {
  const [audioFiles, setAudioFiles] = useState<AudioFile[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [currentlyPlaying, setCurrentlyPlaying] = useState<string | null>(null);
  const [audioProgress, setAudioProgress] = useState<{[key: string]: number}>({});
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [fileToDelete, setFileToDelete] = useState<AudioFile | null>(null);
  const [uploading, setUploading] = useState(false);
  const [notification, setNotification] = useState<{message: string, type: 'success' | 'error'} | null>(null);
  const audioRefs = useRef<{[key: string]: HTMLAudioElement}>({});
  const { getToken } = useAuth();

  const showNotification = (message: string, type: 'success' | 'error' = 'success') => {
    setNotification({ message, type });
    setTimeout(() => setNotification(null), 3000);
  };

  const getAudioElement = (fileId: string): HTMLAudioElement => {
    if (!audioRefs.current[fileId]) {
      audioRefs.current[fileId] = new Audio();
    }
    return audioRefs.current[fileId];
  };

  useEffect(() => {
    fetchAudioFiles();
    return () => {
      Object.values(audioRefs.current).forEach(audio => {
        audio.pause();
        audio.src = '';
      });
    };
  }, []);

  const fetchAudioFiles = async () => {
    try {
      setLoading(true);
      setError(null);
      const token = getToken();
      
      const response = await fetch(`${API_URL}/audio-files`, {
        headers: {
          'Authorization': `Bearer ${token}`,
        }
      });
      
      if (!response.ok) {
        throw new Error(`Failed to fetch audio files: ${response.status}`);
      }
      
      const data = await response.json();
      setAudioFiles(data);
    } catch (err) {
      console.error('Error fetching audio files:', err);
      setError(err instanceof Error ? err.message : 'Unknown error');
      showNotification('Failed to load audio files', 'error');
    } finally {
      setLoading(false);
    }
  };

  const handlePlayPause = async (file: AudioFile) => {
    try {
      if (currentlyPlaying === file.id) {
        const audioElement = getAudioElement(file.id);
        audioElement.pause();
        setCurrentlyPlaying(null);
        return;
      }
      
      if (currentlyPlaying) {
        const currentAudio = getAudioElement(currentlyPlaying);
        currentAudio.pause();
        currentAudio.currentTime = 0;
      }

      const token = getToken();
      const audioUrl = `${API_URL}/audio-files/stream/${file.id}?token=${token}`;
      
      console.log('Playing audio via streaming URL:', file.name);

      const newAudio = new Audio();
      newAudio.preload = 'auto';
      newAudio.src = audioUrl;

      newAudio.onerror = (e) => {
        console.error('Audio error:', newAudio.error, 'for file:', file.name);
        showNotification(`Cannot play ${file.name}: ${newAudio.error?.message || 'Format not supported'}`, 'error');
        setCurrentlyPlaying(null);
      };

      newAudio.ontimeupdate = () => {
        if (newAudio.duration && !isNaN(newAudio.duration)) {
          setAudioProgress(prev => ({
            ...prev,
            [file.id]: (newAudio.currentTime / newAudio.duration) * 100
          }));
        }
      };

      newAudio.onended = () => {
        setCurrentlyPlaying(null);
        setAudioProgress(prev => ({
          ...prev,
          [file.id]: 0
        }));
      };

      audioRefs.current[file.id] = newAudio;

      try {
        await newAudio.play();
        setCurrentlyPlaying(file.id);
      } catch (playError) {
        console.error('Play error:', playError);
        showNotification('Cannot play this audio file in browser. Try downloading instead.', 'error');
      }

    } catch (error) {
      console.error('Error playing audio:', error);
      showNotification('Error playing audio file', 'error');
    }
  };

  const handleSeek = (fileId: string, value: number[]) => {
    const audioElement = getAudioElement(fileId);
    if (audioElement && audioElement.duration && !isNaN(audioElement.duration)) {
      audioElement.currentTime = (value[0] / 100) * audioElement.duration;
      setAudioProgress(prev => ({
        ...prev,
        [fileId]: value[0]
      }));
    }
  };

  // ✅ IMPROVED: Download function with multiple endpoints
  const handleDownload = async (file: AudioFile) => {
    try {
      const token = getToken();
      
      // Multiple download endpoints try karen
      const downloadUrls = [
        `${API_URL}/audio-files/download/${file.id}?token=${token}`,
        `${API_URL}/files/download/${file.id}?token=${token}`,
        `${API_URL}/files/access/${file.id}?token=${token}`,
        `${API_URL}/audio-files/download-token/${file.id}?token=${token}`
      ];
      
      let success = false;
      
      for (const downloadUrl of downloadUrls) {
        try {
          console.log(`🔄 Trying download from: ${downloadUrl}`);
          
          // Test if endpoint works
          const testResponse = await fetch(downloadUrl, { 
            method: 'HEAD',
            headers: { 'Authorization': `Bearer ${token}` }
          });
          
          if (testResponse.ok) {
            const a = document.createElement('a');
            a.href = downloadUrl;
            a.download = file.name;
            a.style.display = 'none';
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            
            success = true;
            showNotification('Download started', 'success');
            console.log('✅ Download successful from:', downloadUrl);
            break;
          }
        } catch (err) {
          console.log(`❌ Failed from ${downloadUrl}:`, err);
          continue;
        }
      }
      
      if (!success) {
        // Last attempt: direct URL access
        if (file.url && (file.url.startsWith('http') || file.url.startsWith('/uploads'))) {
          const directUrl = file.url.startsWith('/uploads') 
            ? `${window.location.origin}${file.url}`
            : file.url;
          
          const a = document.createElement('a');
          a.href = directUrl;
          a.download = file.name;
          a.style.display = 'none';
          document.body.appendChild(a);
          a.click();
          document.body.removeChild(a);
          
          showNotification('Download started via direct link', 'success');
        } else {
          showNotification('Failed to download - no working endpoint found', 'error');
        }
      }
    } catch (err) {
      console.error('❌ Error downloading file:', err);
      showNotification('Download failed - please try again', 'error');
    }
  };

  const handleDelete = async () => {
    if (!fileToDelete) return;
    
    try {
      const token = getToken();
      const response = await fetch(`${API_URL}/audio-files/${fileToDelete.id}`, {
        method: 'DELETE',
        headers: {
          'Authorization': `Bearer ${token}`,
        }
      });
      
      if (!response.ok) {
        throw new Error('Failed to delete file');
      }
      
      setAudioFiles(prev => prev.filter(file => file.id !== fileToDelete.id));
      setDeleteDialogOpen(false);
      setFileToDelete(null);
      showNotification('File deleted successfully');
    } catch (err) {
      console.error('Error deleting file:', err);
      showNotification('Failed to delete file', 'error');
    }
  };

  const handleFileUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    try {
      const file = event.target.files?.[0];
      if (!file) return;

      if (!file.type.startsWith('audio/')) {
        showNotification('Please select an audio file', 'error');
        return;
      }

      setUploading(true);
      const token = getToken();
      const formData = new FormData();
      formData.append('audio', file);

      const response = await fetch(`${API_URL}/audio-files/upload`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`
        },
        body: formData
      });

      const result = await response.json();

      if (response.ok) {
        showNotification('File uploaded successfully!');
        fetchAudioFiles();
      } else {
        showNotification('Upload failed: ' + (result.error || 'Unknown error'), 'error');
      }
    } catch (error) {
      console.error('Upload error:', error);
      showNotification('Upload failed', 'error');
    } finally {
      setUploading(false);
      if (event.target) event.target.value = '';
    }
  };

  const formatFileSize = (bytes: number): string => {
    if (!bytes) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  const formatDuration = (seconds?: number): string => {
    if (!seconds) return '--:--';
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  if (loading) {
    return (
      <div className="flex justify-center items-center h-64">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary"></div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {notification && (
        <div className={`fixed top-4 right-4 z-50 p-4 rounded-md shadow-lg ${
          notification.type === 'success' 
            ? 'bg-green-100 text-green-800 border border-green-200' 
            : 'bg-red-100 text-red-800 border border-red-200'
        }`}>
          <div className="flex items-center gap-2">
            {notification.type === 'success' ? (
              <span>✓</span>
            ) : (
              <AlertCircle className="h-4 w-4" />
            )}
            <span>{notification.message}</span>
          </div>
        </div>
      )}

      <div className="flex justify-between items-center">
        <h2 className="text-2xl font-bold">Audio Files</h2>
        <div className="flex gap-2">
          <label htmlFor="audio-upload" className="cursor-pointer">
            <input
              id="audio-upload"
              type="file"
              accept="audio/*"
              onChange={handleFileUpload}
              className="hidden"
              disabled={uploading}
            />
            <Button variant="outline" asChild disabled={uploading}>
              <div className="flex items-center gap-2">
                <Upload className="h-4 w-4" />
                Upload Audio
              </div>
            </Button>
          </label>
          <Button variant="outline" onClick={fetchAudioFiles} disabled={loading}>
            <RefreshCw className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {error && (
        <div className="bg-destructive/15 text-destructive p-4 rounded-md">
          <div className="flex items-center gap-2">
            <AlertCircle className="h-4 w-4" />
            <span>{error}</span>
          </div>
        </div>
      )}

      {audioFiles.length === 0 ? (
        <div className="flex flex-col items-center justify-center h-64 text-muted-foreground">
          <FileAudio className="h-16 w-16 mb-4" />
          <p className="text-lg font-medium">No audio files yet</p>
          <p className="text-sm">Upload audio files to see them here</p>
        </div>
      ) : (
        <div className="grid gap-4">
          {audioFiles.map((file) => (
            <Card key={file.id} className="overflow-hidden">
              <CardHeader className="pb-3">
                <CardTitle className="text-lg flex items-center gap-2">
                  <FileAudio className="h-5 w-5 text-primary" />
                  <span className="truncate">{file.name}</span>
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex items-center justify-between text-sm text-muted-foreground">
                  <div className="flex items-center gap-4 flex-wrap">
                    <div className="flex items-center gap-1">
                      <Calendar className="h-4 w-4" />
                      <span>{format(new Date(file.uploadDate), "MMM d, yyyy")}</span>
                    </div>
                    <div className="flex items-center gap-1">
                      <span>{formatFileSize(file.size)}</span>
                    </div>
                    {file.duration && (
                      <div className="flex items-center gap-1">
                        <Clock className="h-4 w-4" />
                        <span>{formatDuration(file.duration)}</span>
                      </div>
                    )}
                  </div>
                </div>

                <div className="space-y-2">
                  <div className="flex items-center gap-3">
                    <Button
                      variant="outline"
                      size="icon"
                      onClick={() => handlePlayPause(file)}
                      className="rounded-full h-10 w-10"
                      disabled={uploading}
                      title="Play audio"
                    >
                      {currentlyPlaying === file.id ? (
                        <Pause className="h-4 w-4" />
                      ) : (
                        <Play className="h-4 w-4" />
                      )}
                    </Button>

                    <div className="flex-1 space-y-1">
                      <Slider
                        value={[audioProgress[file.id] || 0]}
                        max={100}
                        step={1}
                        onValueChange={(value) => handleSeek(file.id, value)}
                        className="w-full"
                        disabled={!currentlyPlaying}
                      />
                    </div>

                    <div className="flex items-center gap-2">
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => handleDownload(file)}
                        title="Download"
                        className="flex-shrink-0"
                      >
                        <Download className="h-4 w-4" />
                      </Button>
                      
                      <AlertDialog open={deleteDialogOpen && fileToDelete?.id === file.id} onOpenChange={setDeleteDialogOpen}>
                        <AlertDialogTrigger asChild>
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => setFileToDelete(file)}
                            title="Delete"
                            className="text-destructive hover:text-destructive"
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </AlertDialogTrigger>
                        <AlertDialogContent>
                          <AlertDialogHeader>
                            <AlertDialogTitle>Delete Audio File</AlertDialogTitle>
                            <AlertDialogDescription>
                              Are you sure you want to delete "{file.name}"? This action cannot be undone.
                            </AlertDialogDescription>
                          </AlertDialogHeader>
                          <AlertDialogFooter>
                            <AlertDialogCancel>Cancel</AlertDialogCancel>
                            <AlertDialogAction
                              onClick={handleDelete}
                              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                            >
                              Delete
                            </AlertDialogAction>
                          </AlertDialogFooter>
                        </AlertDialogContent>
                      </AlertDialog>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
};

const TranscriptionHistory: React.FC = () => {
  const [showInput, setShowInput] = useState(false); 
  const [selectedTab, setSelectedTab] = useState("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [formatFilter, setFormatFilter] = useState<string>("all");
  const [sortOrder, setSortOrder] = useState<"asc" | "desc">("desc");
  const [selectedTranscription, setSelectedTranscription] = useState<Transcription | null>(null);
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);
  const [isDetailDialogOpen, setIsDetailDialogOpen] = useState(false);
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);
  const [isShareDialogOpen, setIsShareDialogOpen] = useState(false);
  const [shareLink, setShareLink] = useState("https://purrscribe.ai/share/sample");
  const [linkCopied, setLinkCopied] = useState(false);
  const [callRecordings, setCallRecordings] = useState<CallRecording[]>([]);
  const [databaseTranscriptions, setDatabaseTranscriptions] = useState<Transcription[]>([]);
  const { isAuthenticated, getToken } = useAuth();
  const [editedTranscription, setEditedTranscription] = useState<Transcription | null>(null);

  useEffect(() => {
    const loadAllTranscriptions = async () => {
      try {
        const recordings = await getCallRecordings();
        setCallRecordings(recordings);
        if (isAuthenticated) {
          const token = getToken();
          if (token) {
            const response = await fetch(`${API_URL}/transcriptions`, {
              headers: {
                'Authorization': `Bearer ${token}`
              }
            });
            
            if (response.ok) {
              const data = await response.json();
              const dbTranscriptions: Transcription[] = data.transcriptions.map((t: any) => ({
                id: t.id,
                title: t.title,
                content: t.content,
                date: new Date(t.created_at),
                format: t.category as any,
                petName: t.pet_name,
                clinicName: t.clinic_name,
                visitType: t.visit_type,
                templateName: t.template_name,
                recordingDuration: t.recording_duration,
                audioUrl: t.audio_url 
              }));
              setDatabaseTranscriptions(dbTranscriptions);
            }
          }
        }
      } catch (error) {
        console.error("Failed to load transcriptions:", error);
      }
    };

    loadAllTranscriptions();
  }, [isAuthenticated, getToken]);

  const callRecordingTranscriptions: Transcription[] = callRecordings.map(
    (recording) => ({
      id: recording.id,
      title: `${recording.petName} - Owner Call`,
      content: recording.transcription || "Transcription pending...",
      date: recording.date,
      format: "Call Recording",
      petName: recording.petName,
      ownerName: recording.ownerName,
      duration: recording.duration,
      audioUrl: recording.audioUrl,
      summary: recording.summary,
      isCallRecording: true,
    })
  );

  const allTranscriptions = [
    ...databaseTranscriptions,
    ...callRecordingTranscriptions
  ];

  const filteredTranscriptions = allTranscriptions
  .filter((transcription) => {
    const matchesSearch =
      transcription.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
      transcription.content.toLowerCase().includes(searchQuery.toLowerCase()) ||
      (transcription.petName && transcription.petName.toLowerCase().includes(searchQuery.toLowerCase())) ||
      (transcription.clinicName && transcription.clinicName.toLowerCase().includes(searchQuery.toLowerCase())) ||
      (transcription.ownerName && transcription.ownerName.toLowerCase().includes(searchQuery.toLowerCase())) ||
      (transcription.visitType && transcription.visitType.toLowerCase().includes(searchQuery.toLowerCase())) ||
      false;

    const matchesFormat =
      formatFilter === "all" || 
      (formatFilter === "Soap" && transcription.format === "SOAP") ||
      (formatFilter === "Annual Checkup" && transcription.format === "Annual Checkup") ||
      (formatFilter === "Raw Text" && transcription.format === "Raw Text") ||
      (formatFilter === "Call Recordings" && transcription.format === "Call Recording") ||
      (formatFilter === "Others" && transcription.format === "Others") ||
      (formatFilter === "Medical Notes" && transcription.format === "Medical Notes");

    return matchesSearch && matchesFormat;
  })
 .sort((a, b) => {
  try {
    const dateA = new Date(a.date).getTime();
    const dateB = new Date(b.date).getTime();
    
    if (sortOrder === "asc") {
      return dateA - dateB;
    } else {
      return dateB - dateA;
    }
  } catch (error) {
    console.error("Date sorting error:", error);
    return 0; // Fallback: no sorting if dates are invalid
  }
});

  const handleTranscriptionClick = (transcription: Transcription) => {
    setSelectedTranscription(transcription);
    setIsDetailDialogOpen(true);
  };

  const handleDeleteClick = () => {
    if (!selectedTranscription) return;
  
    if (isAuthenticated) {
      const token = getToken();
      if (token) {
        fetch(`${API_URL}/transcriptions/${selectedTranscription.id}`, {
          method: 'DELETE',
          headers: {
            'Authorization': `Bearer ${token}`
          }
        }).catch(error => {
          console.error("Failed to delete from database:", error);
        });
      }
    }
    setDatabaseTranscriptions(prev => 
      prev.filter(t => t.id !== selectedTranscription.id)
    );
    setCallRecordings(prev => 
      prev.filter(r => r.id !== selectedTranscription.id)
    );
    setIsDeleteDialogOpen(false);
    setIsDetailDialogOpen(false);
  };

  const handleShareClick = () => {
    setShareLink(
      "https://vet-transcribe.app/share/" +
        (selectedTranscription?.id || "sample")
    );
    setIsShareDialogOpen(true);
  };

  const handlePrintClick = () => {
    if (selectedTranscription) {
      const printWindow = window.open("", "_blank");
      if (printWindow) {
        printWindow.document.write(`
          <html>
            <head>
              <title>${selectedTranscription.title} - Print View</title>
              <style>
                body { font-family: Arial, sans-serif; margin: 40px; }
                h1 { color: #333; }
                .meta { color: #666; margin-bottom: 20px; }
                .content { line-height: 1.6; }
              </style>
            </head>
            <body>
              <h1>${selectedTranscription.title}</h1>
              <div class="meta">
                <p>Date: ${format(selectedTranscription.date, "MMMM d, yyyy")}</p>
                <p>Format: ${selectedTranscription.format}</p>
                ${selectedTranscription.petName ? `<p>Pet: ${selectedTranscription.petName}</p>` : ""}
                ${selectedTranscription.clinicName ? `<p>Clinic: ${selectedTranscription.clinicName}</p>` : ""}
                ${selectedTranscription.visitType ? `<p>Visit Type: ${selectedTranscription.visitType}</p>` : ""}
              </div>
              <div class="content">
                ${selectedTranscription.content.replace(/\n/g, "<br>")}
              </div>
            </body>
          </html>
        `);
        printWindow.document.close();
        printWindow.focus();
        printWindow.print();
      }
    }
  };

  const handleCopyLink = () => {
    navigator.clipboard
      .writeText(shareLink)
      .then(() => {
        setLinkCopied(true);
        setTimeout(() => setLinkCopied(false), 3000);
      })
      .catch((err) => {
        console.error("Failed to copy link: ", err);
      });
  };

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins.toString().padStart(2, "0")}:${secs.toString().padStart(2, "0")}`;
  };

  const getFormatBadgeColor = (format: string) => {
    if (format === "SOAP") {
      return "bg-blue-100 text-blue-800";
    } else if (format === "Annual Checkup") {
      return "bg-green-100 text-green-800";
    } else if (format === "Raw Text") {
      return "bg-purple-100 text-purple-800";
    } else if (format === "Call Recording") {
      return "bg-purrscribe-blue/20 text-purrscribe-blue";
    } else if (format === "Medical Notes") {
      return "bg-orange-100 text-orange-800";
    } else if (format === "Others") {
      return "bg-gray-100 text-gray-800";
    } else {
      return "bg-gray-100 text-gray-800";
    }
  };

  const handleEditClick = (transcription: Transcription) => {
    setSelectedTranscription(transcription);
    setEditedTranscription({...transcription});
    setIsEditDialogOpen(true);
  };

  const handleEditSave = async () => {
    if (!editedTranscription) return;
    
    try {
      if (isAuthenticated) {
        const token = getToken();
        if (token) {
          const updateData = {
            title: editedTranscription.title,
            content: editedTranscription.content,
            category: editedTranscription.format,
            pet_name: editedTranscription.petName || null,
            clinic_name: editedTranscription.clinicName || null,
            visit_type: editedTranscription.visitType || null
          };

          const response = await fetch(`${API_URL}/transcriptions/${editedTranscription.id}`, {
            method: 'PUT',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${token}`
            },
            body: JSON.stringify(updateData)
          });
          
          if (!response.ok) {
            const errorText = await response.text();
            throw new Error(`Database update failed: ${errorText}`);
          }
          
          const result = await response.json();
          setDatabaseTranscriptions(prev => 
            prev.map(t => t.id === editedTranscription.id ? 
              { ...editedTranscription, ...result.transcription } : t
            )
          );
        }
      }
      setSelectedTranscription(editedTranscription);
      
      setIsEditDialogOpen(false);
      alert("Changes saved successfully!");
      
    } catch (error: any) {
      console.error("Error saving changes:", error);
      alert("Failed to save changes: " + error.message);
    }
  };

  // ✅ NEW: Function to migrate old files
  const migrateOldFiles = async () => {
    try {
      const token = getToken();
      const response = await fetch(`${API_URL}/files/migrate-old-files`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });
      
      if (response.ok) {
        const result = await response.json();
        alert(`Successfully migrated ${result.files.length} audio files`);
        // Refresh the audio files list
        window.location.reload();
      } else {
        throw new Error('Migration failed');
      }
    } catch (error) {
      console.error('Migration error:', error);
      alert('Failed to migrate old files');
    }
  };

  return (
    <div className="bg-background min-h-screen p-0 sm:p-4 bg-gradient-to-b from-white to-primary-50">
      <div className="flex flex-col space-y-6">
        <div className="flex flex-wrap justify-between items-center gap-4 mb-4">
          <div className="bg-gradient-to-r from-[#F0F4FF] to-[#E0ECFF] rounded-xl w-[100%] p-6 shadow-sm mb-8">
            <motion.h1
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.6, ease: "easeOut" }}
              className="text-2xl font-bold"
            >
              Transcription History
            </motion.h1>
          </div>
          <div className="flex justify-between items-center w-full flex-wrap gap-4 relative">
            <Tabs defaultValue="all" onValueChange={setFormatFilter}>
              <div className="hidden sm:flex">
                <TabsList className="flex flex-wrap gap-2">
                  <TabsTrigger value="all">All</TabsTrigger>
                  <TabsTrigger value="Soap">SOAP</TabsTrigger>
                  <TabsTrigger value="Annual Checkup">Annual Checkup</TabsTrigger>
                  <TabsTrigger value="Raw Text">Raw Text</TabsTrigger>
                  <TabsTrigger value="Call Recordings">Call Recordings</TabsTrigger>
                  <TabsTrigger value="Medical Notes">Medical Notes</TabsTrigger>
                  <TabsTrigger value="Others">Others</TabsTrigger>
                </TabsList>
              </div>
              <div className="sm:hidden relative z-10">
                <TabsList>
                  <details className="relative">
                    <summary className="cursor-pointer border px-4 py-2 rounded bg-white shadow flex items-center justify-between w-[200px]">
                      <span>Filter Options</span>
                      <svg className="w-4 h-4" viewBox="0 0 20 20" fill="currentColor">
                        <path
                          fillRule="evenodd"
                          d="M5.23 7.21a.75.75 0 011.06.02L10 10.94l3.71-3.71a.75.75 0 111.06 1.06l-4.24 4.24a.75.75 0 01-1.06 0L5.21 8.29a.75.75 0 01.02-1.08z"
                          clipRule="evenodd"
                        />
                      </svg>
                    </summary>
                    <div
                      className="absolute w-[200px] left-0 z-20 rounded border bg-white shadow flex flex-col 
                                 max-[450px]:bottom-full max-[450px]:mb-2 
                                 sm:top-full sm:mt-1"
                    >
                      <TabsTrigger value="all" className="text-left px-4 py-2 hover:bg-gray-100">All</TabsTrigger>
                      <TabsTrigger value="Soap" className="text-left px-4 py-2 hover:bg-gray-100">SOAP</TabsTrigger>
                      <TabsTrigger value="Annual Checkup" className="text-left px-4 py-2 hover:bg-gray-100">Annual Checkup</TabsTrigger>
                      <TabsTrigger value="Raw Text" className="text-left px-4 py-2 hover:bg-gray-100">Raw Text</TabsTrigger>
                      <TabsTrigger value="Call Recordings" className="text-left px-4 py-2 hover:bg-gray-100">Call Recordings</TabsTrigger>
                      <TabsTrigger value="Medical Notes" className="text-left px-4 py-2 hover:bg-gray-100">Medical Notes</TabsTrigger>
                      <TabsTrigger value="Others" className="text-left px-4 py-2 hover:bg-gray-100">Others</TabsTrigger>
                    </div>
                  </details>
                </TabsList>
              </div>
            </Tabs>
            <div className="relative z-20 sm:ml-auto w-full sm:w-auto">
              <Search
                onClick={() => setShowInput(!showInput)}
                className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 sm:hidden z-30"
                size={18}
              />
              <Input
                placeholder="Search transcriptions..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className={`transition-all duration-300 pl-10 ${
                  showInput ? "w-full sm:w-72" : "w-10 sm:w-72"
                }`}
                style={{
                  paddingLeft: "2.5rem",
                }}
              />
            </div>
          </div>
        </div>
        <div className="flex justify-end mt-[-2rem] gap-2"> 
          <Button
            variant="outline"
            onClick={() => setSortOrder(sortOrder === "asc" ? "desc" : "asc")}
            className="flex items-center gap-2"
          >
            {sortOrder === "asc" ? <SortAsc size={16} /> : <SortDesc size={16} />}
            {sortOrder === "asc" ? "Oldest First" : "Newest First"}
          </Button>
          
          {/* ✅ NEW: Migrate Old Files Button */}
          {formatFilter === "Call Recordings" && (
            <Button
              variant="outline"
              onClick={migrateOldFiles}
              className="flex items-center gap-2"
              title="Migrate old audio files to new system"
            >
              <RefreshCw size={16} />
              Migrate Old Files
            </Button>
          )}
        </div>
        {formatFilter === "Call Recordings" ? (
          <AudioFilesComponent />
        ) : (
          <div className="grid gap-4">
            {filteredTranscriptions.length > 0 ? (
              filteredTranscriptions.map((transcription) => (
                <motion.div
                  key={transcription.id}
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.4, ease: "easeOut" }}
                >
                  <Card
                    onClick={() => handleTranscriptionClick(transcription)}
                    className="cursor-pointer transition-all duration-300 ease-in-out hover:shadow-lg hover:scale-[1.02] shadow-xl border border-gray-200 rounded-xl bg-white"
                  >
                    <CardContent className="p-5 shadow-md hover:shadow-lg transition-shadow duration-300">
                      <div className="flex justify-between items-start">
                        <div className="w-full">
                          <h3 className="font-semibold text-lg text-gray-800">
                            {transcription.title}
                            {transcription.isCallRecording && (
                              <Phone
                                size={16}
                                className="inline-block ml-2 text-purrscribe-blue"
                              />
                            )}
                          </h3>

                          <div className="flex flex-wrap items-center gap-2 text-sm text-gray-500 mt-2">
                            <div className="flex items-center gap-1">
                              <Calendar size={14} />
                              <span>{format(transcription.date, "MMM d, yyyy")}</span>
                            </div>

                            <Badge className={getFormatBadgeColor(transcription.format)}>
                              {transcription.format === "Call Recording" ? (
                                <div className="flex items-center gap-1">
                                  <Phone size={12} />
                                  <span>Call Recordings</span>
                                </div>
                              ) : (
                                transcription.format
                              )}
                            </Badge>

                            {transcription.duration && (
                              <span className="text-xs text-gray-400">
                                {formatTime(transcription.duration)}
                              </span>
                            )}
                          </div>

                          {(transcription.petName ||
                            transcription.clinicName ||
                            transcription.ownerName ||
                            transcription.visitType) && (
                            <div className="flex flex-wrap gap-2 mt-2 text-sm text-gray-500">
                              {transcription.petName && <span>Pet: {transcription.petName}</span>}
                              {transcription.petName &&
                                (transcription.clinicName || transcription.ownerName || transcription.visitType) && (
                                  <span>•</span>
                                )}
                              {transcription.clinicName && (
                                <span>Clinic: {transcription.clinicName}</span>
                              )}
                              {transcription.clinicName && transcription.ownerName && (
                                <span>•</span>
                              )}
                              {transcription.ownerName && (
                                <span>Owner: {transcription.ownerName}</span>
                              )}
                              {transcription.ownerName && transcription.visitType && (
                                <span>•</span>
                              )}
                              {transcription.visitType && (
                                <span>Visit: {transcription.visitType}</span>
                              )}
                            </div>
                          )}
                        </div>

                        <div className="ml-4 mt-1">
                          {transcription.isCallRecording ? (
                            <Mic size={20} className="text-purrscribe-blue" />
                          ) : (
                            <FileText size={20} className="text-gray-400" />
                          )}
                        </div>
                      </div>

                      <p className="mt-4 text-gray-600 text-sm line-clamp-2">
                        {transcription.content}
                      </p>
                    </CardContent>
                  </Card>
                </motion.div>
              ))
            ) : (
              <div className="text-center py-8 text-gray-500">
                <FileText size={48} className="mx-auto mb-4 text-gray-300" />
                <h3 className="text-lg font-medium">No transcriptions found</h3>
                <p>Try adjusting your search or filters</p>
              </div>
            )}
          </div>
        )}
      </div>

      <Dialog open={isDetailDialogOpen} onOpenChange={setIsDetailDialogOpen}>
        <DialogContent className="max-w-3xl bg-[#F1F5F9] transition-opacity">
          <DialogHeader>
            <DialogTitle>{selectedTranscription?.title}</DialogTitle>
          </DialogHeader>
          
          {/* ✅ IMPROVED: Audio Player with better error handling */}
          {selectedTranscription?.audioUrl && (
            <div className="mt-4">
              <h4 className="text-sm font-medium mb-2">Audio Recording</h4>
              <AudioPlayer 
                audioUrl={selectedTranscription.audioUrl} 
                duration={selectedTranscription.recordingDuration || selectedTranscription.duration}
                fileId={selectedTranscription.id}
                fileName={`${selectedTranscription.title}.webm`}
              />
            </div>
          )}
          
          <div className="flex items-center gap-2 text-sm text-gray-500 mt-4">
            <Calendar size={14} />
            <span>
              {selectedTranscription &&
                format(selectedTranscription.date, "MMMM d, yyyy")}
            </span>
            {selectedTranscription && (
              <Badge
                className={getFormatBadgeColor(selectedTranscription.format)}
              >
                {selectedTranscription.format}
              </Badge>
            )}
          </div>
          {selectedTranscription &&
            (selectedTranscription.petName ||
              selectedTranscription.clinicName ||
              selectedTranscription.ownerName ||
              selectedTranscription.visitType) && (
              <div className="flex gap-2 mt-1 text-sm text-gray-500">
                {selectedTranscription.petName && (
                  <span>Pet: {selectedTranscription.petName}</span>
                )}
                {selectedTranscription.petName &&
                  (selectedTranscription.clinicName ||
                    selectedTranscription.ownerName ||
                    selectedTranscription.visitType) && <span>•</span>}
                {selectedTranscription.clinicName && (
                  <span>Clinic: {selectedTranscription.clinicName}</span>
                )}
                {selectedTranscription.clinicName &&
                  selectedTranscription.ownerName && <span>•</span>}
                {selectedTranscription.ownerName && (
                  <span>Owner: {selectedTranscription.ownerName}</span>
                )}
                {selectedTranscription.ownerName &&
                  selectedTranscription.visitType && <span>•</span>}
                {selectedTranscription.visitType && (
                  <span>Visit: {selectedTranscription.visitType}</span>
                )}
              </div>
            )}
          <Separator className="my-4" />

          <div className="max-h-96 overflow-y-auto">
            <p className="whitespace-pre-line">
              {selectedTranscription?.content}
            </p>
          </div>
          <DialogFooter className="flex justify-between items-center">
            <div className="flex gap-2">
              <Button
                variant="outline"
                size="sm"
                className="flex items-center gap-1"
                onClick={() => {
                  setEditedTranscription({...selectedTranscription!});
                  setIsEditDialogOpen(true);
                }}
              >
                <Edit size={16} />
                Edit
              </Button>
              <AlertDialog
                open={isDeleteDialogOpen}
                onOpenChange={setIsDeleteDialogOpen}
              >
                <AlertDialogTrigger asChild>
                  <Button
                    variant="outline"
                    size="sm"
                    className="flex items-center gap-1 text-red-600 hover:text-red-700 hover:bg-red-50"
                  >
                    <Trash2 size={16} />
                    Delete
                  </Button>
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>Are you sure?</AlertDialogTitle>
                    <AlertDialogDescription>
                      This action cannot be undone. This will permanently delete
                      the transcription.
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel>Cancel</AlertDialogCancel>
                    <AlertDialogAction
                      onClick={handleDeleteClick}
                      className="bg-red-600 hover:bg-red-700"
                    >
                      Delete
                    </AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            </div>
            <div className="flex gap-2">
              <Button
                variant="outline"
                size="sm"
                className="flex items-center gap-1"
                onClick={handleShareClick}
              >
                <Share size={16} />
                Share
              </Button>
              <Button
                variant="outline"
                size="sm"
                className="flex items-center gap-1"
                onClick={handlePrintClick}
              >
                <Printer size={16} />
                Print
              </Button>
            </div>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={isEditDialogOpen} onOpenChange={setIsEditDialogOpen}>
        <DialogContent className="max-w-3xl">
          <DialogHeader>
            <DialogTitle>Edit Transcription</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <label htmlFor="edit-title" className="text-sm font-medium">
                Title
              </label>
              <Input
                id="edit-title"
                value={editedTranscription?.title || ''}
                onChange={(e) => setEditedTranscription(prev => prev ? {...prev, title: e.target.value} : null)}
                className="w-full"
              />
            </div>
            <div className="space-y-2">
              <label htmlFor="edit-content" className="text-sm font-medium">
                Content
              </label>
              <textarea
                id="edit-content"
                value={editedTranscription?.content || ''}
                onChange={(e) => setEditedTranscription(prev => prev ? {...prev, content: e.target.value} : null)}
                className="w-full min-h-[200px] p-2 border rounded-md"
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <label htmlFor="edit-pet" className="text-sm font-medium">
                  Pet Name
                </label>
                <Input
                  id="edit-pet"
                  value={editedTranscription?.petName || ''}
                  onChange={(e) => setEditedTranscription(prev => prev ? {...prev, petName: e.target.value} : null)}
                  className="w-full"
                />
              </div>
              <div className="space-y-2">
                <label htmlFor="edit-clinic" className="text-sm font-medium">
                  Clinic Name
                </label>
                <Input
                  id="edit-clinic"
                  value={editedTranscription?.clinicName || ''}
                  onChange={(e) => setEditedTranscription(prev => prev ? {...prev, clinicName: e.target.value} : null)}
                  className="w-full"
                />
              </div>
            </div>
            <div className="space-y-2">
              <label htmlFor="edit-visit-type" className="text-sm font-medium">
                Visit Type
              </label>
              <Input
                id="edit-visit-type"
                value={editedTranscription?.visitType || ''}
                onChange={(e) => setEditedTranscription(prev => prev ? {...prev, visitType: e.target.value} : null)}
                className="w-full"
              />
            </div>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setIsEditDialogOpen(false)}
            >
              Cancel
            </Button>
            <Button onClick={handleEditSave}>
              Save Changes
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={isShareDialogOpen} onOpenChange={setIsShareDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Share Transcription</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">
              Share this link with others to give them access to this
              transcription:
            </p>
            <div className="flex items-center space-x-2">
              <Input value={shareLink} readOnly className="flex-1" />
              <Button size="icon" variant="outline" onClick={handleCopyLink}>
                {linkCopied ? <Check size={16} /> : <Copy size={16} />}
              </Button>
            </div>
            {linkCopied && (
              <p className="text-sm text-green-600">
                Link copied to clipboard!
              </p>
            )}
          </div>
          <DialogFooter>
            <Button onClick={() => setIsShareDialogOpen(false)}>Close</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default TranscriptionHistory;