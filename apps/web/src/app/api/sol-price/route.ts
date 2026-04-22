export const revalidate = 60;

const COINGECKO_URL = 'https://api.coingecko.com/api/v3/simple/price?ids=solana&vs_currencies=usd';
const FALLBACK_USD = 150;

export async function GET() {
  try {
    const res = await fetch(COINGECKO_URL, { next: { revalidate: 60 } });
    if (!res.ok) throw new Error(`coingecko ${res.status}`);
    const json = (await res.json()) as { solana?: { usd?: number } };
    const usd = json.solana?.usd;
    if (typeof usd !== 'number' || !Number.isFinite(usd) || usd <= 0) {
      throw new Error('invalid price payload');
    }
    return Response.json({ usd, source: 'coingecko' });
  } catch {
    return Response.json({ usd: FALLBACK_USD, source: 'fallback' });
  }
}
