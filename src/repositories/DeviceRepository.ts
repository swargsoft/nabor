import { db } from './db/database';
import type { Device } from '@/types/db';

export const DeviceRepository = {
  async save(device: Device): Promise<void> {
    await db.devices.put(device);
  },

  async get(id: string): Promise<Device | undefined> {
    return db.devices.get(id);
  },

  async getAllForAccount(accountId: string): Promise<Device[]> {
    return db.devices.where('accountId').equals(accountId).toArray();
  },

  async delete(id: string): Promise<void> {
    await db.devices.delete(id);
  },

  async clear(): Promise<void> {
    await db.devices.clear();
  },
};
