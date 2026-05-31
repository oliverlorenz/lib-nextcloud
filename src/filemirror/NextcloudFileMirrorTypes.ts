export type NextcloudMirrorEvent = {
  type: 'synced' | 'deleted';
  remotePath: string;
  localPath: string;
};

export type NextcloudFileMirrorOptions = {
  remotePath: string;
  localPath: string;
  pollIntervalMs?: number;
  onConflict?: (remotePath: string, localPath: string) => 'remote' | 'local';
  onEvent?: (event: NextcloudMirrorEvent) => void;
};
