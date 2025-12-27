import { SearchPageContent } from "@/components/search/search-page-content";

export default function SearchPage() {
    return (
        <div className="container py-6 space-y-6">
            <div className="flex flex-col gap-2">
                <h1 className="text-3xl font-bold tracking-tight">Global Search</h1>
                <p className="text-muted-foreground">
                    Search your library or find new games on IGDB.
                </p>
            </div>

            <SearchPageContent />
        </div>
    );
}
