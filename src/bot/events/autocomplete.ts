import { Events, type Interaction } from 'discord.js';
import logger from '../../utilities/logger';
import { client } from '../client';

export default {
  name: Events.InteractionCreate,

  async execute(interaction: Interaction) {
    if (!interaction.isAutocomplete()) return;

    const command = client.commands.get(interaction.commandName);
    if (!command || !command.autocomplete) return;

    const loggerWithCtx = logger.child({ command: command.data.name });
    try {
      loggerWithCtx.info('Received autocomplete interaction');
      await command.autocomplete(interaction);
      loggerWithCtx.info('Autocomplete interaction finished');
    } catch (err) {
      loggerWithCtx.error({ err }, 'Unhandled error during autocomplete interaction');
    }
  },
};
