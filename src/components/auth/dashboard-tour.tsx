"use client";

import { useEffect, useState, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ChevronLeft, ChevronRight, X, Sparkles, Check, ArrowRight } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

interface TourStep {
  id: string;
  title: string;
  description: string;
  target?: string;
  position?: "top" | "bottom" | "left" | "right" | "center";
  action?: () => void;
}

const TOUR_STEPS: TourStep[] = [
  {
    id: "welcome",
    title: "Welcome to CareHub!",
    description: "This quick tour will show you the key areas of your dashboard. You can skip at any time.",
    position: "center",
  },
  {
    id: "stats",
    title: "Real-time Metrics",
    description: "Live cards show active shifts, late/no-show alerts, unassigned shifts, and staff availability at a glance.",
    target: "[data-tour='stats']",
    position: "bottom",
  },
  {
    id: "live-shifts",
    title: "Live Shift Monitoring",
    description: "Track active shifts in real-time with elapsed time, staff and client details, and mobile check-in status.",
    target: "[data-tour='live-shifts']",
    position: "top",
  },
  {
    id: "alerts",
    title: "Alerts Panel",
    description: "Critical notifications for late shifts, unassigned shifts, and new incidents requiring immediate attention.",
    target: "[data-tour='alerts']",
    position: "top",
  },
  {
    id: "evv",
    title: "EVV Snapshot",
    description: "Live staff location tracking during shifts for Electronic Visit Verification compliance.",
    target: "[data-tour='evv']",
    position: "top",
  },
  {
    id: "charts",
    title: "Analytics & Reports",
    description: "Staff hours charts and detailed reports for payroll, billing, and compliance auditing.",
    target: "[data-tour='charts']",
    position: "top",
  },
  {
    id: "navigation",
    title: "Navigation Menu",
    description: "Access all modules: Clients, Staff, Scheduling, Incidents, Billing, Payroll, and more.",
    target: "[data-tour='navigation']",
    position: "right",
  },
  {
    id: "complete",
    title: "You're Ready!",
    description: "Start managing your care services. The tour is always available from the help menu if you need a refresher.",
    position: "center",
  },
];

interface DashboardTourProps {
  isOpen: boolean;
  onClose: () => void;
  onComplete: () => void;
}

