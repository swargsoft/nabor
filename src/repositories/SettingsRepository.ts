import { db } from './db/database';
import type { Settings } from '@/types/db';

const SETTINGS_ID = 'local' as const;

const defaults: Settings = {
  id: SETTINGS_ID,
  ageMin: 18,
  ageMax: 99,
  radiusKm: 25,
  genderPreference: [],
  notificationsEnabled: true,
  theme: 'system',
  turnServers: [],
  updatedAt: Date.now(),
};

export const SettingsRepository = {
  async get(): Promise<Settings> {
    return (await db.settings.get(SETTINGS_ID)) ?? defaults;
  },

  async save(settings: Partial<Omit<Settings, 'id'>>): Promise<void> {
    const current = await this.get();
    await db.settings.put({ ...current, ...settings, id: SETTINGS_ID, updatedAt: Date.now() });
  },

  async clear(): Promise<void> {
    await db.settings.clear();
  },
};
