
'use client';

import SettingsClient from '@/components/dashboard/SettingsClient';

const mockTags = [
    { id: '1', name: 'RPG', userId: 'user1' },
    { id: '2', name: 'Action', userId: 'user1' }
];

const mockAccountsConnected = [
    { provider: 'steam', providerAccountId: '76561198000000000' }
];

const mockAccountsDisconnected = [];

const mockAccountsCommunity = [
    { provider: 'steamcommunity', providerAccountId: '76561198000000001' }
];

export default function VerifySettings() {
    return (
        <div className="p-10 space-y-10">
            <div className="border p-4 rounded-xl">
                <h2 className="mb-4 text-xl font-bold">Scenario 1: Connected (Account)</h2>
                <SettingsClient
                    initialPace={1.0}
                    initialTags={mockTags}
                    initialAccounts={mockAccountsConnected}
                    userSteamId={null}
                />
            </div>

            <div className="border p-4 rounded-xl">
                <h2 className="mb-4 text-xl font-bold">Scenario 2: Disconnected</h2>
                <SettingsClient
                    initialPace={1.0}
                    initialTags={mockTags}
                    initialAccounts={mockAccountsDisconnected}
                    userSteamId={null}
                />
            </div>

            <div className="border p-4 rounded-xl">
                <h2 className="mb-4 text-xl font-bold">Scenario 3: Connected (User Field Only)</h2>
                <SettingsClient
                    initialPace={1.0}
                    initialTags={mockTags}
                    initialAccounts={mockAccountsDisconnected}
                    userSteamId={'76561198000000002'}
                />
            </div>

             <div className="border p-4 rounded-xl">
                <h2 className="mb-4 text-xl font-bold">Scenario 4: Connected (Community Provider)</h2>
                <SettingsClient
                    initialPace={1.0}
                    initialTags={mockTags}
                    initialAccounts={mockAccountsCommunity}
                    userSteamId={null}
                />
            </div>
        </div>
    );
}
