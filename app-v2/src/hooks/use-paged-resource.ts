import { useCallback, useState } from 'react';
import { useResource } from './use-resource';

/** Fetch one cursor page at a time; a filter change starts a new cursor history. */
export function usePagedResource<T extends { total: number; nextCursor: string | null }>(
  load: (cursor: string | null) => Promise<T>, scope: string,
) {
  const [history, setHistory] = useState<{ scope: string; cursors: (string | null)[]; index: number }>({ scope, cursors: [null], index: 0 });
  const current = history.scope === scope ? history : { scope, cursors: [null], index: 0 };
  const resource = useResource(() => load(current.cursors[current.index]), [scope, current.cursors[current.index]]);
  const reloadResource = resource.reload;
  const reload = useCallback(() => {
    setHistory({ scope, cursors: [null], index: 0 });
    reloadResource();
  }, [scope, reloadResource]);
  return {
    ...resource,
    data: resource.loading || resource.error ? undefined : resource.data,
    reload,
    page: current.index + 1,
    hasPrevious: current.index > 0,
    previous: () => setHistory({ ...current, index: Math.max(0, current.index - 1) }),
    next: () => {
      if (!resource.loading && resource.data?.nextCursor) setHistory({ scope, cursors: [...current.cursors.slice(0, current.index + 1), resource.data.nextCursor], index: current.index + 1 });
    },
  };
}
