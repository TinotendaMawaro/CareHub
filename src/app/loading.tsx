"use client";

import { useEffect, useState } from "react";
import { CareHubLogoWithText } from "@/components/ui/carehub-logo";
import { Loader2 } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";

export default function RootLoading() {
  const [show, setShow] = useState(false);

  useEffect(() => {
    if (typeof window !== 'undefined') {
      const hasShown = sessionStorage.getItem('carehub-splash-shown');
      if (!hasShown) {
        setShow(true);
        const timer = setTimeout(() => {
          setShow(false);
          sessionStorage.setItem('carehub-splash-shown', 'true');
        }, 4000);
        return () => clearTimeout(timer);
      }
    }
  }, []);

  return (
    <AnimatePresence>
      {show && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.4 }}
          className="fixed inset-0 z-[100] flex items-center justify-center bg-background"
        >
          <motion.div
            initial={{ scale: 0.9, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ scale: 0.9, opacity: 0 }}
            transition={{ duration: 0.5, ease: [0.25, 0.46, 0.45, 0.94] }}
            className="w-full max-w-md mx-4 p-8 text-center"
          >
            <CareHubLogoWithText size={56} className="mx-auto mb-6" />
            <motion.h1
              initial={{ y: 20, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              transition={{ delay: 0.2, duration: 0.4 }}
              className="text-3xl font-bold text-foreground font-headline mb-2"
            >
              CareHub
            </motion.h1>
            <motion.p
              initial={{ y: 20, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              transition={{ delay: 0.3, duration: 0.4 }}
              className="text-muted-foreground text-lg mb-8"
            >
              Loading your dashboard...
            </motion.p>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 0.4, duration: 0.4 }}
              className="flex items-center justify-center gap-2"
            >
              <Loader2 className="h-6 w-6 animate-spin text-primary" />
              <span className="text-sm text-muted-foreground">Please wait</span>
            </motion.div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