export function DashboardTour({ isOpen, onClose, onComplete }: DashboardTourProps) {
  const { toast } = useToast();
  const [currentStep, setCurrentStep] = useState(0);
  const [showConfetti, setShowConfetti] = useState(false);

  const goNext = useCallback(() => {
    if (currentStep < TOUR_STEPS.length - 1) {
      setCurrentStep(prev => prev + 1);
    } else {
      handleComplete();
    }
  }, [currentStep]);

  const goPrev = useCallback(() => {
    if (currentStep > 0) {
      setCurrentStep(prev => prev - 1);
    }
  }, [currentStep]);

  const handleComplete = useCallback(() => {
    setShowConfetti(true);
    toast({
      title: "Tour Complete!",
      description: "You're ready to use CareHub. Welcome aboard!",
    });
    onComplete();
    setTimeout(() => {
      setShowConfetti(false);
      onClose();
    }, 1500);
  }, [onClose, onComplete, toast]);

  const handleSkip = useCallback(() => {
    toast({
      title: "Tour Skipped",
      description: "You can restart it anytime from the help menu.",
    });
    onClose();
  }, [onClose, toast]);

  if (!isOpen) return null;

  const step = TOUR_STEPS[currentStep];
  const isLast = currentStep === TOUR_STEPS.length - 1;
  const isFirst = currentStep === 0;

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={{ duration: 0.2 }}
        className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
        role="dialog"
        aria-modal="true"
        aria-labelledby={`tour-title-${currentStep}`}
      >
        {/* Spotlight overlay for targeted steps */}
        {step.target && step.position !== "center" && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 pointer-events-none"
          >
            <div className="absolute inset-0 bg-black/60" />
            <div
              className="absolute bg-transparent rounded-lg border-2 border-primary box-shadow: 0 0 0 9999px rgba(0,0,0,0.6)"
              style={{
                // This will be positioned by the tour tooltip
              }}
            />
          </motion.div>
        )}

        <motion.div
          initial={{ scale: 0.9, opacity: 0, y: 20 }}
          animate={{ scale: 1, opacity: 1, y: 0 }}
          exit={{ scale: 0.9, opacity: 0, y: 20 }}
          transition={{ duration: 0.3, ease: [0.25, 0.46, 0.45, 0.94] }}
          className="w-full max-w-md mx-4 relative z-10"
        >
          <Card className="shadow-2xl overflow-hidden">
            <CardHeader className="pb-2">
              <div className="flex items-center justify-between">
                <motion.div
                  initial={{ opacity: 0, x: -20 }}
                  animate={{ opacity: 1, x: 0 }}
                  className="flex items-center gap-2"
                >
                  <div className="flex items-center justify-center w-8 h-8 rounded-full bg-primary/10 text-primary">
                    <Sparkles className="h-4 w-4" />
                  </div>
                  <CardTitle id={`tour-title-${currentStep}`} className="text-lg">
                    {step.title}
                  </CardTitle>
                </motion.div>
                <motion.button
                  initial={{ opacity: 0, scale: 0.8 }}
                  animate={{ opacity: 1, scale: 1 }}
                  onClick={handleSkip}
                  className="p-1 rounded-lg hover:bg-muted transition-colors text-muted-foreground"
                  aria-label="Skip tour"
                >
                  <X className="h-5 w-5" />
                </motion.button>
              </div>
            </CardHeader>

            <CardContent className="pt-0">
              <motion.div
                key={step.id}
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -20 }}
                transition={{ duration: 0.2 }}
                className="space-y-4"
              >
                <p className="text-muted-foreground leading-relaxed">{step.description}</p>

                {/* Progress indicator */}
                <div className="flex items-center justify-center gap-1">
                  {TOUR_STEPS.map((_, i) => (
                    <motion.button
                      key={i}
                      initial={{ scale: 0.8 }}
                      animate={{ scale: 1 }}
                      transition={{ delay: i * 0.05 }}
                      onClick={() => setCurrentStep(i)}
                      className={`w-2 h-2 rounded-full transition-all ${
                        i === currentStep
                          ? "bg-primary w-6"
                          : "bg-muted-foreground/30 hover:bg-muted-foreground/50"
                      }`}
                      aria-label={`Go to step ${i + 1}`}
                      aria-current={i === currentStep ? "step" : undefined}
                    />
                  ))}
                </div>

                {/* Navigation buttons */}
                <div className="flex items-center justify-between pt-2">
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={goPrev}
                    disabled={isFirst}
                    className="gap-1"
                  >
                    <ChevronLeft className="h-4 w-4" />
                    Back
                  </Button>

                  <div className="flex gap-2">
                    {isLast ? (
                      <motion.button
                        initial={{ scale: 0.9 }}
                        animate={{ scale: 1 }}
                        whileHover={{ scale: 1.02 }}
                        whileTap={{ scale: 0.98 }}
                        onClick={handleComplete}
                        className="flex-1 flex items-center justify-center gap-2 bg-primary text-primary-foreground px-4 py-2 rounded-lg font-medium"
                      >
                        <Check className="h-4 w-4" />
                        Get Started
                        <ArrowRight className="h-4 w-4" />
                      </motion.button>
                    ) : (
                      <Button
                        onClick={goNext}
                        className="flex-1 flex items-center justify-end gap-2"
                      >
                        Next
                        <ChevronRight className="h-4 w-4" />
                      </Button>
                    )}
                  </div>
                </div>
              </motion.div>
            </CardContent>
          </Card>

          {/* Step indicator */}
          <motion.p
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            className="text-center text-xs text-muted-foreground mt-3"
          >
            Step {currentStep + 1} of {TOUR_STEPS.length}
          </motion.p>
        </motion.div>

        {/* Confetti celebration */}
        {showConfetti && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 pointer-events-none z-50 overflow-hidden"
          >
            {[...Array(30)].map((_, i) => (
              <motion.div
                key={i}
                initial={{ y: -100, opacity: 1, rotate: 0 }}
                animate={{ y: window.innerHeight + 100, opacity: 0, rotate: 360 }}
                transition={{
                  duration: 2 + Math.random(),
                  delay: Math.random() * 0.5,
                  ease: "easeOut",
                }}
                className="absolute w-3 h-3 rounded"
                style={{
                  left: `${Math.random() * 100}%`,
                  backgroundColor: ["#22c55e", "#3b82f6", "#f59e0b", "#ef4444", "#8b5cf6"][Math.floor(Math.random() * 5)],
                }}
              />
            ))}
          </motion.div>
        )}
      </motion.div>
    </AnimatePresence>
  );
}