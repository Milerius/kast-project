import { PublicKey } from '@solana/web3.js';

const STATE_PDA = new PublicKey('98CZ95a9ZEbAMW4SQwJJPY7ApLV4M6TYe4gweQ2ZNQdC');
const USDC_MINT = new PublicKey('EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v');
const TOKEN_PROGRAM_ID = new PublicKey('TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA');
const ATA_PROGRAM_ID = new PublicKey('ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL');

const [ata] = PublicKey.findProgramAddressSync(
  [STATE_PDA.toBuffer(), TOKEN_PROGRAM_ID.toBuffer(), USDC_MINT.toBuffer()],
  ATA_PROGRAM_ID,
);
console.log('state PDA USDC ATA:', ata.toBase58());
