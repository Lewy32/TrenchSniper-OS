@echo off
echo 🔥 TrenchSniper OS - Quick Start
echo =================================
echo.
echo Step 1: Install dependencies
call pnpm install
if errorlevel 1 (
    echo ❌ Install failed. Make sure Node.js is installed.
    pause
    exit /b 1
)
echo ✅ Dependencies installed
echo.
echo Step 2: Copy env template
copy /Y .env.example .env.local >nul 2>&1
echo ✅ Environment file created
echo.
echo ⚠️  EDIT .env.local with your wallet mnemonic!
echo     Right-click .env.local -^> Open with Notepad
echo.
echo     Required for devnet:
echo     - SOLANA_RPC_URL=https://api.devnet.solana.com
echo.
echo     Required for mainnet:
echo     - SOLANA_RPC_URL=https://api.mainnet-beta.solana.com
echo     - WALLET_MNEMONIC=your phrase here
echo.
set /p editnow="Open .env.local now? (y/n): "
if /i "%editnow%"=="y" notepad .env.local
echo.
echo Step 3: Get devnet SOL (FREE)
echo     Visit: https://faucet.solana.com/
echo     Paste your wallet address
echo.
echo Step 4: Build
echo     pnpm build
echo.
echo Step 5: Test
echo     pnpm sniper --dry-run
echo.
pause
