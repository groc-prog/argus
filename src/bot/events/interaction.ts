import { Events, type Interaction } from 'discord.js';
import logger from '../../utilities/logger';
import { client } from '../client';

export default {
  name: Events.InteractionCreate,

  async execute(interaction: Interaction) {
    try {
      if (!interaction.isChatInputCommand()) return;

      const command = client.commands.get(interaction.commandName);
      if (!command) return;

      logger.info({ command: command.data.name }, 'Received chat input interaction');
      await command.execute(interaction);
      logger.info({ command: command.data.name }, 'Chat interaction finished');
    } catch (err) {
      logger.error({ err }, 'Unhandled error during chat interaction handling');
    }
  },
};
