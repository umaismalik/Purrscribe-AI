import React, { useState, useEffect } from "react";
import { motion } from "framer-motion";
import { format } from "date-fns";
import {
  getCallRecordings,
  transcribeCallRecording,
  summarizeTranscription,
  deleteCallRecording,
  approveTranscription,
  rejectTranscription,
  createCallRecording,
  updateCallRecordingDuration,
  CallRecording,
} from "../../services/callService";
import { getPets } from "../../services/petService";
import { Pet } from "../../types/petTypes";
import {
  Search,
  Play,
  Pause,
  MoreVertical,
  Trash2,
  Share,
  Printer,
  Download,
  FileText,
  Phone,
  Plus,
  RefreshCw,
  User,
  Dog,
  Calendar,
  Clock
} from "lucide-react";
import CallHistoryHeader from "./CallHistoryHeader";
import CallHistorySearch from "./CallHistorySearch";
import CallRecordingCard from "./CallRecordingCard";
import CallDetailsDialog from "./CallDetailsDialog";
import DeleteConfirmationDialog from "./DeleteConfirmationDialog";
import NewCallDialog from "./NewCallDialog";
import LoadingState from "./LoadingState";
import EmptyState from "./EmptyState";
import { useAuth } from "../../context/AuthContext";

const API_BASE = import.meta.env.VITE_API_BASE || 'https://mliapi.ddns.net:5000';

// Extended interface to include pet information
interface ExtendedCallRecording extends CallRecording {
  petInfo?: {
    id: string | number;
    name: string;
    species: string;
    breed: string;
    age: string;
    owner: string;
    phoneNumber: string;
    imageUrl?: string;
    notes?: string;
  };
}

