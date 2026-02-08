/**
 * Withdraw Module - SOL extraction from wallets
 */
import {
  Connection,
  PublicKey,
  Transaction,
  SystemProgram,
  sendAndConfirmTransaction,
  LAMPORTS_PER_SOL,
} from '@solana/web3.js';

export interface WithdrawConfig {
  fromWallet: string; // Source wallet
  toAddress: string; // Destination
  amount?: number; // SOL amount (undefined = all)
  keepRent?: number; // SOL to keep for rent (default 0.00203928)
}

export interface BatchWithdrawConfig {
  wallets: string[]; // Source wallets
  toAddress: string; // Single destination
  keepRent?: number; // SOL to keep per wallet
}

export interface WithdrawResult {
  success: boolean;
  txSignature?: string;
  from: string;
  to: string;
  amount: number;
  fee: number;
  balanceBefore: number;
  balanceAfter: number;
  error?: string;
}

export interface BatchWithdrawResult {
  total: number;
  successful: number;
  failed: number;
  results: WithdrawResult[];
  totalWithdrawn: number;
  totalFees: number;
}

/**
 * Get wallet balance
 */
export async function getBalance(
  connection: Connection,
  walletAddress: string
): Promise<number> {
  try {
    const balance = await connection.getBalance(new PublicKey(walletAddress));
    return balance / LAMPORTS_PER_SOL;
  } catch {
    return 0;
  }
}

/**
 * Calculate max withdraw amount
 * Leaves rent exemption balance
 */
export async function calculateMaxWithdraw(
  connection: Connection,
  walletAddress: string,
  keepRent: number = 0.00203928
): Promise<number> {
  const balance = await getBalance(connection, walletAddress);
  const rent = Math.max(keepRent, 0.00203928); // Min rent exemption
  return Math.max(0, balance - rent - 0.00001); // Leave tiny buffer for fee
}

/**
 * Withdraw SOL from wallet
 */
export async function withdrawSol(
  connection: Connection,
  config: WithdrawConfig,
  signer: any
): Promise<WithdrawResult> {
  try {
    const from = new PublicKey(config.fromWallet);
    const to = new PublicKey(config.toAddress);

    // Get balance before
    const balanceBefore = await getBalance(connection, config.fromWallet);

    // Calculate amount
    let amountSols: number;
    if (config.amount === undefined) {
      // Withdraw all (minus rent)
      amountSols = await calculateMaxWithdraw(
        connection,
        config.fromWallet,
        config.keepRent
      );
    } else {
      amountSols = config.amount;
    }

    if (amountSols <= 0) {
      return {
        success: false,
        from: config.fromWallet,
        to: config.toAddress,
        amount: 0,
        fee: 0,
        balanceBefore,
        balanceAfter: balanceBefore,
        error: 'Insufficient balance',
      };
    }

    const amountLamports = BigInt(Math.floor(amountSols * LAMPORTS_PER_SOL));

    // Create transfer
    const tx = new Transaction().add(
      SystemProgram.transfer({
        fromPubkey: from,
        toPubkey: to,
        lamports: amountLamports,
      })
    );

    // Send
    const signature = await sendAndConfirmTransaction(connection, tx, [signer], {
      commitment: 'confirmed',
    });

    // Get balance after
    const balanceAfter = await getBalance(connection, config.fromWallet);
    const fee = amountSols - (balanceBefore - balanceAfter);

    return {
      success: true,
      txSignature: signature,
      from: config.fromWallet,
      to: config.toAddress,
      amount: amountSols,
      fee,
      balanceBefore,
      balanceAfter,
    };
  } catch (error: any) {
    const balanceBefore = await getBalance(connection, config.fromWallet);
    return {
      success: false,
      from: config.fromWallet,
      to: config.toAddress,
      amount: config.amount || 0,
      fee: 0,
      balanceBefore,
      balanceAfter: balanceBefore,
      error: error.message || 'Withdraw failed',
    };
  }
}

/**
 * Batch withdraw from multiple wallets
 */
export async function batchWithdrawSol(
  connection: Connection,
  config: BatchWithdrawConfig,
  signers: any[]
): Promise<BatchWithdrawResult> {
  const results: WithdrawResult[] = [];
  let totalWithdrawn = 0;
  let totalFees = 0;

  for (let i = 0; i < config.wallets.length; i++) {
    const result = await withdrawSol(connection, {
      fromWallet: config.wallets[i],
      toAddress: config.toAddress,
      keepRent: config.keepRent,
    }, signers[i]);

    results.push(result);

    if (result.success) {
      totalWithdrawn += result.amount;
      totalFees += result.fee;
    }
  }

  const successful = results.filter(r => r.success).length;

  return {
    total: config.wallets.length,
    successful,
    failed: config.wallets.length - successful,
    results,
    totalWithdrawn,
    totalFees,
  };
}

/**
 * Format withdraw result
 */
export function formatWithdrawResult(result: WithdrawResult): string {
  if (result.success) {
    return `✅ Withdraw Successful\n` +
      `Amount: ${result.amount.toFixed(6)} SOL\n` +
      `From: ${result.from.slice(0, 6)}...${result.from.slice(-4)}\n` +
      `To: ${result.to.slice(0, 6)}...${result.to.slice(-4)}\n` +
      `Fee: ${result.fee.toFixed(9)} SOL\n` +
      `Balance: ${result.balanceBefore.toFixed(4)} → ${result.balanceAfter.toFixed(4)} SOL\n` +
      `TX: ${result.txSignature?.slice(0, 16)}...`;
  }
  return `❌ Withdraw Failed\n` +
    `Error: ${result.error}\n` +
    `Balance: ${result.balanceBefore.toFixed(4)} SOL`;
}

/**
 * Format batch summary
 */
export function formatBatchWithdrawSummary(result: BatchWithdrawResult): string {
  const rate = (result.successful / result.total * 100).toFixed(1);
  return `💸 Batch Withdraw Summary\n` +
    `Total: ${result.total} wallets\n` +
    `✅ Success: ${result.successful} (${rate}%)\n` +
    `❌ Failed: ${result.failed}\n` +
    `💰 Total: ${result.totalWithdrawn.toFixed(4)} SOL\n` +
    `💸 Fees: ${result.totalFees.toFixed(6)} SOL`;
}
