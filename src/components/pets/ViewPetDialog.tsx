import { Dialog, DialogContent, DialogHeader, DialogFooter } from "../../components/ui/dialog";
import { Button } from "../../components/ui/button";
import { Avatar, AvatarFallback, AvatarImage } from "../../components/ui/avatar";
import { Pet } from "./types/petTypes";
import { Trash2, Edit, Phone, MessageCircle, FileText, Loader2 } from "lucide-react";
import { useAuth } from "../../context/AuthContext";
import { useState, useEffect } from "react";

const API_BASE = import.meta.env.VITE_API_BASE || 'https://mliapi.ddns.net:5000';

interface ViewPetDialogProps {
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  pet: Pet | null;
  onEdit: () => void;
  onDelete: (id: string) => void;
}

const ViewPetDialog = ({ isOpen, onOpenChange, pet, onEdit, onDelete }: ViewPetDialogProps) => {
  const { user } = useAuth();
  const isNurse = user?.role === "nurse";
  const [transcriptions, setTranscriptions] = useState<any[]>([]);
  const [isLoadingTranscriptions, setIsLoadingTranscriptions] = useState(false);

  // Fetch transcriptions for this pet
  useEffect(() => {
    const fetchPetTranscriptions = async () => {
      if (!pet || !isOpen) return;
      
      try {
        setIsLoadingTranscriptions(true);
        const token = localStorage.getItem('auth_token');
        
        if (!token) {
          console.log('No auth token found');
          return;
        }

        console.log('Fetching transcriptions for pet:', pet.name);

        const response = await fetch(`${API_BASE}/api/transcriptions?limit=100`, {
          headers: {
            'Authorization': `Bearer ${token}`,
          },
        });

        if (response.ok) {
          const data = await response.json();
          console.log('Transcriptions response:', data);
          
          // The response is { transcriptions: [...], total: ..., page: ..., totalPages: ... }
          const allTranscriptions = data.transcriptions || [];
          
          // Filter transcriptions for this specific pet
          const petTranscriptions = allTranscriptions.filter((t: any) => 
            t.pet_name === pet.name || t.petName === pet.name
          );
          
          console.log('Filtered transcriptions for pet:', petTranscriptions);
          setTranscriptions(petTranscriptions);
        } else {
          console.error('Failed to fetch transcriptions:', response.status);
        }
      } catch (error) {
        console.error('Error fetching transcriptions:', error);
      } finally {
        setIsLoadingTranscriptions(false);
      }
    };

    fetchPetTranscriptions();
  }, [pet, isOpen]);

  if (!pet) return null;

  const handleWhatsAppCall = () => {
    if (!pet.phoneNumber) {
      alert("Owner phone number is not available");
      return;
    }
    const formattedNumber = pet.phoneNumber.replace(/\D/g, '');
    const whatsappUrl = `https://wa.me/${formattedNumber}`;
    window.open(whatsappUrl, '_blank', 'noopener,noreferrer');
  };

  const handleWhatsAppMessage = () => {
    if (!pet.phoneNumber) {
      alert("Owner phone number is not available");
      return;
    }
    const formattedNumber = pet.phoneNumber.replace(/\D/g, '');
    const message = `Hello, this is regarding your pet ${pet.name}.`;
    const encodedMessage = encodeURIComponent(message);
    const whatsappUrl = `https://wa.me/${formattedNumber}?text=${encodedMessage}`;
    window.open(whatsappUrl, '_blank', 'noopener,noreferrer');
  };

  const handleRegularCall = () => {
    if (!pet.phoneNumber) {
      alert("Owner phone number is not available");
      return;
    }
    const formattedNumber = pet.phoneNumber.replace(/\D/g, '');
    window.location.href = `tel:${formattedNumber}`;
  };

  async function saveCallRecording(
    audioBlob: Blob,
    { petId, petName, ownerName, duration }: { petId: string; petName: string; ownerName: string; duration: number; }
  ) {
    const formData = new FormData();
    formData.append("audio", audioBlob, `${petName}-call.webm`);
    formData.append("petId", petId);
    formData.append("petName", petName);
    formData.append("ownerName", ownerName);
    formData.append("duration", duration.toString());

    const response = await fetch("/api/call-recordings", {
      method: "POST",
      body: formData,
    });

    if (!response.ok) {
      throw new Error("Failed to save call recording");
    }

    return await response.json();
  }

  return (
    <Dialog open={isOpen} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-[400px] max-h-[90vh] sm:max-w-[600px] overflow-y-auto">
        <DialogHeader>
          <div className="gap-2 relative bg-[#272E3F] text-white text-center -mt-300 -pt-10 pb-0 rounded-b-[110px] overflow-hidden w-[40%] mx-auto -mt-6">
            <span className="text-xl font-semibold">{pet.name}</span>
            <span className="bg-primary/10 px-2 py-1 rounded text-xs font-medium">
              {pet.species}
            </span>
          </div>
          <p className="text-sm text-muted-foreground">
            {pet.breed} • {pet.age}
          </p>
        </DialogHeader>
        
        <div className="grid md:grid-cols-[1fr_2fr] gap-6 py-4">
          <div>
            <div className="rounded-lg overflow-hidden mb-4">
              <img
                src={pet.imageUrl}
                alt={pet.name}
                className="w-full h-auto object-cover"
                onError={(e) => {
                  const target = e.target as HTMLImageElement;
                  target.src = `https://api.dicebear.com/7.x/avataaars/svg?seed=${pet.name}`;
                }}
              />
            </div>
          </div>
          
          <div className="space-y-4">
            <div>
              <h4 className="text-sm font-medium mb-1">Owner Information</h4>
              <div className="flex items-center gap-3">
                <Avatar>
                  <AvatarImage
                    src={`https://api.dicebear.com/7.x/avataaars/svg?seed=${pet.owner}`}
                  />
                  <AvatarFallback>
                    {pet.owner.substring(0, 2).toUpperCase()}
                  </AvatarFallback>
                </Avatar>
                <div>
                  <p className="font-medium">{pet.owner}</p>
                  {pet.phoneNumber && (
                    <p className="text-sm text-muted-foreground">{pet.phoneNumber}</p>
                  )}
                </div>
              </div>
            </div>

            <div>
              <h4 className="text-sm font-medium mb-1">Notes</h4>
              <p className="text-sm text-muted-foreground">
                {pet.notes || "No notes available for this pet."}
              </p>
            </div>
            {pet.phoneNumber && (
              <div className="mt-4">
                <h4 className="text-sm font-medium mb-2">Contact Owner</h4>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  <Button 
                    onClick={handleWhatsAppCall}
                    className="bg-green-600 hover:bg-green-700 text-white gap-2"
                    size="sm"
                  >
                    <Phone size={16} />
                    WhatsApp Call
                  </Button>
                  
                  <Button 
                    onClick={handleWhatsAppMessage}
                    className="bg-blue-600 hover:bg-blue-700 text-white gap-2"
                    size="sm"
                  >
                    <MessageCircle size={16} />
                    WhatsApp Message
                  </Button>
                  
                  <Button 
                    onClick={handleRegularCall}
                    variant="outline"
                    className="gap-2"
                    size="sm"
                  >
                    <Phone size={16} />
                    Regular Call
                  </Button>
                  
                  <Button 
                    variant="outline"
                    className="gap-2"
                    size="sm"
                    onClick={() => {
                      navigator.clipboard.writeText(pet.phoneNumber);
                      alert("Phone number copied to clipboard");
                    }}
                  >
                    Copy Number
                  </Button>
                </div>
              </div>
            )}
            <div>
              <h4 className="text-sm font-medium mb-2">Recent Transcriptions</h4>
              {isLoadingTranscriptions ? (
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Loading transcriptions...
                </div>
              ) : transcriptions.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  No recent transcriptions found for this pet.
                </p>
              ) : (
                <div className="space-y-2 max-h-40 overflow-y-auto">
                  {transcriptions.slice(0, 5).map((transcription) => (
                    <div key={transcription.id} className="p-2 bg-muted/50 rounded-md">
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium truncate">{transcription.title}</p>
                          <p className="text-xs text-muted-foreground">
                            {new Date(transcription.created_at || transcription.createdAt).toLocaleDateString()}
                          </p>
                        </div>
                        <FileText className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                      </div>
                    </div>
                  ))}
                  {transcriptions.length > 5 && (
                    <p className="text-xs text-muted-foreground text-center">
                      +{transcriptions.length - 5} more transcriptions
                    </p>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
        
        <DialogFooter className="flex justify-between sm:justify-between dialog-footer-stack">
          {!isNurse && (
            <Button
              variant="outline"
              onClick={() => onDelete(pet.id)}
              className="gap-2 w-full"
            >
              <Trash2 size={16} />
              Delete Pet
            </Button>
          )}
          <div className="flex gap-2 w-full justify-end">
            <Button
              variant="outline"
              onClick={() => onOpenChange(false)}
              className="w-full"
            >
              Close
            </Button>
            {!isNurse && (
              <Button className="gap-2 w-full mb-5" onClick={onEdit}>
                <Edit size={16} />
                Edit Pet
              </Button>
            )}
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default ViewPetDialog;