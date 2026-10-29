import React, { useState, useEffect } from "react";
import DashboardLayout from "../../components/layout/DashboardLayout";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "../../components/ui/card";
import { Avatar, AvatarFallback, AvatarImage } from "../../components/ui/avatar";
import { Button } from "../../components/ui/button";
import { Input } from "../../components/ui/input";
import { Label } from "../../components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "../../components/ui/tabs";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "../../components/ui/dialog";
import { useToast } from "../../components/ui/use-toast";
import { useAuth } from "../../context/AuthContext";
import { Badge } from "../../components/ui/badge";
import { 
  CheckIcon, 
  AlertTriangleIcon, 
  CreditCard, 
  Building, 
  Mail, 
  Edit, 
  Trash2, 
  Loader2, 
  Upload,
  User
} from "lucide-react";
import { RadioGroup, RadioGroupItem } from "../../components/ui/radio-group";

const ProfilePage = () => {
  const { toast } = useToast();
  const [isAvatarDialogOpen, setIsAvatarDialogOpen] = useState(false);
  const [avatarSeed, setAvatarSeed] = useState("vet");
  const { user } = useAuth();
  const [uploadingAvatar, setUploadingAvatar] = useState(false);
  
  // ✅ FIX: Use same API_BASE as FileManager
  const API_BASE = import.meta.env.VITE_API_BASE || 'https://mliapi.ddns.net:5000';
  const API_URL = `${API_BASE}/api`;

  // ✅ FIX: Direct token access function (FileManager jaisa)
  const getTokenDirect = (): string => {
    const token = localStorage.getItem('auth_token');
    console.log('🔐 ProfilePage getTokenDirect:', token ? 'Present' : 'NULL');
    if (!token) {
      throw new Error('No authentication token found');
    }
    return token;
  };

  // Subscription state
  const [isPlanDialogOpen, setIsPlanDialogOpen] = useState(false);
  const [isCancelDialogOpen, setIsCancelDialogOpen] = useState(false);
  const [selectedPlan, setSelectedPlan] = useState("premium");
  const [billingCycle, setBillingCycle] = useState("monthly");
  const [subscriptionData, setSubscriptionData] = useState(null);
  const [loadingSubscription, setLoadingSubscription] = useState(true);
  
  const [avatarOptions, setAvatarOptions] = useState([
    "vet",
    "doctor",
    "medical",
    "health",
    "care",
    "animal",
    "pet",
  ]);

  const [userData, setUserData] = useState({
    name: "",
    email: "",
    professional_title: "",
    phone_number: "",
    phone_verified: false,
    avatar_seed: "vet",
    avatar_url: "",
    createdAt: "",
    updatedAt: ""
  });

  const [loading, setLoading] = useState(false);
  const [passwordLoading, setPasswordLoading] = useState(false);
  const [verifyLoading, setVerifyLoading] = useState(false);
  const [cancelling, setCancelling] = useState(false);
  const [subscribing, setSubscribing] = useState(false);
  const [paymentMethod, setPaymentMethod] = useState("card");
  const [isAddPaymentMethodOpen, setIsAddPaymentMethodOpen] = useState(false);
  const [isEditPaymentMethodOpen, setIsEditPaymentMethodOpen] = useState(false);
  const [savingPaymentMethod, setSavingPaymentMethod] = useState(false);
  const [editingPaymentMethod, setEditingPaymentMethod] = useState(false);
  const [currentPaymentMethod, setCurrentPaymentMethod] = useState(null);

  // Form states for different payment methods
  const [cardData, setCardData] = useState({
    cardNumber: "",
    expiryDate: "",
    cvv: "",
    cardholderName: "",
  });

  const [bankData, setBankData] = useState({
    accountHolderName: "",
    accountNumber: "",
    routingNumber: "",
    bankName: "",
    accountType: "checking",
  });

  const [paypalData, setPaypalData] = useState({
    email: "",
  });

  const [paymentMethods, setPaymentMethods] = useState([]);

  const subscriptionPlans = {
    monthly: [
      {
        id: "basic",
        name: "Basic",
        price: 0,
        description: "For individual veterinarians",
        features: [
          "5 transcriptions per month",
          "Basic templates",
          "Email support",
          "1GB storage"
        ]
      },
      {
        id: "premium",
        name: "Premium",
        price: 29,
        description: "For small clinics",
        features: [
          "Unlimited transcriptions",
          "All templates",
          "Priority support",
          "10GB storage",
          "Multiple pets"
        ],
        popular: true
      },
      {
        id: "enterprise",
        name: "Enterprise",
        price: 79,
        description: "For large veterinary hospitals",
        features: [
          "Unlimited transcriptions",
          "Custom templates",
          "24/7 dedicated support",
          "Unlimited storage",
          "Team collaboration",
          "Advanced analytics"
        ]
      }
    ],
    yearly: [
      {
        id: "basic",
        name: "Basic",
        price: 0,
        description: "For individual veterinarians",
        features: [
          "5 transcriptions per month",
          "Basic templates",
          "Email support",
          "1GB storage"
        ],
        savings: "Save 17%"
      },
      {
        id: "premium",
        name: "Premium",
        price: 290,
        description: "For small clinics",
        features: [
          "Unlimited transcriptions",
          "All templates",
          "Priority support",
          "10GB storage",
          "Multiple pets"
        ],
        popular: true,
        savings: "Save 17%"
      },
      {
        id: "enterprise",
        name: "Enterprise",
        price: 790,
        description: "For large veterinary hospitals",
        features: [
          "Unlimited transcriptions",
          "Custom templates",
          "24/7 dedicated support",
          "Unlimited storage",
          "Team collaboration",
          "Advanced analytics"
        ],
        savings: "Save 17%"
      }
    ]
  };

  const [editableData, setEditableData] = useState({
    professional_title: "",
    phone_number: ""
  });

  useEffect(() => {
    if (user && user.name && user.email) {
      setUserData(prev => ({
        ...prev,
        name: user.name,
        email: user.email
      }));
    }
    
    fetchUserProfile();
    fetchSubscriptionData();
    fetchPaymentMethods();
  }, [user]);

  useEffect(() => {
    if (userData) {
      setEditableData({
        professional_title: userData.professional_title || "",
        phone_number: userData.phone_number || ""
      });
    }
  }, [userData]);

  // ✅ FIXED: Profile fetch with proper error handling and avatar management
  const fetchUserProfile = async () => {
    try {
      const token = getTokenDirect();
      
      console.log('🔐 Fetching profile from:', `${API_URL}/user/profile`);
      
      const response = await fetch(`${API_URL}/user/profile`, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        }
      });
      
      console.log('👤 Profile API Response:', response.status);
      
      if (response.ok) {
        const data = await response.json();
        console.log('✅ Profile data received:', data);
        
        // ✅ PROPERLY SET BOTH USER DATA AND AVATAR SEED
        setUserData(prev => ({
          ...prev,
          ...data,
          name: data.name || user?.name || prev.name,
          email: data.email || user?.email || prev.email,
          avatar_url: data.avatar_url || prev.avatar_url,
          avatar_seed: data.avatar_seed || prev.avatar_seed
        }));
        
        // ✅ SET AVATAR SEED SEPARATELY FOR CONSISTENCY
        setAvatarSeed(data.avatar_seed || "vet");
        
        setEditableData({
          professional_title: data.professional_title || "",
          phone_number: data.phone_number || ""
        });
      } else {
        console.error('❌ Profile API error:', response.status);
        // Use cached user data if available
        if (user) {
          setUserData(prev => ({
            ...prev,
            name: user.name || prev.name,
            email: user.email || prev.email
          }));
        }
        
        // Don't show error toast for network issues
        if (response.status !== 0) {
          toast({
            title: "Warning",
            description: "Using cached profile data. Some features may be limited.",
          });
        }
      }
    } catch (error) {
      console.error('❌ Error fetching profile:', error);
      // Use cached user data
      if (user) {
        setUserData(prev => ({
          ...prev,
          name: user.name || prev.name,
          email: user.email || prev.email
        }));
      }
      
      // Only show warning for non-network errors
      if (error.message !== 'Failed to fetch') {
        toast({
          title: "Warning",
          description: "Could not fetch profile data. Using cached information.",
        });
      }
    }
  };

  // ✅ FIXED: Subscription fetch with error handling
  const fetchSubscriptionData = async () => {
    try {
      setLoadingSubscription(true);
      const token = getTokenDirect();
      console.log('📦 Fetching subscription from:', `${API_URL}/user/subscription`);
      
      const response = await fetch(`${API_URL}/user/subscription`, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        }
      });
      
      console.log('📦 Subscription API Response:', response.status);
      
      if (response.ok) {
        const data = await response.json();
        console.log('✅ Subscription data:', data);
        setSubscriptionData(data);
      } else if (response.status === 404) {
        console.log('ℹ️ No subscription found');
        setSubscriptionData(null);
      } else {
        console.error('❌ Subscription API error:', response.status);
        setSubscriptionData(null);
      }
    } catch (error) {
      console.error('❌ Error fetching subscription:', error);
      setSubscriptionData(null);
    } finally {
      setLoadingSubscription(false);
    }
  };

  // ✅ FIXED: Payment methods fetch
  const fetchPaymentMethods = async () => {
    try {
      const token = getTokenDirect();
      console.log('💳 Fetching payment methods from:', `${API_URL}/user/payment-methods`);
      
      const response = await fetch(`${API_URL}/user/payment-methods`, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        }
      });
      
      console.log('💳 Payment methods API Response:', response.status);
      
      if (response.ok) {
        const data = await response.json();
        console.log('✅ Payment methods:', data);
        setPaymentMethods(data);
      } else {
        console.error('❌ Payment methods API error:', response.status);
        setPaymentMethods([]);
      }
    } catch (error) {
      console.error('❌ Error fetching payment methods:', error);
      setPaymentMethods([]);
    }
  };

  // ✅ FIXED: Handle avatar change with immediate update
  const handleAvatarChange = async (seed: string) => {
    setAvatarSeed(seed);
    setIsAvatarDialogOpen(false);
    
    // ✅ UPDATE THE AVATAR SEED IN BACKEND IMMEDIATELY
    await updateAvatarSeed(seed);
  };

  const generateRandomSeed = () => {
    const randomSeed = Math.random().toString(36).substring(2, 8);
    setAvatarOptions([...avatarOptions, randomSeed]);
    handleAvatarChange(randomSeed);
  };

  // ✅ FIXED: Update avatar seed in backend with immediate feedback
  const updateAvatarSeed = async (seed: string) => {
    try {
      const token = getTokenDirect();
      
      const response = await fetch(`${API_URL}/user/profile`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          avatar_seed: seed,
          avatar_url: null // Clear uploaded avatar when using seed
        })
      });
      
      if (response.ok) {
        // ✅ UPDATE LOCAL STATE IMMEDIATELY
        setUserData(prev => ({
          ...prev,
          avatar_url: "", // Clear uploaded avatar
          avatar_seed: seed
        }));
        
        setAvatarSeed(seed);
        
        toast({
          title: "Success",
          description: "Avatar updated successfully!",
        });
        
        // Refresh to ensure consistency
        fetchUserProfile();
      } else {
        toast({
          title: "Error",
          description: "Failed to update avatar",
          variant: "destructive",
        });
      }
    } catch (error) {
      console.error('Error updating avatar seed:', error);
      toast({
        title: "Error",
        description: "Failed to update avatar",
        variant: "destructive",
      });
    }
  };

  // ✅ FIXED: Handle avatar upload with immediate update
  const handleAvatarUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    // Check file type and size
    if (!file.type.startsWith('image/')) {
      toast({
        title: "Error",
        description: "Please select a valid image file",
        variant: "destructive",
      });
      return;
    }

    if (file.size > 5 * 1024 * 1024) {
      toast({
        title: "Error",
        description: "Image size should be less than 5MB",
        variant: "destructive",
      });
      return;
    }

    setUploadingAvatar(true);
    
    try {
      const token = getTokenDirect();
      const formData = new FormData();
      formData.append('avatar', file);

      const response = await fetch(`${API_URL}/user/avatar`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
        },
        body: formData
      });

      if (response.ok) {
        const result = await response.json();
        
        // ✅ IMMEDIATELY update the user data
        setUserData(prev => ({
          ...prev,
          avatar_url: result.avatarUrl,
          avatar_seed: "" // Clear seed when using uploaded avatar
        }));
        
        // ✅ CLEAR AVATAR SEED STATE
        setAvatarSeed("");
        
        toast({
          title: "Success",
          description: "Profile picture updated successfully!",
        });
        
        setIsAvatarDialogOpen(false);
        
        // ✅ AUTOMATICALLY SAVE THE PROFILE WITH NEW AVATAR URL
        await saveAvatarToProfile(result.avatarUrl);
        
      } else {
        const errorData = await response.json();
        toast({
          title: "Error",
          description: errorData.error || "Failed to upload profile picture",
          variant: "destructive",
        });
      }
    } catch (error) {
      console.error('❌ Error uploading avatar:', error);
      toast({
        title: "Error",
        description: "Unable to upload profile picture. Please try again.",
        variant: "destructive",
      });
    } finally {
      setUploadingAvatar(false);
      // Reset the file input
      event.target.value = '';
    }
  };

  // ✅ NEW: Function to automatically save avatar to profile
  const saveAvatarToProfile = async (avatarUrl: string) => {
    try {
      const token = getTokenDirect();
      
      const response = await fetch(`${API_URL}/user/profile`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          avatar_url: avatarUrl,
          avatar_seed: null // Clear seed when using uploaded avatar
        })
      });
      
      if (response.ok) {
        console.log('✅ Avatar URL saved to profile');
        // Refresh user profile data
        fetchUserProfile();
      } else {
        console.error('❌ Failed to save avatar URL to profile');
      }
    } catch (error) {
      console.error('❌ Error saving avatar to profile:', error);
    }
  };

  const handleInputChange = (field: string, value: string) => {
    setEditableData(prev => ({
      ...prev,
      [field]: value
    }));
  };

  // ✅ FIXED: Save changes with proper avatar data handling
  const handleSaveChanges = async () => {
    setLoading(true);
    
    try {
      const token = getTokenDirect();
      
      console.log('💾 Saving profile to:', `${API_URL}/user/profile`);
      
      // Prepare update data
      const updateData: any = {
        professional_title: editableData.professional_title,
        phone_number: editableData.phone_number,
      };
      
      // Handle avatar logic
      if (userData.avatar_url) {
        // If user has uploaded avatar, use that and clear seed
        updateData.avatar_url = userData.avatar_url;
        updateData.avatar_seed = null;
      } else {
        // If no uploaded avatar, use the seed
        updateData.avatar_seed = avatarSeed;
        updateData.avatar_url = null;
      }
      
      console.log('📦 Update data:', updateData);
      
      const response = await fetch(`${API_URL}/user/profile`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify(updateData)
      });
      
      console.log('💾 Save profile response:', response.status);
      
      if (response.status === 401) {
        localStorage.removeItem('auth_token');
        toast({
          title: "Session Expired",
          description: "Please log in again.",
          variant: "destructive",
        });
        setLoading(false);
        return;
      }
      
      if (response.ok) {
        const result = await response.json();
        
        // ✅ IMMEDIATELY UPDATE LOCAL STATE
        setUserData(prev => ({
          ...prev,
          ...updateData,
          // Ensure we have the latest data from server
          avatar_url: result.user?.avatar_url || updateData.avatar_url,
          avatar_seed: result.user?.avatar_seed || updateData.avatar_seed
        }));
        
        toast({
          title: "Success",
          description: "Profile updated successfully!",
        });
        
        // Optional: Refresh profile data to ensure consistency
        setTimeout(() => {
          fetchUserProfile();
        }, 500);
        
      } else {
        const errorText = await response.text();
        console.error('Save profile error:', errorText);
        toast({
          title: "Error",
          description: "Failed to update profile. Please try again.",
          variant: "destructive",
        });
      }
    } catch (error) {
      console.error('❌ Error updating profile:', error);
      toast({
        title: "Error",
        description: "Unable to connect to server. Please check your connection.",
        variant: "destructive",
      });
    }
    setLoading(false);
  };

  // ✅ FIXED: Verify phone with error handling
  const handleVerifyPhone = async () => {
    setVerifyLoading(true);
    try {
      const token = getTokenDirect();
      const response = await fetch(`${API_URL}/user/verify-phone`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        }
      });
      
      if (response.ok) {
        toast({
          title: "Verification Sent",
          description: "Verification code sent to your phone number",
        });
        fetchUserProfile();
      } else {
        const errorData = await response.json();
        toast({
          title: "Error",
          description: errorData.error || "Failed to send verification",
          variant: "destructive",
        });
      }
    } catch (error) {
      console.error('❌ Error sending verification:', error);
      toast({
        title: "Error",
        description: "Unable to send verification. Please try again.",
        variant: "destructive",
      });
    }
    setVerifyLoading(false);
  };

  const handleUpdatePassword = async () => {
    setPasswordLoading(true);
    
    const currentPassword = (document.getElementById('current-password') as HTMLInputElement)?.value;
    const newPassword = (document.getElementById('new-password') as HTMLInputElement)?.value;
    const confirmPassword = (document.getElementById('confirm-password') as HTMLInputElement)?.value;
    
    console.log('🔐 Frontend - Password change attempt:', {
      hasCurrentPassword: !!currentPassword,
      hasNewPassword: !!newPassword,
      hasConfirmPassword: !!confirmPassword
    });
    
    // Basic validation
    if (!newPassword || !confirmPassword) {
      toast({
        title: "Error",
        description: "New password and confirmation are required",
        variant: "destructive",
      });
      setPasswordLoading(false);
      return;
    }
    
    if (newPassword !== confirmPassword) {
      toast({
        title: "Error",
        description: "New passwords don't match",
        variant: "destructive",
      });
      setPasswordLoading(false);
      return;
    }
    
    if (newPassword.length < 6) {
      toast({
        title: "Error",
        description: "Password must be at least 6 characters long",
        variant: "destructive",
      });
      setPasswordLoading(false);
      return;
    }
    
    try {
      const token = getTokenDirect();
      
      console.log('🌐 Sending password change request to:', `${API_URL}/user/change-password`);
      
      const requestBody: any = { newPassword };
      
      // Only include currentPassword if it's provided (for existing password users)
      if (currentPassword) {
        requestBody.currentPassword = currentPassword;
      }
      
      console.log('📦 Request body:', requestBody);
      
      const response = await fetch(`${API_URL}/user/change-password`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify(requestBody)
      });
      
      console.log('📡 Response status:', response.status);
      
      if (response.ok) {
        const result = await response.json();
        console.log('✅ Password change successful:', result);
        
        toast({
          title: "Success",
          description: result.message || "Password updated successfully!",
        });
        
        // Clear the form
        (document.getElementById('current-password') as HTMLInputElement).value = '';
        (document.getElementById('new-password') as HTMLInputElement).value = '';
        (document.getElementById('confirm-password') as HTMLInputElement).value = '';
      } else {
        const errorData = await response.json();
        console.error('❌ Password change failed:', errorData);
        
        toast({
          title: "Error",
          description: errorData.error || "Failed to update password",
          variant: "destructive",
        });
      }
    } catch (error) {
      console.error('❌ Error updating password:', error);
      toast({
        title: "Error",
        description: "Unable to update password. Please try again.",
        variant: "destructive",
      });
    }
    setPasswordLoading(false);
  };

  const handlePlanChange = (planId: string) => {
    setSelectedPlan(planId);
  };

  // ✅ FIXED: Subscribe with error handling
  const handleSubscribe = async () => {
    setSubscribing(true);
    
    try {
      const token = getTokenDirect();
      const response = await fetch(`${API_URL}/user/subscribe`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          planId: selectedPlan,
          billingCycle: billingCycle
        })
      });
      
      if (response.ok) {
        const result = await response.json();
        
        if (selectedPlan === 'basic' && subscriptionPlans[billingCycle].find(p => p.id === 'basic')?.price === 0) {
          setSubscriptionData({
            plan: {
              id: 'basic',
              name: 'Basic',
              price: 0
            },
            billingCycle: billingCycle,
            status: 'active'
          });
          
          setIsPlanDialogOpen(false);
          
          toast({
            title: "Success!",
            description: "Free Basic plan activated successfully!",
          });
          
          fetchSubscriptionData();
        } else if (result.redirectUrl) {
          window.location.href = result.redirectUrl;
        } else {
          setSubscriptionData(result.subscription);
          setIsPlanDialogOpen(false);
          
          toast({
            title: "Subscription Updated",
            description: `You have successfully subscribed to the ${result.plan.name} plan.`,
          });
          
          fetchSubscriptionData();
        }
      } else {
        const errorData = await response.json();
        if (errorData.code === "NO_PAYMENT_METHOD") {
          toast({
            title: "Payment Method Required",
            description: errorData.message,
            variant: "destructive",
          });
          setIsAddPaymentMethodOpen(true);
        } else {
          toast({
            title: "Error",
            description: errorData.error || "Failed to update subscription",
            variant: "destructive",
          });
        }
      }
    } catch (error) {
      console.error('❌ Error subscribing:', error);
      toast({
        title: "Error",
        description: "Unable to process subscription. Please try again.",
        variant: "destructive",
      });
    } finally {
      setSubscribing(false);
    }
  };

  // ✅ FIXED: Cancel subscription with error handling
  const handleCancelSubscription = async () => {
    setCancelling(true);
    
    try {
      const token = getTokenDirect();
      const response = await fetch(`${API_URL}/user/cancel-subscription`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        }
      });
      
      if (response.ok) {
        const result = await response.json();
        
        if (result.success) {
          setSubscriptionData(null); 
          setIsCancelDialogOpen(false);
          
          toast({
            title: "Subscription Cancelled",
            description: "Your subscription has been cancelled successfully.",
          });
          
          try {
            await fetchSubscriptionData();
          } catch (error) {
            console.log('No subscription found after cancellation - this is expected');
            setSubscriptionData(null);
          }
        } else {
          toast({
            title: "Error",
            description: result.error || "Failed to cancel subscription",
            variant: "destructive",
          });
        }
      } else {
        const errorData = await response.json();
        toast({
          title: "Error",
          description: errorData.error || "Failed to cancel subscription",
          variant: "destructive",
        });
      }
    } catch (error) {
      console.error('❌ Error cancelling subscription:', error);
      toast({
        title: "Error",
        description: "Unable to cancel subscription. Please try again.",
        variant: "destructive",
      });
    } finally {
      setCancelling(false);
    }
  };

  // ✅ FIXED: Add payment method with error handling
  const handleAddPaymentMethod = async () => {
    setSavingPaymentMethod(true);
    
    try {
      let paymentData;
      
      if (paymentMethod === "card") {
        if (!cardData.cardNumber || !cardData.expiryDate || !cardData.cvv || !cardData.cardholderName) {
          toast({
            title: "Error",
            description: "Please fill all card details",
            variant: "destructive",
          });
          setSavingPaymentMethod(false);
          return;
        }
        
        paymentData = {
          type: "card",
          details: {
            ...cardData,
            cardNumber: cardData.cardNumber.slice(-4)
          }
        };
      } else if (paymentMethod === "bank") {
        if (!bankData.accountHolderName || !bankData.accountNumber || !bankData.routingNumber || !bankData.bankName) {
          toast({
            title: "Error",
            description: "Please fill all bank details",
            variant: "destructive",
          });
          setSavingPaymentMethod(false);
          return;
        }
        
        paymentData = {
          type: "bank",
          details: {
            ...bankData,
            accountNumber: bankData.accountNumber.slice(-4)
          }
        };
      } else if (paymentMethod === "paypal") {
        if (!paypalData.email) {
          toast({
            title: "Error",
            description: "Please enter your PayPal email",
            variant: "destructive",
          });
          setSavingPaymentMethod(false);
          return;
        }
        
        paymentData = {
          type: "paypal",
          details: paypalData
        };
      }
      
      const token = getTokenDirect();
      const response = await fetch(`${API_URL}/user/payment-methods`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify(paymentData)
      });
      
      if (response.ok) {
        const newPaymentMethod = await response.json();
        setPaymentMethods(prev => [...prev, newPaymentMethod]);
        
        toast({
          title: "Success",
          description: "Payment method added successfully!",
        });
        setIsAddPaymentMethodOpen(false);
        setCardData({ cardNumber: "", expiryDate: "", cvv: "", cardholderName: "" });
        setBankData({ accountHolderName: "", accountNumber: "", routingNumber: "", bankName: "", accountType: "checking" });
        setPaypalData({ email: "" });
      } else {
        const errorData = await response.json();
        toast({
          title: "Error",
          description: errorData.error || "Failed to add payment method",
          variant: "destructive",
        });
      }
    } catch (error) {
      console.error('❌ Error adding payment method:', error);
      toast({
        title: "Error",
        description: "Unable to add payment method. Please try again.",
        variant: "destructive",
      });
    }
    setSavingPaymentMethod(false);
  };

  // Handle edit payment method
  const handleEditPaymentMethod = (method: any) => {
    setCurrentPaymentMethod(method);
    setPaymentMethod(method.type);
    
    if (method.type === "card") {
      setCardData({
        cardNumber: method.details.cardNumber || "",
        expiryDate: method.details.expiryDate || "",
        cvv: "",
        cardholderName: method.details.cardholderName || ""
      });
    } else if (method.type === "bank") {
      setBankData({
        accountHolderName: method.details.accountHolderName || "",
        accountNumber: method.details.accountNumber || "",
        routingNumber: method.details.routingNumber || "",
        bankName: method.details.bankName || "",
        accountType: method.details.accountType || "checking"
      });
    } else if (method.type === "paypal") {
      setPaypalData({
        email: method.details.email || ""
      });
    }
    
    setIsEditPaymentMethodOpen(true);
  };

  // Handle update payment method
  const handleUpdatePaymentMethod = async () => {
    setEditingPaymentMethod(true);
    
    try {
      let updatedDetails;
      
      if (paymentMethod === "card") {
        updatedDetails = {
          ...currentPaymentMethod.details,
          cardholderName: cardData.cardholderName,
          expiryDate: cardData.expiryDate
        };
      } else if (paymentMethod === "bank") {
        updatedDetails = {
          ...bankData,
          accountNumber: bankData.accountNumber.slice(-4)
        };
      } else if (paymentMethod === "paypal") {
        updatedDetails = paypalData;
      }
      
      const token = getTokenDirect();
      const response = await fetch(`${API_URL}/user/payment-methods/${currentPaymentMethod.id}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ details: updatedDetails })
      });
      
      if (response.ok) {
        const updatedMethod = await response.json();
        setPaymentMethods(prev => 
          prev.map(method => 
            method.id === currentPaymentMethod.id 
              ? { ...method, details: updatedDetails }
              : method
          )
        );
        
        toast({
          title: "Success",
          description: "Payment method updated successfully!",
        });
        setIsEditPaymentMethodOpen(false);
        setCurrentPaymentMethod(null);
      } else {
        const errorData = await response.json();
        toast({
          title: "Error",
          description: errorData.error || "Failed to update payment method",
          variant: "destructive",
        });
      }
    } catch (error) {
      console.error('❌ Error updating payment method:', error);
      toast({
        title: "Error",
        description: "Error updating payment method",
        variant: "destructive",
      });
    }
    setEditingPaymentMethod(false);
  };

  // Handle delete payment method
  const handleDeletePaymentMethod = async (methodId: string) => {
    try {
      const token = getTokenDirect();
      const response = await fetch(`${API_URL}/user/payment-methods/${methodId}`, {
        method: 'DELETE',
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });
      
      if (response.ok) {
        setPaymentMethods(prev => prev.filter(method => method.id !== methodId));
        toast({
          title: "Success",
          description: "Payment method deleted successfully!",
        });
      } else {
        const errorData = await response.json();
        toast({
          title: "Error",
          description: errorData.error || "Failed to delete payment method",
          variant: "destructive",
        });
      }
    } catch (error) {
      console.error('❌ Error deleting payment method:', error);
      toast({
        title: "Error",
        description: "Error deleting payment method",
        variant: "destructive",
      });
    }
  };

  // Handle set default payment method
  const handleSetDefaultPaymentMethod = async (methodId: string) => {
    try {
      const token = getTokenDirect();
      const response = await fetch(`${API_URL}/user/payment-methods/${methodId}/set-default`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });
      
      if (response.ok) {
        setPaymentMethods(prev => 
          prev.map(method => ({
            ...method,
            isDefault: method.id === methodId
          }))
        );
        toast({
          title: "Success",
          description: "Default payment method updated!",
        });
      } else {
        const errorData = await response.json();
        toast({
          title: "Error",
          description: errorData.error || "Failed to set default payment method",
          variant: "destructive",
        });
      }
    } catch (error) {
      console.error('❌ Error setting default payment method:', error);
      toast({
        title: "Error",
        description: "Error setting default payment method",
        variant: "destructive",
      });
    }
  };

  const formatDate = (dateString: string) => {
    if (!dateString) return 'N/A';
    try {
      const date = new Date(dateString);
      return date.toLocaleDateString('en-US', {
        year: 'numeric',
        month: 'long',
        day: 'numeric'
      });
    } catch (error) {
      return 'Invalid Date';
    }
  };

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD'
    }).format(amount);
  };

  // Render payment method icon based on type
  const renderPaymentMethodIcon = (type: string) => {
    switch (type) {
      case "card":
        return <CreditCard className="h-5 w-5" />;
      case "bank":
        return <Building className="h-5 w-5" />;
      case "paypal":
        return <Mail className="h-5 w-5" />;
      default:
        return <CreditCard className="h-5 w-5" />;
    }
  };

  // Render payment method details
  const renderPaymentMethodDetails = (method: any) => {
    switch (method.type) {
      case "card":
        return (
          <div>
            <p className="font-medium">Card ending in {method.details.cardNumber}</p>
            <p className="text-sm text-muted-foreground">
              Expires {method.details.expiryDate} • {method.details.cardholderName}
            </p>
          </div>
        );
      case "bank":
        return (
          <div>
            <p className="font-medium">{method.details.bankName}</p>
            <p className="text-sm text-muted-foreground">
              Account ending in {method.details.accountNumber}
            </p>
          </div>
        );
      case "paypal":
        return (
          <div>
            <p className="font-medium">PayPal</p>
            <p className="text-sm text-muted-foreground">
              {method.details.email}
            </p>
          </div>
        );
      default:
        return null;
    }
  };

  return (
    <DashboardLayout>
      <div className="bg-background p-6 -ml-5 -mt-15 rounded-lg w-full max-w-5xl mx-auto">
        <h1 className="text-2xl font-bold mb-6 bg-gradient-to-r from-[#F0F4FF] to-[#E0ECFF] rounded-xl w-[100%] p-6 shadow-sm">Profile Settings</h1>

        <Tabs defaultValue="account" className="w-full">
          <TabsList className="grid w-full grid-cols-3">
            <TabsTrigger value="account">Account</TabsTrigger>
            <TabsTrigger value="subscription">Subscription</TabsTrigger>
            <TabsTrigger value="preferences">Preferences</TabsTrigger>
          </TabsList>

          <TabsContent value="account" className="space-y-4 mt-6">
            <Card className="shadow-xl transition-transform duration-300 hover:scale-105">
              <CardHeader>
                <CardTitle>Personal Information</CardTitle>
                <CardDescription>
                  Update your account details and profile information.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                <div className="flex items-center space-x-4">
                  <Avatar className="h-20 w-20">
                    <AvatarImage
                      src={
                        userData.avatar_url || 
                        (avatarSeed ? `https://api.dicebear.com/7.x/avataaars/svg?seed=${avatarSeed}` : '')
                      }
                      alt="Profile Picture"
                      onError={(e) => {
                        // Fallback if image fails to load
                        e.currentTarget.src = `https://api.dicebear.com/7.x/avataaars/svg?seed=${avatarSeed || 'vet'}`;
                      }}
                    />
                    <AvatarFallback>
                      {uploadingAvatar ? (
                        <Loader2 className="h-10 w-10 animate-spin" />
                      ) : (
                        <User className="h-10 w-10" />
                      )}
                    </AvatarFallback>
                  </Avatar>
                  <div>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setIsAvatarDialogOpen(true)}
                      disabled={uploadingAvatar}
                    >
                      {uploadingAvatar ? "Uploading..." : "Change Profile Picture"}
                    </Button>
                    <p className="text-xs text-muted-foreground mt-2">
                      {uploadingAvatar 
                        ? "Uploading..." 
                        : userData.avatar_url 
                          ? "Custom photo" 
                          : `Current avatar: ${avatarSeed}`
                      }
                    </p>
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="name">Full Name</Label>
                    <Input 
                      id="name" 
                      value={userData.name || "Loading..."}
                      readOnly
                      className="bg-muted"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="email">Email</Label>
                    <Input
                      id="email"
                      value={userData.email || "Loading..."}
                      readOnly
                      className="bg-muted"
                    />
                    <p className="text-xs text-muted-foreground">
                      Email address cannot be changed. Contact support for assistance.
                    </p>
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="title">Professional Title</Label>
                    <Input 
                      id="title" 
                      value={editableData.professional_title} 
                      onChange={(e) => handleInputChange('professional_title', e.target.value)}
                      placeholder="e.g., Veterinarian, Doctor"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="phone">Phone Number</Label>
                    <div className="flex space-x-2">
                      <Input 
                        id="phone" 
                        value={editableData.phone_number} 
                        onChange={(e) => handleInputChange('phone_number', e.target.value)}
                        placeholder="(555) 123-4567"
                      />
                      <Button
                        variant="outline"
                        size="sm"
                        className="whitespace-nowrap bg-[#E6EFFF]"
                        onClick={handleVerifyPhone}
                        disabled={verifyLoading || !editableData.phone_number}
                      >
                        {verifyLoading ? "Sending..." : userData.phone_verified ? "Verified" : "Verify"}
                      </Button>
                    </div>
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="memberSince">Member Since</Label>
                    <Input
                      id="memberSince"
                      value={formatDate(userData.createdAt)}
                      readOnly
                      className="bg-muted"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="lastUpdated">Last Updated</Label>
                    <Input
                      id="lastUpdated"
                      value={formatDate(userData.updatedAt)}
                      readOnly
                      className="bg-muted"
                    />
                  </div>
                </div>
                
                <Button onClick={handleSaveChanges} disabled={loading}>
                  {loading ? "Saving..." : "Save Changes"}
                </Button>
              </CardContent>
            </Card>

            <Card className="shadow-xl transition-transform duration-300 hover:scale-105">
              <CardHeader>
                <CardTitle>Password</CardTitle>
                <CardDescription>
                  Change your password or enable two-factor authentication.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="current-password">Current Password</Label>
                  <Input 
                    id="current-password" 
                    type="password" 
                    placeholder="Enter current password"
                  />
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="new-password">New Password</Label>
                    <Input 
                      id="new-password" 
                      type="password" 
                      placeholder="Enter new password"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="confirm-password">
                      Confirm New Password
                    </Label>
                    <Input 
                      id="confirm-password" 
                      type="password" 
                      placeholder="Confirm new password"
                    />
                  </div>
                </div>
                <Button onClick={handleUpdatePassword} disabled={passwordLoading}>
                  {passwordLoading ? "Updating..." : "Update Password"}
                </Button>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="subscription" className="space-y-4 mt-6">
            {loadingSubscription ? (
              <Card className="shadow-xl">
                <CardContent className="p-6">
                  <div className="flex justify-center items-center h-40">
                    <Loader2 className="h-8 w-8 animate-spin mr-2" />
                    <p>Loading subscription information...</p>
                  </div>
                </CardContent>
              </Card>
            ) : subscriptionData && subscriptionData.status !== "cancelled" ? (
              <>
                <Card className="shadow-xl transition-transform duration-300 hover:scale-105">
                  <CardHeader>
                    <CardTitle>Current Plan</CardTitle>
                    <CardDescription>
                      You are currently on the {subscriptionData.plan.name} plan.
                    </CardDescription>
                  </CardHeader>
                  <CardContent>
                    <div className="bg-primary/10 p-4 rounded-lg mb-4">
                      <div className="flex justify-between items-center">
                        <div>
                          <h3 className="font-semibold">
                            {subscriptionData.plan.name} Plan
                            <Badge className="ml-2" variant={subscriptionData.status === "active" ? "default" : "secondary"}>
                              {subscriptionData.status}
                            </Badge>
                          </h3>
                          <p className="text-sm text-muted-foreground">
                            Billed {subscriptionData.billingCycle}
                          </p>
                        </div>
                        <div className="text-right">
                          <p className="font-bold text-lg">{formatCurrency(subscriptionData.plan.price)}/{subscriptionData.billingCycle === "monthly" ? "mo" : "yr"}</p>
                          {subscriptionData.nextBillingDate && (
                            <p className="text-sm text-muted-foreground">
                              Next billing date: {formatDate(subscriptionData.nextBillingDate)}
                            </p>
                          )}
                        </div>
                      </div>
                    </div>
                    <div className="flex gap-4">
                      <Button variant="outline" onClick={() => setIsPlanDialogOpen(true)}>Change Plan</Button>
                      <Button
                        variant="outline"
                        className="text-destructive hover:text-destructive"
                        onClick={() => setIsCancelDialogOpen(true)}
                      >
                        Cancel Subscription
                      </Button>
                    </div>
                  </CardContent>
                </Card>

                <Card className="shadow-xl transition-transform duration-300 hover:scale-105">
                  <CardHeader>
                    <CardTitle>Payment Methods</CardTitle>
                    <CardDescription>
                      Manage your payment methods and billing information.
                    </CardDescription>
                  </CardHeader>
                  <CardContent>
                    {paymentMethods.length === 0 ? (
                      <div className="text-center py-8">
                        <CreditCard className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
                        <h3 className="text-lg font-semibold mb-2">No Payment Methods</h3>
                        <p className="text-muted-foreground mb-4">
                          Add a payment method to start your subscription.
                        </p>
                        <Button onClick={() => setIsAddPaymentMethodOpen(true)}>
                          Add Payment Method
                        </Button>
                      </div>
                    ) : (
                      <div className="space-y-4">
                        {paymentMethods.map((method: any) => (
                          <div key={method.id} className="flex items-center justify-between p-4 border rounded-lg">
                            <div className="flex items-center space-x-4">
                              <div className="bg-muted w-10 h-10 rounded-full flex items-center justify-center">
                                {renderPaymentMethodIcon(method.type)}
                              </div>
                              {renderPaymentMethodDetails(method)}
                              {method.isDefault && (
                                <Badge variant="secondary" className="ml-2">
                                  Default
                                </Badge>
                              )}
                            </div>
                            <div className="flex items-center space-x-2">
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => handleEditPaymentMethod(method)}
                              >
                                <Edit className="h-4 w-4 mr-1" />
                                Edit
                              </Button>
                              {!method.isDefault && (
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  className="text-destructive hover:text-destructive"
                                  onClick={() => handleDeletePaymentMethod(method.id)}
                                >
                                  <Trash2 className="h-4 w-4 mr-1" />
                                  Remove
                                </Button>
                              )}
                              {!method.isDefault && (
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  onClick={() => handleSetDefaultPaymentMethod(method.id)}
                                >
                                  Set Default
                                </Button>
                              )}
                            </div>
                          </div>
                        ))}
                        <Button 
                          variant="outline" 
                          onClick={() => setIsAddPaymentMethodOpen(true)}
                          className="w-full"
                        >
                          Add Another Payment Method
                        </Button>
                      </div>
                    )}
                  </CardContent>
                </Card>
              </>
            ) : (
              <Card className="shadow-xl transition-transform duration-300 hover:scale-105">
                <CardHeader>
                  <CardTitle>No Active Subscription</CardTitle>
                  <CardDescription>
                    You don't have an active subscription. Choose a plan to get started.
                  </CardDescription>
                </CardHeader>
                <CardContent className="text-center py-8">
                  <div className="mb-6">
                    <AlertTriangleIcon className="h-16 w-16 text-muted-foreground mx-auto mb-4" />
                    <h3 className="text-xl font-semibold mb-2">No Active Plan</h3>
                    <p className="text-muted-foreground">
                      {subscriptionData?.status === "cancelled" 
                        ? "Your subscription has been cancelled. Choose a new plan to continue using our services."
                        : "You don't have an active subscription. Choose a plan to get started."}
                    </p>
                  </div>
                  <Button onClick={() => setIsPlanDialogOpen(true)}>
                    Choose a Plan
                  </Button>
                </CardContent>
              </Card>
            )}
          </TabsContent>

          <TabsContent value="preferences" className="space-y-4 mt-6">
            <Card className="shadow-xl transition-transform duration-300 hover:scale-105">
              <CardHeader>
                <CardTitle>Application Preferences</CardTitle>
                <CardDescription>
                  Customize your application experience.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <p className="text-center py-10 text-muted-foreground">
                  Preference settings coming soon.
                </p>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>

      {/* Plan Selection Dialog */}
      <Dialog open={isPlanDialogOpen} onOpenChange={setIsPlanDialogOpen}>
        <DialogContent className="sm:max-w-4xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Choose Your Plan</DialogTitle>
            <DialogDescription>
              Select the plan that best fits your veterinary practice needs.
            </DialogDescription>
          </DialogHeader>
          
          <div className="flex justify-center mb-6">
            <div className="flex items-center space-x-2 bg-muted p-1 rounded-lg">
              <Button
                variant={billingCycle === "monthly" ? "default" : "ghost"}
                size="sm"
                onClick={() => setBillingCycle("monthly")}
              >
                Monthly
              </Button>
              <Button
                variant={billingCycle === "yearly" ? "default" : "ghost"}
                size="sm"
                onClick={() => setBillingCycle("yearly")}
              >
                Yearly
              </Button>
            </div>
          </div>
          
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {subscriptionPlans[billingCycle].map((plan: any) => (
              <div
                key={plan.id}
                className={`relative border rounded-lg p-6 transition-all ${
                  selectedPlan === plan.id
                    ? "border-primary ring-2 ring-primary"
                    : "border-muted"
                } ${plan.popular ? "border-primary" : ""}`}
              >
                {plan.popular && (
                  <div className="absolute -top-3 left-0 right-0 mx-auto w-fit">
                    <Badge className="px-3 py-1">Most Popular</Badge>
                  </div>
                )}
                
                {plan.savings && (
                  <Badge variant="secondary" className="mb-2">
                    {plan.savings}
                  </Badge>
                )}
                
                <h3 className="text-xl font-bold">{plan.name}</h3>
                <p className="text-muted-foreground text-sm mt-1">{plan.description}</p>
                
                <div className="my-4">
                  <span className="text-3xl font-bold">{formatCurrency(plan.price)}</span>
                  <span className="text-muted-foreground">
                    /{billingCycle === "monthly" ? "month" : "year"}
                  </span>
                </div>
                
                <ul className="space-y-2 my-6">
                  {plan.features.map((feature: string, index: number) => (
                    <li key={index} className="flex items-start">
                      <CheckIcon className="h-5 w-5 text-green-500 mr-2 mt-0.5 flex-shrink-0" />
                      <span className="text-sm">{feature}</span>
                    </li>
                  ))}
                </ul>
                
                <Button
                  className="w-full"
                  variant={selectedPlan === plan.id ? "default" : "outline"}
                  onClick={() => handlePlanChange(plan.id)}
                >
                  {selectedPlan === plan.id ? "Selected" : "Select Plan"}
                </Button>
              </div>
            ))}
          </div>
          
          <DialogFooter className="mt-6">
            <Button variant="outline" onClick={() => setIsPlanDialogOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleSubscribe} disabled={subscribing}>
              {subscribing ? "Subscribing..." : `Subscribe to ${subscriptionPlans[billingCycle].find((p: any) => p.id === selectedPlan)?.name} Plan`}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Cancel Subscription Dialog */}
      <Dialog open={isCancelDialogOpen} onOpenChange={setIsCancelDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Cancel Subscription</DialogTitle>
            <DialogDescription>
              Are you sure you want to cancel your subscription? You will lose access to premium features at the end of your billing period.
            </DialogDescription>
          </DialogHeader>
          <div className="flex items-center space-x-2 bg-amber-50 p-4 rounded-lg mb-4">
            <AlertTriangleIcon className="h-5 w-5 text-amber-500" />
            <p className="text-sm text-amber-800">
              Your access to premium features will continue until {formatDate(subscriptionData?.nextBillingDate)}.
            </p>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsCancelDialogOpen(false)}>
              Keep Subscription
            </Button>
            <Button 
              variant="destructive" 
              onClick={handleCancelSubscription}
              disabled={cancelling}
            >
              {cancelling ? "Cancelling..." : "Cancel Subscription"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Enhanced Avatar Change Dialog with Upload */}
      <Dialog open={isAvatarDialogOpen} onOpenChange={setIsAvatarDialogOpen}>
        <DialogContent className="sm:max-w-[500px]">
          <DialogHeader>
            <DialogTitle>Change Profile Picture</DialogTitle>
            <DialogDescription>
              Choose an avatar or upload your own picture.
            </DialogDescription>
          </DialogHeader>
          
          <Tabs defaultValue="avatars" className="w-full">
            <TabsList className="grid w-full grid-cols-2">
              <TabsTrigger value="avatars">Avatars</TabsTrigger>
              <TabsTrigger value="upload">Upload Photo</TabsTrigger>
            </TabsList>
            
            <TabsContent value="avatars" className="space-y-4">
              <div className="grid grid-cols-3 gap-4 py-4">
                {avatarOptions.map((seed) => (
                  <div
                    key={seed}
                    className={`cursor-pointer p-2 rounded-md ${
                      avatarSeed === seed ? "ring-2 ring-primary" : "hover:bg-accent"
                    }`}
                    onClick={() => handleAvatarChange(seed)}
                  >
                    <Avatar className="h-16 w-16 mx-auto">
                      <AvatarImage
                        src={`https://api.dicebear.com/7.x/avataaars/svg?seed=${seed}`}
                      />
                      <AvatarFallback>
                        {seed.substring(0, 2).toUpperCase()}
                      </AvatarFallback>
                    </Avatar>
                    <p className="text-xs text-center mt-1 truncate">{seed}</p>
                  </div>
                ))}
              </div>
              
              <div className="flex justify-between">
                <Button
                  variant="outline"
                  onClick={generateRandomSeed}
                >
                  Generate Random
                </Button>
              </div>
            </TabsContent>
            
            <TabsContent value="upload" className="space-y-4">
              <div className="border-2 border-dashed border-muted-foreground/25 rounded-lg p-6 text-center">
                <div className="flex flex-col items-center justify-center space-y-4">
                  <Upload className="h-12 w-12 text-muted-foreground" />
                  <div className="space-y-2">
                    <p className="font-medium">Upload your photo</p>
                    <p className="text-sm text-muted-foreground">
                      PNG, JPG, JPEG up to 5MB
                    </p>
                  </div>
                  
                  <Label 
                    htmlFor="avatar-upload" 
                    className="cursor-pointer"
                  >
                    <Button 
                      variant="default" 
                      disabled={uploadingAvatar}
                      className="relative"
                    >
                      {uploadingAvatar ? (
                        <>
                          <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                          Uploading...
                        </>
                      ) : (
                        <>
                          <Upload className="h-4 w-4 mr-2" />
                          Choose File
                        </>
                      )}
                    </Button>
                    <Input
                      id="avatar-upload"
                      type="file"
                      accept="image/*"
                      className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                      onChange={handleAvatarUpload}
                      disabled={uploadingAvatar}
                    />
                  </Label>
                </div>
              </div>
              
              <div className="text-xs text-muted-foreground text-center">
                <p>For best results, use a square image with a clear face.</p>
              </div>
            </TabsContent>
          </Tabs>
          
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setIsAvatarDialogOpen(false)}
            >
              Cancel
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Add Payment Method Dialog */}
      <Dialog open={isAddPaymentMethodOpen} onOpenChange={setIsAddPaymentMethodOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Add Payment Method</DialogTitle>
            <DialogDescription>
              Choose how you'd like to pay for your subscription.
            </DialogDescription>
          </DialogHeader>
          
          <RadioGroup 
            value={paymentMethod} 
            onValueChange={setPaymentMethod}
            className="grid grid-cols-3 gap-4 mb-6"
          >
            <div>
              <RadioGroupItem value="card" id="card" className="peer sr-only" />
              <Label
                htmlFor="card"
                className="flex flex-col items-center justify-between rounded-md border-2 border-muted bg-transparent p-4 hover:bg-accent hover:text-accent-foreground peer-data-[state=checked]:border-primary [&:has([data-state=checked])]:border-primary"
              >
                <CreditCard className="mb-3 h-6 w-6" />
                Credit Card
              </Label>
            </div>
            
            <div>
              <RadioGroupItem value="bank" id="bank" className="peer sr-only" />
              <Label
                htmlFor="bank"
                className="flex flex-col items-center justify-between rounded-md border-2 border-muted bg-transparent p-4 hover:bg-accent hover:text-accent-foreground peer-data-[state=checked]:border-primary [&:has([data-state=checked])]:border-primary"
              >
                <Building className="mb-3 h-6 w-6" />
                Bank Transfer
              </Label>
            </div>
            
            <div>
              <RadioGroupItem value="paypal" id="paypal" className="peer sr-only" />
              <Label
                htmlFor="paypal"
                className="flex flex-col items-center justify-between rounded-md border-2 border-muted bg-transparent p-4 hover:bg-accent hover:text-accent-foreground peer-data-[state=checked]:border-primary [&:has([data-state=checked])]:border-primary"
              >
                <Mail className="mb-3 h-6 w-6" />
                PayPal
              </Label>
            </div>
          </RadioGroup>
          
          {/* Credit Card Form */}
          {paymentMethod === "card" && (
            <div className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="cardholderName">Cardholder Name</Label>
                <Input
                  id="cardholderName"
                  placeholder="John Doe"
                  value={cardData.cardholderName}
                  onChange={(e) => setCardData({...cardData, cardholderName: e.target.value})}
                />
              </div>
              
              <div className="space-y-2">
                <Label htmlFor="cardNumber">Card Number</Label>
                <Input
                  id="cardNumber"
                  placeholder="1234 5678 9012 3456"
                  value={cardData.cardNumber}
                  onChange={(e) => setCardData({...cardData, cardNumber: e.target.value})}
                />
              </div>
              
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="expiryDate">Expiry Date</Label>
                  <Input
                    id="expiryDate"
                    placeholder="MM/YY"
                    value={cardData.expiryDate}
                    onChange={(e) => setCardData({...cardData, expiryDate: e.target.value})}
                  />
                </div>
                
                <div className="space-y-2">
                  <Label htmlFor="cvv">CVV</Label>
                  <Input
                    id="cvv"
                    placeholder="123"
                    value={cardData.cvv}
                    onChange={(e) => setCardData({...cardData, cvv: e.target.value})}
                  />
                </div>
              </div>
            </div>
          )}
          
          {/* Bank Transfer Form */}
          {paymentMethod === "bank" && (
            <div className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="bankName">Bank Name</Label>
                <Input
                  id="bankName"
                  placeholder="e.g., Chase Bank"
                  value={bankData.bankName}
                  onChange={(e) => setBankData({...bankData, bankName: e.target.value})}
                />
              </div>
              
              <div className="space-y-2">
                <Label htmlFor="accountHolderName">Account Holder Name</Label>
                <Input
                  id="accountHolderName"
                  placeholder="John Doe"
                  value={bankData.accountHolderName}
                  onChange={(e) => setBankData({...bankData, accountHolderName: e.target.value})}
                />
              </div>
              
              <div className="space-y-2">
                <Label htmlFor="accountNumber">Account Number</Label>
                <Input
                  id="accountNumber"
                  placeholder="000123456789"
                  value={bankData.accountNumber}
                  onChange={(e) => setBankData({...bankData, accountNumber: e.target.value})}
                />
              </div>
              
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="routingNumber">Routing Number</Label>
                  <Input
                    id="routingNumber"
                    placeholder="021000021"
                    value={bankData.routingNumber}
                    onChange={(e) => setBankData({...bankData, routingNumber: e.target.value})}
                  />
                </div>
                
                <div className="space-y-2">
                  <Label htmlFor="accountType">Account Type</Label>
                  <select
                    id="accountType"
                    className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
                    value={bankData.accountType}
                    onChange={(e) => setBankData({...bankData, accountType: e.target.value})}
                  >
                    <option value="checking">Checking</option>
                    <option value="savings">Savings</option>
                  </select>
                </div>
              </div>
            </div>
          )}
          
          {/* PayPal Form */}
          {paymentMethod === "paypal" && (
            <div className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="paypalEmail">PayPal Email</Label>
                <Input
                  id="paypalEmail"
                  type="email"
                  placeholder="your.email@example.com"
                  value={paypalData.email}
                  onChange={(e) => setPaypalData({email: e.target.value})}
                />
              </div>
              
              <div className="bg-blue-50 p-4 rounded-lg text-sm text-blue-800">
                <p>You will be redirected to PayPal to complete the authentication process after saving.</p>
              </div>
            </div>
          )}
          
          <DialogFooter>
            <Button 
              variant="outline" 
              onClick={() => setIsAddPaymentMethodOpen(false)}
            >
              Cancel
            </Button>
            <Button 
              onClick={handleAddPaymentMethod}
              disabled={savingPaymentMethod}
            >
              {savingPaymentMethod ? "Saving..." : "Save Payment Method"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Edit Payment Method Dialog */}
      <Dialog open={isEditPaymentMethodOpen} onOpenChange={setIsEditPaymentMethodOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Edit Payment Method</DialogTitle>
            <DialogDescription>
              Update your payment method details.
            </DialogDescription>
          </DialogHeader>
          
          {/* Payment method form */}
          {currentPaymentMethod && (
            <>
              {paymentMethod === "card" && (
                <div className="space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="edit-cardholderName">Cardholder Name</Label>
                    <Input
                      id="edit-cardholderName"
                      placeholder="John Doe"
                      value={cardData.cardholderName}
                      onChange={(e) => setCardData({...cardData, cardholderName: e.target.value})}
                    />
                  </div>
                  
                  <div className="space-y-2">
                    <Label htmlFor="edit-expiryDate">Expiry Date</Label>
                    <Input
                      id="edit-expiryDate"
                      placeholder="MM/YY"
                      value={cardData.expiryDate}
                      onChange={(e) => setCardData({...cardData, expiryDate: e.target.value})}
                    />
                  </div>
                </div>
              )}
              
              {paymentMethod === "bank" && (
                <div className="space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="edit-bankName">Bank Name</Label>
                    <Input
                      id="edit-bankName"
                      placeholder="e.g., Chase Bank"
                      value={bankData.bankName}
                      onChange={(e) => setBankData({...bankData, bankName: e.target.value})}
                    />
                  </div>
                  
                  <div className="space-y-2">
                    <Label htmlFor="edit-accountHolderName">Account Holder Name</Label>
                    <Input
                      id="edit-accountHolderName"
                      placeholder="John Doe"
                      value={bankData.accountHolderName}
                      onChange={(e) => setBankData({...bankData, accountHolderName: e.target.value})}
                    />
                  </div>
                  
                  <div className="space-y-2">
                    <Label htmlFor="edit-accountNumber">Account Number</Label>
                    <Input
                      id="edit-accountNumber"
                      placeholder="000123456789"
                      value={bankData.accountNumber}
                      onChange={(e) => setBankData({...bankData, accountNumber: e.target.value})}
                    />
                  </div>
                  
                  <div className="space-y-2">
                    <Label htmlFor="edit-routingNumber">Routing Number</Label>
                    <Input
                      id="edit-routingNumber"
                      placeholder="021000021"
                      value={bankData.routingNumber}
                      onChange={(e) => setBankData({...bankData, routingNumber: e.target.value})}
                    />
                  </div>
                </div>
              )}
              
              {paymentMethod === "paypal" && (
                <div className="space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="edit-paypalEmail">PayPal Email</Label>
                    <Input
                      id="edit-paypalEmail"
                      type="email"
                      placeholder="your.email@example.com"
                      value={paypalData.email}
                      onChange={(e) => setPaypalData({email: e.target.value})}
                    />
                  </div>
                </div>
              )}
            </>
          )}
          
          <DialogFooter>
            <Button 
              variant="outline" 
              onClick={() => setIsEditPaymentMethodOpen(false)}
            >
              Cancel
            </Button>
            <Button 
              onClick={handleUpdatePaymentMethod}
              disabled={editingPaymentMethod}
            >
              {editingPaymentMethod ? "Updating..." : "Update Payment Method"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </DashboardLayout>
  );
};

export default ProfilePage;