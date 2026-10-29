import React, { useState } from "react";
import { useAuth } from "../../hooks/useAuth";
import { useAuth as useAuthContext } from "../../context/AuthContext";
import { Link, useLocation } from "react-router-dom";
import { cn } from "../../lib/utils";
import {
  Mic,
  History,
  PawPrint,
  Building2,
  Users as UsersIcon,
  LogOut,
  Menu,
  FileText,
  Phone,
  NotebookPen,
  LayoutDashboard,
} from "lucide-react";
import { Button } from "../../components/ui/button";
import { Avatar, AvatarFallback, AvatarImage } from "../../components/ui/avatar";
import { useNavigate } from "react-router-dom";

interface DashboardLayoutProps {
  children: React.ReactNode;
}

const DashboardLayout = ({ children }: DashboardLayoutProps) => {
  const [expanded, setExpanded] = useState(true);
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const [isLoggingOut, setIsLoggingOut] = useState(false);

  const location = useLocation();
  const { logout } = useAuth();
  const { user } = useAuthContext();
  const navigate = useNavigate();

  const toggleDropdown = () => setDropdownOpen((prev) => !prev);
  const toggleSidebar = () => setExpanded(!expanded);

  // ✅ SINGLE LOGOUT HANDLER - Fixed version
  const handleLogout = async () => {
    if (isLoggingOut) return; // Prevent multiple clicks
    
    setIsLoggingOut(true);
    setDropdownOpen(false);
    
    try {
      console.log("🚪 Starting logout process...");
      
      // Clear all storage first
      localStorage.clear();
      sessionStorage.clear();
      
      // Clear all cookies
      document.cookie.split(";").forEach(cookie => {
        const eqPos = cookie.indexOf("=");
        const name = eqPos > -1 ? cookie.substr(0, eqPos) : cookie;
        document.cookie = name + "=;expires=Thu, 01 Jan 1970 00:00:00 GMT;path=/";
        document.cookie = name + "=;expires=Thu, 01 Jan 1970 00:00:00 GMT;path=/;domain=." + window.location.hostname;
      });
      
      // Call the auth context logout
      await logout();
      
      console.log("✅ Logout completed - redirecting to login");
      
      // Force redirect to login page
      window.location.href = '/login';
      
    } catch (error) {
      console.error("❌ Logout error:", error);
      // Even if there's an error, redirect to login
      window.location.href = '/login';
    } finally {
      setIsLoggingOut(false);
    }
  };

  React.useEffect(() => {
    const handleResize = () => {
      if (window.innerWidth >= 768) {
        setExpanded(true);
      }
    };

    window.addEventListener("resize", handleResize);
    handleResize();

    return () => window.removeEventListener("resize", handleResize);
  }, []);

  // Role-based navigation items
  const allNavigationItems = [
    { path: "/dashboard", label: "Dashboard", icon: <LayoutDashboard size={20} />, roles: ["admin", "doctor", "nurse"] },
    { path: "/transcribe", label: "Transcribe", icon: <Mic size={20} />, roles: ["admin", "doctor", "nurse"] },
    // History: only doctor + admin (nurse should NOT see)
    { path: "/history", label: "History", icon: <History size={20} />, roles: ["admin", "doctor"] },
    { path: "/calls", label: "Calls", icon: <Phone size={20} />, roles: ["admin", "doctor", "nurse"] },
    { path: "/pets", label: "Pets", icon: <PawPrint size={20} />, roles: ["admin", "doctor", "nurse"] },
    // Clinics and Templates accessible to nurse (view-only handled elsewhere)
    { path: "/clinics", label: "Clinics", icon: <Building2 size={20} />, roles: ["admin", "doctor", "nurse"] },
    { path: "/templates", label: "Templates", icon: <NotebookPen size={20} />, roles: ["admin", "doctor", "nurse"] },
    { path: "/files", label: "Files", icon: <FileText size={20} />, roles: ["admin", "doctor", "nurse"] },
    { path: "/admin/users", label: "Manage Users", icon: <UsersIcon size={20} />, roles: ["admin"] },
  ];

  const navigationItems = allNavigationItems.filter((item) => {
    if (!user?.role) return false;
    const currentRole = user.role.toLowerCase();
    return item.roles.some((r) => r.toLowerCase() === currentRole);
  });

  return (
    <div className="flex h-screen bg-background">
      {/* Mobile menu button */}
      <Button
        variant="ghost"
        size="icon"
        className="fixed top-4 left-4 z-50 md:hidden"
        onClick={toggleSidebar}
      >
        <Menu size={20} />
      </Button>

      {/* Sidebar */}
      <div
        className={cn(
          "fixed inset-y-0 left-0 z-40 bg-[#E6EFFF] border-r shadow-sm transition-all duration-200 md:relative flex flex-col",
          expanded ? "w-60" : "w-16",
          "transition-transform",
          expanded || window.innerWidth >= 640 ? "translate-x-0" : "-translate-x-full"
        )}
      >
        <div className="flex items-center justify-center h-[80px] border-b pt-2">
          <img
            src={expanded ? "/purrscribe.svg" : "/fulllogo_transparent.png"}
            alt="PurrScribe Logo"
            className={cn(expanded ? "w-[100px]" : "w-[150px]", "hidden md:block")}
          />
        </div>
        
        <div
          className="flex-1 overflow-y-auto p-4 pt-10"
          style={{
            rowGap: window.innerHeight > 500 ? "1rem" : "0",
            display: "flex",
            flexDirection: "column",
          }}
        >
          {navigationItems.map((item) => (
            <Link
              key={item.path}
              to={item.path}
              className={cn(
                "flex items-center rounded-md px-3 py-2 text-sm font-medium transition-colors",
                location.pathname === item.path
                  ? "bg-primary text-primary-foreground"
                  : "text-muted-foreground hover:bg-white hover:text-accent-foreground",
                !expanded && "justify-center px-0"
              )}
            >
              <span className="mr-3">{item.icon}</span>
              {expanded && <span>{item.label}</span>}
            </Link>
          ))}
        </div>

        {/* ✅ FIXED: Single logout button in sidebar */}
        <div className="p-4 border-t">
          <Button
            variant="ghost"
            className={cn(
              "flex items-center w-full justify-start text-muted-foreground hover:text-foreground",
              !expanded && "justify-start"
            )}
            onClick={handleLogout}
            disabled={isLoggingOut}
          >
            <LogOut size={20} className="mr-2" />
            {expanded && <span>{isLoggingOut ? "Logging out..." : "Logout"}</span>}
          </Button>
        </div>
      </div>

      {/* Main content */}
      <div className="flex-1 overflow-auto relative flex flex-col">
        <header
          className="h-30 px-6 flex items-center justify-end border-b shadow-md relative"
          style={{
            background: "linear-gradient(to right, #E6EFFF, #c4dfff, #a3cfff, #82bfff)",
          }}
        >
          <div className="md:hidden absolute left-1/2 transform -translate-x-1/2">
            <img src="/purrscribe.svg" alt="PurrScribe Logo" className="h-13 w-20" />
          </div>
          
          <div className="relative">
            <div onClick={toggleDropdown} className="cursor-pointer">
              <Avatar className="h-12 w-12 py-2">
                <AvatarImage src="https://api.dicebear.com/7.x/avataaars/svg?seed=vet" />
                <AvatarFallback>VT</AvatarFallback>
              </Avatar>
            </div>

            {dropdownOpen && (
              <div className="absolute right-0 mt-2 w-48 bg-white border rounded shadow-md z-50">
                <button
                  className="w-full text-left px-4 py-2 text-sm hover:bg-gray-100"
                  onClick={() => {
                    setDropdownOpen(false);
                    navigate("/profile");
                  }}
                >
                  Settings
                </button>
                {/* ✅ FIXED: Use the same logout handler */}
                <button
                  className="w-full text-left px-4 py-2 text-sm hover:bg-gray-100"
                  onClick={handleLogout}
                  disabled={isLoggingOut}
                >
                  {isLoggingOut ? "Logging out..." : "Logout"}
                </button>
              </div>
            )}
          </div>
        </header>

        <main className="flex-1 md:p-9 px-10 ml-10 sm:px-6 lg:px-20 py-6">
          {children}
        </main>
      </div>
    </div>
  );
};

export default DashboardLayout;