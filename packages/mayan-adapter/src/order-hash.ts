import { Buffer } from 'buffer';
import { decodeFunctionData, keccak256, type Hex } from 'viem';
import { SystemProgram } from '@solana/web3.js';
import {
  getAmountOfFractionalAmount,
  getGasDecimal,
  getWormholeChainIdByName,
  hexToUint8Array,
  nativeAddressToHexString,
} from '@mayanfinance/swap-sdk';

export const SWIFT_PROGRAM_ID = 'BLZRi6frs4X4DNLw56V4EXai1b6QVESN1BhHBTYM9VcY';
const EVM_ZERO_ADDRESS = '0x0000000000000000000000000000000000000000';
const ORDER_DATA_SIZE = 239;
const INIT_SWIFT_DATA_SIZE = 198;
const RANDOM_KEY_OFFSET = 166;

export interface SwiftHashableQuote {
  fromChain: string;
  toChain: string;
  swiftInputContract: string;
  toToken: { contract: string; decimals: number };
  minAmountOut: number;
  gasDrop: number;
  cancelRelayerFee64: string | number;
  refundRelayerFee64: string | number;
  deadline64: string | number;
  referrerBps: number;
  protocolBps: number;
  swiftAuctionMode: number;
}

function stripHexPrefix(h: string): string {
  return h.startsWith('0x') ? h.slice(2) : h;
}

function chainId(name: string): number {
  const id = getWormholeChainIdByName(name as never);
  if (id == null) throw new Error(`unknown chain: ${name}`);
  return id;
}

export function computeSwiftOrderHash(
  quote: SwiftHashableQuote,
  swapperAddress: string,
  destinationAddress: string,
  referrerAddress: string | null,
  randomKeyHex: string,
): Hex {
  const data = Buffer.alloc(ORDER_DATA_SIZE);
  let offset = 0;
  const sourceChainId = chainId(quote.fromChain);
  const destChainId = chainId(quote.toChain);
  const solanaChainId = chainId('solana');

  data.set(
    Buffer.from(hexToUint8Array(nativeAddressToHexString(swapperAddress, sourceChainId))),
    offset,
  );
  offset += 32;
  data.writeUInt16BE(sourceChainId, offset);
  offset += 2;

  const tokenInHex =
    quote.swiftInputContract === EVM_ZERO_ADDRESS
      ? nativeAddressToHexString(SystemProgram.programId.toString(), solanaChainId)
      : nativeAddressToHexString(quote.swiftInputContract, sourceChainId);
  data.set(Buffer.from(hexToUint8Array(tokenInHex)), offset);
  offset += 32;

  data.set(
    Buffer.from(hexToUint8Array(nativeAddressToHexString(destinationAddress, destChainId))),
    offset,
  );
  offset += 32;
  data.writeUInt16BE(destChainId, offset);
  offset += 2;

  const tokenOutHex =
    quote.toToken.contract === EVM_ZERO_ADDRESS
      ? nativeAddressToHexString(SystemProgram.programId.toString(), solanaChainId)
      : nativeAddressToHexString(quote.toToken.contract, destChainId);
  data.set(Buffer.from(hexToUint8Array(tokenOutHex)), offset);
  offset += 32;

  data.writeBigUInt64BE(
    getAmountOfFractionalAmount(quote.minAmountOut, Math.min(quote.toToken.decimals, 8)),
    offset,
  );
  offset += 8;
  data.writeBigUInt64BE(
    getAmountOfFractionalAmount(quote.gasDrop, Math.min(getGasDecimal(quote.toChain as never), 8)),
    offset,
  );
  offset += 8;
  data.writeBigUInt64BE(BigInt(quote.cancelRelayerFee64), offset);
  offset += 8;
  data.writeBigUInt64BE(BigInt(quote.refundRelayerFee64), offset);
  offset += 8;
  data.writeBigUInt64BE(BigInt(quote.deadline64), offset);
  offset += 8;

  const refAddress = referrerAddress
    ? Buffer.from(hexToUint8Array(nativeAddressToHexString(referrerAddress, destChainId)))
    : SystemProgram.programId.toBuffer();
  data.set(refAddress, offset);
  offset += 32;

  data.writeUInt8(quote.referrerBps, offset);
  offset += 1;
  data.writeUInt8(quote.protocolBps, offset);
  offset += 1;
  data.writeUInt8(quote.swiftAuctionMode, offset);
  offset += 1;

  const randomBytes = Buffer.from(hexToUint8Array(stripHexPrefix(randomKeyHex)));
  if (randomBytes.length !== 32) throw new Error('random key must be 32 bytes');
  data.set(randomBytes, offset);
  offset += 32;

  if (offset !== ORDER_DATA_SIZE) throw new Error(`Invalid order data size: ${offset}`);
  return keccak256(data);
}

