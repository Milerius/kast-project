'use client';
import { useEffect, useState } from 'react';

const FALLBACK_USD = 150;

export function usePriceSol(): number {
  const [price, setPrice] = useState<number>(FALLBACK_USD);
  useEffect(() => {
    let canceled = false;
    fetch('/api/sol-price')
      .then((r) => r.json() as Promise<{ usd?: number }>)
      .then((j) => {
        if (!canceled && typeof j.usd === 'number' && j.usd > 0) setPrice(j.usd);
      })
      .catch(() => {
        /* keep fallback */
      });
    return () => {
      canceled = true;
    };
  }, []);
  return price;
}
