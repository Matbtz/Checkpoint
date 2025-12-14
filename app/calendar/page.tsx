import { getUserLibrary } from '@/actions/dashboard';
import { GameCard } from '@/components/dashboard/GameCard';
import { getUserPreferences } from '@/actions/user';

export default async function CalendarPage() {
  const library = await getUserLibrary();
  const prefs = await getUserPreferences();

  // Filter for wishlist and upcoming
  const upcomingGames = library
    .filter(item => {
        // Status check or Date check
        // The prompt says "games of status 'Wishlist' / 'À venir'"
        // Assuming "À venir" is determined by release date being in future or status being Wishlist
        const isWishlist = item.status === 'Wishlist';
        const isUpcoming = item.game.releaseDate && new Date(item.game.releaseDate) > new Date();
        return isWishlist || isUpcoming;
    })
    .sort((a, b) => {
        const dateA = a.game.releaseDate ? new Date(a.game.releaseDate).getTime() : 9999999999999;
        const dateB = b.game.releaseDate ? new Date(b.game.releaseDate).getTime() : 9999999999999;
        return dateA - dateB; // Ascending (Soonest first)
    });

  return (
    <div className="container mx-auto py-8 px-4">
      <h1 className="text-3xl font-bold mb-6">Calendrier des Sorties</h1>

      {upcomingGames.length === 0 ? (
          <p className="text-zinc-500">Aucun jeu à venir dans votre liste.</p>
      ) : (
          <div className="space-y-8">
              {upcomingGames.map((item) => {
                  const date = item.game.releaseDate ? new Date(item.game.releaseDate) : null;
                  return (
                    <div key={item.id} className="flex flex-col md:flex-row gap-4 border-b border-zinc-200 dark:border-zinc-800 pb-4">
                        <div className="w-32 flex-shrink-0 text-zinc-500 pt-2">
                             {date ? (
                                 <div className="text-center md:text-left">
                                     <div className="text-2xl font-bold text-zinc-800 dark:text-zinc-200">{date.getDate()}</div>
                                     <div className="text-sm uppercase">{date.toLocaleDateString('fr-FR', { month: 'short', year: 'numeric' })}</div>
                                 </div>
                             ) : (
                                 <span className="text-sm">TBA</span>
                             )}
                        </div>
                        <div className="flex-grow">
                            <GameCard item={item} paceFactor={prefs.pace} />
                        </div>
                    </div>
                  );
              })}
          </div>
      )}
    </div>
  );
}
