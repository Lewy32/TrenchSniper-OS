// SELL ALL MODULE - Emergency exit all positions
// One-click sell across all wallets with progress tracking

export interface SellAllConfig {
  excludedWallets: string[];      // Dev wallet protection
  slippageBps: number;            // Default: 100 = 1%
  priorityFee: number;            // SOL priority fee
  maxRetries: number;             // Per-wallet retry attempts
  partialSellThreshold: number;   // Min % to consider partial success
}

export interface Position {
  wallet: string;
  tokenAddress: string;
  tokenSymbol: string;
  balance: number;
  estimatedSolValue: number;
}

export interface SellResult {
  wallet: string;
  success: boolean;
  txSignature?: string;
  solReceived: number;
  error?: string;
  partialSell?: boolean;
  percentageSold?: number;
}

export interface SellAllSummary {
  totalPositions: number;
  soldCount: number;
  failedCount: number;
  partialCount: number;
  totalSolReceived: number;
  results: SellResult[];
  failures: SellResult[];
  durationMs: number;
}

const DEFAULT_CONFIG: SellAllConfig = {
  excludedWallets: [],
  slippageBps: 100,
  priorityFee: 0.001,
  maxRetries: 3,
  partialSellThreshold: 90,
};

/**
 * Execute sell-all across all wallets
 * Excludes protected wallets (dev, treasury)
 */
export async function sellAll(
  positions: Position[],
  config: Partial<SellAllConfig> = {}
): Promise<SellAllSummary> {
  const cfg = { ...DEFAULT_CONFIG, ...config };
  const startTime = Date.now();

  // Filter out excluded wallets
  const targetPositions = positions.filter(
    (p) => !cfg.excludedWallets.includes(p.wallet)
  );

  const results: SellResult[] = [];
  const failures: SellResult[] = [];

  // Process sells sequentially with progress tracking
  for (let i = 0; i < targetPositions.length; i++) {
    const pos = targetPositions[i];
    
    const result = await executeSell(pos, cfg);
    results.push(result);

    if (!result.success) {
      failures.push(result);
    }

    // Progress callback hook
    onProgress(i + 1, targetPositions.length, result);
  }

  const soldCount = results.filter((r) => r.success && !r.partialSell).length;
  const partialCount = results.filter((r) => r.partialSell).length;
  const failedCount = failures.length;

  return {
    totalPositions: targetPositions.length,
    soldCount,
    failedCount,
    partialCount,
    totalSolReceived: results.reduce((sum, r) => sum + r.solReceived, 0),
    results,
    failures,
    durationMs: Date.now() - startTime,
  };
}

/**
 * Execute single sell with retry logic
 */
async function executeSell(
  position: Position,
  config: SellAllConfig
): Promise<SellResult> {
  const baseResult: SellResult = {
    wallet: position.wallet,
    success: false,
    solReceived: 0,
  };

  for (let attempt = 1; attempt <= config.maxRetries; attempt++) {
    try {
      // Execute swap (mocked - replace with actual DEX call)
      const txResult = await executeDexSwap({
        wallet: position.wallet,
        tokenIn: position.tokenAddress,
        tokenOut: 'SOL',
        amount: position.balance,
        slippageBps: config.slippageBps,
        priorityFee: config.priorityFee,
      });

      if (txResult.success) {
        return {
          ...baseResult,
          success: true,
          txSignature: txResult.signature,
          solReceived: txResult.outputAmount,
        };
      }

      // Partial sell check
      if (txResult.partialFill && txResult.percentageSold) {
        const isPartialSuccess = txResult.percentageSold >= config.partialSellThreshold;
        return {
          ...baseResult,
          success: isPartialSuccess,
          partialSell: true,
          percentageSold: txResult.percentageSold,
          solReceived: txResult.outputAmount,
          txSignature: txResult.signature,
        };
      }

      if (attempt === config.maxRetries) {
        return { ...baseResult, error: txResult.error || 'Swap failed' };
      }
    } catch (err) {
      if (attempt === config.maxRetries) {
        return { 
          ...baseResult, 
          error: err instanceof Error ? err.message : 'Unknown error' 
        };
      }
    }

    // Exponential backoff between retries
    await sleep(1000 * attempt);
  }

  return baseResult;
}

/**
 * Progress hook - override for custom progress handling
 */
let progressCallback: ((current: number, total: number, result: SellResult) => void) | null = null;

export function setProgressCallback(
  cb: (current: number, total: number, result: SellResult) => void
): void {
  progressCallback = cb;
}

function onProgress(current: number, total: number, result: SellResult): void {
  if (progressCallback) {
    progressCallback(current, total, result);
  }
}

// Mock DEX swap interface
interface DexSwapResult {
  success: boolean;
  signature?: string;
  outputAmount: number;
  partialFill?: boolean;
  percentageSold?: number;
  error?: string;
}

async function executeDexSwap(params: {
  wallet: string;
  tokenIn: string;
  tokenOut: string;
  amount: number;
  slippageBps: number;
  priorityFee: number;
}): Promise<DexSwapResult> {
  // Placeholder - integrate with Jupiter/Raydium/etc
  // Return mock success for now
  return {
    success: true,
    signature: `tx_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
    outputAmount: params.amount * 0.95, // Simulate 5% price impact
  };
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Emergency exit - sell everything NOW
 * Higher priority fees, no retries on success
 */
export async function emergencyExit(
  positions: Position[],
  priorityFee: number = 0.01
): Promise<SellAllSummary> {
  return sellAll(positions, {
    priorityFee,
    slippageBps: 200, // 2% slippage for speed
    maxRetries: 1,     // Fast fail
  });
}

/**
 * Format summary for Telegram display
 */
export function formatSellAllSummary(summary: SellAllSummary): string {
  const lines = [
    '🚨 *SELL ALL COMPLETE*',
    '',
    `📊 Positions: ${summary.totalPositions}`,
    `✅ Sold: ${summary.soldCount}`,
    `⚠️ Partial: ${summary.partialCount}`,
    `❌ Failed: ${summary.failedCount}`,
    '',
    `💰 Total SOL: ${summary.totalSolReceived.toFixed(4)}`,
    `⏱ Duration: ${(summary.durationMs / 1000).toFixed(1)}s`,
  ];

  if (summary.failures.length > 0) {
    lines.push('', '*Failures:*');
    summary.failures.slice(0, 5).forEach((f) => {
      lines.push(`\`${f.wallet.slice(0, 6)}...\`: ${f.error || 'Unknown'}`);
    });
  }

  return lines.join('\n');
}
