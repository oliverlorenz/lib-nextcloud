export type NextcloudMirrorEvent = {
  type: 'synced' | 'deleted' | 'uploaded';
  remotePath: string;
  localPath: string;
};

export type NextcloudFileChangeSource = 'local' | 'remote';

export type NextcloudFileChange = {
  remotePath: string;
  localPath: string;
  source: NextcloudFileChangeSource;
};

export type NextcloudFileMirrorOptions = {
  remotePath: string;
  localPath: string;
  pollIntervalMs?: number;
  onConflict?: (remotePath: string, localPath: string) => 'remote' | 'local';
  onEvent?: (event: NextcloudMirrorEvent) => void;
  onChanged?: (change: NextcloudFileChange) => void;
};
