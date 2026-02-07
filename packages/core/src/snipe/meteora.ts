/**
 * Meteora DLMM Integration
 * TrenchSniper OS - Direct Meteora DEX Integration
 */

import {
  Connection,
  Keypair,
  PublicKey,
  Transaction,
  TransactionInstruction,
  ComputeBudgetProgram,
} from '@solana/web3.js';
import {
  TOKEN_PROGRAM_ID,
  getAssociatedTokenAddress,
  createAssociatedTokenAccountInstruction,
} from '@solana/spl-token';

import { Quote, QuoteParams, SwapResult, Pool, NoRouteError, APIError } from '../trading/types.js';

// ============ Constants ============

export const METEORA_DLMM_PROGRAM = new PublicKey('LBUZKhRxPF3XUpBCjp4YzTKgLccjZhTSDM9YuVaPwxo');
const METEORA_API_URL = 'https://dlmm-api.meteora.ag';
const QUOTE_VALIDITY_MS = 30000;

// ============ Types ============

export interface MeteoraDLMMPool {
  address: string;
  name: string;
  mintX: string;
  mintY: string;
  reserveX: string;
  reserveY: string;
  reserveXAmount: number;
  reserveYAmount: number;
  binStep: number;
  baseFeePercentage: string;
  protocolFeePercentage: string;
  liquidity: number;
  feeApr: number;
  apr: number;
  currentPrice: number;
  activeBinId: number;
}

export interface MeteoraSwapParams {
  wallet: Keypair;
  quote: Quote;
  priorityFee?: number;
}

// ============ Meteora DLMM Client ============

export class MeteoraClient {
  private poolCache: Map<string, MeteoraDLMMPool> = new Map();
  private poolCacheExpiry = 0;
  private readonly cacheDurationMs = 60000;

  constructor(
    private readonly connection: Connection,
    private readonly apiUrl: string = METEORA_API_URL
  ) {}

  /**
   * Get swap quote from Meteora DLMM
   */
  async getQuote(params: QuoteParams): Promise<Quote> {
    const pool = await this.findPool(
      params.inputMint.toString(),
      params.outputMint.toString()
    );

    if (!pool) {
      throw new NoRouteError(
        params.inputMint.toString(),
        params.outputMint.toString()
      );
    }

    const result = this.calculateQuote(pool, params);
    const now = Date.now();

    return {
      inputMint: params.inputMint.toString(),
      outputMint: params.outputMint.toString(),
      inAmount: params.amount.toString(),
      outAmount: result.outAmount,
      minOutAmount: result.minOutAmount,
      priceImpactPct: result.priceImpact,
      route: [{
        dex: 'meteora',
        inputMint: params.inputMint.toString(),
        outputMint: params.outputMint.toString(),
        poolId: pool.address,
        percent: 100,
      }],
      dex: 'orca', // Using 'orca' as meteora not in DEX type yet
      timestamp: now,
      expiresAt: now + QUOTE_VALIDITY_MS,
    };
  }

  /**
   * Execute swap on Meteora DLMM
   */
  async swap(params: MeteoraSwapParams): Promise<SwapResult> {
    const { wallet, quote, priorityFee } = params;

    const pool = await this.findPool(quote.inputMint, quote.outputMint);
    if (!pool) {
      throw new APIError('meteora', 'Pool not found');
    }

    const transaction = await this.buildSwapTransaction(
      wallet,
      pool,
      quote,
      priorityFee
    );

    const signature = await this.connection.sendRawTransaction(
      transaction.serialize(),
      { skipPreflight: false, maxRetries: 2 }
    );

    const confirmation = await this.connection.confirmTransaction(signature, 'confirmed');

    if (confirmation.value.err) {
      throw new APIError('meteora', `Transaction failed: ${JSON.stringify(confirmation.value.err)}`);
    }

    return {
      signature,
      inputAmount: parseInt(quote.inAmount),
      outputAmount: parseInt(quote.outAmount),
      fee: (priorityFee || 5000) / 1e9,
      slot: confirmation.context.slot,
      timestamp: Date.now(),
    };
  }

