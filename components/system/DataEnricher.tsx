
'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { getPendingEnrichmentGames } from '@/actions/queue';

export default function DataEnricher() {
  const [isProcessing, setIsProcessing] = useState(false);
  const router = useRouter();

  useEffect(() => {
    let isMounted = true;

    async function processEnrichment() {
      if (isProcessing) return;
      setIsProcessing(true);

      try {
        // Keep fetching until no more games need enrichment
        while (isMounted) {
          // 1. Get games needing enrichment
          const gameIds = await getPendingEnrichmentGames();

          if (gameIds.length === 0) {
            break; // No more games to process
          }

          // 2. Process in batches of 5
          const batchSize = 5;
          for (let i = 0; i < gameIds.length; i += batchSize) {
            if (!isMounted) break;

            const batch = gameIds.slice(i, i + batchSize);

            try {
              const response = await fetch('/api/games/enrich', {
                method: 'POST',
                headers: {
                  'Content-Type': 'application/json',
                },
                body: JSON.stringify({ gameIds: batch }),
              });

              if (response.ok) {
                // Refresh UI to show new data (images, etc.)
                router.refresh();

                // Wait 2 seconds before next batch
                await new Promise((resolve) => setTimeout(resolve, 2000));
              } else {
                console.error('Batch enrichment failed', await response.text());
                await new Promise((resolve) => setTimeout(resolve, 2000));
              }
            } catch (err) {
              console.error('Error processing batch:', err);
               await new Promise((resolve) => setTimeout(resolve, 2000));
            }
          }

          // Small delay before fetching next chunk of IDs to allow DB to settle/UI to update
          await new Promise((resolve) => setTimeout(resolve, 1000));
        }
      } catch (error) {
        console.error('Enrichment process error:', error);
      } finally {
        if (isMounted) setIsProcessing(false);
      }
    }

    processEnrichment();

    return () => {
      isMounted = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // Run once on mount

  // No visible UI
  return null;
}