type SolanaIx = {
  programId: { toBase58: () => string };
  data: Buffer | Uint8Array;
};

export function extractSolanaRandomKey(instructions: ReadonlyArray<SolanaIx>): string {
  const ix = instructions.find((i) => i.programId.toBase58() === SWIFT_PROGRAM_ID);
  if (!ix) throw new Error('Swift init_order instruction not found');
  const data = Buffer.from(ix.data as Uint8Array);
  if (data.length !== INIT_SWIFT_DATA_SIZE) {
    throw new Error(`Unexpected Swift init_order data size: ${data.length}`);
  }
  return data.subarray(RANDOM_KEY_OFFSET, RANDOM_KEY_OFFSET + 32).toString('hex');
}

const FORWARDER_ABI = [
  {
    type: 'function',
    name: 'forwardERC20',
    stateMutability: 'payable',
    inputs: [
      { name: 'tokenIn', type: 'address' },
      { name: 'amountIn', type: 'uint256' },
      {
        name: 'permitParams',
        type: 'tuple',
        components: [
          { name: 'value', type: 'uint256' },
          { name: 'deadline', type: 'uint256' },
          { name: 'v', type: 'uint8' },
          { name: 'r', type: 'bytes32' },
          { name: 's', type: 'bytes32' },
        ],
      },
      { name: 'mayanProtocol', type: 'address' },
      { name: 'protocolData', type: 'bytes' },
    ],
    outputs: [],
  },
] as const;

const SWIFT_ABI = [
  {
    type: 'function',
    name: 'createOrderWithToken',
    stateMutability: 'nonpayable',
    inputs: [
      { name: 'tokenIn', type: 'address' },
      { name: 'amountIn', type: 'uint256' },
      {
        name: 'params',
        type: 'tuple',
        components: [
          { name: 'trader', type: 'bytes32' },
          { name: 'tokenOut', type: 'bytes32' },
          { name: 'minAmountOut', type: 'uint64' },
          { name: 'gasDrop', type: 'uint64' },
          { name: 'cancelFee', type: 'uint64' },
          { name: 'refundFee', type: 'uint64' },
          { name: 'deadline', type: 'uint64' },
          { name: 'destAddr', type: 'bytes32' },
          { name: 'destChainId', type: 'uint16' },
          { name: 'referrerAddr', type: 'bytes32' },
          { name: 'referrerBps', type: 'uint8' },
          { name: 'auctionMode', type: 'uint8' },
          { name: 'random', type: 'bytes32' },
        ],
      },
    ],
    outputs: [{ name: 'orderHash', type: 'bytes32' }],
  },
] as const;

export function extractEvmRandomKey(forwarderCallData: `0x${string}`): string {
  const forwardDecoded = decodeFunctionData({ abi: FORWARDER_ABI, data: forwarderCallData });
  const protocolData = forwardDecoded.args[4];
  const swiftDecoded = decodeFunctionData({ abi: SWIFT_ABI, data: protocolData });
  const params = swiftDecoded.args[2] as { random: `0x${string}` };
  return stripHexPrefix(params.random);
}
