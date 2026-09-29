import { useSyncExternalStore } from 'react';

// Hash routing (PROJECT_BRIEF.md §7: GitHub Pages has no SPA rewrites). "#/points" opens the
// points page; anything else is the timing board.

export type Route = 'timing' | 'points';

export function routeFromHash(hash: string): Route {
  return /^#\/points\b/.test(hash) ? 'points' : 'timing';
}

export function hashForRoute(route: Route): string {
  return route === 'points' ? '#/points' : '#/';
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
