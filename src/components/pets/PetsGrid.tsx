import { Card, CardContent } from "../../components/ui/card";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "../../components/ui/dropdown-menu";
import { Button } from "../../components/ui/button";
import { MoreVertical, Eye, Edit, Trash2, Phone, MessageCircle } from "lucide-react";
import { Pet } from "./types/petTypes";
import React, { useState, useEffect } from "react";
import { useAuth } from "../../context/AuthContext";

const API_BASE = import.meta.env.VITE_API_BASE || 'https://mliapi.ddns.net:5000';

interface PetsGridProps {
  pets: Pet[];
  onViewPet: (pet: Pet) => void;
  onEditPet: (pet: Pet) => void;
  onDeletePet: (id: string) => void;
  onCallOwner: (pet: Pet) => void;
}

const getPetImageUrl = (pet: Pet): string => {
  if (pet.imageUrl && (pet.imageUrl.startsWith('http') || pet.imageUrl.startsWith('data:'))) {
    return pet.imageUrl;
  }
  if (pet.imageData && pet.imageType) {
    return `data:${pet.imageType};base64,${pet.imageData}`;
  }
  if (pet.imageUrl) {
    return pet.imageUrl;
  }
  return `https://api.dicebear.com/7.x/avataaars/svg?seed=${pet.name}`;
};

