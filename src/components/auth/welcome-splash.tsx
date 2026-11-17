"use client";

import { useEffect } from "react";
import { CareHubLogoWithText } from "@/components/ui/carehub-logo";
import { Loader2, Heart, Shield, Users, Clock } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";

type SplashVariant = "login" | "admin" | "logout";

interface WelcomeSplashProps {
  variant: SplashVariant;
  onComplete: () => void;
}

const variantConfig = {
  login: {
    title: "Welcome to CareHub",
    subtitle: "Your care management platform",
    features: [
      { icon: Heart, label: "Compassionate Care", desc: "Client-first approach" },
      { icon: Shield, label: "Compliance Ready", desc: "EVV & regulatory tools" },
      { icon: Users, label: "Team Coordination", desc: "Scheduling & communication" },
      { icon: Clock, label: "Real-time Tracking", desc: "Live shift monitoring" },
    ],
  },
  admin: {
    title: "Admin Portal",
    subtitle: "Manage your organization",
    features: [
      { icon: Users, label: "Staff Management", desc: "Caregivers & clients" },
      { icon: Shield, label: "Compliance Dashboard", desc: "EVV & audit trails" },
      { icon: Clock, label: "Payroll & Billing", desc: "Automated calculations" },
      { icon: Heart, label: "Quality Assurance", desc: "Incidents & care plans" },
    ],
  },
  logout: {
    title: "Thank You",
    subtitle: "See you next time",
    features: [
      { icon: Heart, label: "Session Ended", desc: "Securely logged out" },
      { icon: Shield, label: "Data Protected", desc: "Your info is safe" },
      { icon: Users, label: "Team Notified", desc: "Shift handovers updated" },
      { icon: Clock, label: "Ready for Tomorrow", desc: "Schedule preserved" },
    ],
  },
};

export function WelcomeSplash({ variant, onComplete }: WelcomeSplashProps) {
  const config = variantConfig[variant];

  useEffect(() => {
    const timer = setTimeout(onComplete, variant === "logout" ? 2000 : 4000);
    return () => clearTimeout(timer);
  }, [onComplete, variant]);

  return (
    <AnimatePresence mode="wait">
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={{ duration: 0.4 }}
        className="fixed inset-0 z-50 flex items-center justify-center bg-background"
        role="alert"
        aria-live="polite"
      >
        <motion.div
          initial={{ scale: 0.9, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          exit={{ scale: 0.9, opacity: 0 }}
          transition={{ duration: 0.5, ease: [0.25, 0.46, 0.45, 0.94] }}
          className="w-full max-w-md mx-4 p-8 text-center"
        >
          <CareHubLogoWithText size={48} className="mx-auto mb-6" />
          
          <motion.h1
            initial={{ y: 20, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            transition={{ delay: 0.2, duration: 0.4 }}
            className="text-3xl font-bold text-foreground font-headline mb-2"
          >
            {config.title}
          </motion.h1>
          
          <motion.p
            initial={{ y: 20, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            transition={{ delay: 0.3, duration: 0.4 }}
            className="text-muted-foreground text-lg mb-8"
          >
            {config.subtitle}
          </motion.p>

          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.4, duration: 0.4 }}
            className="grid gap-4 sm:grid-cols-2 mb-8"
          >
            {config.features.map((feature, i) => (
              <motion.div
                key={feature.label}
                initial={{ y: 20, opacity: 0 }}
                animate={{ y: 0, opacity: 1 }}
                transition={{ delay: 0.5 + i * 0.1, duration: 0.4 }}
                className="flex flex-col items-center gap-2 p-4 bg-muted/50 rounded-xl"
              >
                <feature.icon className="h-8 w-8 text-primary" />
                <span className="font-medium text-sm">{feature.label}</span>
                <span className="text-xs text-muted-foreground">{feature.desc}</span>
              </motion.div>
            ))}
          </motion.div>

          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 1.2, duration: 0.4 }}
            className="flex items-center justify-center gap-2"
          >
            <Loader2 className="h-6 w-6 animate-spin text-primary" />
            <span className="text-sm text-muted-foreground">Loading...</span>
          </motion.div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}