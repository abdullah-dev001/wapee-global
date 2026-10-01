import * as SecureStore from 'expo-secure-store';

import { type AuthStorage } from './authStorage.types';

/**
 * Supabase auth session storage for iOS/Android on top of SecureStore
 * (Keychain / Keystore). SecureStore values should stay small, so long values
 * (the session JSON) are split into chunks:
 *   `<key>.n`  → number of chunks
 *   `<key>.0`, `<key>.1`, … → chunk contents
 */

const CHUNK_SIZE = 1800;

const countKey = (key: string) => `${key}.n`;
const chunkKey = (key: string, index: number) => `${key}.${index}`;

async function readCount(key: string): Promise<number> {
  const raw = await SecureStore.getItemAsync(countKey(key));
  const count = raw ? Number.parseInt(raw, 10) : 0;
  return Number.isFinite(count) && count > 0 ? count : 0;
}

async function removeChunks(key: string, from: number, to: number): Promise<void> {
  const deletions: Promise<void>[] = [];
  for (let i = from; i < to; i += 1) deletions.push(SecureStore.deleteItemAsync(chunkKey(key, i)));
  await Promise.all(deletions);
}

export const authStorage: AuthStorage = {
  async getItem(key) {
    const count = await readCount(key);
    if (count === 0) return null;
    const chunks = await Promise.all(
      Array.from({ length: count }, (_, i) => SecureStore.getItemAsync(chunkKey(key, i))),
    );
    // A missing chunk means a partial write; treat the session as absent.
    if (chunks.some((chunk) => chunk === null)) return null;
    return chunks.join('');
  },

  async setItem(key, value) {
    const previousCount = await readCount(key);
    const chunks: string[] = [];
    for (let i = 0; i < value.length; i += CHUNK_SIZE) chunks.push(value.slice(i, i + CHUNK_SIZE));
    await Promise.all(chunks.map((chunk, i) => SecureStore.setItemAsync(chunkKey(key, i), chunk)));
    await SecureStore.setItemAsync(countKey(key), String(chunks.length));
    if (previousCount > chunks.length) await removeChunks(key, chunks.length, previousCount);
  },

  async removeItem(key) {
    const count = await readCount(key);
    await removeChunks(key, 0, count);
    await SecureStore.deleteItemAsync(countKey(key));
  },
};
