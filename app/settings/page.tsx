import { getUserPreferences } from '@/actions/user';
import { getUserTags } from '@/actions/tag';
import SettingsClient from '@/components/dashboard/SettingsClient';

export default async function SettingsPage() {
    const prefs = await getUserPreferences();
    const tags = await getUserTags();

    return <SettingsClient initialPace={prefs.pace} initialTags={tags} />;
}
