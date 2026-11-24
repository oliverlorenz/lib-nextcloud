import {
  describe,
  it,
  expect,
  beforeEach,
  afterEach,
  vi,
  type Mock,
  type MockInstance,
} from 'vitest';
import { mkdir, stat, unlink, writeFile } from 'fs/promises';
import { mock } from 'vitest-mock-extended';
import { NextcloudFileService } from '../files/index.js';
import { NextcloudHeaderService } from '../shared/NextcloudHeaderService.js';
import { NextcloudFileMirrorService } from './NextcloudFileMirrorService.js';
import type {
  NextcloudFileChange,
  NextcloudFileMirrorOptions,
  NextcloudMirrorEvent,
} from './NextcloudFileMirrorTypes.js';

vi.mock('webdav', () => ({
  AuthType: { Password: 'password' },
  createClient: vi.fn(),
}));

vi.mock('fs/promises', () => ({
  writeFile: vi.fn(),
  mkdir: vi.fn(),
  unlink: vi.fn(),
  stat: vi.fn(),
}));

const flush = async (): Promise<void> => {
  for (let i = 0; i < 20; i++) {
    await Promise.resolve();
  }
};

type EventListener = (event: unknown) => void;

class MockWebSocket {
  public readonly url: string;
  private readonly listeners = new Map<string, EventListener[]>();
  public readonly sent: string[] = [];
  public closed = false;

  constructor(url: string) {
    this.url = url;
  }

  public addEventListener(type: string, listener: EventListener): void {
    const existing = this.listeners.get(type) ?? [];
    this.listeners.set(type, [...existing, listener]);
  }

  public send(data: string): void {
    this.sent.push(data);
  }

  public close(): void {
    this.closed = true;
  }

  public emit(type: string, event: unknown = {}): void {
    this.listeners.get(type)?.forEach((l) => l(event));
  }
}

