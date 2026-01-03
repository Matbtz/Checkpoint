
import { getDailyRecommendations } from '@/actions/recommendations';
import { DiscoverySection } from '@/components/discovery/DiscoverySection';

export async function RecommendationSection() {
  const recommendation = await getDailyRecommendations();

  if (!recommendation || recommendation.games.length === 0) {
    return null;
  }

  // Extract genre from reason string if possible, or fallback
  // The reason is format: "Recommandé pour vous (Genre : RPG)"
  let genre = '';
  const match = recommendation.reason.match(/Genre : (.+)\)/);
  if (match) {
    genre = match[1];
  }

  const viewMoreHref = genre ? `/search?genre=${encodeURIComponent(genre)}&sortBy=rating` : '/search?sortBy=rating';

  return (
    <section className="mb-8 w-full">
        <DiscoverySection
            title="Recommandation du jour"
            games={recommendation.games}
            viewMoreHref={viewMoreHref}
        />
        <p className="text-sm text-zinc-400 px-1 mt-1">
            {recommendation.reason}
        </p>
    </section>
  );
}