  /**
   * Get available Meteora pools for a token
   */
  async getPools(tokenMint: PublicKey): Promise<Pool[]> {
    await this.refreshPoolCache();
    
    const pools: Pool[] = [];
    const mintStr = tokenMint.toString();

    for (const [, poolInfo] of this.poolCache) {
      if (poolInfo.mintX === mintStr || poolInfo.mintY === mintStr) {
        pools.push({
          id: poolInfo.address,
          dex: 'orca', // Using orca as meteora not in DEX type
          tokenA: { mint: poolInfo.mintX, symbol: '', decimals: 9 },
          tokenB: { mint: poolInfo.mintY, symbol: '', decimals: 9 },
          liquidity: poolInfo.liquidity ?? 0,
          volume24h: 0,
        });
      }
    }

    return pools;
  }

  /**
   * Find pool for a token pair
   */
  private async findPool(inputMint: string, outputMint: string): Promise<MeteoraDLMMPool | null> {
    await this.refreshPoolCache();

    for (const [, pool] of this.poolCache) {
      if (
        (pool.mintX === inputMint && pool.mintY === outputMint) ||
        (pool.mintX === outputMint && pool.mintY === inputMint)
      ) {
        return pool;
      }
    }

    return null;
  }

  /**
   * Refresh pool cache from Meteora API
   */
  private async refreshPoolCache(): Promise<void> {
    const now = Date.now();
    if (now < this.poolCacheExpiry) return;

    try {
      const response = await fetch(`${this.apiUrl}/pair/all`);
      if (!response.ok) throw new Error(`HTTP ${response.status}`);

      const data = await response.json();
      this.poolCache.clear();

      if (Array.isArray(data)) {
        for (const pool of data) {
          if (pool.address) {
            this.poolCache.set(pool.address, {
              address: pool.address,
              name: pool.name,
              mintX: pool.mint_x,
              mintY: pool.mint_y,
              reserveX: pool.reserve_x,
              reserveY: pool.reserve_y,
              reserveXAmount: pool.reserve_x_amount || 0,
              reserveYAmount: pool.reserve_y_amount || 0,
              binStep: pool.bin_step,
              baseFeePercentage: pool.base_fee_percentage,
              protocolFeePercentage: pool.protocol_fee_percentage,
              liquidity: pool.liquidity || 0,
              feeApr: pool.fee_apr || 0,
              apr: pool.apr || 0,
              currentPrice: pool.current_price || 0,
              activeBinId: pool.active_bin_id || 0,
            });
          }
        }
      }

      this.poolCacheExpiry = now + this.cacheDurationMs;
    } catch (error) {
      console.warn('Failed to refresh Meteora pool cache:', error);
    }
  }

  /**
   * Calculate swap quote for DLMM
   */
  private calculateQuote(
    pool: MeteoraDLMMPool,
    params: QuoteParams
  ): { outAmount: string; minOutAmount: string; priceImpact: number } {
    const isXToY = params.inputMint.toString() === pool.mintX;
    const inputReserve = isXToY ? pool.reserveXAmount : pool.reserveYAmount;
    const outputReserve = isXToY ? pool.reserveYAmount : pool.reserveXAmount;

    const inputAmount = BigInt(params.amount);
    
    // DLMM fee is based on bin step (basis points)
    const feeRate = BigInt(pool.binStep);
    const fee = inputAmount * feeRate / 10000n;
    const inputAfterFee = inputAmount - fee;

    // Constant product approximation for DLMM
    const inputReserveBig = BigInt(Math.floor(inputReserve));
    const outputReserveBig = BigInt(Math.floor(outputReserve));
    
    const outputAmount = (outputReserveBig * inputAfterFee) / (inputReserveBig + inputAfterFee);

    const spotPrice = Number(outputReserveBig) / Number(inputReserveBig);
    const executionPrice = Number(outputAmount) / Number(inputAfterFee);
    const priceImpact = Math.abs((spotPrice - executionPrice) / spotPrice * 100);

    const slippageMultiplier = BigInt(10000 - params.slippageBps);
    const minOutput = (outputAmount * slippageMultiplier) / 10000n;

    return {
      outAmount: outputAmount.toString(),
      minOutAmount: minOutput.toString(),
      priceImpact,
    };
  }

