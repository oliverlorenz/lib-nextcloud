import { mkdir, stat, unlink, writeFile as writeFileToFs } from 'fs/promises';
import { dirname, join } from 'path';
import { NextcloudHeaderService } from '../shared/NextcloudHeaderService';
import { NextcloudFileService, type DirectoryEntry } from '../files';
import type { NextcloudFileMirrorOptions } from './NextcloudFileMirrorTypes';

const DEFAULT_POLL_INTERVAL_MS = 30_000;
const INITIAL_RECONNECT_DELAY_MS = 1_000;
const MAX_RECONNECT_DELAY_MS = 60_000;

export class NextcloudFileMirrorService {
  public static create(
    ncBasePath: string,
    ncUsername: string,
    ncAppPassword: string,
  ): NextcloudFileMirrorService {
    return new NextcloudFileMirrorService(
      ncBasePath,
      ncUsername,
      ncAppPassword,
      new NextcloudHeaderService(),
      NextcloudFileService.create(ncBasePath, ncUsername, ncAppPassword),
    );
  }

  constructor(
    private readonly ncBasePath: string,
    private readonly ncUsername: string,
    private readonly ncAppPassword: string,
    private readonly headerService: NextcloudHeaderService,
    private readonly fileService: NextcloudFileService,
    private readonly wsFactory: (url: string) => WebSocket = (url) => new WebSocket(url),
  ) {}

  private ws: WebSocket | undefined;
  private pollTimer: ReturnType<typeof setInterval> | undefined;
  private readonly etagMap = new Map<string, string>();
  private options: NextcloudFileMirrorOptions | undefined;
  private reconnectDelay = INITIAL_RECONNECT_DELAY_MS;
  private stopped = false;
  private syncing = false;

  public async start(options: NextcloudFileMirrorOptions): Promise<void> {
    this.options = options;
    this.stopped = false;
    await this.performSync();
    await this.connectNotifyPush();
  }

  public stop(): void {
    this.stopped = true;
    this.ws?.close();
    this.ws = undefined;
    if (this.pollTimer !== undefined) {
      clearInterval(this.pollTimer);
      this.pollTimer = undefined;
    }
  }

  public async writeFile(localFilePath: string, contents: string | Buffer): Promise<void> {
    if (this.options === undefined) throw new Error('Service not started');
    const { localPath, remotePath } = this.options;
    const remoteFilePath = this.localToRemotePath(localPath, localFilePath, remotePath);
    const buffer = typeof contents === 'string' ? Buffer.from(contents) : contents;
    await mkdir(dirname(localFilePath), { recursive: true });
    await writeFileToFs(localFilePath, buffer);
    await this.fileService.upload(remoteFilePath, buffer);
    this.etagMap.delete(remoteFilePath);
    this.options.onEvent?.({
      type: 'uploaded',
      remotePath: remoteFilePath,
      localPath: localFilePath,
    });
  }

  public async deleteFile(localFilePath: string): Promise<void> {
    if (this.options === undefined) throw new Error('Service not started');
    const { localPath, remotePath } = this.options;
    const remoteFilePath = this.localToRemotePath(localPath, localFilePath, remotePath);
    await unlink(localFilePath);
    await this.fileService.deleteFile(remoteFilePath);
    this.etagMap.delete(remoteFilePath);
  }

  private async connectNotifyPush(): Promise<void> {
    if (this.stopped || this.options === undefined) return;

    let token: string;
    try {
      token = await this.getPreAuthToken();
    } catch {
      this.startPollingFallback();
      return;
    }

    const wsUrl = `${this.ncBasePath.replace(/^http/, 'ws')}/push`;
    const ws = this.wsFactory(wsUrl);
    this.ws = ws;

    ws.addEventListener('open', () => {
      ws.send(token);
    });

    ws.addEventListener('message', (event: MessageEvent) => {
      const { data } = event;
      if (typeof data !== 'string') return;
      if (data === 'authenticated') {
        this.reconnectDelay = INITIAL_RECONNECT_DELAY_MS;
        return;
      }
      if (data === 'notify_file') {
        void this.performSync();
      }
    });

    ws.addEventListener('close', () => {
      if (this.stopped) return;
      setTimeout(() => void this.connectNotifyPush(), this.reconnectDelay);
      this.reconnectDelay = Math.min(this.reconnectDelay * 2, MAX_RECONNECT_DELAY_MS);
    });

    ws.addEventListener('error', () => {
      ws.close();
    });
  }