const CallHistory = () => {
  const [recordings, setRecordings] = useState<ExtendedCallRecording[]>([]);
  const [pets, setPets] = useState<Pet[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isPetsLoading, setIsPetsLoading] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedRecording, setSelectedRecording] = useState<ExtendedCallRecording | null>(null);
  const [isDetailsOpen, setIsDetailsOpen] = useState(false);
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);
  const [isTranscribing, setIsTranscribing] = useState(false);
  const [isSummarizing, setIsSummarizing] = useState(false);
  const [isApproving, setIsApproving] = useState(false);
  const [isRejecting, setIsRejecting] = useState(false);
  const [audioPlaying, setAudioPlaying] = useState<string | null>(null);
  const audioRef = React.useRef<HTMLAudioElement | null>(null);
  const [isNewCallDialogOpen, setIsNewCallDialogOpen] = useState(false);
  const [selectedPet, setSelectedPet] = useState<{
    id: string | number;
    name: string;
    owner: string;
    phoneNumber?: string;
    species?: string;
    breed?: string;
    age?: string;
  } | null>(null);
  const [petsError, setPetsError] = useState<string | null>(null);
 
  const { getToken, isAuthenticated, isLoading: authLoading } = useAuth();

  // Load both recordings and pets
  useEffect(() => {
    if (isAuthenticated && !authLoading) {
      loadRecordings();
      loadPets();
    }
  }, [isAuthenticated, authLoading]);

  // Enhanced function to load recordings with pet information
  const loadRecordings = async () => {
    setIsLoading(true);
    try {
      console.log('🌐 Fetching call recordings from backend...');
      
      // Load recordings from backend
      const recordingsData = await getCallRecordings();
      
      // Load pets to enrich recording data
      const petsData = await getPets();
      
      // Enrich recordings with pet information
      const enrichedRecordings: ExtendedCallRecording[] = recordingsData.map(recording => {
        // Find matching pet by name and owner
        const matchingPet = petsData.find(pet => 
          pet.name === recording.petName && pet.owner === recording.ownerName
        );
        
        return {
          ...recording,
          petInfo: matchingPet ? {
            id: matchingPet.id,
            name: matchingPet.name,
            species: matchingPet.species,
            breed: matchingPet.breed,
            age: matchingPet.age || '',
            owner: matchingPet.owner,
            phoneNumber: matchingPet.phoneNumber || '',
            imageUrl: matchingPet.imageUrl,
            notes: matchingPet.notes
          } : undefined
        };
      });
      
      setRecordings(enrichedRecordings);
      console.log('✅ Enriched call recordings loaded:', enrichedRecordings.length);
      
    } catch (error) {
      console.error("❌ Failed to load call recordings:", error);
      
      // Fallback to local storage
      try {
        const localRecords = JSON.parse(localStorage.getItem('localCallRecordings') || '[]');
        console.log('📦 Loading from local storage:', localRecords.length);
        
        // Enrich local records with pet information
        const enrichedLocalRecords = localRecords.map((recording: any) => {
          const matchingPet = pets.find(pet => 
            pet.name === recording.petName && pet.owner === recording.ownerName
          );
          
          return {
            ...recording,
            petInfo: matchingPet ? {
              id: matchingPet.id,
              name: matchingPet.name,
              species: matchingPet.species,
              breed: matchingPet.breed,
              age: matchingPet.age || '',
              owner: matchingPet.owner,
              phoneNumber: matchingPet.phoneNumber || '',
              imageUrl: matchingPet.imageUrl,
              notes: matchingPet.notes
            } : undefined
          };
        });
        
        setRecordings(enrichedLocalRecords);
      } catch (localError) {
        console.error("❌ Local storage also failed:", localError);
        setRecordings([]);
      }
    } finally {
      setIsLoading(false);
    }
  };

  // Function to handle call from pet management
  const handleCallFromPet = async (pet: Pet) => {
    try {
      console.log('📞 Starting call from pet:', pet);
      
      // Create call recording
      const newRecording = await createCallRecording({
        petName: pet.name,
        ownerName: pet.owner,
        phoneNumber: pet.phoneNumber || '',
        callType: "whatsapp",
        callDirection: "outgoing",
        duration: 0
      });

      // Enrich with pet info
      const enrichedRecording: ExtendedCallRecording = {
        ...newRecording,
        petInfo: {
          id: pet.id,
          name: pet.name,
          species: pet.species,
          breed: pet.breed,
          age: pet.age || '',
          owner: pet.owner,
          phoneNumber: pet.phoneNumber || '',
          imageUrl: pet.imageUrl,
          notes: pet.notes
        }
      };

      // Add to recordings list
      setRecordings(prev => [enrichedRecording, ...prev]);
      
      // Open WhatsApp
      if (pet.phoneNumber) {
        const formattedNumber = pet.phoneNumber.replace(/\D/g, '');
        let whatsappNumber = formattedNumber;
        
        if (!whatsappNumber.startsWith('+')) {
          whatsappNumber = whatsappNumber.startsWith('1') 
            ? `+${whatsappNumber}`
            : `+1${whatsappNumber}`;
        }

        const whatsappUrl = `https://wa.me/${whatsappNumber}`;
        const whatsappWindow = window.open(whatsappUrl, '_blank', 'noopener,noreferrer');
        
        if (whatsappWindow) {
          const startTime = Date.now();
          
          const checkWindow = setInterval(() => {
            if (whatsappWindow.closed) {
              clearInterval(checkWindow);
              const endTime = Date.now();
              const duration = Math.floor((endTime - startTime) / 1000);
              
              // Update duration
              updateCallRecordingDuration(newRecording.id, duration)
                .then(() => {
                  setRecordings(prev => 
                    prev.map(rec => 
                      rec.id === newRecording.id 
                        ? { ...rec, duration }
                        : rec
                    )
                  );
                })
                .catch(error => {
                  console.error('Failed to update duration:', error);
                });
            }
          }, 1000);
        }
      }
      
    } catch (error) {
      console.error("❌ Failed to create call recording:", error);
      
      // Fallback: Just open WhatsApp
      if (pet.phoneNumber) {
        const formattedNumber = pet.phoneNumber.replace(/\D/g, '');
        const whatsappUrl = `https://wa.me/${formattedNumber}`;
        window.open(whatsappUrl, '_blank', 'noopener,noreferrer');
      }
    }
  };

  // Delete recording
  const handleDelete = async () => {
    if (!selectedRecording) return;
    
    try {
      await deleteCallRecording(selectedRecording.id);
      setRecordings(recordings.filter((rec) => rec.id !== selectedRecording.id));
      setIsDetailsOpen(false);
      setIsDeleteDialogOpen(false);
      setSelectedRecording(null);
    } catch (error) {
      console.error("❌ Failed to delete recording:", error);
      alert('Failed to delete recording. Please try again.');
    }
  };

  // Transcribe recording
  const handleTranscribe = async (recordingId: string) => {
    setIsTranscribing(true);
    try {
      const updatedRecording = await transcribeCallRecording(recordingId);
      setRecordings(recordings.map((rec) => 
        rec.id === recordingId ? { ...updatedRecording, petInfo: rec.petInfo } : rec
      ));
      
      if (selectedRecording?.id === recordingId) {
        setSelectedRecording({ ...updatedRecording, petInfo: selectedRecording.petInfo });
      }
    } catch (error) {
      console.error("Failed to transcribe recording:", error);
      alert('Failed to transcribe recording. Please try again.');
    } finally {
      setIsTranscribing(false);
    }
  };

  // Summarize transcription
  const handleSummarize = async (recordingId: string) => {
    setIsSummarizing(true);
    try {
      const updatedRecording = await summarizeTranscription(recordingId);
      setRecordings(recordings.map((rec) => 
        rec.id === recordingId ? { ...updatedRecording, petInfo: rec.petInfo } : rec
      ));
      
      if (selectedRecording?.id === recordingId) {
        setSelectedRecording({ ...updatedRecording, petInfo: selectedRecording.petInfo });
      }
    } catch (error) {
      console.error("Failed to summarize transcription:", error);
      alert('Failed to generate summary. Please try again.');
    } finally {
      setIsSummarizing(false);
    }
  };

  // ✅ ADDED: Approve transcription function
  const handleApprove = async (recordingId: string) => {
    setIsApproving(true);
    try {
      const updatedRecording = await approveTranscription(recordingId);
      setRecordings(recordings.map((rec) => 
        rec.id === recordingId ? { ...updatedRecording, petInfo: rec.petInfo } : rec
      ));
      
      if (selectedRecording?.id === recordingId) {
        setSelectedRecording({ ...updatedRecording, petInfo: selectedRecording.petInfo });
      }
      
      console.log('✅ Transcription approved successfully');
    } catch (error) {
      console.error("Failed to approve transcription:", error);
      alert('Failed to approve transcription. Please try again.');
    } finally {
      setIsApproving(false);
    }
  };

  // ✅ ADDED: Reject transcription function
  const handleReject = async (recordingId: string) => {
    setIsRejecting(true);
    try {
      const updatedRecording = await rejectTranscription(recordingId);
      setRecordings(recordings.map((rec) => 
        rec.id === recordingId ? { ...updatedRecording, petInfo: rec.petInfo } : rec
      ));
      
      if (selectedRecording?.id === recordingId) {
        setSelectedRecording({ ...updatedRecording, petInfo: selectedRecording.petInfo });
      }
      
      console.log('✅ Transcription rejected successfully');
    } catch (error) {
      console.error("Failed to reject transcription:", error);
      alert('Failed to reject transcription. Please try again.');
    } finally {
      setIsRejecting(false);
    }
  };

  // Load pets function
  const loadPets = async () => {
    if (!isAuthenticated) {
      setPetsError("Authentication required");
      return;
    }

    setIsPetsLoading(true);
    setPetsError(null);
    try {
      const petsData = await getPets();
      setPets(petsData);
    } catch (error: any) {
      console.error("Failed to load pets:", error);
      setPetsError(error.message || "Failed to load pets");
    } finally {
      setIsPetsLoading(false);
    }
  };

  // Start new call
  const handleStartCall = async () => {
    if (!selectedPet) return;
    setIsNewCallDialogOpen(false);
    
    try {
      const newRecording = await createCallRecording({
        petName: selectedPet.name,
        ownerName: selectedPet.owner,
        phoneNumber: selectedPet.phoneNumber || '',
        callType: "whatsapp",
        callDirection: "outgoing",
        duration: 0
      });

      // Enrich with pet info
      const enrichedRecording: ExtendedCallRecording = {
        ...newRecording,
        petInfo: selectedPet ? {
          id: selectedPet.id,
          name: selectedPet.name,
          species: selectedPet.species || '',
          breed: selectedPet.breed || '',
          age: selectedPet.age || '',
          owner: selectedPet.owner,
          phoneNumber: selectedPet.phoneNumber || '',
        } : undefined
      };

      setRecordings(prev => [enrichedRecording, ...prev]);
      
      // Open WhatsApp
      if (selectedPet.phoneNumber) {
        const formattedNumber = selectedPet.phoneNumber.replace(/\D/g, '');
        const whatsappUrl = `https://wa.me/${formattedNumber}`;
        window.open(whatsappUrl, '_blank', 'noopener,noreferrer');
      }
      
    } catch (error) {
      console.error("❌ Failed to create call recording:", error);
      alert('Failed to create call recording. Please try again.');
    }
    
    setSelectedPet(null);
  };

  // Audio playback
  const toggleAudio = (recordingId: string, audioUrl?: string) => {
    if (!audioUrl) return;

    if (audioPlaying === recordingId) {
      if (audioRef.current) {
        audioRef.current.pause();
        audioRef.current = null;
      }
      setAudioPlaying(null);
    } else {
      if (audioRef.current) {
        audioRef.current.pause();
      }
      
      try {
        audioRef.current = new Audio(audioUrl);
        audioRef.current.play()
          .then(() => setAudioPlaying(recordingId))
          .catch(error => {
            console.error('Error playing audio:', error);
            setAudioPlaying(null);
          });
        
        audioRef.current.onended = () => setAudioPlaying(null);
        audioRef.current.onerror = () => setAudioPlaying(null);
      } catch (error) {
        console.error('Error creating audio element:', error);
        setAudioPlaying(null);
      }
    }
  };

  // Filter recordings based on search
  const filteredRecordings = recordings.filter((recording) => {
    const searchLower = searchQuery.toLowerCase();
    return (
      recording.petName?.toLowerCase().includes(searchLower) ||
      recording.ownerName?.toLowerCase().includes(searchLower) ||
      recording.petInfo?.species?.toLowerCase().includes(searchLower) ||
      recording.petInfo?.breed?.toLowerCase().includes(searchLower) ||
      (recording.transcription && recording.transcription.toLowerCase().includes(searchLower)) ||
      (recording.summary && recording.summary.toLowerCase().includes(searchLower))
    );
  });

  // Export function to be used by PetManagement
  const exportCallHandler = {
    handleCallFromPet
  };

  // Make it available globally for PetManagement to access
  if (typeof window !== 'undefined') {
    (window as any).CallHistoryHandler = exportCallHandler;
  }

  if (authLoading) {
    return <LoadingState />;
  }

  if (!isAuthenticated) {
    return (
      <div className="container mx-auto py-6 text-center">
        <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-6 max-w-md mx-auto">
          <h2 className="text-lg font-semibold text-yellow-800 mb-2">
            Authentication Required
          </h2>
          <p className="text-yellow-700 mb-4">
            Please log in to view call history and manage pets.
          </p>
          <button 
            onClick={() => window.location.href = '/login'}
            className="bg-yellow-500 text-white px-4 py-2 rounded hover:bg-yellow-600 transition-colors"
          >
            Go to Login
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="container mx-auto py-6 space-y-6 bg-gradient-to-b from-white to-primary-50 min-h-screen">
      <CallHistoryHeader 
        onNewCall={() => setIsNewCallDialogOpen(true)}
      />
      
      <CallHistorySearch 
        searchQuery={searchQuery}
        onSearchChange={setSearchQuery}
      />

      {/* Stats Summary */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
        <div className="bg-white p-4 rounded-lg shadow-sm border">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-blue-100 rounded-lg">
              <Phone className="w-5 h-5 text-blue-600" />
            </div>
            <div>
              <p className="text-sm text-gray-600">Total Calls</p>
              <p className="text-2xl font-bold text-gray-900">{recordings.length}</p>
            </div>
          </div>
        </div>
        
        <div className="bg-white p-4 rounded-lg shadow-sm border">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-green-100 rounded-lg">
              <User className="w-5 h-5 text-green-600" />
            </div>
            <div>
              <p className="text-sm text-gray-600">Unique Pets</p>
              <p className="text-2xl font-bold text-gray-900">
                {new Set(recordings.map(r => r.petName)).size}
              </p>
            </div>
          </div>
        </div>
        
        <div className="bg-white p-4 rounded-lg shadow-sm border">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-purple-100 rounded-lg">
              <Dog className="w-5 h-5 text-purple-600" />
            </div>
            <div>
              <p className="text-sm text-gray-600">Pet Species</p>
              <p className="text-2xl font-bold text-gray-900">
                {new Set(recordings.filter(r => r.petInfo?.species).map(r => r.petInfo!.species)).size}
              </p>
            </div>
          </div>
        </div>
        
        <div className="bg-white p-4 rounded-lg shadow-sm border">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-orange-100 rounded-lg">
              <Clock className="w-5 h-5 text-orange-600" />
            </div>
            <div>
              <p className="text-sm text-gray-600">Avg Duration</p>
              <p className="text-2xl font-bold text-gray-900">
                {recordings.length > 0 
                  ? Math.round(recordings.reduce((acc, curr) => acc + (curr.duration || 0), 0) / recordings.length) 
                  : 0}s
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Refresh Button */}
      <div className="flex justify-end">
        <button
          onClick={loadRecordings}
          disabled={isLoading}
          className="flex items-center gap-2 px-4 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600 disabled:opacity-50 transition-colors"
        >
          <RefreshCw size={16} className={isLoading ? "animate-spin" : ""} />
          {isLoading ? "Refreshing..." : "Refresh Calls"}
        </button>
      </div>

      {/* Call Records */}
      {isLoading ? (
        <LoadingState />
      ) : filteredRecordings.length === 0 ? (
        <EmptyState />
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {filteredRecordings.map((recording) => (
            <CallRecordingCard
              key={recording.id}
              recording={recording}
              audioPlaying={audioPlaying}
              onPlayAudio={toggleAudio}
              onViewDetails={() => {
                setSelectedRecording(recording);
                setIsDetailsOpen(true);
              }}
              onDelete={() => {
                setSelectedRecording(recording);
                setIsDeleteDialogOpen(true);
              }}
            />
          ))}
        </div>
      )}

      {/* Dialogs */}
      <CallDetailsDialog
        isOpen={isDetailsOpen}
        onOpenChange={setIsDetailsOpen}
        recording={selectedRecording}
        audioPlaying={audioPlaying}
        isTranscribing={isTranscribing}
        isSummarizing={isSummarizing}
        isApproving={isApproving}
        isRejecting={isRejecting}
        onPlayAudio={toggleAudio}
        onTranscribe={handleTranscribe}
        onSummarize={handleSummarize}
        onApprove={handleApprove}
        onReject={handleReject}
        onDelete={() => setIsDeleteDialogOpen(true)}
      />

      <DeleteConfirmationDialog
        isOpen={isDeleteDialogOpen}
        onOpenChange={setIsDeleteDialogOpen}
        recording={selectedRecording}
        onDelete={handleDelete}
      />

      <NewCallDialog
        isOpen={isNewCallDialogOpen}
        onOpenChange={setIsNewCallDialogOpen}
        selectedPet={selectedPet}
        onSelectPet={setSelectedPet}
        pets={pets}
        isLoading={isPetsLoading}
        petsError={petsError}
        onRetryPets={loadPets}
        onStartCall={handleStartCall}
      />

      <audio 
        ref={audioRef}
        style={{ display: 'none' }}
        onEnded={() => setAudioPlaying(null)}
        onError={() => setAudioPlaying(null)}
      />
    </div>
  );
};

export default CallHistory;