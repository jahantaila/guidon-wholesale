'use client';

import { useEffect } from 'react';

/**
 * Lock body scroll while a modal/drawer is open. Returns nothing; just
 * call it at the top of the modal component with the open boolean.
 *
 * Preserves the existing body overflow value so nested modals don't
 * clobber each other's restoration. Idempotent across mount cycles.
 */
export function useBodyScrollLock(active: boolean): void {
  useEffect(() => {
    if (!active) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = prev;
    };
  }, [active]);
}
