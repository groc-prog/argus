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
    /**
     * Updates the registered broadcast jobs and creates new ones if none exist already.
     * @param {string} guildId - The ID of the guild to change to another job.
     * @param {string} newCronSchedule - The new CRON pattern
     * @param {string} [oldCronSchedule] - The old CRON pattern.
     */
    updateBroadcastJob(guildId: string, newCronSchedule: string, oldCronSchedule?: string): void;
    /**
     * Schedules a new broadcast job for the provided guilds.
     * @param {string} cronSchedule - The CRON pattern to use.
     * @param {Set<string>} guildIds - The guild ID's which should be part of the job
     */
    scheduleBroadcastJob(cronSchedule: string, guildIds: Set<string>): void;
  }
}
