import { useFocusEffect } from 'expo-router';
import { useCallback, useEffect, useRef, useState, type DependencyList } from 'react';

type ResourceState<T> = {
  data?: T;
  error?: Error;
  /** Which request (deps + reload count) the current data/error belongs to. */
  key?: string;
};

/**
 * Loads async data, re-running when `deps` change. The previous data is kept
 * while reloading so screens don't flash empty.
 */
export function useResource<T>(load: () => Promise<T>, deps: DependencyList) {
  const [version, setVersion] = useState(0);
  const [state, setState] = useState<ResourceState<T>>({});
  const key = JSON.stringify([...deps, version]);

  useEffect(() => {
    let cancelled = false;
    load().then(
      (data) => !cancelled && setState({ data, key }),
      (error: Error) => !cancelled && setState((s) => ({ ...s, error, key })),
    );
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  const loading = state.key !== key;
  const reload = useCallback(() => setVersion((v) => v + 1), []);
  /** Replaces the data with a fresh copy, e.g. the result of a mutation. */
  const setData = useCallback((data: T) => setState((s) => ({ data, key: s.key })), []);

  return { data: state.data, error: loading ? undefined : state.error, loading, reload, setData };
}

/** Calls `reload` when the screen regains focus (e.g. after returning from a form). */
export function useReloadOnFocus(reload: () => void) {
  const firstFocus = useRef(true);
  useFocusEffect(
    useCallback(() => {
      if (firstFocus.current) {
        firstFocus.current = false;
        return;
      }
      reload();
    }, [reload]),
  );
}
