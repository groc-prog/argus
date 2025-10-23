import type { MaybePromise } from 'bun';
import {
  type ClientEvents,
  type SlashCommandBuilder,
  type SlashCommandOptionsOnlyBuilder,
} from 'discord.js';

export interface Command {
  data: SlashCommandBuilder | SlashCommandOptionsOnlyBuilder;
  execute(interaction: ChatInputCommandInteraction): Promise<unknown>;
  autocomplete?(interaction: AutocompleteInteraction): Promise<unknown>;
}

export interface Event {
  name: keyof ClientEvents;
  once?: boolean;
  execute(...args: unknown): MaybePromise<unknown>;
}

declare module 'discord.js' {
  interface Client {
    commands: Map<string, Command>;
  }
}
