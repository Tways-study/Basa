"use client";

import { useEffect, useState } from "react";

export type ImageSize = { width: number; height: number };

/**
 * Natural size of the photo, needed so a crop keeps the right shape. Null while loading or if it
 * fails; the caller shows a plain placeholder rather than a wrongly stretched crop.
 */
export function useImageSize(url: string | null): ImageSize | null {
  const [loaded, setLoaded] = useState<{ url: string; size: ImageSize } | null>(null);

  useEffect(() => {
    if (!url) return;
    let cancelled = false;
    const img = new Image();
    img.onload = () => {
      if (!cancelled && img.naturalWidth > 0) {
        setLoaded({ url, size: { width: img.naturalWidth, height: img.naturalHeight } });
      }
    };
    img.src = url;
    return () => {
      cancelled = true;
    };
  }, [url]);

  return loaded && loaded.url === url ? loaded.size : null;
}
