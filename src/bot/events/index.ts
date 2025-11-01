import autocompleteEvent from './autocomplete';
import readyEvent from './ready';
import interactionEvent from './interaction';
import guildCreateEvent from './guild-create';
import guildDeleteEvent from './guild-delete';

export default [
  autocompleteEvent,
  readyEvent,
  interactionEvent,
  guildCreateEvent,
  guildDeleteEvent,
];
