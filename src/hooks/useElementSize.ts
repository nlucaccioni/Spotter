import { useCallback, useState } from 'react';

export interface Size {
  width: number;
  height: number;
}

/** Tracks an element's content-box size. Attach the returned ref callback to the element. */
export function useElementSize<T extends Element>(): [(node: T | null) => void, Size | null] {
  const [size, setSize] = useState<Size | null>(null);

  const ref = useCallback((node: T | null) => {
    if (!node) return;
    const observer = new ResizeObserver(([entry]) => {
      if (!entry) return;
      const { width, height } = entry.contentRect;
      setSize((prev) =>
        prev && prev.width === width && prev.height === height ? prev : { width, height },
      );
    });
    observer.observe(node);
    return () => observer.disconnect();
  }, []);

  return [ref, size];
}
