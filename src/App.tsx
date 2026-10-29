// App.tsx
import { Suspense, useEffect, useState } from "react";
import { Routes, Route, Navigate } from "react-router-dom";
import { AuthProvider, useAuth } from './context/AuthContext';
import ProtectedRoute from "./components/ProtectedRoute";
import RoleSelectionPopup from "./components/role/RoleSelectionPopup";

// Auth Pages
import LoginPage from "./components/auth/LoginPage02";
import RegisterPage from "./components/auth/RegisterPage";
import PaywallPage from "./components/auth/PaywallPage";

// Dashboard Pages
import Dashboard from "./components/dashboard/Dashboard";
import TranscribePage from "./components/transcription/TranscribePage";
import HistoryPage from "./components/transcription/HistoryPage";
import PetsPage from "./components/pets/PetsPage";
import ClinicsPage from "./components/clinics/ClinicsPage";
import ProfilePage from "./components/profile/ProfilePage";
import FilesPage from "./components/files/FilesPage";
import CallsPage from "./components/calls/CallsPage";
import VisitTypeTemplatesPage from "./components/transcription/VisitTypeTemplatesPage";
import AuthCallbackPage from "./pages/AuthCallbackPage";
import AudioFiles from "./components/transcription/components/AudioFiles";
import AdminUsersPage from "./components/admin/AdminUsersPage";
import { Loader2 } from "lucide-react";
const RoleBasedApp = () => {
  const { user, isAuthenticated, isLoading } = useAuth();
  const [showRolePopup, setShowRolePopup] = useState(false);
  useEffect(() => {
    if (!isLoading && isAuthenticated && user && !user.role) {
      console.log("🔄 Showing role popup - user needs role selection");
      setShowRolePopup(true);
    } else {
      setShowRolePopup(false);
    }
  }, [isAuthenticated, user, isLoading]); 

  const handleRoleSelected = () => {
    setShowRolePopup(false);
  };

  return (
    <>
      <Suspense fallback={
        <div className="flex items-center justify-center h-screen">
          <Loader2 className="animate-spin h-8 w-8 text-blue-500" />
        </div>
      }>
        <Routes>
          <Route path="/login" element={<LoginPage />} />
          <Route path="/register" element={<RegisterPage />} />
          <Route path="/auth-callback" element={<AuthCallbackPage />} />
          
          <Route path="/paywall" element={
            <ProtectedRoute>
              <PaywallPage />
            </ProtectedRoute>
          } />
          <Route element={<ProtectedRoute requiredRoles={['admin']} />}>
            <Route path="/admin/users" element={<AdminUsersPage />} />
          </Route>
          <Route element={<ProtectedRoute requiredRoles={['doctor', 'admin']} />}>
            <Route path="/clinics" element={<ClinicsPage />} />
            <Route path="/templates" element={<VisitTypeTemplatesPage />} />
          </Route>
          <Route element={<ProtectedRoute />}>
            <Route path="/dashboard" element={<Dashboard />} />
            <Route path="/transcribe" element={<TranscribePage />} />
            <Route path="/history" element={<HistoryPage />} />
            <Route path="/pets" element={<PetsPage />} />
            <Route path="/profile" element={<ProfilePage />} />
            <Route path="/files" element={<FilesPage />} />
            <Route path="/calls" element={<CallsPage />} />
            <Route path="/audio-files" element={<AudioFiles />} />
          </Route>
          <Route 
            path="/" 
            element={
              <ProtectedRoute>
                <Navigate to="/dashboard" />
              </ProtectedRoute>
            } 
          />
          <Route path="*" element={<Navigate to="/" />} />
        </Routes>
      </Suspense>
      <RoleSelectionPopup 
        isOpen={showRolePopup} 
        onRoleSelected={handleRoleSelected} 
      />
    </>
  );
};
function App() {
  return (
    <AuthProvider>
      <RoleBasedApp />
    </AuthProvider>
  );
}

export default App;