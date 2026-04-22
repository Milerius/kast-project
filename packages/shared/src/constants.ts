export const SOLANA_USDC_MINT = 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v';
export const SOLANA_SOL_MINT = 'So11111111111111111111111111111111111111112'; // WSOL
export const BASE_USDC = '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913';
export const BASE_CHAIN_ID = 8453;

// Kamino main market (verify against @kamino-finance/klend-sdk constants at impl time)
export const KAMINO_MAIN_MARKET = '7u3HeHxYDLhnCoErrtycNokbQYbWGzLs6JSDqGAv5PfF';

export const LAMPORTS_PER_SOL = 1_000_000_000n;
export const USDC_BASE_UNITS = 1_000_000n; // USDC has 6 decimals on both chains

export const TARGET_COLLATERAL_USD = 18;
export const DEFAULT_BORROW_USDC_UNITS = 5n * USDC_BASE_UNITS; // 5 USDC

export const BASE_ETH_GAS_THRESHOLD_WEI = 1_000_000_000_000_000n; // 0.001 ETH
export const PENDING_ORDERS_STORAGE_KEY = 'kast:pendingOrders';
