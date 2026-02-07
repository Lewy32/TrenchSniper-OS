# TrenchSniper OS Roadmap

Features mapped against Proxima.tools capabilities.

## ✅ IMPLEMENTED (v0.1.0)

| Feature | Status | Notes |
|---------|--------|-------|
| Token Launch on PumpFun | ✅ | IPFS metadata, bonding curve |
| PumpFun Trading | ✅ | Buy/sell with slippage |
| Raydium AMM Trading | ✅ | Pool discovery + swaps |
| Meteora DLMM | ✅ | Concentrated liquidity |
| Smart Router | ✅ | Auto-routing, migration detection |
| Multi-Wallet | ✅ | HD generation, encryption |
| Jito Bundles | ✅ | MEV protection |
| Telegram Bot | ✅ | Alerts, control, portfolio |
| Auto-Sniper | ✅ | Mempool monitoring, rules |
| Web UI Dashboard | ✅ | Vite + React, dark mode |
| Strategy Configs | ✅ | Aggressive/Balanced/Conservative |

---

## 🚧 IN PROGRESS / PLANNED

### 🔥 HIGH PRIORITY

| Feature | Proxima Equivalent | Notes |
|---------|-------------------|-------|
| **Auto-Sell** | Auto-Sell on Launch | Automated take-profit/stop-loss execution |
| **Shield/Honeypot Detection** | 🟧 Shield | Rug pull protection, honeypot detection |
| **P&L Cards** | P&L Cards | Detailed profit/loss tracking & visualization |
| **Sell ALL** | Sell ALL | One-click exit all positions |
| **Creator Fee Claiming** | Claim Creator Fees | Collect bonding curve fees |
| **Liquidity Lock** | Lock Supply (via Streamflow) | Lock LP tokens |

### 🟡 MEDIUM PRIORITY

| Feature | Proxima Equivalent | Notes |
|---------|-------------------|-------|
| **Burn Supply** | 🟪 Burn Supply | Token burning functionality |
| **Buyback** | 🟪 Buyback | Auto-buyback with treasury funds |
| **DexScreener Update** | Update DexScreener | Refresh DexScreener metadata |
| **Wallet Activity Generator** | Generate Activity | Create fake tx history for stealth |
| **Sniper Guard** | 🟦 Sniper Guard | Anti-bot protection on launches |

### 🟢 LOW PRIORITY / NICE-TO-HAVE

| Feature | Proxima Equivalent | Notes |
|---------|-------------------|-------|
| **Referral System** | 🟩 Referral | Affiliate/referral tracking |
| **Platform Fees** | ⬜️ Platform Fees | Fee management for operators |
| **Archived Launches** | ⬜️ Archived / Deleted | Archive management |
| **Account Statistics** | 🟩 Account Statistics | User analytics dashboard |

---

## 📊 Feature Coverage

```
Core Trading:      ████████████████████ 100%
Token Launch:      ███████████████████░ 90%  (missing: Sniper Guard)
Wallet Mgmt:       █████████████████░░░ 80%  (missing: Activity gen)
Auto-Trading:      ███████████████░░░░░ 75%  (missing: Auto-sell)
Safety Features:   ████████░░░░░░░░░░░░ 40%  (missing: Shield, locks)
Revenue Features:  ██████░░░░░░░░░░░░░░ 30%  (missing: Fee claim, buyback)
```

---

## 🎯 v0.2.0 Target

1. **Auto-Sell engine** - Stop loss / take profit automation
2. **Shield module** - Honeypot + rug detection
3. **P&L tracking** - Realized + unrealized gains
4. **Creator fee claim** - Bonding curve revenue
5. **Sniper Guard** - Anti-front-running protection

**Estimated:** 2-3 days with focused work

---

## 🤝 Contributing

These features need depth from Proxima users!

If you know how these features work in detail:
- Open an issue with feature specs
- Reference existing implementations
- Share edge cases & requirements

---

*Last updated: 2026-02-07*