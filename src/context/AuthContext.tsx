import React, { createContext, useContext, useState, useEffect, ReactNode, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';

interface User {
  id: string;
  email: string;
  name: string;
  role?: 'admin' | 'doctor' | 'nurse';
  createdAt: string;
  auth0Id?: string;
}

interface AuthResponse {
  token: string;
  user: User;
}
interface Auth0User {
  sub: string;
  email: string;
  name: string;
  email_verified?: boolean;
}

type AuthContextType = {
  user: User | null;
  isLoading: boolean;
  error: string;
  register: (email: string, password: string, name: string) => Promise<void>;
  login: (email: string, password: string) => Promise<void>;
  loginWithAuth0: (auth0UserData: Auth0User, auth0Token: string) => Promise<void>;
  logout: () => void;
  isAuthenticated: boolean;
  getToken: () => string | null;
  syncAuth0UserWithBackend: (auth0UserData: any) => Promise<void>;
  hasRole: (roles: string[]) => boolean;
  updateUserRole: (role: string) => Promise<void>;
  role: string | null;
};

export const AuthContext = createContext<AuthContextType | undefined>(undefined);

interface AuthProviderProps {
  children: ReactNode;
}
let syncAttempts = 0;
const MAX_SYNC_ATTEMPTS = 2;

export function AuthProvider({ children }: AuthProviderProps) {
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState('');
  const navigate = useNavigate();

  const hasRole = (roles: string[]): boolean => {
    if (!user || !user.role) return false;
    return roles.includes(user.role);
  };
  const updateUserRole = async (role: string): Promise<void> => {
    try {
      const token = getToken();
      if (!token) throw new Error('No authentication token found');

      const response = await fetch(`${import.meta.env.VITE_API_BASE}/api/user/role`, {
        method: 'PUT',
        headers: { 
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ role })
      });

      const responseData = await response.json();

      if (!response.ok) {
        throw new Error(responseData.error || 'Failed to update role');
      }
      if (responseData.user) {
        const updatedUser = { ...user, ...responseData.user };
        setUser(updatedUser);
        localStorage.setItem('user', JSON.stringify(updatedUser));
      }

    } catch (error: any) {
      console.error('Role update error:', error);
      throw error;
    }
  };

const getToken = (): string | null => {
  const token = localStorage.getItem('auth_token');
  console.log('🔐 getToken() called - Returning:', token ? token.substring(0, 20) + '...' : 'NULL');
  return token;
};
  const setToken = (token: string): void => {
    localStorage.setItem('auth_token', token);
  };

  const removeToken = (): void => {
    localStorage.removeItem('auth_token');
    localStorage.removeItem('user');
    localStorage.removeItem('auth0_user');
    localStorage.removeItem('auth0_sub');
    localStorage.removeItem('last_sync_attempt');
  };
const syncAuth0UserWithBackend = useCallback(async (auth0UserData: any): Promise<void> => {
  if (syncAttempts >= MAX_SYNC_ATTEMPTS) {
    console.warn("⚠️ Too many sync attempts, aborting");
    setIsLoading(false); // ✅ ADD THIS
    return;
  }
  
  syncAttempts++;
  
  try {
    console.log("🔄 Syncing Auth0 user with backend...", auth0UserData);
    const lastSyncAttempt = localStorage.getItem('last_sync_attempt');
    const now = Date.now();
    if (lastSyncAttempt && (now - parseInt(lastSyncAttempt)) < 5000) { 
      console.log("⏳ Sync attempted recently, skipping");
      setIsLoading(false); // ✅ ADD THIS
      return;
    }
    
    localStorage.setItem('last_sync_attempt', now.toString());
    
    const auth0Id = auth0UserData.sub || auth0UserData.id;
    const email = auth0UserData.email;
    const name = auth0UserData.name || auth0UserData.email?.split('@')[0] || 'User';
    
    if (!auth0Id || !email) {
      throw new Error('Invalid Auth0 user data: missing sub or email');
    }
    await new Promise(resolve => setTimeout(resolve, 500));
    
    const response = await fetch(`${import.meta.env.VITE_API_BASE}/api/auth/auth0/sync`, {
      method: 'POST',
      headers: { 
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        auth0Id: auth0Id,
        email: email,
        name: name,
        emailVerified: true
      })
    });

    const responseData = await response.json();
    console.log("📡 Backend sync response:", responseData);

    if (!response.ok) {
      if (response.status === 429) {
        console.warn("Rate limited, will retry on next login");
        localStorage.setItem('auth0_user', JSON.stringify(auth0UserData));
        setIsLoading(false); // ✅ ADD THIS
        return;
      }
      throw new Error(responseData.error || 'Auth0 sync failed');
    }

    if (!responseData.token || !responseData.user) {
      throw new Error('Invalid response from server');
    }
    
    // ✅ TOKEN SAVE - Yahan check karo
    console.log('💾 Saving token to localStorage:', responseData.token.substring(0, 20) + '...');
    setToken(responseData.token);
    localStorage.setItem('user', JSON.stringify(responseData.user));
    localStorage.setItem('auth_token', responseData.token);
    setUser(responseData.user);
    
    syncAttempts = 0;
    localStorage.removeItem('auth0_user');
    localStorage.removeItem('last_sync_attempt');
    
    console.log("✅ Auth0 user synced successfully with database");
    
  } catch (error: any) {
    console.error('❌ Auth0 sync error:', error);
    // Clear invalid data
    localStorage.removeItem('auth0_user');
    localStorage.removeItem('last_sync_attempt');
  } finally {
    setIsLoading(false); // ✅ ADD THIS - MOST IMPORTANT
  }
}, []);
const checkAuthStatus = useCallback(async () => {
  console.log("Checking authentication status");
  
  const auth0UserStr = localStorage.getItem('auth0_user');
  const token = localStorage.getItem('auth_token');
  const userDataStr = localStorage.getItem('user');
  
  console.log("Auth0 user from storage:", auth0UserStr);
  console.log("Token from storage:", token);
  console.log("User data from storage:", userDataStr);
  if (token && userDataStr) {
    try {
      const userData = JSON.parse(userDataStr);
      setUser(userData);
      setIsLoading(false);
      return;
    } catch (err) {
      console.error("Failed to parse user data:", err);
      localStorage.removeItem('user');
      localStorage.removeItem('auth_token');
    }
  }
  if (auth0UserStr && !token) {
    try {
      const auth0User = JSON.parse(auth0UserStr);
      console.log("Auth0 user found but no token, starting sync...");
      localStorage.removeItem('last_sync_attempt');
      syncAttempts = 0; 
      await syncAuth0UserWithBackend(auth0User);
    } catch (err) {
      console.error("Failed to parse Auth0 user data:", err);
      localStorage.removeItem('auth0_user');
    }
  }
  
  setIsLoading(false);
}, [syncAuth0UserWithBackend]);
  useEffect(() => {
    checkAuthStatus();
  }, [checkAuthStatus]);

  const register = async (email: string, password: string, name: string): Promise<void> => {
    setIsLoading(true);
    setError('');
    try {
      console.log("Registering user:", { email, name });
      
      const response = await fetch(`${import.meta.env.VITE_API_BASE}/api/auth/register`, {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ email, password, name }),
      });

      const responseData = await response.json();
      console.log("Registration response:", responseData);

      if (!response.ok) {
        throw new Error(responseData.error || responseData.message || 'Registration failed');
      }

      if (!responseData.token || !responseData.user) {
        throw new Error('Invalid response from server');
      }
      setToken(responseData.token);
      localStorage.setItem('user', JSON.stringify(responseData.user));
      setUser(responseData.user);
      
      console.log("Registration successful, user:", responseData.user);
      
    } catch (error: any) {
      console.error('Registration error:', error);
      setError(error.message || 'Registration failed. Please try again.');
      throw error;
    } finally {
      setIsLoading(false);
    }
  };

  const login = async (email: string, password: string): Promise<void> => {
    setIsLoading(true);
    setError('');
    try {
      console.log("Logging in user:", email);
      
      const response = await fetch(`${import.meta.env.VITE_API_BASE}/api/auth/login`, {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ email, password }),
      });

      const responseData = await response.json();
      console.log("Login response:", responseData);

      if (!response.ok) {
        throw new Error(responseData.error || responseData.message || 'Login failed');
      }

      if (!responseData.token || !responseData.user) {
        throw new Error('Invalid response from server');
      }
      setToken(responseData.token);
      localStorage.setItem('user', JSON.stringify(responseData.user));
      setUser(responseData.user);
      
      console.log("Login successful, user:", responseData.user);
      
    } catch (error: any) {
      console.error('Login error:', error);
      setError(error.message || 'Login failed. Please check your credentials.');
      throw error;
    } finally {
      setIsLoading(false);
    }
  };
  const loginWithAuth0 = async (auth0UserData: Auth0User, auth0Token: string): Promise<void> => {
    setIsLoading(true);
    setError('');
    try {
      console.log("🔄 Syncing Auth0 user with backend...", auth0UserData);
      
      const response = await fetch(`${import.meta.env.VITE_API_BASE}/api/auth/auth0/callback`, {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${auth0Token}`
        },
        body: JSON.stringify({
          auth0Id: auth0UserData.sub,
          email: auth0UserData.email,
          name: auth0UserData.name,
          emailVerified: auth0UserData.email_verified || false
        })
      });

      const responseData = await response.json();
      console.log("Backend sync response:", responseData);

      if (!response.ok) {
        if (responseData.code === 'ACCOUNT_LINKING_REQUIRED') {
          throw new Error('This email is already registered. Please use your original login method or contact support.');
        }
        throw new Error(responseData.error || 'Auth0 sync failed');
      }

      if (!responseData.token || !responseData.user) {
        throw new Error('Invalid response from server');
      }
      setToken(responseData.token);
      localStorage.setItem('user', JSON.stringify(responseData.user));
      localStorage.setItem('auth_token', responseData.token);
      setUser(responseData.user);
      
      console.log("Auth0 login successful");
      
    } catch (error: any) {
      console.error('Auth0 login error:', error);
      setError(error.message || 'Auth0 login failed');
      throw error;
    } finally {
      setIsLoading(false);
    }
  };
  const linkAuth0Account = async (email: string, password: string, auth0UserData: Auth0User): Promise<void> => {
    try {
      await login(email, password);
      const response = await fetch(`${import.meta.env.VITE_API_BASE}/api/auth/link-auth0`, {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${getToken()}`
        },
        body: JSON.stringify({
          auth0Id: auth0UserData.sub,
          email: auth0UserData.email
        })
      });

      if (!response.ok) {
        throw new Error('Failed to link Auth0 account');
      }
      const updatedUser = { ...user, auth0Id: auth0UserData.sub };
      setUser(updatedUser);
      localStorage.setItem('user', JSON.stringify(updatedUser));
      
    } catch (error: any) {
      console.error('Account linking error:', error);
      throw error;
    }
  };
 const logout = (): void => {
  console.log("Logging out user - Clearing all storage");
  
  // Clear all storage
  localStorage.clear();
  sessionStorage.clear();
  
  // Clear cookies
  document.cookie.split(";").forEach(cookie => {
    const eqPos = cookie.indexOf("=");
    const name = eqPos > -1 ? cookie.substr(0, eqPos) : cookie;
    document.cookie = name + "=;expires=Thu, 01 Jan 1970 00:00:00 GMT;path=/";
    document.cookie = name + "=;expires=Thu, 01 Jan 1970 00:00:00 GMT;path=/;domain=." + window.location.hostname;
  });
  
  // Clear state
  setUser(null);
  setError('');
  setIsLoading(false);
  
  console.log("✅ All storage cleared - redirecting to login");
};
  const recoverFromAuthError = useCallback((): void => {
    console.log("🔄 Attempting auth error recovery");
    localStorage.removeItem('auth_token');
    localStorage.removeItem('user');
    localStorage.removeItem('auth0_user');
    localStorage.removeItem('last_sync_attempt');
    setUser(null);
    setError('');
    setIsLoading(false);
    window.location.href = '/login';
  }, []);

  const value: AuthContextType = { 
    user, 
    isLoading, 
    error,
    register, 
    login, 
    loginWithAuth0,
    logout,
    isAuthenticated: !!user,
    getToken,
    syncAuth0UserWithBackend,
    hasRole,
    updateUserRole,
    role: user?.role || null
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextType {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}