describe('NextcloudFileMirrorService', () => {
  let service: NextcloudFileMirrorService;
  let fetchSpy: MockInstance;
  let mockFileService: ReturnType<typeof mock<NextcloudFileService>>;
  let mockWs: MockWebSocket;
  let wsFactory: Mock;

  const BASE_OPTIONS: NextcloudFileMirrorOptions = {
    remotePath: '/Documents/Folder',
    localPath: '/local/mirror',
  };

  const makeEntry = (
    filename: string,
    etag: string | null,
    lastmod = 'Thu, 01 Jan 2026 00:00:00 GMT',
  ) => ({
    filename,
    type: 'file' as const,
    etag,
    lastmod,
  });

  beforeEach(() => {
    vi.resetAllMocks();

    (writeFile as Mock).mockResolvedValue(undefined);
    (mkdir as Mock).mockResolvedValue(undefined);
    (unlink as Mock).mockResolvedValue(undefined);
    (stat as Mock).mockRejectedValue(Object.assign(new Error('ENOENT'), { code: 'ENOENT' }));

    mockFileService = mock<NextcloudFileService>();
    mockFileService.listDirectoryContents.mockResolvedValue([]);
    mockFileService.download.mockResolvedValue(Buffer.from('content'));
    mockFileService.upload.mockResolvedValue(true);
    mockFileService.deleteFile.mockResolvedValue(undefined);

    mockWs = new MockWebSocket('ws://test');
    wsFactory = vi.fn().mockReturnValue(mockWs);

    fetchSpy = vi.spyOn(global, 'fetch').mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ ocs: { data: 'test-token' } }),
    } as unknown as Response);

    service = new NextcloudFileMirrorService(
      'https://nc.example.com',
      'user',
      'pass',
      new NextcloudHeaderService(),
      mockFileService,
      wsFactory,
    );
  });

  afterEach(() => {
    service.stop();
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  it('create() returns an instance without manual dependency injection', () => {
    expect(
      NextcloudFileMirrorService.create('https://nc.example.com', 'user', 'pass'),
    ).toBeInstanceOf(NextcloudFileMirrorService);
  });

  describe('start()', () => {
    it('performs initial sync on start', async () => {
      await service.start(BASE_OPTIONS);

      expect(mockFileService.listDirectoryContents).toHaveBeenCalledWith(BASE_OPTIONS.remotePath, {
        deep: true,
      });
    });

    it('connects to notify_push WebSocket after initial sync', async () => {
      await service.start(BASE_OPTIONS);

      expect(wsFactory).toHaveBeenCalledWith('wss://nc.example.com/push');
    });

    it('fetches pre_auth token before opening WebSocket', async () => {
      await service.start(BASE_OPTIONS);

      expect(fetchSpy).toHaveBeenCalledWith(
        'https://nc.example.com/ocs/v2.php/apps/notify_push/api/v1/pre_auth',
        expect.objectContaining({ method: 'POST' }),
      );
    });

    it('sends pre_auth token over WebSocket on open', async () => {
      await service.start(BASE_OPTIONS);
      mockWs.emit('open');

      expect(mockWs.sent).toContain('test-token');
    });

    it('downloads new files during initial sync', async () => {
      mockFileService.listDirectoryContents.mockResolvedValue([
        makeEntry('/Documents/Folder/file.txt', 'etag-1'),
      ]);

      await service.start(BASE_OPTIONS);

      expect(mockFileService.download).toHaveBeenCalledWith('/Documents/Folder/file.txt');
      expect(writeFile).toHaveBeenCalledWith('/local/mirror/file.txt', expect.any(Buffer));
    });

    it('fires onEvent with synced type after downloading a file', async () => {
      mockFileService.listDirectoryContents.mockResolvedValue([
        makeEntry('/Documents/Folder/file.txt', 'etag-1'),
      ]);
      const events: NextcloudMirrorEvent[] = [];

      await service.start({ ...BASE_OPTIONS, onEvent: (e) => events.push(e) });

      expect(events).toEqual([
        {
          type: 'synced',
          remotePath: '/Documents/Folder/file.txt',
          localPath: '/local/mirror/file.txt',
        },
      ]);
    });

    it('falls back to polling when pre_auth fails', async () => {
      vi.useFakeTimers();
      fetchSpy.mockResolvedValue({ ok: false, status: 500 } as unknown as Response);

      await service.start(BASE_OPTIONS);

      vi.advanceTimersByTime(30_000);
      await Promise.resolve();

      expect(mockFileService.listDirectoryContents).toHaveBeenCalledTimes(2);
    });

    it('uses custom pollIntervalMs for fallback polling', async () => {
      vi.useFakeTimers();
      fetchSpy.mockResolvedValue({ ok: false, status: 500 } as unknown as Response);

      await service.start({ ...BASE_OPTIONS, pollIntervalMs: 5_000 });

      vi.advanceTimersByTime(4_999);
      await Promise.resolve();
      expect(mockFileService.listDirectoryContents).toHaveBeenCalledTimes(1);

      vi.advanceTimersByTime(1);
      await Promise.resolve();
      expect(mockFileService.listDirectoryContents).toHaveBeenCalledTimes(2);
    });
  });

  describe('stop()', () => {
    it('closes the WebSocket', async () => {
      await service.start(BASE_OPTIONS);

      service.stop();

      expect(mockWs.closed).toBe(true);
    });

    it('cancels polling timer', async () => {
      vi.useFakeTimers();
      fetchSpy.mockResolvedValue({ ok: false, status: 500 } as unknown as Response);
      await service.start(BASE_OPTIONS);

      service.stop();
      mockFileService.listDirectoryContents.mockClear();
      vi.advanceTimersByTime(60_000);

      expect(mockFileService.listDirectoryContents).not.toHaveBeenCalled();
    });
  });

  describe('notify_file event', () => {
    it('triggers a new sync when notify_file message is received', async () => {
      await service.start(BASE_OPTIONS);
      mockFileService.listDirectoryContents.mockClear();

      mockWs.emit('message', { data: 'notify_file' });
      await flush();

      expect(mockFileService.listDirectoryContents).toHaveBeenCalled();
    });

    it('ignores non-string message data', async () => {
      await service.start(BASE_OPTIONS);
      mockFileService.listDirectoryContents.mockClear();

      mockWs.emit('message', { data: 42 });
      await flush();

      expect(mockFileService.listDirectoryContents).not.toHaveBeenCalled();
    });

    it('resets reconnect delay on authenticated message', async () => {
      await service.start(BASE_OPTIONS);
      mockWs.emit('message', { data: 'authenticated' });

      expect(mockWs.sent).not.toContain('authenticated');
    });
  });

  describe('WebSocket reconnect', () => {
    it('schedules reconnect when WebSocket closes unexpectedly', async () => {
      vi.useFakeTimers();
      await service.start(BASE_OPTIONS);

      mockWs.emit('close');
      vi.advanceTimersByTime(1_000);
      await flush();

      expect(wsFactory).toHaveBeenCalledTimes(2);
    });

    it('does not reconnect after stop()', async () => {
      vi.useFakeTimers();
      await service.start(BASE_OPTIONS);

      service.stop();
      mockWs.emit('close');
      vi.advanceTimersByTime(10_000);
      await flush();

      expect(wsFactory).toHaveBeenCalledTimes(1);
    });

    it('closes WebSocket on error', async () => {
      await service.start(BASE_OPTIONS);

      mockWs.emit('error');

      expect(mockWs.closed).toBe(true);
    });
  });

  describe('ETag-based delta sync', () => {
    it('skips files whose ETag has not changed since last sync', async () => {
      mockFileService.listDirectoryContents.mockResolvedValue([
        makeEntry('/Documents/Folder/file.txt', 'etag-stable'),
      ]);

      await service.start(BASE_OPTIONS);
      mockFileService.download.mockClear();

      mockWs.emit('message', { data: 'notify_file' });
      await flush();

      expect(mockFileService.download).not.toHaveBeenCalled();
    });

    it('re-downloads files whose ETag changed', async () => {
      mockFileService.listDirectoryContents
        .mockResolvedValueOnce([makeEntry('/Documents/Folder/file.txt', 'etag-v1')])
        .mockResolvedValueOnce([makeEntry('/Documents/Folder/file.txt', 'etag-v2')]);

      await service.start(BASE_OPTIONS);
      mockFileService.download.mockClear();

      mockWs.emit('message', { data: 'notify_file' });
      await flush();

      expect(mockFileService.download).toHaveBeenCalledWith('/Documents/Folder/file.txt');
    });

    it('uses lastmod as fallback when etag is null', async () => {
      mockFileService.listDirectoryContents.mockResolvedValue([
        makeEntry('/Documents/Folder/file.txt', null),
      ]);

      await service.start(BASE_OPTIONS);
      mockFileService.download.mockClear();

      mockWs.emit('message', { data: 'notify_file' });
      await flush();

      expect(mockFileService.download).not.toHaveBeenCalled();
    });
  });

  describe('deletion mirroring', () => {
    it('deletes local file when remote file is removed', async () => {
      mockFileService.listDirectoryContents
        .mockResolvedValueOnce([makeEntry('/Documents/Folder/file.txt', 'etag-1')])
        .mockResolvedValueOnce([]);
      (stat as Mock).mockResolvedValue({ mtimeMs: Date.now() });

      await service.start(BASE_OPTIONS);

      mockWs.emit('message', { data: 'notify_file' });
      await flush();

      expect(unlink).toHaveBeenCalledWith('/local/mirror/file.txt');
    });

    it('fires onEvent with deleted type when local file is removed', async () => {
      mockFileService.listDirectoryContents
        .mockResolvedValueOnce([makeEntry('/Documents/Folder/file.txt', 'etag-1')])
        .mockResolvedValueOnce([]);
      (stat as Mock).mockResolvedValue({ mtimeMs: Date.now() });
      const events: NextcloudMirrorEvent[] = [];

      await service.start({ ...BASE_OPTIONS, onEvent: (e) => events.push(e) });

      mockWs.emit('message', { data: 'notify_file' });
      await flush();

      expect(events).toContainEqual({
        type: 'deleted',
        remotePath: '/Documents/Folder/file.txt',
        localPath: '/local/mirror/file.txt',
      });
    });

    it('skips deletion when local file does not exist', async () => {
      mockFileService.listDirectoryContents
        .mockResolvedValueOnce([makeEntry('/Documents/Folder/file.txt', 'etag-1')])
        .mockResolvedValueOnce([]);

      await service.start(BASE_OPTIONS);

      mockWs.emit('message', { data: 'notify_file' });
      await flush();

      expect(unlink).not.toHaveBeenCalled();
    });
  });

  describe('conflict resolution', () => {
    it('downloads file without calling onConflict when no local file exists', async () => {
      const onConflict = vi.fn();
      mockFileService.listDirectoryContents.mockResolvedValue([
        makeEntry('/Documents/Folder/file.txt', 'etag-1'),
      ]);

      await service.start({ ...BASE_OPTIONS, onConflict });

      expect(onConflict).not.toHaveBeenCalled();
      expect(mockFileService.download).toHaveBeenCalled();
    });

    it('downloads without calling onConflict when local file is not newer', async () => {
      const onConflict = vi.fn();
      mockFileService.listDirectoryContents.mockResolvedValue([
        makeEntry('/Documents/Folder/file.txt', 'etag-1', 'Thu, 01 Jan 2026 12:00:00 GMT'),
      ]);
      (stat as Mock).mockResolvedValue({
        mtimeMs: new Date('2026-01-01T11:00:00Z').getTime(),
      });

      await service.start({ ...BASE_OPTIONS, onConflict });

      expect(onConflict).not.toHaveBeenCalled();
      expect(mockFileService.download).toHaveBeenCalled();
    });

    it('calls onConflict when local file is newer than remote', async () => {
      const onConflict = vi.fn().mockReturnValue('remote');
      mockFileService.listDirectoryContents.mockResolvedValue([
        makeEntry('/Documents/Folder/file.txt', 'etag-1', 'Thu, 01 Jan 2026 10:00:00 GMT'),
      ]);
      (stat as Mock).mockResolvedValue({
        mtimeMs: new Date('2026-01-01T12:00:00Z').getTime(),
      });

      await service.start({ ...BASE_OPTIONS, onConflict });

      expect(onConflict).toHaveBeenCalledWith(
        '/Documents/Folder/file.txt',
        '/local/mirror/file.txt',
      );
    });

    it('skips download when onConflict returns local', async () => {
      const onConflict = vi.fn().mockReturnValue('local');
      mockFileService.listDirectoryContents.mockResolvedValue([
        makeEntry('/Documents/Folder/file.txt', 'etag-1', 'Thu, 01 Jan 2026 10:00:00 GMT'),
      ]);
      (stat as Mock).mockResolvedValue({
        mtimeMs: new Date('2026-01-01T12:00:00Z').getTime(),
      });

      await service.start({ ...BASE_OPTIONS, onConflict });

      expect(mockFileService.download).not.toHaveBeenCalled();
      expect(writeFile).not.toHaveBeenCalled();
    });

    it('downloads file when no onConflict is set even if local is newer', async () => {
      mockFileService.listDirectoryContents.mockResolvedValue([
        makeEntry('/Documents/Folder/file.txt', 'etag-1', 'Thu, 01 Jan 2026 10:00:00 GMT'),
      ]);
      (stat as Mock).mockResolvedValue({
        mtimeMs: new Date('2026-01-01T12:00:00Z').getTime(),
      });

      await service.start(BASE_OPTIONS);

      expect(mockFileService.download).toHaveBeenCalled();
    });
  });

  describe('path mapping', () => {
    it('maps nested remote paths to correct local paths', async () => {
      mockFileService.listDirectoryContents.mockResolvedValue([
        makeEntry('/Documents/Folder/sub/deep/file.txt', 'etag-1'),
      ]);

      await service.start(BASE_OPTIONS);

      expect(writeFile).toHaveBeenCalledWith('/local/mirror/sub/deep/file.txt', expect.any(Buffer));
    });

    it('creates parent directories for nested files', async () => {
      mockFileService.listDirectoryContents.mockResolvedValue([
        makeEntry('/Documents/Folder/sub/file.txt', 'etag-1'),
      ]);

      await service.start(BASE_OPTIONS);

      expect(mkdir).toHaveBeenCalledWith('/local/mirror/sub', { recursive: true });
    });
  });

  describe('pre_auth', () => {
    it('falls back to polling (not WebSocket) when pre_auth endpoint returns non-ok', async () => {
      vi.useFakeTimers();
      fetchSpy.mockResolvedValue({ ok: false, status: 503 } as unknown as Response);

      await service.start(BASE_OPTIONS);

      expect(wsFactory).not.toHaveBeenCalled();

      vi.advanceTimersByTime(30_000);
      await Promise.resolve();

      expect(mockFileService.listDirectoryContents).toHaveBeenCalledTimes(2);
    });
  });

  describe('writeFile()', () => {
    it('throws when service is not started', async () => {
      await expect(service.writeFile('/local/mirror/file.txt', 'content')).rejects.toThrow(
        'Service not started',
      );
    });

    it('writes the file to the local path', async () => {
      await service.start(BASE_OPTIONS);

      await service.writeFile('/local/mirror/file.txt', Buffer.from('hello'));

      expect(writeFile).toHaveBeenCalledWith('/local/mirror/file.txt', expect.any(Buffer));
    });

    it('converts string contents to Buffer before writing locally', async () => {
      await service.start(BASE_OPTIONS);

      await service.writeFile('/local/mirror/file.txt', 'hello');

      expect(writeFile).toHaveBeenCalledWith('/local/mirror/file.txt', Buffer.from('hello'));
    });

    it('creates parent directories before writing', async () => {
      await service.start(BASE_OPTIONS);

      await service.writeFile('/local/mirror/sub/file.txt', 'hello');

      expect(mkdir).toHaveBeenCalledWith('/local/mirror/sub', { recursive: true });
    });

    it('uploads file contents to the corresponding WebDAV path', async () => {
      await service.start(BASE_OPTIONS);

      await service.writeFile('/local/mirror/file.txt', Buffer.from('hello'));

      expect(mockFileService.upload).toHaveBeenCalledWith(
        '/Documents/Folder/file.txt',
        expect.any(Buffer),
      );
    });

    it('maps nested local paths to correct remote paths', async () => {
      await service.start(BASE_OPTIONS);

      await service.writeFile('/local/mirror/sub/deep/file.txt', 'hello');

      expect(mockFileService.upload).toHaveBeenCalledWith(
        '/Documents/Folder/sub/deep/file.txt',
        expect.any(Buffer),
      );
    });

    it('fires onEvent with uploaded type after uploading', async () => {
      const events: NextcloudMirrorEvent[] = [];
      await service.start({ ...BASE_OPTIONS, onEvent: (e) => events.push(e) });

      await service.writeFile('/local/mirror/file.txt', 'hello');

      expect(events).toContainEqual({
        type: 'uploaded',
        remotePath: '/Documents/Folder/file.txt',
        localPath: '/local/mirror/file.txt',
      });
    });

    it('invalidates etagMap so the next sync re-evaluates the file', async () => {
      mockFileService.listDirectoryContents.mockResolvedValue([
        makeEntry('/Documents/Folder/file.txt', 'etag-1'),
      ]);
      await service.start(BASE_OPTIONS);

      await service.writeFile('/local/mirror/file.txt', 'updated');
      mockFileService.download.mockClear();

      mockFileService.listDirectoryContents.mockResolvedValue([
        makeEntry('/Documents/Folder/file.txt', 'etag-2'),
      ]);
      mockWs.emit('message', { data: 'notify_file' });
      await flush();

      expect(mockFileService.download).toHaveBeenCalledWith('/Documents/Folder/file.txt');
    });
  });

  describe('deleteFile()', () => {
    it('throws when service is not started', async () => {
      await expect(service.deleteFile('/local/mirror/file.txt')).rejects.toThrow(
        'Service not started',
      );
    });

    it('deletes the local file', async () => {
      await service.start(BASE_OPTIONS);

      await service.deleteFile('/local/mirror/file.txt');

      expect(unlink).toHaveBeenCalledWith('/local/mirror/file.txt');
    });

    it('deletes the file on the remote path via NextcloudFileService', async () => {
      await service.start(BASE_OPTIONS);

      await service.deleteFile('/local/mirror/file.txt');

      expect(mockFileService.deleteFile).toHaveBeenCalledWith('/Documents/Folder/file.txt');
    });

    it('maps nested local paths to correct remote paths', async () => {
      await service.start(BASE_OPTIONS);

      await service.deleteFile('/local/mirror/sub/deep/file.txt');

      expect(mockFileService.deleteFile).toHaveBeenCalledWith(
        '/Documents/Folder/sub/deep/file.txt',
      );
    });

    it('removes the entry from etagMap so the next sync does not re-create the file locally', async () => {
      mockFileService.listDirectoryContents
        .mockResolvedValueOnce([makeEntry('/Documents/Folder/file.txt', 'etag-1')])
        .mockResolvedValueOnce([]);
      await service.start(BASE_OPTIONS);

      await service.deleteFile('/local/mirror/file.txt');
      (stat as Mock).mockResolvedValue({ mtimeMs: Date.now() });

      mockWs.emit('message', { data: 'notify_file' });
      await flush();

      expect(unlink).toHaveBeenCalledTimes(1);
    });
  });

  describe('onChanged', () => {
    it('fires with source local after writing a file ourselves', async () => {
      const changes: NextcloudFileChange[] = [];
      await service.start({ ...BASE_OPTIONS, onChanged: (c) => changes.push(c) });

      await service.writeFile('/local/mirror/file.txt', 'hello');

      expect(changes).toContainEqual({
        remotePath: '/Documents/Folder/file.txt',
        localPath: '/local/mirror/file.txt',
        source: 'local',
      });
    });

    it('fires with source remote after a server-side change is downloaded', async () => {
      mockFileService.listDirectoryContents.mockResolvedValue([
        makeEntry('/Documents/Folder/file.txt', 'etag-1'),
      ]);
      const changes: NextcloudFileChange[] = [];

      await service.start({ ...BASE_OPTIONS, onChanged: (c) => changes.push(c) });

      expect(changes).toEqual([
        {
          remotePath: '/Documents/Folder/file.txt',
          localPath: '/local/mirror/file.txt',
          source: 'remote',
        },
      ]);
    });

    it('does not fire when a remote file is deleted', async () => {
      mockFileService.listDirectoryContents
        .mockResolvedValueOnce([makeEntry('/Documents/Folder/file.txt', 'etag-1')])
        .mockResolvedValueOnce([]);
      (stat as Mock).mockResolvedValue({ mtimeMs: Date.now() });
      const changes: NextcloudFileChange[] = [];

      await service.start({ ...BASE_OPTIONS, onChanged: (c) => changes.push(c) });
      changes.length = 0;

      mockWs.emit('message', { data: 'notify_file' });
      await flush();

      expect(changes).toEqual([]);
    });
  });
});
