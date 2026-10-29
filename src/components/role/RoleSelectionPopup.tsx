import React, { useState } from 'react';
import { useAuth } from '../../context/AuthContext';
import { Button } from '../../components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../../components/ui/card';
import { RadioGroup, RadioGroupItem } from '../../components/ui/radio-group';
import { Label } from '../../components/ui/label';
import { Loader2, Shield, User, Users, ArrowRight, CheckCircle } from 'lucide-react';
interface RoleSelectionPopupProps {
  isOpen: boolean;
  onRoleSelected: () => void;
}

const RoleSelectionPopup: React.FC<RoleSelectionPopupProps> = ({ isOpen, onRoleSelected }) => {
  const { updateUserRole, user } = useAuth();
  const [selectedRole, setSelectedRole] = useState<string>('');
  const [isLoading, setIsLoading] = useState(false);
  const [showNextScreen, setShowNextScreen] = useState(false);
  const shouldShowPopup = isOpen && !user?.role;

  if (!shouldShowPopup) {
    return null;
  }

  const handleRoleSubmit = async () => {
    if (!selectedRole) return;

    setIsLoading(true);
    try {
      await updateUserRole(selectedRole);
      setShowNextScreen(true);
    } catch (error) {
      console.error('Error updating role:', error);
      alert('Failed to set role. Please try again.');
    } finally {
      setIsLoading(false);
    }
  };

  const handleContinueToDashboard = () => {
    onRoleSelected();
  };

  const handleChangeRole = () => {
    setShowNextScreen(false);
    setSelectedRole('');
  };

  const roleDescriptions = {
    doctor: {
      title: 'Doctor',
      icon: User,
      description: 'Full access to all medical features',
      features: ['All transcriptions', 'Patient management', 'Clinic access', 'Full templates', 'Medical decisions'],
      color: 'border-blue-200 bg-blue-50',
      badgeColor: 'bg-blue-100 text-blue-800',
      iconColor: 'text-blue-500'
    },
    nurse: {
      title: 'Nurse',
      icon: Users,
      description: 'Basic access for patient care tasks',
      features: ['Basic transcriptions', 'Patient view only', 'Limited templates', 'No clinic management', 'Assisting tasks'],
      color: 'border-green-200 bg-green-50',
      badgeColor: 'bg-green-100 text-green-800',
      iconColor: 'text-green-500'
    },
    admin: {
      title: 'Admin',
      icon: Shield,
      description: 'Full system access with user management',
      features: ['All features', 'User management', 'System settings', 'Full access', 'Role management'],
      color: 'border-red-200 bg-red-50',
      badgeColor: 'bg-red-100 text-red-800',
      iconColor: 'text-red-500'
    }
  };
  if (showNextScreen) {
    const selectedRoleInfo = roleDescriptions[selectedRole as keyof typeof roleDescriptions];
    const SelectedIcon = selectedRoleInfo.icon;

    return (
      <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
        <Card className="w-full max-w-md mx-auto animate-in fade-in duration-300">
          <CardHeader className="text-center pb-4">
            <div className="flex justify-center mb-4">
              <div className="rounded-full bg-green-100 p-3">
                <CheckCircle className="h-8 w-8 text-green-600" />
              </div>
            </div>
            <CardTitle className="text-xl text-gray-900 flex items-center justify-center gap-2">
              <SelectedIcon className={`h-6 w-6 ${selectedRoleInfo.iconColor}`} />
              Role Selected Successfully!
            </CardTitle>
            <CardDescription className="text-gray-600 mt-2">
              You have selected the <strong>{selectedRoleInfo.title}</strong> role
            </CardDescription>
          </CardHeader>
          
          <CardContent className="p-6 space-y-6">
            <div className="text-center">
              <div className={`inline-flex items-center px-3 py-1 rounded-full text-sm font-medium mb-4 ${selectedRoleInfo.badgeColor}`}>
                <SelectedIcon className="h-4 w-4 mr-1" />
                {selectedRoleInfo.title}
              </div>
              <p className="text-gray-600 mb-4">
                {selectedRoleInfo.description}
              </p>
              <div className="bg-gray-50 rounded-lg p-4 border">
                <h4 className="font-medium text-gray-900 mb-3 text-left">Your Access Includes:</h4>
                <ul className="text-sm text-gray-600 space-y-2 text-left">
                  {selectedRoleInfo.features.map((feature, index) => (
                    <li key={index} className="flex items-center gap-3">
                      <div className="w-2 h-2 bg-gray-400 rounded-full flex-shrink-0"></div>
                      <span>{feature}</span>
                    </li>
                  ))}
                </ul>
              </div>
            </div>

            <div className="space-y-3">
              <Button
                onClick={handleContinueToDashboard}
                className="w-full bg-blue-600 hover:bg-blue-700 text-white font-medium"
                size="lg"
              >
                Continue to Dashboard
                <ArrowRight className="ml-2 h-4 w-4" />
              </Button>
              
              <Button
                onClick={handleChangeRole}
                variant="outline"
                className="w-full border-gray-300"
              >
                Change Role
              </Button>
            </div>

            <p className="text-xs text-gray-500 text-center">
              You can change your role later from your profile settings.
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }
  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <Card className="w-full max-w-4xl mx-auto animate-in fade-in duration-300">
        <CardHeader className="text-center pb-4">
          <CardTitle className="text-2xl text-gray-900 mb-2">
            Welcome! Select Your Role
          </CardTitle>
          <CardDescription className="text-gray-600 text-base">
            Choose your role to customize your experience and access features
          </CardDescription>
        </CardHeader>
        
        <CardContent className="p-6 space-y-6">
          <RadioGroup 
            value={selectedRole} 
            onValueChange={setSelectedRole} 
            className="grid grid-cols-1 md:grid-cols-3 gap-4"
          >
            {Object.entries(roleDescriptions).map(([role, info]) => {
              const IconComponent = info.icon;
              return (
                <div 
                  key={role} 
                  className={`flex flex-col p-5 border-2 rounded-xl cursor-pointer transition-all duration-200 h-full min-h-[220px] ${
                    selectedRole === role 
                      ? `${info.color} border-blue-500 ring-2 ring-blue-200 shadow-md transform scale-[1.02]` 
                      : 'border-gray-200 bg-white hover:border-gray-300 hover:bg-gray-50 hover:shadow-sm'
                  }`}
                  onClick={() => setSelectedRole(role)}
                >
                  <div className="flex items-start gap-3 mb-4">
                    <RadioGroupItem 
                      value={role} 
                      id={role} 
                      className="flex-shrink-0 mt-1" 
                    />
                    <div className="flex items-center gap-2">
                      <IconComponent className={`h-6 w-6 flex-shrink-0 ${info.iconColor}`} />
                      <Label htmlFor={role} className="text-lg font-semibold cursor-pointer text-gray-900">
                        {info.title}
                      </Label>
                    </div>
                  </div>
                  
                  <p className="text-gray-600 text-sm mb-4 flex-grow leading-relaxed">
                    {info.description}
                  </p>
                  
                  <div className="mt-auto">
                    <ul className="text-sm text-gray-500 space-y-2">
                      {info.features.slice(0, 4).map((feature, index) => (
                        <li key={index} className="flex items-start gap-2">
                          <div className="w-1.5 h-1.5 bg-gray-400 rounded-full mt-2 flex-shrink-0"></div>
                          <span className="leading-tight">{feature}</span>
                        </li>
                      ))}
                      {info.features.length > 4 && (
                        <li className="text-blue-500 font-medium text-sm mt-2">
                          +{info.features.length - 4} more features
                        </li>
                      )}
                    </ul>
                  </div>
                </div>
              );
            })}
          </RadioGroup>
          {selectedRole && (
            <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 animate-in fade-in duration-300">
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
                <div className="flex-1">
                  <h4 className="font-semibold text-blue-900 text-lg">
                    {roleDescriptions[selectedRole as keyof typeof roleDescriptions].title} Selected
                  </h4>
                  <p className="text-blue-700 text-sm mt-1">
                    {roleDescriptions[selectedRole as keyof typeof roleDescriptions].description}
                  </p>
                </div>
                <Button
                  onClick={handleRoleSubmit}
                  disabled={isLoading}
                  className="bg-blue-600 hover:bg-blue-700 text-white font-medium px-6 whitespace-nowrap"
                  size="lg"
                >
                  {isLoading ? (
                    <>
                      <Loader2 className="animate-spin mr-2 h-4 w-4" />
                      Setting Role...
                    </>
                  ) : (
                    <>
                      Confirm & Continue
                      <ArrowRight className="ml-2 h-4 w-4" />
                    </>
                  )}
                </Button>
              </div>
            </div>
          )}
          {!selectedRole && (
            <div className="text-center py-4">
              <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4 inline-block">
                <p className="text-yellow-700 text-sm">
                  <strong>Please select a role</strong> to continue to your dashboard
                </p>
              </div>
            </div>
          )}

          <div className="border-t pt-4">
            <p className="text-xs text-gray-500 text-center">
              <strong>Note:</strong> Your role determines your access level and permissions. 
              You can contact administrator for role changes later.
            </p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};

export default RoleSelectionPopup;