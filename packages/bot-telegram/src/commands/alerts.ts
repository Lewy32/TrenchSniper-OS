/**
 * /alerts command - Manage price and event alerts
 */
import { Context, Markup } from 'telegraf';

export type AlertType = 
  | 'price_movement' 
  | 'migration_detected' 
  | 'new_token' 
  | 'tx_confirmed' 
  | 'stop_loss' 
  | 'take_profit';

interface AlertSettings {
  userId: number;
  enabled: AlertType[];
  priceThreshold: number; // % change to alert
}

const alertLabels: Record<AlertType, string> = {
  price_movement: '📈 Price Movement',
  migration_detected: '🚀 Migration Alert',
  new_token: '🔥 New Token',
  tx_confirmed: '✅ Transaction Confirmed',
  stop_loss: '🛑 Stop Loss',
  take_profit: '💰 Take Profit',
};

export function registerAlertsCommand(bot: any) {
  const userSettings: Map<number, AlertSettings> = new Map();

  // Initialize default settings
  function getSettings(userId: number): AlertSettings {
    if (!userSettings.has(userId)) {
      userSettings.set(userId, {
        userId,
        enabled: ['price_movement', 'migration_detected', 'new_token'],
        priceThreshold: 10,
      });
    }
    return userSettings.get(userId)!;
  }

  bot.command('alerts', async (ctx: Context) => {
    const userId = ctx.from?.id;
    if (!userId) return;

    const settings = getSettings(userId);
    const enabledCount = settings.enabled.length;

    const message = `🔔 <b>Alert Settings</b>

<b>Active Alerts:</b> ${enabledCount}/6
<b>Price Threshold:</b> ${settings.priceThreshold}%

<b>Toggle Alerts:</b>
Click buttons below to enable/disable`;

    const buttons = Object.entries(alertLabels).map(([type, label]) => {
      const isEnabled = settings.enabled.includes(type as AlertType);
      const emoji = isEnabled ? '✅' : '❌';
      return Markup.button.callback(`${emoji} ${label}`, `alert:${type}`);
    });

    await ctx.reply(message, {
      parse_mode: 'HTML',
      ...Markup.inlineKeyboard(buttons, { columns: 1 }),
    });
  });

  // Handle alert toggle callbacks
  bot.action(/alert:(.+)/, async (ctx: Context) => {
    const match = (ctx as any).match;
    if (!match) return;

    const alertType = match[1] as AlertType;
    const userId = ctx.from?.id;
    if (!userId) return;

    const settings = getSettings(userId);
    const index = settings.enabled.indexOf(alertType);

    if (index > -1) {
      settings.enabled.splice(index, 1);
    } else {
      settings.enabled.push(alertType);
    }

    const isEnabled = index === -1; // Was just enabled
    const status = isEnabled ? 'enabled' : 'disabled';

    await ctx.answerCbQuery(`${alertLabels[alertType]} ${status}`);

    // Refresh the message
    const updatedMessage = `🔔 <b>Alert Settings</b>

<b>Active Alerts:</b> ${settings.enabled.length}/6
<b>Price Threshold:</b> ${settings.priceThreshold}%

<b>Toggle Alerts:</b>
Click buttons below to enable/disable`;

    const buttons = Object.entries(alertLabels).map(([type, label]) => {
      const enabled = settings.enabled.includes(type as AlertType);
      const emoji = enabled ? '✅' : '❌';
      return Markup.button.callback(`${emoji} ${label}`, `alert:${type}`);
    });

    await ctx.editMessageText(updatedMessage, {
      parse_mode: 'HTML',
      ...Markup.inlineKeyboard(buttons, { columns: 1 }),
    });
  });

  bot.command('threshold', async (ctx: Context) => {
    const text = (ctx.message as any)?.text || '';
    const args = text.split(' ').slice(1);
    const userId = ctx.from?.id;
    if (!userId) return;

    if (args.length === 0) {
      const settings = getSettings(userId);
      await ctx.reply(
        `Current price alert threshold: ${settings.priceThreshold}%\n\n` +
        `Use /threshold <percent> to change\n` +
        `Example: /threshold 5`
      );
      return;
    }

    const threshold = parseInt(args[0]);
    if (isNaN(threshold) || threshold < 1 || threshold > 100) {
      await ctx.reply('❌ Invalid threshold. Use 1-100%');
      return;
    }

    const settings = getSettings(userId);
    settings.priceThreshold = threshold;
    await ctx.reply(`✅ Price alert threshold set to ${threshold}%`);
  });

  bot.command('testalert', async (ctx: Context) => {
    const message = `🔔 <b>Test Alert</b>

This is how your alerts will look:

📈 <b>Price Alert</b>

🪙 Token: <code>Gg5...</code>
🏷️ Symbol: $TEST
💵 Amount: 1.5 SOL
📊 Price Change: +15.5%
🔗 TX: <a href="https://solscan.io/tx/xxx">View on Solscan</a>

⏰ ${new Date().toLocaleString()}`;

    await ctx.reply(message, { parse_mode: 'HTML' });
  });
}