const PetsGrid = ({
  pets,
  onViewPet,
  onEditPet,
  onDeletePet,
  onCallOwner,
}: PetsGridProps) => {
  const { user } = useAuth();
  const isNurse = user?.role === "nurse";
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const handleWhatsAppCall = (pet: Pet) => {
    if (!pet.phoneNumber) {
      alert(`Phone number not available for ${pet.name}'s owner`);
      return;
    }

    const formattedNumber = pet.phoneNumber.replace(/\D/g, '');
    const whatsappUrl = `https://wa.me/${formattedNumber}`;
    window.open(whatsappUrl, '_blank', 'noopener,noreferrer');
  };

  const handleWhatsAppMessage = (pet: Pet) => {
    if (!pet.phoneNumber) {
      alert(`Phone number not available for ${pet.name}'s owner`);
      return;
    }

    const formattedNumber = pet.phoneNumber.replace(/\D/g, '');
    const message = `Hello, this is regarding your pet ${pet.name}.`;
    const encodedMessage = encodeURIComponent(message);
    const whatsappUrl = `https://wa.me/${formattedNumber}?text=${encodedMessage}`;
    window.open(whatsappUrl, '_blank', 'noopener,noreferrer');
  };

  // ✅ FIXED: Fetch pets from database
 // PetsGrid.tsx - UPDATE fetchPets function
useEffect(() => {
  const fetchPets = async () => {
    try {
      setIsLoading(true);
      // ✅ FIX: Use localStorage directly
      const token = localStorage.getItem("auth_token"); // DIRECT ACCESS
      
      if (!token) {
        setError("Authentication token not found. Please login again.");
        setIsLoading(false);
        return;
      }

      console.log('🌐 Fetching from:', `${API_BASE}/api/pets`);

      const response = await fetch(`${API_BASE}/api/pets`, {
        headers: {
          "Authorization": `Bearer ${token}`,
        },
      });
      
      if (response.ok) {
        const petsData = await response.json();
        console.log("✅ Fetched pets from database:", petsData);
      } else if (response.status === 401) {
        setError("Session expired. Please login again.");
        localStorage.removeItem("auth_token");
        window.location.href = "/login";
      } else {
        setError("Failed to fetch pets from server.");
      }
    } catch (error) {
      console.error("❌ Error fetching pets:", error);
      setError("Network error. Please check your connection.");
    } finally {
      setIsLoading(false);
    }
  };

  fetchPets();
}, []);
  // Delete pet handler - opens confirmation dialog
  const handleDelete = (id: string) => {
    onDeletePet(id);
  };

  if (isLoading) {
    return (
      <div className="flex justify-center items-center py-10">
        <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-primary"></div>
        <span className="ml-3 text-muted-foreground">Loading pets...</span>
      </div>
    );
  }

  if (error) {
    return (
      <div className="text-center py-10">
        <div className="text-destructive mb-2">
          <i className="fas fa-exclamation-triangle mr-2"></i>
          {error}
        </div>
        <Button onClick={() => window.location.reload()}>
          Try Again
        </Button>
      </div>
    );
  }

  if (pets.length === 0) {
    return (
      <div className="text-center py-10">
        <div className="mb-4 text-muted-foreground">
          <i className="fas fa-paw text-4xl"></i>
        </div>
        <p className="text-muted-foreground mb-4">
          No pets found. Try adjusting your search or add a new pet.
        </p>
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-2 lg:grid-cols-3 gap-6">
      {pets.map((pet) => (
        <Card
          key={pet.id}
          className="overflow-hidden shadow-lg transition-all duration-300 hover:shadow-xl group cursor-pointer"
        >
          <div className="relative h-48 overflow-hidden">
            <img
              src={getPetImageUrl(pet)}
              alt={pet.name}
              className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-110"
              onError={(e) => {
                const target = e.target as HTMLImageElement;
                console.log('Image failed to load for pet:', pet.name, pet.imageUrl);
                target.src = `https://api.dicebear.com/7.x/avataaars/svg?seed=${pet.name}`;
              }}
              onLoad={(e) => {
                console.log('Image loaded successfully for pet:', pet.name);
              }}
            />
            <div className="absolute top-3 right-3">
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button
                    variant="secondary"
                    size="icon"
                    className="h-9 w-9 rounded-full bg-background/80 backdrop-blur-sm hover:bg-background"
                    onClick={(e) => e.stopPropagation()}
                  >
                    <MoreVertical size={16} />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-48">
                  <DropdownMenuItem 
                    onClick={(e) => {
                      e.stopPropagation();
                      onViewPet(pet);
                    }}
                    className="cursor-pointer"
                  >
                    <Eye className="mr-2" size={16} />
                    View Details
                  </DropdownMenuItem>
                  {!isNurse && (
                    <DropdownMenuItem 
                      onClick={(e) => {
                        e.stopPropagation();
                        onEditPet(pet);
                      }}
                      className="cursor-pointer"
                    >
                      <Edit className="mr-2" size={16} />
                      Edit Pet
                    </DropdownMenuItem>
                  )}
                  
                  {/* WhatsApp Options */}
                  {pet.phoneNumber && (
                    <>
                      <DropdownMenuItem 
                        onClick={(e) => {
                          e.stopPropagation();
                          handleWhatsAppCall(pet);
                        }}
                        className="cursor-pointer text-green-600"
                      >
                        <Phone className="mr-2" size={16} />
                        WhatsApp Call
                      </DropdownMenuItem>
                      <DropdownMenuItem 
                        onClick={(e) => {
                          e.stopPropagation();
                          handleWhatsAppMessage(pet);
                        }}
                        className="cursor-pointer text-blue-600"
                      >
                        <MessageCircle className="mr-2" size={16} />
                        WhatsApp Message
                      </DropdownMenuItem>
                    </>
                  )}
                  
                  {!isNurse && (
                    <DropdownMenuItem 
                      onClick={(e) => {
                        e.stopPropagation();
                        handleDelete(pet.id);
                      }}
                      className="cursor-pointer text-destructive focus:text-destructive"
                    >
                      <Trash2 className="mr-2" size={16} />
                      Delete Pet
                    </DropdownMenuItem>
                  )}
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
            <div className="absolute bottom-3 left-3">
              <span className={`px-3 py-1 rounded-full text-xs font-medium ${
                pet.species === 'Dog' ? 'bg-blue-100 text-blue-800' :
                pet.species === 'Cat' ? 'bg-pink-100 text-pink-800' :
                pet.species === 'Bird' ? 'bg-yellow-100 text-yellow-800' :
                'bg-gray-100 text-gray-800'
              }`}>
                {pet.species}
              </span>
            </div>
          </div>
          
          <CardContent className="p-4" onClick={() => onViewPet(pet)}>
            <div className="flex justify-between items-start mb-2">
              <h3 className="font-semibold text-lg truncate">{pet.name}</h3>
              {pet.age && (
                <span className="text-sm text-muted-foreground whitespace-nowrap">
                  {pet.age}
                </span>
              )}
            </div>
            
            <div className="space-y-2">
              {pet.breed && (
                <p className="text-sm text-muted-foreground">
                  <span className="font-medium">Breed:</span> {pet.breed}
                </p>
              )}
              
              <p className="text-sm">
                <span className="font-medium">Owner:</span> {pet.owner}
              </p>
              
              {pet.phoneNumber && (
                <p className="text-sm text-green-600 font-medium">
                  <span className="font-medium">Phone:</span> {pet.phoneNumber}
                </p>
              )}
              
              {pet.notes && (
                <p className="text-sm text-muted-foreground truncate">
                  <span className="font-medium">Notes:</span> {pet.notes}
                </p>
              )}
            </div>

            {/* Quick Action Buttons */}
            {pet.phoneNumber && (
              <div className="flex gap-2 mt-3">
                <Button 
                  size="sm" 
                  className="flex-1 text-xs"
                  style={{
                    backgroundColor: '#242C3F',
                    color: 'white'
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.backgroundColor = '#1a2030'; 
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.backgroundColor = '#242C3F'; 
                  }}
                  onClick={(e) => {
                    e.stopPropagation();
                    handleWhatsAppCall(pet);
                  }}
                >
                  <Phone size={12} className="mr-1" />
                  Call
                </Button>
                <Button 
                  size="sm" 
                  variant="outline"
                  className="flex-1 text-xs"
                  onClick={(e) => {
                    e.stopPropagation();
                    onViewPet(pet);
                  }}
                >
                  Details
                </Button>
              </div>
            )}
          </CardContent>
        </Card>
      ))}
    </div>
  );
};

export default PetsGrid;