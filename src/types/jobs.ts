export interface JobContext {
  type: JobType;
}

export interface BroadcastJobContext extends JobContext {
  guildIds: Set<string>;
  updatedGuildIds?: Set<string>;
}

export enum JobType {
  Broadcast,
  Dm,
}
