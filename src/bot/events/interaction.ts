import { Events, type Interaction } from 'discord.js';
import logger from '../../utilities/logger';
import { client } from '../client';

export default {
  name: Events.InteractionCreate,

  async execute(interaction: Interaction) {
    if (!interaction.isChatInputCommand()) return;

    const command = client.commands.get(interaction.commandName);
    if (!command) return;

    const loggerWithCtx = logger.child({ command: command.data.name });
    try {
      loggerWithCtx.info('Received chat input interaction');
      await command.execute(interaction);
      loggerWithCtx.info('Chat interaction finished');
    } catch (err) {
      loggerWithCtx.error({ err }, 'Unhandled error during chat interaction');
    }
  },
};
