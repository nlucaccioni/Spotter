import { useSyncExternalStore } from 'react';

// Hash routing (PROJECT_BRIEF.md §7: GitHub Pages has no SPA rewrites). "#/points" opens the
// points page, "#/analysis" the analysis page; anything else is the timing board.

export type Route = 'timing' | 'points' | 'analysis';

export function routeFromHash(hash: string): Route {
  if (/^#\/points\b/.test(hash)) return 'points';
  if (/^#\/analysis\b/.test(hash)) return 'analysis';
  return 'timing';
}

export function hashForRoute(route: Route): string {
  return route === 'timing' ? '#/' : `#/${route}`;
}

const subscribe = (onChange: () => void) => {
  window.addEventListener('hashchange', onChange);
  return () => window.removeEventListener('hashchange', onChange);
};

export function useHashRoute(): [Route, (route: Route) => void] {
  const route = useSyncExternalStore(subscribe, () => routeFromHash(window.location.hash));
  const navigate = (next: Route) => {
    window.location.hash = hashForRoute(next);
  };
  return [route, navigate];
}
