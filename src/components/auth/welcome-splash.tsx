"use client";

import { useEffect } from "react";
import { CareHubLogo } from "@/components/ui/carehub-logo";
import { useOrganisation } from "@/hooks/use-organisation";
import { Heart, Shield, Users, Clock } from "lucide-react";
import { motion, AnimatePresence, useReducedMotion } from "framer-motion";

type SplashVariant = "login" | "admin" | "logout";

interface WelcomeSplashProps {
  variant: SplashVariant;
  onComplete: () => void;
}

const variantConfig = {
  login: {
    title: (org: string) => `Welcome to ${org}`,
    subtitle: "Preparing your workspace",
    features: [
      { icon: Heart, label: "Compassionate care", desc: "Client-first" },
      { icon: Shield, label: "Compliance ready", desc: "EVV and audit trails" },
      { icon: Users, label: "Team coordination", desc: "Rosters and chat" },
      { icon: Clock, label: "Real-time tracking", desc: "Live shift monitoring" },
    ],
  },
  admin: {
    title: () => "Admin portal",
    subtitle: "Preparing your workspace",
    features: [
      { icon: Users, label: "Staff management", desc: "Workers and clients" },
      { icon: Shield, label: "Compliance", desc: "EVV and audit trails" },
      { icon: Clock, label: "Payroll and billing", desc: "Automated calculations" },
      { icon: Heart, label: "Quality assurance", desc: "Incidents and care plans" },
    ],
  },
  logout: {
    title: () => "Thank you",
    subtitle: "You have been signed out securely",
    features: [
      { icon: Shield, label: "Data protected", desc: "Session closed" },
      { icon: Clock, label: "Ready for tomorrow", desc: "Schedule preserved" },
    ],
  },
};

const DURATION: Record<SplashVariant, number> = { login: 3200, admin: 3200, logout: 1800 };

export function WelcomeSplash({ variant, onComplete }: WelcomeSplashProps) {
  const config = variantConfig[variant];
  const { org } = useOrganisation();
  const reduceMotion = useReducedMotion();
  const brand = org.brandColor;

  useEffect(() => {
    const timer = setTimeout(onComplete, DURATION[variant]);
    return () => clearTimeout(timer);
  }, [onComplete, variant]);

  return (
    <AnimatePresence mode="wait">
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={{ duration: 0.35 }}
        className="fixed inset-0 z-50 flex items-center justify-center overflow-hidden"
        style={{ background: "linear-gradient(135deg, hsl(225 32% 9%) 0%, hsl(225 30% 14%) 55%, hsl(225 28% 12%) 100%)" }}
        role="alert"
        aria-live="polite"
      >
        {/* Ambient brand orbs behind the glass. */}
        <motion.div
          aria-hidden
          className="absolute -left-32 -top-32 h-[28rem] w-[28rem] rounded-full blur-3xl"
          style={{ backgroundColor: brand, opacity: 0.28 }}
          animate={reduceMotion ? undefined : { x: [0, 30, 0], y: [0, 20, 0] }}
          transition={{ duration: 9, repeat: Infinity, ease: "easeInOut" }}
        />
        <motion.div
          aria-hidden
          className="absolute -bottom-40 -right-24 h-[32rem] w-[32rem] rounded-full blur-3xl"
          style={{ backgroundColor: brand, opacity: 0.18 }}
          animate={reduceMotion ? undefined : { x: [0, -25, 0], y: [0, -15, 0] }}
          transition={{ duration: 11, repeat: Infinity, ease: "easeInOut" }}
        />

        <motion.div
          initial={{ scale: 0.94, y: 12, opacity: 0 }}
          animate={{ scale: 1, y: 0, opacity: 1 }}
          exit={{ scale: 0.96, opacity: 0 }}
          transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
          className="relative mx-4 w-full max-w-md rounded-3xl border border-white/10 bg-white/[0.06] p-8 text-center shadow-2xl backdrop-blur-2xl"
        >
          <motion.div
            initial={{ scale: 0.8, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            transition={{ delay: 0.1, duration: 0.45, ease: [0.22, 1, 0.36, 1] }}
            className="mx-auto mb-5 flex h-20 w-20 items-center justify-center rounded-2xl bg-white shadow-xl ring-1 ring-white/40"
            style={{ boxShadow: `0 12px 40px -8px ${brand}80` }}
          >
            {org.logoUrl ? (
              <img src={org.logoUrl} alt="" className="h-14 w-14 object-contain" />
            ) : (
              <CareHubLogo size={56} />
            )}
          </motion.div>

          <motion.h1
            initial={{ y: 14, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            transition={{ delay: 0.18, duration: 0.4 }}
            className="mb-1 text-2xl font-bold tracking-tight text-white"
          >
            {config.title(org.name)}
          </motion.h1>

          <motion.p
            initial={{ y: 14, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            transition={{ delay: 0.26, duration: 0.4 }}
            className="mb-7 text-sm text-white/60"
          >
            {config.subtitle}
          </motion.p>

          <div className="mb-8 grid grid-cols-2 gap-3">
            {config.features.map((feature, i) => (
              <motion.div
                key={feature.label}
                initial={{ y: 16, opacity: 0 }}
                animate={{ y: 0, opacity: 1 }}
                transition={{ delay: 0.34 + i * 0.09, duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
                className="flex flex-col items-center gap-2 rounded-2xl border border-white/10 bg-white/[0.05] p-4"
              >
                <span className="flex h-10 w-10 items-center justify-center rounded-xl" style={{ backgroundColor: `${brand}2e` }}>
                  <feature.icon className="h-5 w-5" style={{ color: brand }} />
                </span>
                <span className="text-sm font-semibold text-white">{feature.label}</span>
                <span className="text-xs text-white/50">{feature.desc}</span>
              </motion.div>
            ))}
          </div>

          {/* Progress bar timed to the splash itself, so it never lies about how long is left. */}
          <div className="h-1 w-full overflow-hidden rounded-full bg-white/10">
            <motion.div
              initial={{ scaleX: 0 }}
              animate={{ scaleX: 1 }}
              transition={{ duration: DURATION[variant] / 1000, ease: "linear" }}
              className="h-full origin-left rounded-full"
              style={{ background: `linear-gradient(90deg, ${brand}, ${brand}aa)` }}
            />
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}
