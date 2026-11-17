"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase/client";
import { WelcomeSplash } from "@/components/auth/welcome-splash";

export default function LogoutPage() {
  const router = useRouter();

  useEffect(() => {
    const handleLogout = async () => {
      await supabase.auth.signOut();
      router.push("/");
      router.refresh();
    };

    const timer = setTimeout(handleLogout, 2500);
    return () => clearTimeout(timer);
  }, [router]);

  return (
    <WelcomeSplash variant="logout" onComplete={() => {}} />
  );
}