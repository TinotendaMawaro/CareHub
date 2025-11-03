"use client";

import React, { createContext, useContext, useState, useEffect } from "react";
import { useRouter, usePathname } from "next/navigation";
import { User, onAuthStateChanged, signOut } from "firebase/auth";
import { auth } from "@/lib/firebase/client";
import { Loader2 } from "lucide-react";
import { useToast } from "./use-toast";

type AuthContextType = {
  user: User | null;
  isAdmin: boolean;
  loading: boolean;
  logout: () => Promise<void>;
};

const AuthContext = createContext<AuthContextType>({
  user: null,
  isAdmin: false,
  loading: true,
  logout: async () => {},
});

export const AuthProvider = ({ children }: { children: React.ReactNode }) => {
  const [user, setUser] = useState<User | null>(null);
  const [isAdmin, setIsAdmin] = useState<boolean>(false);
  const [loading, setLoading] = useState(true);
  const { toast } = useToast();

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      setLoading(true);
      if (user) {
        setUser(user);
        try {
          const idTokenResult = await user.getIdTokenResult(true);
          const userIsAdmin = idTokenResult.claims.role === "admin";
          setIsAdmin(userIsAdmin);
        } catch (err) {
          console.error("Error fetching token claims:", err);
          setIsAdmin(false);
        }
      } else {
        setUser(null);
        setIsAdmin(false);
      }
      setLoading(false);
    });

    return () => unsubscribe();
  }, []);

  const logout = async () => {
    await signOut(auth);
    toast({
      title: "Logged Out",
      description: "You have been successfully logged out. Goodbye!",
    });
  };

  const value = { user, isAdmin, loading, logout };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};

export const useAuth = () => {
  return useContext(AuthContext);
};

export const useRequireAuth = () => {
  const { user, isAdmin, loading } = useAuth();
  const router = useRouter();
  const pathname = usePathname();

  useEffect(() => {
    if (loading) {
      return; // Don't do anything while loading.
    }

    const isAuthPage = pathname === "/" || pathname === "/signup";
    
    // If user is not logged in and is trying to access a protected page, redirect to login.
    if (!user && !isAuthPage) {
      router.push("/");
    }
    
    // If a logged-in user who is NOT an admin tries to access a protected page.
    if (user && !isAdmin && !isAuthPage) {
      router.push("/");
    }

    // If a logged-in admin lands on an auth page, redirect to dashboard.
    if (user && isAdmin && isAuthPage) {
      router.push("/dashboard");
    }

  }, [user, isAdmin, loading, router, pathname]);

  return { user, isAdmin, loading };
};

export function AuthGuard({ children }: { children: React.ReactNode }) {
  const { loading, user } = useRequireAuth();
  
  if (loading) {
    return (
      <div className="flex h-screen w-full items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }
  
  // Only render children if the user is authenticated
  if (user) {
    return <>{children}</>;
  }

  // While loading or if not a user, we show nothing or a loader, 
  // the redirect is handled by the hook.
  return null;
}
