import React, { useState, useEffect } from "react";
import PetManagementHeader from "./PetManagementHeader";
import PetSearchFilter from "./PetSearchFilter";
import PetsGrid from "./PetsGrid";
import AddPetDialog from "./AddPetDialog";
import ViewPetDialog from "./ViewPetDialog";
import EditPetDialog from "./EditPetDialog";
import DeletePetDialog from "./DeletePetDialog";
import { useAuth } from "../../hooks/useAuth";
import { Pet, PetFormData as BasePetFormData } from "./types/petTypes";

const API_BASE = import.meta.env.VITE_API_BASE || 'https://mliapi.ddns.net:5000';

// Add interface for call recording
interface CreateCallRecordingData {
  petName: string;
  ownerName: string;
  phoneNumber: string;
  callType?: string;
  callDirection?: string;
  duration?: number;
}

const PetManagement = () => {
  const [pets, setPets] = useState<Pet[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedSpecies, setSelectedSpecies] = useState<string>("all");
  const { getToken, logout } = useAuth(); 
  const [isAddPetDialogOpen, setIsAddPetDialogOpen] = useState(false);
  const [isViewPetDialogOpen, setIsViewPetDialogOpen] = useState(false);
  const [isEditPetDialogOpen, setIsEditPetDialogOpen] = useState(false);
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);

  const [selectedPet, setSelectedPet] = useState<Pet | null>(null);
  
  interface PetFormData extends BasePetFormData {
    imageData?: string;
    imageType?: string;
    phoneNumber?: string;
    previewUrl?: string; 
  }

  const [newPet, setNewPet] = useState<PetFormData>({
    name: "",
    species: "",
    breed: "",
    age: "",
    owner: "",
    phoneNumber: "",
    imageUrl: "",
    imageData: "",
    imageType: "",
    notes: "",
  });
  
  const [editFormData, setEditFormData] = useState<PetFormData>({
    name: "",
    species: "",
    breed: "",
    age: "",
    owner: "",
    phoneNumber: "",
    imageUrl: "",
    notes: ""
  });

  // Function to create call recording
  const createCallRecording = async (callData: CreateCallRecordingData) => {
    try {
      const token = localStorage.getItem('auth_token');
      const response = await fetch(`${API_BASE}/api/call-recordings`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
        },
        body: JSON.stringify(callData),
      });

      if (!response.ok) {
        throw new Error('Failed to create call recording');
      }

      return await response.json();
    } catch (error) {
      console.error('Error creating call recording:', error);
      throw error;
    }
  };

  // Function to update call duration
  const updateCallDuration = async (callId: string, duration: number) => {
    try {
      const token = localStorage.getItem('auth_token');
      await fetch(`${API_BASE}/api/call-recordings/${callId}/duration`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
        },
        body: JSON.stringify({ duration }),
      });
    } catch (error) {
      console.error('Failed to update call duration:', error);
    }
  };

  // ✅ FIXED: Fetch pets from API
  useEffect(() => {
    const fetchPets = async () => {
      try {
        setIsLoading(true);
        
        const token = localStorage.getItem('auth_token');
        console.log('🔐 Token from localStorage:', token);
        
        if (!token) {
          console.error('❌ NO TOKEN FOUND');
          logout();
          return;
        }

        console.log('🌐 Fetching from:', `${API_BASE}/api/pets`);
        
        const response = await fetch(`${API_BASE}/api/pets`, {
          headers: {
            "Authorization": `Bearer ${token}`,
          },
        });
        
        console.log('📡 Response status:', response.status);
        
        if (response.ok) {
          const petsData = await response.json();
          console.log("✅ Pets data received:", petsData);
          
          const petsWithPhone = petsData.map((pet: any) => ({
            ...pet,
            phoneNumber: pet.phoneNumber || ''
          }));
          
          setPets(petsWithPhone);
        } else {
          console.error("❌ Failed to fetch pets - Status:", response.status);
        }
      } catch (error) {
        console.error("❌ Error fetching pets:", error);
      } finally {
        setIsLoading(false);
      }
    };
    
    fetchPets();
  }, []);

  const filteredPets = pets.filter((pet) => {
    const matchesSearch =
      pet.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      pet.breed.toLowerCase().includes(searchTerm.toLowerCase()) ||
      pet.owner.toLowerCase().includes(searchTerm.toLowerCase());

    const matchesSpecies =
      selectedSpecies === "all" || pet.species === selectedSpecies;

    return matchesSearch && matchesSpecies;
  });

// In your PetManagement component, update the handleCallOwner function:

