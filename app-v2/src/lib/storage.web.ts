/** Web counterpart of `storage.ts`. localStorage can be unavailable (private mode), so failures are ignored. */
export const storage = {
  async get(key: string) {
    try {
      return window.localStorage.getItem(key);
    } catch {
      return null;
    }
  },
  async set(key: string, value: string) {
    try {
      window.localStorage.setItem(key, value);
    } catch {}
  },
  async remove(key: string) {
    try {
      window.localStorage.removeItem(key);
    } catch {}
  },
};