  private startPollingFallback(): void {
    if (this.options === undefined || this.stopped) return;
    const interval = this.options.pollIntervalMs ?? DEFAULT_POLL_INTERVAL_MS;
    this.pollTimer = setInterval(() => void this.performSync(), interval);
  }

  private async performSync(): Promise<void> {
    if (this.options === undefined || this.syncing) return;
    this.syncing = true;
    try {
      const { remotePath, localPath } = this.options;
      const entries = await this.fileService.listDirectoryContents(remotePath, { deep: true });

      const remoteFiles = entries.filter((e) => e.type === 'file');
      const remotePathSet = new Set(remoteFiles.map((e) => e.filename));

      for (const entry of remoteFiles) {
        const etagKey = entry.etag ?? entry.lastmod;
        if (this.etagMap.get(entry.filename) === etagKey) continue;
        await this.syncFile(entry, localPath, remotePath);
      }

      for (const trackedPath of this.etagMap.keys()) {
        if (!remotePathSet.has(trackedPath)) {
          const localFilePath = this.remoteToLocalPath(remotePath, trackedPath, localPath);
          await this.deleteLocalFile(localFilePath, trackedPath);
          this.etagMap.delete(trackedPath);
        }
      }
    } finally {
      this.syncing = false;
    }
  }

  private async syncFile(
    entry: DirectoryEntry,
    localPath: string,
    remotePath: string,
  ): Promise<void> {
    if (this.options === undefined) return;
    const localFilePath = this.remoteToLocalPath(remotePath, entry.filename, localPath);

    if ((await this.resolveConflict(entry, localFilePath)) === 'local') {
      this.etagMap.set(entry.filename, entry.etag ?? entry.lastmod);
      return;
    }

    const buffer = await this.fileService.download(entry.filename);
    await mkdir(dirname(localFilePath), { recursive: true });
    await writeFileToFs(localFilePath, buffer);
    this.etagMap.set(entry.filename, entry.etag ?? entry.lastmod);

    this.options.onEvent?.({
      type: 'synced',
      remotePath: entry.filename,
      localPath: localFilePath,
    });
  }

  private async resolveConflict(
    entry: DirectoryEntry,
    localFilePath: string,
  ): Promise<'remote' | 'local'> {
    if (this.options?.onConflict === undefined) return 'remote';
    const localStats = await stat(localFilePath).catch(() => undefined);
    if (localStats === undefined) return 'remote';
    if (localStats.mtimeMs <= new Date(entry.lastmod).getTime()) return 'remote';
    return this.options.onConflict(entry.filename, localFilePath);
  }

  private async deleteLocalFile(localFilePath: string, remoteFilePath: string): Promise<void> {
    if (this.options === undefined) return;
    const localStats = await stat(localFilePath).catch(() => undefined);
    if (localStats === undefined) return;
    await unlink(localFilePath);
    this.options.onEvent?.({
      type: 'deleted',
      remotePath: remoteFilePath,
      localPath: localFilePath,
    });
  }

  private remoteToLocalPath(remotePath: string, remoteFilePath: string, localPath: string): string {
    const base = remotePath.endsWith('/') ? remotePath.slice(0, -1) : remotePath;
    const relative = remoteFilePath.slice(base.length).replace(/^\//, '');
    return join(localPath, relative);
  }

  private localToRemotePath(localPath: string, localFilePath: string, remotePath: string): string {
    const base = localPath.endsWith('/') ? localPath.slice(0, -1) : localPath;
    const remoteBase = remotePath.endsWith('/') ? remotePath.slice(0, -1) : remotePath;
    const relative = localFilePath.slice(base.length).replace(/^\//, '');
    return `${remoteBase}/${relative}`;
  }

  private async getPreAuthToken(): Promise<string> {
    const response = await fetch(`${this.ncBasePath}/ocs/v2.php/apps/notify_push/api/v1/pre_auth`, {
      method: 'POST',
      headers: this.headerService.getOCSHeaders(this.ncUsername, this.ncAppPassword),
    });
    if (!response.ok) {
      throw new Error(`notify_push pre_auth failed: ${response.status}`);
    }
    const data = (await response.json()) as { ocs: { data: string } };
    return data.ocs.data;
  }
}
