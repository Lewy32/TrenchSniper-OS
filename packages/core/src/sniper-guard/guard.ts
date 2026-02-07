// SNIPER GUARD LAUNCH PROTECTION
// Monitor external SOL buys during token launch

export type GuardAction = 'STOP_BUYING' | 'EMERGENCY_EXIT';

export interface GuardConfig {
  maxExternalSol: number;        // SOL threshold for triggering
  action: GuardAction;           // Response to external buys
  monitorDurationMs: number;     // How long to monitor post-launch
  cooldownMs: number;            // Time between actions
}

export interface LaunchPlan {
  tokenAddress: string;
  sniperWallets: string[];       // Our sniper wallet addresses
  devWallet: string;             // Dev wallet
  funderWallet: string;          // Launch funder
  mevWallets?: string[];        // Known MEV bot wallets
}

export interface BuyEvent {
  wallet: string;
  solAmount: number;
  tokenAmount: number;
  timestamp: number;
  txSignature: string;
}

export interface ExternalBuyAlert {
  wallet: string;
  solAmount: number;
  cumulativeExternalSol: number;
  threshold: number;
  percentageOfThreshold: number;
  timestamp: number;
  isWhitelisted: boolean;
}

export interface GuardState {
  tokenAddress: string;
  isActive: boolean;
  externalSolTotal: number;
  whitelist: Set<string>;
  alerts: ExternalBuyAlert[];
  lastActionTime: number;
  actionTriggered: boolean;
}

const DEFAULT_CONFIG: GuardConfig = {
  maxExternalSol: 50,           // 50 SOL default threshold
  action: 'STOP_BUYING',
  monitorDurationMs: 300000,     // 5 minutes
  cooldownMs: 30000,             // 30 second cooldown
};

// Active guards registry
const activeGuards = new Map<string, GuardState>();

/**
 * Initialize sniper guard for token launch
 */
export function initGuard(
  launchPlan: LaunchPlan,
  config: Partial<GuardConfig> = {}
): GuardState {
  const cfg = { ...DEFAULT_CONFIG, ...config };
  
  // Build whitelist from launch plan
  const whitelist = new Set<string>([
    launchPlan.devWallet.toLowerCase(),
    launchPlan.funderWallet.toLowerCase(),
    ...launchPlan.sniperWallets.map((w) => w.toLowerCase()),
    ...(launchPlan.mevWallets || []).map((w) => w.toLowerCase()),
  ]);

  const state: GuardState = {
    tokenAddress: launchPlan.tokenAddress,
    isActive: true,
    externalSolTotal: 0,
    whitelist,
    alerts: [],
    lastActionTime: 0,
    actionTriggered: false,
  };

  activeGuards.set(launchPlan.tokenAddress, state);

  // Auto-stop monitoring after duration
  setTimeout(() => {
    stopGuard(launchPlan.tokenAddress);
  }, cfg.monitorDurationMs);

  return state;
}

/**
 * Process incoming buy event
 * Returns action if threshold triggered
 */
export function processBuyEvent(
  tokenAddress: string,
  event: BuyEvent,
  config: Partial<GuardConfig> = {}
): GuardAction | null {
  const cfg = { ...DEFAULT_CONFIG, ...config };
  const state = activeGuards.get(tokenAddress);

  if (!state || !state.isActive) return null;
  if (state.actionTriggered) return null;

  const normalizedWallet = event.wallet.toLowerCase();
  const isWhitelisted = state.whitelist.has(normalizedWallet);

  // Skip whitelisted wallets
  if (isWhitelisted) return null;

  // Add to external SOL total
  state.externalSolTotal += event.solAmount;

  // Create alert
  const alert: ExternalBuyAlert = {
    wallet: event.wallet,
    solAmount: event.solAmount,
    cumulativeExternalSol: state.externalSolTotal,
    threshold: cfg.maxExternalSol,
    percentageOfThreshold: (state.externalSolTotal / cfg.maxExternalSol) * 100,
    timestamp: Date.now(),
    isWhitelisted: false,
  };

  state.alerts.push(alert);

  // Check cooldown
  const now = Date.now();
  if (now - state.lastActionTime < cfg.cooldownMs) {
    return null;
  }

  // Check threshold
  if (state.externalSolTotal >= cfg.maxExternalSol) {
    state.actionTriggered = true;
    state.lastActionTime = now;
    
    // Emit event for listeners
    onThresholdBreached(tokenAddress, alert, cfg.action);
    
    return cfg.action;
  }

  return null;
}

