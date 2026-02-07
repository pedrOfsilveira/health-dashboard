/**
 * Offline queue using idb-keyval.
 * When network fails, entries are stored locally and flushed when back online.
 * Uses Svelte 5 runes for reactive pending count.
 */
import { get, set } from 'idb-keyval';
import { callProcessEntry } from './supabase.js';
import { handleGamificationUpdate } from './stores.svelte.js';

const QUEUE_KEY = 'bio-tracker-offline-queue';

// ─── Reactive state ─────────────────────────────────────────

export const offlineQueue = $state({
  /** @type {number} */
  pendingCount: 0,
  /** @type {boolean} */
  flushing: false,
});

// ─── Helpers ────────────────────────────────────────────────

async function loadQueue() {
  try {
    return (await get(QUEUE_KEY)) || [];
  } catch {
    return [];
  }
}

async function saveQueue(queue) {
  await set(QUEUE_KEY, queue);
  offlineQueue.pendingCount = queue.length;
}

// ─── Public API ─────────────────────────────────────────────

/**
 * Add an entry to the offline queue.
 * @param {string} text - The user message text
 * @param {string} date - ISO date string (YYYY-MM-DD)
 */
export async function enqueueEntry(text, date) {
  const queue = await loadQueue();
  queue.push({ text, date, createdAt: Date.now() });
  await saveQueue(queue);
}

/**
 * Flush all queued entries by sending them to the API.
 * Returns an array of results (success/fail per entry).
 * @returns {Promise<Array<{ success: boolean, text: string, result?: any, error?: string }>>}
 */
export async function flushQueue() {
  if (offlineQueue.flushing) return [];

  const queue = await loadQueue();
  if (queue.length === 0) return [];

  offlineQueue.flushing = true;
  const results = [];

  // Process entries one by one (order matters for day totals)
  const remaining = [];
  for (const entry of queue) {
    try {
      const result = await callProcessEntry(entry.text, entry.date);
      results.push({ success: true, text: entry.text, result });

      // Apply gamification updates
      if (result.success && result.gamification) {
        handleGamificationUpdate(result.gamification);
      }
    } catch {
      // Still offline or transient error — keep in queue
      remaining.push(entry);
      results.push({ success: false, text: entry.text, error: 'Ainda sem conexão' });
    }
  }

  await saveQueue(remaining);
  offlineQueue.flushing = false;
  return results;
}

/**
 * Initialize: load count from IDB and set up online listener.
 */
export async function initOfflineQueue() {
  const queue = await loadQueue();
  offlineQueue.pendingCount = queue.length;

  // Auto-flush when coming back online
  window.addEventListener('online', async () => {
    if (offlineQueue.pendingCount > 0) {
      await flushQueue();
    }
  });
}
