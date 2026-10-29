import React, { useEffect } from 'react';
import { useAuth } from '../../hooks/useAuth';
import { useNavigate } from 'react-router-dom';
import { Button } from '../../components/ui/button';
import { Alert, AlertDescription, AlertTitle } from '../../components/ui/alert';
import { Loader2 } from 'lucide-react';
import Auth0LoginButton from '../auth/Auth0LoginButton';

const LoginPage = () => {
  const {
    isAuthenticated,
    isLoading,
    error,
  } = useAuth();
  
  const navigate = useNavigate();

  useEffect(() => {
    if (isAuthenticated) {
      console.log("User is authenticated, redirecting to dashboard");
      navigate('/dashboard', { replace: true });
    }
  }, [isAuthenticated, navigate]); 

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-screen">
        <Loader2 className="animate-spin text-4xl text-blue-500" />
        <span className="ml-2">Loading...</span>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-purple-50 flex flex-col items-center justify-center p-3 sm:p-4 md:p-6 overflow-hidden">
      {/* Logo and Brand Name */}
      <div className="flex flex-col sm:flex-row items-center justify-center mb-6 sm:mb-8 lg:mb-10 xl:mb-12 w-full max-w-4xl px-2">
        <div className="text-center w-full max-w-2xl">
          <div className="flex items-center justify-center">
            <h1 className="text-3xl xs:text-4xl sm:text-4xl md:text-4xl lg:text-5xl xl:text-6xl font-bold bg-gradient-to-r from-purple-600 to-blue-600 bg-clip-text text-transparent animate-pulse break-words leading-tight">
              PurrscribeAI
            </h1>
            <img 
              src="/logo1.png" 
              alt="PurrscribeAI Logo" 
              className="h-14 w-14 sm:h-16 sm:w-16 md:h-18 md:w-18 lg:h-20 lg:w-20 ml-2 sm:ml-2 md:ml-3 lg:ml-4 xl:ml-4 animate-bounce flex-shrink-0"
            />
          </div>
          <p className="text-base sm:text-lg md:text-lg lg:text-xl xl:text-xl text-gray-600 mt-1 sm:mt-2 md:mt-2 lg:mt-3 xl:mt-3 font-light px-1 break-words">
            Intelligent Transcription Solutions
          </p>
        </div>
      </div>

      {/* Login Box */}
      <div className="bg-white p-4 sm:p-6 md:p-7 lg:p-8 rounded-2xl shadow-2xl w-full max-w-xs xs:max-w-sm sm:max-w-md md:max-w-lg border border-gray-200 transform hover:scale-105 transition-transform duration-300 mx-2">
        <h2 className="text-xl sm:text-2xl md:text-2xl lg:text-3xl font-bold text-center mb-4 sm:mb-5 md:mb-6 lg:mb-8 text-gray-800 break-words">
          Welcome Back
        </h2>
        
        {error && (
          <Alert variant="destructive" className="mb-3 sm:mb-4 md:mb-5 lg:mb-6">
            <AlertTitle className="text-sm">Error</AlertTitle>
            <AlertDescription className="text-xs sm:text-sm break-words">{error}</AlertDescription>
          </Alert>
        )}

        {/* Auth0 Login Button */}
        <div className="mb-3 sm:mb-4 md:mb-5 lg:mb-6">
          <Auth0LoginButton />
        </div>

        <p className="text-xs sm:text-sm text-gray-500 text-center mb-3 sm:mb-4 md:mb-5 lg:mb-6 px-1 break-words">
          Secure login with Auth0 for enhanced security and single sign-on
        </p>

        <div className="border-t border-gray-200 pt-3 sm:pt-4 md:pt-5 lg:pt-6">
          <Button
            onClick={() => navigate('/register', { replace: true })}
            variant="outline"
            className="w-full py-2 text-sm sm:text-base md:text-base lg:text-lg font-semibold hover:bg-gray-50 transition-colors duration-200 break-words"
          >
            Create New Account
          </Button>
        </div>
      </div>

      {/* Footer */}
      <div className="mt-6 sm:mt-7 md:mt-8 lg:mt-10 xl:mt-12 text-center px-2 w-full max-w-2xl">
        <p className="text-gray-500 text-xs sm:text-sm font-medium break-words px-1">
          Transforming audio into intelligent text • Powered by AI
        </p>
      </div>
    </div>
  );
};

export default LoginPage;