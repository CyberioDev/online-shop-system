import { ApiError } from './types';

const LATENCY_MS = 250;

export function respond<T>(value: T): Promise<T> {
  // Return copies so screens can't mutate the "server" state by accident.
  const copy = value === undefined ? value : (JSON.parse(JSON.stringify(value)) as T);
  return new Promise((resolve) => setTimeout(() => resolve(copy), LATENCY_MS));
}

export function fail(code: ApiError['code'], message?: string): Promise<never> {
  return new Promise((_, reject) =>
    setTimeout(() => reject(new ApiError(code, message)), LATENCY_MS),
  );
}

let idCounter = 1000;
export const newId = (prefix: string) => `${prefix}_${++idCounter}`;
