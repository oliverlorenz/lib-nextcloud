export enum NextcloudPollType {
  TEXT = "textPoll",
  DATE = "datePoll",
}

export enum NextcloudPollAccess {
  OPEN = "open",
  PRIVATE = "private",
}

export enum NextcloudPollShowResults {
  ALWAYS = "always",
  CLOSED = "closed",
  NEVER = "never",
}

export type NextcloudPollConfiguration = {
  allowComment?: boolean;
  allowMaybe?: boolean;
  anonymous?: boolean;
  expire?: number;
  access: NextcloudPollAccess;
  showResults: NextcloudPollShowResults;
  maxVotesPerOption?: number;
  maxVotesPerUser?: number;
  useNo?: boolean;
};
