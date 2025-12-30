
import { getDailyRecommendations } from '@/actions/recommendations';
import { ScrollArea, ScrollBar } from '@/components/ui/scroll-area';
import { HomeGameCard } from '@/components/discovery/HomeGameCard';
import { Sparkles } from 'lucide-react';

export async function RecommendationSection() {
  const recommendation = await getDailyRecommendations();

  if (!recommendation || recommendation.games.length === 0) {
    return null;
  }

  return (
    <section className="mb-8 w-full">
      <div className="flex flex-col gap-1 mb-4 px-1">
        <h2 className="text-xl font-bold flex items-center gap-2 text-zinc-100">
           <Sparkles className="w-5 h-5 text-indigo-400" />
           Recommandation du jour
        </h2>
        <p className="text-sm text-zinc-400">
          {recommendation.reason}
        </p>
      </div>

      <ScrollArea className="w-full whitespace-nowrap pb-4">
        <div className="flex gap-4">
          {recommendation.games.map((game) => (
            <HomeGameCard key={game.id} game={game} />
          ))}
        </div>
        <ScrollBar orientation="horizontal" />
      </ScrollArea>
    </section>
  );
}
