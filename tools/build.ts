import type { BuildConfig, BuildOutput } from 'bun';
import { readdir } from 'node:fs/promises';
import path from 'node:path';

const DIST_DIR = 'dist';
const DYNAMIC_IMPORT_ENTRYPOINT_DIR = path.join(import.meta.dirname, '..', 'src', 'bot');
const DYNAMIC_IMPORT_DIST_DIR = path.join(import.meta.dirname, '..', DIST_DIR);

const BUILD_ARGS: Partial<BuildConfig> = {
  target: 'bun',
  minify: true,
};

async function buildDiscordEventFiles(): Promise<void> {
  const files = await readdir(path.join(DYNAMIC_IMPORT_ENTRYPOINT_DIR, 'events'), {
    withFileTypes: true,
  });
  const filesToBundle = files.filter((file) => file.isFile() && file.name.endsWith('.ts'));

  await Bun.build({
    ...BUILD_ARGS,
    entrypoints: filesToBundle.map((file) =>
      path.join(DYNAMIC_IMPORT_ENTRYPOINT_DIR, 'events', file.name),
    ),
    outdir: path.join(DYNAMIC_IMPORT_DIST_DIR, 'events'),
  });
}

async function buildDiscordCommandFiles(): Promise<void> {
  const commandFoldersPath = path.join(DYNAMIC_IMPORT_ENTRYPOINT_DIR, 'commands');
  const commandFolders = await readdir(commandFoldersPath, {
    withFileTypes: true,
  });

  const builds: Promise<BuildOutput>[] = [];
  for (const folder of commandFolders) {
    if (!folder.isDirectory()) continue;

    const files = await readdir(path.join(commandFoldersPath, folder.name), {
      withFileTypes: true,
    });
    const filesToBundle = files.filter((file) => file.isFile() && file.name.endsWith('.ts'));

    builds.push(
      Bun.build({
        ...BUILD_ARGS,
        entrypoints: filesToBundle.map((file) =>
          path.join(DYNAMIC_IMPORT_ENTRYPOINT_DIR, 'commands', folder.name, file.name),
        ),
        outdir: path.join(DYNAMIC_IMPORT_DIST_DIR, 'commands', folder.name),
      }),
    );
  }

  await Promise.all(builds);
}

async function build(): Promise<void> {
  await Bun.build({
    ...BUILD_ARGS,
    entrypoints: ['src/index.ts'],
    outdir: DIST_DIR,
    external: ['src/bot/commands', 'src/bot/events'],
  });

  await buildDiscordEventFiles();
  await buildDiscordCommandFiles();
}

build().catch((err: unknown) => {
  console.error(err);
  process.exit(1);
});
