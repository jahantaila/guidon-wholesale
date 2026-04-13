'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

export default function EmbedOrderPage() {
  const router = useRouter();

  useEffect(() => {
    router.replace('/embed/portal');
  }, [router]);

  return null;
}
