'use client';

import { useRouter } from 'next/navigation';
import { AddGameWizardDialog } from '@/components/dashboard/AddGameWizardDialog';

export default function AddGamePage() {
  const router = useRouter();

  const handleClose = () => {
    router.push('/library');
  };

  return (
    <div className="container mx-auto py-4 px-2 md:py-8 md:px-4">
        {/* Render the dialog open by default */}
        <AddGameWizardDialog isOpen={true} onClose={handleClose} />
    </div>
  );
}
