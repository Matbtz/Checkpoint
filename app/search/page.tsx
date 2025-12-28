import { SearchPageContent } from "@/components/search/search-page-content";
import { Suspense } from "react";
import { Loader2 } from "lucide-react";

export default function SearchPage() {
    return (
        <div className="container py-6 space-y-6">
            <div className="flex flex-col gap-2">
                <h1 className="text-3xl font-bold tracking-tight">Global Search</h1>
                <p className="text-muted-foreground">
                    Search your library or find new games on IGDB.
                </p>
            </div>

            <Suspense fallback={
                <div className="flex justify-center py-12">
                    <Loader2 className="h-8 w-8 animate-spin text-primary" />
                </div>
            }>
                <SearchPageContent />
            </Suspense>
        </div>
    );
}
