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
  };

  const value = { user, isAdmin, loading, logout };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};

export const useAuth = () => {
  return useContext(AuthContext);
};

export function AuthGuard({ children }: { children: React.ReactNode }) {
  const { user, isAdmin, loading } = useAuth();
  const router = useRouter();
  const pathname = usePathname();

  useEffect(() => {
    if (loading) {
      return; // Don't do anything while loading.
    }

    // If loading is finished, check for user and admin status.
    // If not an admin, redirect to login page.
    if (!user || !isAdmin) {
      router.push("/");
    }
  }, [user, isAdmin, loading, router, pathname]);

  // While loading, show a spinner.
  if (loading) {
    return (
      <div className="flex h-screen w-full items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  // If loading is complete and user is an admin, show the children.
  if (user && isAdmin) {
    return <>{children}</>;
  }

  // Otherwise, render nothing while the redirect happens.
  return null;
}
