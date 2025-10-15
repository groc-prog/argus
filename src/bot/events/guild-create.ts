import { Events, Guild, PermissionFlagsBits } from 'discord.js';
import logger from '../../utilities/logger';
import { BotConfigurationModel } from '../../models/bot-configuration';

export default {
  name: Events.GuildCreate,

  async execute(guild: Guild) {
    const loggerWithCtx = logger.child({ guildId: guild.id });
    loggerWithCtx.info('Bot joined new guild, creating default bot configuration');

    try {
      const botAsMember = guild.members.me;
      if (!botAsMember) throw new Error('Bot not member of guild');

      // We clean bot configurations up if the bot get's kicked or banned from a guild, but the bot might not be
      // online to execute the event
      loggerWithCtx.debug('Checking if guild has existing bot configuration');
      const existingBotConfiguration = await BotConfigurationModel.findOne({ guildId: guild.id });
      if (existingBotConfiguration) {
        loggerWithCtx.info('Found existing bot configuration in guild, skipping');
        return;
      }

      // Try to get a system channel by default
      loggerWithCtx.debug('Checking for system channel with sufficient permissions');
      const systemChannel = await guild.systemChannel?.fetch();
      if (
        systemChannel &&
        systemChannel.permissionsFor(botAsMember).has(PermissionFlagsBits.SendMessages)
      ) {
        loggerWithCtx.debug(
          { channelId: systemChannel.id },
          'Found system channel with sufficient permissions, setting as default',
        );
        await BotConfigurationModel.createDefaultsForGuild(
          guild.id,
          systemChannel.id,
          botAsMember.id,
        );
        return;
      }

      // If there are no system channels we can access, we will just use the first channel we have
      // access to
      loggerWithCtx.debug(
        'No available system channel found, checking for other channels with sufficient permissions',
      );
      const guildChannels = await guild.channels.fetch();
      const availableChannel = guildChannels.find(BotConfigurationModel.isValidBroadcastChannel);
      if (availableChannel) {
        loggerWithCtx.debug(
          { channelId: availableChannel.id },
          'Found channel with sufficient permissions, setting as default',
        );
        await BotConfigurationModel.createDefaultsForGuild(
          guild.id,
          availableChannel.id,
          botAsMember.id,
        );
        return;
      }

      // It is the responsibility of a admin/guild owner to configure the bot from here on out
      loggerWithCtx.info('No channels with sufficient permissions found, skipping');
    } catch (err) {
      loggerWithCtx.error({ err }, 'Failed to create bot configuration for newly joined guild');
    }
  },
};
