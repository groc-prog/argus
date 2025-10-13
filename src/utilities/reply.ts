import { Locale, type Interaction, type InteractionReplyOptions } from 'discord.js';
import Mustache from 'mustache';

type I18nMessages = Readonly<{ [Locale.EnglishUS]: string } & { [K in Locale]?: string }>;

interface ReplyContext {
  interaction?: Omit<InteractionReplyOptions, 'content'>;
  template?: unknown;
}

/**
 * Removes the leading and trailing whitespace from template strings. Designed to be
 * used for bot replies.
 * @param {TemplateStringsArray} strings - The separate lines in the template string.
 * @param {unknown[]} values - The values used in the template string.
 * @returns {string} The de-dented template string.
 */
export const message = (strings: TemplateStringsArray, ...values: unknown[]): string =>
  strings
    // eslint-disable-next-line @typescript-eslint/restrict-template-expressions, @typescript-eslint/no-base-to-string
    .reduce((prev, curr, index) => `${prev}${values[index - 1] || ''}${curr}`, '')
    .split('\n')
    .map((line) => line.trim())
    .join('\n');

/**
 * Generates a response message from a given mustache.js template. Optionally, context for both
 * the template and the reply can be defined.
 * @param {Interaction} interaction - The current interaction. Must be a interaction which
 * provides the `reply` method.
 * @param {I18nMessages} replies - A object containing all translated replies.
 * @param {ReplyContext} ctx - Optional context for both template and reply.
 * @throws {Error} If the interaction does not provide a `reply` method.
 */
export async function replyFromTemplate(
  interaction: Interaction,
  replies: I18nMessages,
  ctx: ReplyContext = {},
): Promise<void> {
  if (!('reply' in interaction))
    throw new Error('`interaction` parameter does not have a `reply` method');

  ctx.template ??= {};
  ctx.interaction ??= {};

  const template = replies[Locale.EnglishUS];
  const message = Mustache.render(template, ctx.template);

  await interaction.reply({
    content: message,
    ...ctx.interaction,
  });
}
