import { format, differenceInDays } from 'date-fns';

export function formatReleaseDate(releaseDate: Date): string {
    const now = new Date();
    const diffDays = differenceInDays(releaseDate, now);

    // If released (or today)
    if (diffDays <= 0) {
        return format(releaseDate, 'd MMM yyyy');
    }

    // If > 5 days in future
    if (diffDays > 5) {
        return format(releaseDate, 'd MMM yyyy');
    }

    // If <= 5 days in future, we want a countdown.
    // We'll return a special string or handle this in the component.
    // But the requirement says "Afficher un compte à rebours dynamique".
    // Let's return the formatted date here for "static" display, and let the component handle the countdown if needed,
    // OR we can return a formatted string like "In 3 days".
    // However, "compte à rebours dynamique" implies hours/minutes.
    // So the component should probably handle the logic.

    // For the purpose of this utility, let's just format the date.
    return format(releaseDate, 'd MMM yyyy');
}

export function getCountdownString(releaseDate: Date): string {
    const now = new Date();
    const diffTime = releaseDate.getTime() - now.getTime();

    if (diffTime <= 0) return "Sortie !";

    const days = Math.floor(diffTime / (1000 * 60 * 60 * 24));
    const hours = Math.floor((diffTime % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));

    // "Sortie dans 3j 12h"
    return `Sortie dans ${days}j ${hours}h`;
}

export function isReleasingSoon(releaseDate: Date): boolean {
    const now = new Date();
    const diffDays = differenceInDays(releaseDate, now);
    return diffDays >= 0 && diffDays <= 5;
}

export function isReleased(releaseDate: Date): boolean {
    const now = new Date();
    return releaseDate <= now;
}

// Define HLTBTimes interface to avoid 'any'
export interface HLTBTimes {
    main?: number | null;
    extra?: number | null;
    completionist?: number | null;
}

export function calculateProgress(playedMinutes: number, hltbTimes: HLTBTimes | null | undefined, targetType: string): number {
    if (!hltbTimes) return 0;

    let targetMinutes = 0;

    switch (targetType) {
        case 'Main':
            targetMinutes = hltbTimes.main || 0;
            break;
        case 'Extra':
            targetMinutes = hltbTimes.extra || 0;
            break;
        case '100%':
            targetMinutes = hltbTimes.completionist || 0;
            break;
        default:
            targetMinutes = hltbTimes.main || 0;
    }

    if (targetMinutes === 0) return 0;

    const progress = (playedMinutes / targetMinutes) * 100;
    return Math.min(progress, 100); // Cap at 100%
}
