"use client";

import { useEffect } from "react";

const OPEN_LAYER = '[role="dialog"][data-state="open"], [role="alertdialog"][data-state="open"], [role="menu"][data-state="open"]';

/**
 * Safety net for a Radix race: when one overlay opens as another closes, <body> can be left with
 * `pointer-events: none` after every overlay is gone, so nothing on the page can be clicked.
 * Whenever body is locked but no dialog or menu is actually open, release it.
 */
export function InteractionGuard() {
  useEffect(() => {
    const body = document.body;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const check = () => {
      clearTimeout(timer);
      // Let close animations and Radix's own cleanup finish first.
      timer = setTimeout(() => {
        if (body.style.pointerEvents === "none" && !document.querySelector(OPEN_LAYER)) {
          body.style.pointerEvents = "";
        }
      }, 400);
    };
    const observer = new MutationObserver(check);
    observer.observe(body, { attributes: true, attributeFilter: ["style"], childList: true });
    return () => {
      observer.disconnect();
      clearTimeout(timer);
    };
  }, []);
  return null;
}
