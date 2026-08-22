import { db } from '@/repositories/db/database';
import { createLogger } from '@/utils/logger';

const logger = createLogger('clearStorage');

export async function clearStorage(): Promise<void> {
  await db.transaction(
    'rw',
    [
      db.identities,
      db.devices,
      db.profiles,
      db.matches,
      db.conversations,
      db.messages,
      db.media,
      db.locations,
      db.discovery,
      db.settings,
    ],
    async () => {
      await Promise.all([
        db.identities.clear(),
        db.devices.clear(),
        db.profiles.clear(),
        db.matches.clear(),
        db.conversations.clear(),
        db.messages.clear(),
        db.media.clear(),
        db.locations.clear(),
        db.discovery.clear(),
        db.settings.clear(),
      ]);
    },
  );
  logger.info('All local storage cleared');
}
