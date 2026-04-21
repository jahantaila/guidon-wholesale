'use client';

import HelpView from '@/components/HelpView';
import { ADMIN_HELP } from '@/lib/help-content';

export default function AdminHelpPage() {
  return (
    <HelpView
      topics={ADMIN_HELP}
      title="Admin Knowledge Base"
      subtitle="Guides, walkthroughs, and reference for running the wholesale admin panel."
    />
  );
}
