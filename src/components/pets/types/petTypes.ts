export interface Pet {
  id: string;
  name: string;
  species: string;
  breed: string;
  age: string;
  owner: string;
  phoneNumber?: string; // یہ شامل کریں
  imageUrl: string;
  notes?: string;
   imageData?: string;  // Add this
  imageType?: string;
}

export interface PetFormData {
  name: string;
  species: string;
  breed: string;
  age: string;
  owner: string;
  phoneNumber?: string; // یہ شامل کریں
  imageUrl?: string;
  notes?: string;
}