const handleCallOwner = async (pet: Pet) => {
  if (!pet.phoneNumber) {
    alert(`Phone number not available for ${pet.name}'s owner`);
    return;
  }

  try {
    // Check if CallHistory component is available
    if ((window as any).CallHistoryHandler) {
      // Use the CallHistory handler
      (window as any).CallHistoryHandler.handleCallFromPet(pet);
    } else {
      // Fallback to original method
      console.log('CallHistory handler not available, using fallback');
      
      const token = localStorage.getItem('auth_token');
      const callResponse = await fetch(`${API_BASE}/api/call-recordings`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
        },
        body: JSON.stringify({
          petName: pet.name,
          ownerName: pet.owner,
          phoneNumber: pet.phoneNumber,
          callType: "whatsapp",
          callDirection: "outgoing",
          duration: 0
        }),
      });

      if (callResponse.ok) {
        console.log('✅ Call recording created via API');
      }
    }

    // Open WhatsApp
    const formattedNumber = pet.phoneNumber.replace(/\D/g, '');
    let whatsappNumber = formattedNumber;
    
    if (!whatsappNumber.startsWith('+')) {
      whatsappNumber = whatsappNumber.startsWith('1') 
        ? `+${whatsappNumber}`
        : `+1${whatsappNumber}`;
    }

    const whatsappUrl = `https://wa.me/${whatsappNumber}`;
    window.open(whatsappUrl, '_blank', 'noopener,noreferrer');
    
  } catch (error) {
    console.error('❌ Call process failed:', error);
    
    // Final fallback
    const formattedNumber = pet.phoneNumber.replace(/\D/g, '');
    const whatsappUrl = `https://wa.me/${formattedNumber}`;
    window.open(whatsappUrl, '_blank', 'noopener,noreferrer');
  }
};
  // ✅ FIXED: Add pet function
  const handleAddPet = async () => {
    if (newPet.name && newPet.species && newPet.breed && newPet.owner && newPet.phoneNumber) {
      try {
        const token = localStorage.getItem('auth_token');
        console.log('🔐 Token for POST:', token);
        
        if (!token) {
          alert("Please login first");
          logout();
          return;
        }
        
        const petData: any = {
          name: newPet.name,
          species: newPet.species,
          breed: newPet.breed,
          age: newPet.age,
          owner: newPet.owner,
          phoneNumber: newPet.phoneNumber,
          notes: newPet.notes
        };
        
        if (newPet.imageData && newPet.imageType) {
          petData.imageData = newPet.imageData;
          petData.imageType = newPet.imageType;
        } else if (newPet.imageUrl) {
          petData.imageUrl = newPet.imageUrl;
        }

        console.log("📤 Sending pet data to:", `${API_BASE}/api/pets`);
        console.log("📦 Pet data:", petData);

        const response = await fetch(`${API_BASE}/api/pets`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Authorization": `Bearer ${token}`,
          },
          body: JSON.stringify(petData),
        });
        
        console.log('📡 POST Response status:', response.status);
        
        if (response.ok) {
          const addedPet = await response.json();
          const petWithImage = {
            ...addedPet.pet,
            imageUrl: newPet.previewUrl || addedPet.pet.imageUrl
          };
          
          setPets([...pets, petWithImage]);
          setNewPet({
            name: "",
            species: "",
            breed: "",
            age: "",
            owner: "",
            phoneNumber: "",
            imageUrl: "",
            imageData: "",
            imageType: "",
            notes: ""
          });
          setIsAddPetDialogOpen(false);
          alert("Pet added successfully!");
        } else {
          const errorData = await response.json();
          console.error("❌ Failed to add pet:", errorData);
          alert("Failed to add pet: " + (errorData.error || 'Unknown error'));
        }
      } catch (error) {
        console.error("❌ Error adding pet:", error);
        alert("Error adding pet: " + (error as Error).message);
      }
    } else {
      alert("Please fill all required fields (*)");
    }
  };

  const handleViewPet = (pet: Pet) => {
    setSelectedPet(pet);
    setIsViewPetDialogOpen(true);
  };

  // ✅ FIXED: Delete pet function
  const handleDeletePet = async () => {
    if (selectedPet) {
      try {
        const token = localStorage.getItem('auth_token');
        
        const response = await fetch(`${API_BASE}/api/pets/${selectedPet.id}`, {
          method: "DELETE",
          headers: {
            "Authorization": `Bearer ${token}`,
          },
        });
        
        console.log('🗑️ DELETE Response status:', response.status);
        
        if (response.ok) {
          setPets(pets.filter((pet) => pet.id !== selectedPet.id));
          setIsViewPetDialogOpen(false);
          setIsDeleteDialogOpen(false);
          alert("Pet deleted successfully!");
        } else {
          const errorData = await response.json();
          console.error("❌ Failed to delete pet:", errorData);
          alert("Failed to delete pet: " + (errorData.error || 'Unknown error'));
        }
      } catch (error) {
        console.error("❌ Error deleting pet:", error);
        alert("Error deleting pet. Please check your connection.");
      }
    }
  };

  const handleEditPet = (pet: Pet) => {
    setSelectedPet(pet);
    setEditFormData({
      name: pet.name,
      species: pet.species,
      breed: pet.breed,
      age: pet.age || "",
      owner: pet.owner,
      phoneNumber: pet.phoneNumber || "", 
      imageUrl: pet.imageUrl || "",
      notes: pet.notes || ""
    });
    setIsEditPetDialogOpen(true);
  };

  // ✅ FIXED: Edit pet function
  const saveEditedPet = async () => {
    if (
      selectedPet &&
      editFormData.name &&
      editFormData.species &&
      editFormData.breed &&
      editFormData.owner &&
      editFormData.phoneNumber
    ) {
      try {
        setIsSaving(true);
        const token = localStorage.getItem('auth_token');
        
        const petData: any = {
          name: editFormData.name,
          species: editFormData.species,
          breed: editFormData.breed,
          age: editFormData.age,
          owner: editFormData.owner,
          phoneNumber: editFormData.phoneNumber.replace(/\D/g, ''), 
          notes: editFormData.notes
        };
        
        if (editFormData.imageData && editFormData.imageType) {
          petData.imageData = editFormData.imageData;
          petData.imageType = editFormData.imageType;
        } else if (editFormData.imageUrl) {
          petData.imageUrl = editFormData.imageUrl;
        }

        console.log("📤 Updating pet at:", `${API_BASE}/api/pets/${selectedPet.id}`);

        const response = await fetch(`${API_BASE}/api/pets/${selectedPet.id}`, {
          method: "PUT",
          headers: {
            "Content-Type": "application/json",
            "Authorization": `Bearer ${token}`,
          },
          body: JSON.stringify(petData),
        });
        
        console.log('📡 PUT Response status:', response.status);
        
        if (response.ok) {
          const updatedPet = await response.json();
          const updatedPets = pets.map((pet) => {
            if (pet.id === selectedPet.id) {
              return updatedPet.pet;
            }
            return pet;
          });
          
          setPets(updatedPets);
          setIsEditPetDialogOpen(false);
          setEditFormData({
            name: "",
            species: "",
            breed: "",
            age: "",
            owner: "",
            phoneNumber: "",
            imageUrl: "",
            notes: ""
          });
          
          alert("Pet updated successfully!");
        } else {
          const errorData = await response.json();
          console.error("❌ Failed to update pet:", errorData);
          alert("Failed to update pet: " + (errorData.error || 'Unknown error'));
        }
      } catch (error) {
        console.error("❌ Error updating pet:", error);
        alert("Error updating pet. Please check your connection.");
      } finally {
        setIsSaving(false);
      }
    } else {
      alert("Please fill all required fields (*)");
    }
  };

  const handleNewPetChange = (updatedFields: Partial<PetFormData>) => {
    setNewPet((prev) => ({ 
      ...prev, 
      ...updatedFields,
      imageUrl: updatedFields.previewUrl || prev.imageUrl,
      imageData: updatedFields.imageData !== undefined ? updatedFields.imageData : prev.imageData,
      imageType: updatedFields.imageType !== undefined ? updatedFields.imageType : prev.imageType
    }));
  };

  const handleEditFormChange = (updatedFields: Partial<PetFormData>) => {
    setEditFormData((prev) => ({ 
      ...prev, 
      ...updatedFields,
      imageUrl: updatedFields.previewUrl || prev.imageUrl
    }));
  };

  if (isLoading) {
    return <div className="p-6">Loading pets...</div>;
  }

  return (
    <div className="bg-background p-6 rounded-lg w-full">
      <PetManagementHeader onAddPet={() => setIsAddPetDialogOpen(true)} />

      <PetSearchFilter
        searchTerm={searchTerm}
        selectedSpecies={selectedSpecies}
        onSearchChange={setSearchTerm}
        onSpeciesChange={setSelectedSpecies}
      />
      
      <PetsGrid
        pets={filteredPets}
        onViewPet={handleViewPet}
        onEditPet={handleEditPet}
        onDeletePet={(id) => {
          setSelectedPet(pets.find((p) => p.id === id) || null);
          setIsDeleteDialogOpen(true);
        }}
        onCallOwner={handleCallOwner} // Updated to include call functionality
      />

      <AddPetDialog
        isOpen={isAddPetDialogOpen}
        onOpenChange={setIsAddPetDialogOpen}
        pet={newPet}
        onPetChange={handleNewPetChange}
        onAddPet={handleAddPet}
      />

      <ViewPetDialog
        isOpen={isViewPetDialogOpen}
        onOpenChange={setIsViewPetDialogOpen}
        pet={selectedPet}
        onEdit={() => {
          if (selectedPet) {
            handleEditPet(selectedPet);
          }
        }}
        onDelete={(id) => {
          setSelectedPet(pets.find((p) => p.id === id) || null);
          setIsDeleteDialogOpen(true);
        }}
      />

      <EditPetDialog
        isOpen={isEditPetDialogOpen}
        onOpenChange={setIsEditPetDialogOpen}
        pet={editFormData}
        onPetChange={handleEditFormChange}
        onSave={saveEditedPet}
        isSaving={isSaving}
      />

      <DeletePetDialog
        isOpen={isDeleteDialogOpen}
        onOpenChange={setIsDeleteDialogOpen}
        pet={selectedPet}
        onDelete={handleDeletePet}
      />
    </div>
  );
};

export default PetManagement;