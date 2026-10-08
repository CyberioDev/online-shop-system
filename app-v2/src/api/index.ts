import { createHttpApi } from './http';
import { mockApi } from './mock';

export * from './types';

/**
 * Set `EXPO_PUBLIC_API_URL` (e.g. http://localhost:8080) to talk to the backend.
 * Without it the app runs on in-memory demo data.
 */
const baseUrl = process.env.EXPO_PUBLIC_API_URL?.replace(/\/$/, '');

export const api = baseUrl ? createHttpApi(baseUrl) : mockApi;