/**
 * Get current guard status
 */
export function getGuardStatus(tokenAddress: string): GuardState | null {
  return activeGuards.get(tokenAddress) || null;
}

/**
 * Stop monitoring a token
 */
export function stopGuard(tokenAddress: string): void {
  const state = activeGuards.get(tokenAddress);
  if (state) {
    state.isActive = false;
    activeGuards.delete(tokenAddress);
    onGuardStopped(tokenAddress, state);
  }
}

/**
 * Check if wallet is whitelisted
 */
export function isWhitelisted(tokenAddress: string, wallet: string): boolean {
  const state = activeGuards.get(tokenAddress);
  if (!state) return false;
  return state.whitelist.has(wallet.toLowerCase());
}

/**
 * Add wallet to whitelist (emergency)
 */
export function addToWhitelist(tokenAddress: string, wallet: string): boolean {
  const state = activeGuards.get(tokenAddress);
  if (!state) return false;
  state.whitelist.add(wallet.toLowerCase());
  return true;
}

/**
 * Manual threshold check
 */
export function checkThreshold(
  tokenAddress: string,
  config: Partial<GuardConfig> = {}
): { breached: boolean; externalSol: number; threshold: number } {
  const cfg = { ...DEFAULT_CONFIG, ...config };
  const state = activeGuards.get(tokenAddress);
  
  if (!state) {
    return { breached: false, externalSol: 0, threshold: cfg.maxExternalSol };
  }

  return {
    breached: state.externalSolTotal >= cfg.maxExternalSol,
    externalSol: state.externalSolTotal,
    threshold: cfg.maxExternalSol,
  };
}

// Event handlers - can be overridden
let thresholdCallback: ((token: string, alert: ExternalBuyAlert, action: GuardAction) => void) | null = null;
let stopCallback: ((token: string, state: GuardState) => void) | null = null;

export function onThresholdBreached(
  cb: (token: string, alert: ExternalBuyAlert, action: GuardAction) => void
): void {
  thresholdCallback = cb;
}

export function onGuardStopped(
  cb: (token: string, state: GuardState) => void
): void {
  stopCallback = cb;
}

function onThresholdBreached(token: string, alert: ExternalBuyAlert, action: GuardAction): void {
  if (thresholdCallback) {
    thresholdCallback(token, alert, action);
  }
}

function onGuardStopped(token: string, state: GuardState): void {
  if (stopCallback) {
    stopCallback(token, state);
  }
}

/**
 * Format alert for Telegram
 */
export function formatAlert(alert: ExternalBuyAlert, action: GuardAction): string {
  const lines = [
    '🛡️ *SNIPER GUARD ALERT*',
    '',
    `💰 External Buy: ${alert.solAmount.toFixed(2)} SOL`,
    `👤 Wallet: \`${alert.wallet.slice(0, 6)}...${alert.wallet.slice(-4)}\``,
    '',
    `📊 Cumulative External: ${alert.cumulativeExternalSol.toFixed(2)} SOL`,
    `⚠️ Threshold: ${alert.threshold} SOL (${alert.percentageOfThreshold.toFixed(1)}%)`,
    '',
    `🔴 ACTION: *${action}*`,
    `🕐 ${new Date(alert.timestamp).toISOString()}`,
  ];
  return lines.join('\n');
}

/**
 * Get guard stats
 */
export function getGuardStats(tokenAddress: string): {
  totalAlerts: number;
  largestBuy: number;
  avgBuySize: number;
  uniqueWallets: number;
} | null {
  const state = activeGuards.get(tokenAddress);
  if (!state || state.alerts.length === 0) {
    return null;
  }

  const buys = state.alerts;
  const wallets = new Set(buys.map((a) => a.wallet.toLowerCase()));
  const largestBuy = Math.max(...buys.map((a) => a.solAmount));
  const avgBuySize = buys.reduce((sum, a) => sum + a.solAmount, 0) / buys.length;

  return {
    totalAlerts: buys.length,
    largestBuy,
    avgBuySize,
    uniqueWallets: wallets.size,
  };
}

/**
 * List all active guards
 */
export function listActiveGuards(): string[] {
  return Array.from(activeGuards.keys());
}
