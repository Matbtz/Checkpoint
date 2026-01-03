
import { getDailyRecommendations } from '@/actions/recommendations';
import { Sparkles } from 'lucide-react';
import { SectionCarousel } from '@/components/game/SectionCarousel';

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
    <SectionCarousel
        title="Recommandation du jour"
        icon={<Sparkles className="w-5 h-5 text-indigo-400" />}
        games={recommendation.games}
        viewMoreHref={viewMoreHref}
    />
  );
}
