import { Client, Events } from 'discord.js';
import logger from '../../utilities/logger';
import { BotConfigurationModel } from '../../models/bot-configuration';
export default {
  name: Events.ClientReady,
  once: true,

  async execute(client: Client<true>) {
    logger.info(`Bot ${client.user.tag} ready to rumble`);

    logger.info('Scheduling broadcast jobs');
    try {
      const groups = await BotConfigurationModel.getGroupedBroadcastSchedules();

      for (const group of groups) {
        client.scheduleBroadcastJob(group.cron, group.guildIds);
      }
    } catch (err) {
      logger.error({ err }, 'Failed to schedule broadcasts');
    }
  },
};
