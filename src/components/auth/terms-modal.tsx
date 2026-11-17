"use client";

import { useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { CareHubLogoWithText } from "@/components/ui/carehub-logo";
import { X } from "lucide-react";

interface TermsModalProps {
  onAccept: () => void;
  onDecline: () => void;
}

export function TermsModal({ onAccept, onDecline }: TermsModalProps) {
  const [accepted, setAccepted] = useState(false);
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = "unset"; };
  }, []);

  const handleAccept = () => {
    if (accepted) onAccept();
  };

  const handleScroll = (e: React.UIEvent<HTMLDivElement>) => {
    const { scrollTop, scrollHeight, clientHeight } = e.currentTarget;
    if (scrollTop + clientHeight >= scrollHeight - 50) {
      setScrolled(true);
    }
  };

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={{ duration: 0.2 }}
        className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
        role="dialog"
        aria-modal="true"
        aria-labelledby="terms-title"
      >
        <motion.div
          initial={{ scale: 0.95, opacity: 0, y: 20 }}
          animate={{ scale: 1, opacity: 1, y: 0 }}
          exit={{ scale: 0.95, opacity: 0, y: 20 }}
          transition={{ duration: 0.3, ease: [0.25, 0.46, 0.45, 0.94] }}
          className="w-full max-w-2xl max-h-[90vh] bg-background rounded-2xl shadow-2xl overflow-hidden"
        >
          <div className="flex items-center justify-between p-6 border-b">
            <div className="flex items-center gap-3">
              <CareHubLogoWithText size={28} />
              <motion.h2
                id="terms-title"
                initial={{ opacity: 0, x: -20 }}
                animate={{ opacity: 1, x: 0 }}
                className="text-2xl font-bold text-foreground"
              >
                Terms & Conditions
              </motion.h2>
            </div>
          </div>

          <ScrollArea className="h-[60vh] p-6" onScroll={handleScroll}>
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.1 }}
              className="space-y-6 text-sm text-muted-foreground"
            >
              <section>
                <h3 className="font-semibold text-foreground mb-2">1. Acceptance of Terms</h3>
                <p>By accessing and using CareHub ("the Platform"), you accept and agree to be bound by the terms and provision of this agreement. If you do not agree to abide by these terms, please do not use the Platform.</p>
              </section>

              <section>
                <h3 className="font-semibold text-foreground mb-2">2. Description of Service</h3>
                <p>CareHub is a healthcare management platform designed for aged care and disability support services. It provides tools for client management, caregiver scheduling, shift tracking, incident reporting, billing, payroll, and compliance monitoring.</p>
              </section>

              <section>
                <h3 className="font-semibold text-foreground mb-2">3. User Accounts</h3>
                <p>You are responsible for maintaining the confidentiality of your account credentials and for all activities that occur under your account. You agree to notify us immediately of any unauthorized use of your account.</p>
              </section>

              <section>
                <h3 className="font-semibold text-foreground mb-2">4. Privacy & Data Protection</h3>
                <p>We collect and process personal data in accordance with applicable privacy laws including the Australian Privacy Principles (APPs) and GDPR where applicable. Client health information is treated as sensitive information and protected accordingly.</p>
              </section>

              <section>
                <h3 className="font-semibold text-foreground mb-2">5. Compliance & Regulatory</h3>
                <p>The Platform includes features for Electronic Visit Verification (EVV), NDIS compliance, and aged care regulatory requirements. You are responsible for ensuring your use of the Platform complies with all applicable laws and regulations.</p>
              </section>

              <section>
                <h3 className="font-semibold text-foreground mb-2">6. Intellectual Property</h3>
                <p>All content, features, and functionality of the Platform are owned by CareHub and protected by international copyright, trademark, and other intellectual property laws.</p>
              </section>

              <section>
                <h3 className="font-semibold text-foreground mb-2">7. Limitation of Liability</h3>
                <p>CareHub is provided "as is" without warranties of any kind. We are not liable for any indirect, incidental, or consequential damages arising from your use of the Platform.</p>
              </section>

              <section>
                <h3 className="font-semibold text-foreground mb-2">8. Termination</h3>
                <p>We may terminate or suspend your access to the Platform immediately, without prior notice, for conduct that we believe violates these Terms or is harmful to other users.</p>
              </section>

              <section>
                <h3 className="font-semibold text-foreground mb-2">9. Governing Law</h3>
                <p>These Terms shall be governed by and construed in accordance with the laws of Australia, without regard to its conflict of law provisions.</p>
              </section>

              <section>
                <h3 className="font-semibold text-foreground mb-2">10. Changes to Terms</h3>
                <p>We may modify these Terms at any time. Continued use of the Platform after any changes constitutes acceptance of the new Terms.</p>
              </section>
            </motion.div>
          </ScrollArea>

          <div className="border-t p-6">
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.2 }}
              className="flex items-start gap-3 p-4 bg-muted/50 rounded-xl"
            >
              <Checkbox
                id="terms-accept"
                checked={accepted}
                onCheckedChange={(checked) => setAccepted(checked as boolean)}
                disabled={!scrolled}
                className="mt-1"
              />
              <div className="flex-1">
                <Label htmlFor="terms-accept" className="font-medium text-foreground">
                  I have read and agree to the Terms & Conditions
                </Label>
                <p className="text-xs text-muted-foreground mt-1">
                  You must scroll to the bottom to enable acceptance.
                </p>
              </div>
            </motion.div>

            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.3 }}
              className="flex gap-3 mt-4"
            >
              <Button
                variant="outline"
                className="flex-1"
                onClick={onDecline}
                disabled={accepted}
              >
                Decline
              </Button>
              <Button
                className="flex-1"
                onClick={handleAccept}
                disabled={!accepted || !scrolled}
              >
                Accept & Continue
              </Button>
            </motion.div>
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}