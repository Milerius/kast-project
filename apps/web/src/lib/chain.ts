import { Connection } from '@solana/web3.js';
import { createPublicClient, http } from 'viem';
import { base } from 'viem/chains';
import { env } from './env.js';

export function solanaConnection(): Connection {
  return new Connection(env.solanaRpcUrl(), 'confirmed');
}

export function basePublicClient() {
  return createPublicClient({ chain: base, transport: http(env.baseRpcUrl()) });
}
