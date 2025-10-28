import { Events, Guild } from 'discord.js';
import logger from '../../utilities/logger';
import { BotConfigurationModel } from '../../models/bot-configuration';

export default {
  name: Events.GuildDelete,

  async execute(guild: Guild) {
    const loggerWithCtx = logger.child({ guildId: guild.id });
    loggerWithCtx.info('Bot removed from guild, cleaning up bot configuration');

    try {
      loggerWithCtx.debug('Checking if guild has existing bot configuration');
      const existingBotConfiguration = await BotConfigurationModel.deleteOne({ guildId: guild.id });
      if (existingBotConfiguration.deletedCount === 0)
        loggerWithCtx.info('No existing bot configuration found, skipping');
      else loggerWithCtx.info('Bot configuration removed successfully');
    } catch (err) {
      loggerWithCtx.error({ err }, 'Failed to remove bot configuration');
    }
  },
};
