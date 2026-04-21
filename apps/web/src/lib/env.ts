function read(key: string, fallback?: string): string {
  const v = process.env[key] ?? fallback;
  if (v === undefined || v === '') throw new Error(`Missing env ${key}`);
  return v;
}

export const env = {
  privyAppId: () => read('NEXT_PUBLIC_PRIVY_APP_ID'),
  solanaRpcUrl: () => read('NEXT_PUBLIC_SOLANA_RPC_URL'),
  baseRpcUrl: () => read('NEXT_PUBLIC_BASE_RPC_URL'),
  mayanReferrer: () => process.env.NEXT_PUBLIC_MAYAN_REFERRER,
};