  /**
   * Build swap transaction
   */
  private async buildSwapTransaction(
    wallet: Keypair,
    pool: MeteoraDLMMPool,
    quote: Quote,
    priorityFee?: number
  ): Promise<Transaction> {
    const transaction = new Transaction();

    if (priorityFee && priorityFee > 0) {
      transaction.add(
        ComputeBudgetProgram.setComputeUnitPrice({ microLamports: priorityFee })
      );
    }

    const inputMint = new PublicKey(quote.inputMint);
    const outputMint = new PublicKey(quote.outputMint);

    const inputTokenAccount = await getAssociatedTokenAddress(inputMint, wallet.publicKey);
    const outputTokenAccount = await getAssociatedTokenAddress(outputMint, wallet.publicKey);

    const outputAccountInfo = await this.connection.getAccountInfo(outputTokenAccount);
    if (!outputAccountInfo) {
      transaction.add(
        createAssociatedTokenAccountInstruction(
          wallet.publicKey,
          outputTokenAccount,
          wallet.publicKey,
          outputMint
        )
      );
    }

    const swapInstruction = this.buildSwapInstruction(
      wallet.publicKey,
      pool,
      inputTokenAccount,
      outputTokenAccount,
      BigInt(quote.inAmount),
      BigInt(quote.minOutAmount)
    );

    transaction.add(swapInstruction);

    const { blockhash, lastValidBlockHeight } = 
      await this.connection.getLatestBlockhash('confirmed');

    transaction.recentBlockhash = blockhash;
    transaction.lastValidBlockHeight = lastValidBlockHeight;
    transaction.feePayer = wallet.publicKey;
    transaction.sign(wallet);

    return transaction;
  }

  /**
   * Build Meteora DLMM swap instruction
   */
  private buildSwapInstruction(
    user: PublicKey,
    pool: MeteoraDLMMPool,
    userSourceToken: PublicKey,
    userDestToken: PublicKey,
    amountIn: bigint,
    minAmountOut: bigint
  ): TransactionInstruction {
    // Swap instruction discriminator
    const SWAP_DISCRIMINATOR = Buffer.from([248, 198, 158, 145, 225, 117, 135, 200]);
    
    const data = Buffer.alloc(8 + 8 + 8 + 1);
    SWAP_DISCRIMINATOR.copy(data, 0);
    data.writeBigUInt64LE(amountIn, 8);
    data.writeBigUInt64LE(minAmountOut, 16);
    data.writeUInt8(1, 24); // exact_in = true

    const keys = [
      { pubkey: new PublicKey(pool.address), isSigner: false, isWritable: true },
      { pubkey: new PublicKey(pool.reserveX), isSigner: false, isWritable: true },
      { pubkey: new PublicKey(pool.reserveY), isSigner: false, isWritable: true },
      { pubkey: userSourceToken, isSigner: false, isWritable: true },
      { pubkey: userDestToken, isSigner: false, isWritable: true },
      { pubkey: new PublicKey(pool.mintX), isSigner: false, isWritable: false },
      { pubkey: new PublicKey(pool.mintY), isSigner: false, isWritable: false },
      { pubkey: user, isSigner: true, isWritable: false },
      { pubkey: TOKEN_PROGRAM_ID, isSigner: false, isWritable: false },
    ];

    return new TransactionInstruction({
      keys,
      programId: METEORA_DLMM_PROGRAM,
      data,
    });
  }
}

// ============ Standalone Functions ============

let defaultClient: MeteoraClient | null = null;

function getDefaultClient(connection: Connection): MeteoraClient {
  if (!defaultClient) {
    defaultClient = new MeteoraClient(connection);
  }
  return defaultClient;
}

export async function getQuote(connection: Connection, params: QuoteParams): Promise<Quote> {
  return getDefaultClient(connection).getQuote(params);
}

export async function swap(connection: Connection, params: MeteoraSwapParams): Promise<SwapResult> {
  return getDefaultClient(connection).swap(params);
}

export async function getPools(connection: Connection, tokenMint: PublicKey): Promise<Pool[]> {
  return getDefaultClient(connection).getPools(tokenMint);
}
