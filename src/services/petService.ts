import { Pet } from "../types/petTypes";

const API_BASE = 'http://192.168.0.107:5000';

export const getPets = async (): Promise<Pet[]> => {
  try {
    // ✅ CORRECT TOKEN NAME - 'auth_token' instead of 'token'
    const token = localStorage.getItem('auth_token');
    
    console.log('🔐 Token from localStorage:', token ? 'Exists' : 'MISSING');
    console.log('🌐 API Base URL:', API_BASE);

    if (!token) {
      throw new Error('No authentication token found. Please login again.');
    }

    // ✅ CORRECT API URL - Full URL instead of '/api/pets'
    const response = await fetch(`${API_BASE}/api/pets`, {
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
    });
    
    console.log('📡 Response status:', response.status);
    
    if (!response.ok) {
      if (response.status === 401) {
        // Token expired
        localStorage.removeItem('auth_token');
        localStorage.removeItem('user');
        throw new Error('Session expired. Please login again.');
      }
      throw new Error(`Failed to fetch pets: ${response.status}`);
    }
    
    const pets = await response.json();
    console.log('✅ Pets fetched successfully:', pets.length);
    
    return pets.map((pet: any) => ({
      ...pet,
      // Ensure imageUrl is properly formatted
      imageUrl: pet.imageUrl || `http://api.dicebear.com/7.x/avataaars/svg?seed=${pet.name}`
    }));
  } catch (error) {
    console.error('❌ Error fetching pets:', error);
    throw error;
  }
};