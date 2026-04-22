function required(key: string, value: string | undefined): string {
  if (value === undefined || value === '') throw new Error(`Missing env ${key}`);
  return value;
}

export const env = {
  privyAppId: () => required('NEXT_PUBLIC_PRIVY_APP_ID', process.env.NEXT_PUBLIC_PRIVY_APP_ID),
  solanaRpcUrl: () =>
    required('NEXT_PUBLIC_SOLANA_RPC_URL', process.env.NEXT_PUBLIC_SOLANA_RPC_URL),
  baseRpcUrl: () => required('NEXT_PUBLIC_BASE_RPC_URL', process.env.NEXT_PUBLIC_BASE_RPC_URL),
  mayanReferrer: () => process.env.NEXT_PUBLIC_MAYAN_REFERRER,
};
