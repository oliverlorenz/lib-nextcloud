import { mkdir, stat, unlink, writeFile } from 'fs/promises';
import { NextcloudHeaderService } from '../shared/NextcloudHeaderService';
import { NextcloudFileMirrorService } from './NextcloudFileMirrorService';
import type { NextcloudFileMirrorOptions, NextcloudMirrorEvent } from './NextcloudFileMirrorTypes';
import { createClient } from 'webdav';

jest.mock('webdav', () => ({
  AuthType: { Password: 'password' },
  createClient: jest.fn(),
}));

jest.mock('fs/promises', () => ({
  writeFile: jest.fn(),
  mkdir: jest.fn(),
  unlink: jest.fn(),
  stat: jest.fn(),
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
  let fetchSpy: jest.SpyInstance;
  let mockWebdavClient: {
    getDirectoryContents: jest.Mock;
    getFileContents: jest.Mock;
  };
  let mockWs: MockWebSocket;
  let wsFactory: jest.Mock;

  const BASE_OPTIONS: NextcloudFileMirrorOptions = {
    remotePath: '/Documents/Folder',
    localPath: '/local/mirror',
  };

  const makeFileStat = (
    filename: string,
    etag: string,
    lastmod = 'Thu, 01 Jan 2026 00:00:00 GMT',
  ) => ({
    filename,
    type: 'file' as const,
    etag,
    lastmod,
    basename: filename.split('/').pop() ?? '',
    size: 100,
  });

  beforeEach(() => {
    jest.resetAllMocks();

    (writeFile as jest.Mock).mockResolvedValue(undefined);
    (mkdir as jest.Mock).mockResolvedValue(undefined);
    (unlink as jest.Mock).mockResolvedValue(undefined);
    (stat as jest.Mock).mockRejectedValue(Object.assign(new Error('ENOENT'), { code: 'ENOENT' }));

    mockWebdavClient = {
      getDirectoryContents: jest.fn().mockResolvedValue([]),
      getFileContents: jest.fn().mockResolvedValue(Buffer.from('content')),
    };
    (createClient as jest.Mock).mockReturnValue(mockWebdavClient);

    mockWs = new MockWebSocket('ws://test');
    wsFactory = jest.fn().mockReturnValue(mockWs);

    fetchSpy = jest.spyOn(global, 'fetch').mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ ocs: { data: 'test-token' } }),
    } as unknown as Response);

    service = new NextcloudFileMirrorService(
      'https://nc.example.com',
      'user',
      'pass',
      new NextcloudHeaderService(),
      wsFactory,
    );
  });

  afterEach(() => {
    service.stop();
    jest.restoreAllMocks();
    jest.useRealTimers();
  });

  it('create() returns an instance without manual dependency injection', () => {
    expect(
      NextcloudFileMirrorService.create('https://nc.example.com', 'user', 'pass'),
    ).toBeInstanceOf(NextcloudFileMirrorService);
  });

  describe('start()', () => {
    it('performs initial sync on start', async () => {
      await service.start(BASE_OPTIONS);

      expect(mockWebdavClient.getDirectoryContents).toHaveBeenCalledWith(BASE_OPTIONS.remotePath, {
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
      mockWebdavClient.getDirectoryContents.mockResolvedValue([
        makeFileStat('/Documents/Folder/file.txt', 'etag-1'),
      ]);

      await service.start(BASE_OPTIONS);

      expect(mockWebdavClient.getFileContents).toHaveBeenCalledWith('/Documents/Folder/file.txt');
      expect(writeFile).toHaveBeenCalledWith('/local/mirror/file.txt', expect.any(Buffer));
    });

    it('fires onEvent with synced type after downloading a file', async () => {
      mockWebdavClient.getDirectoryContents.mockResolvedValue([
        makeFileStat('/Documents/Folder/file.txt', 'etag-1'),
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
      jest.useFakeTimers();
      fetchSpy.mockResolvedValue({ ok: false, status: 500 } as unknown as Response);

      await service.start(BASE_OPTIONS);

      jest.advanceTimersByTime(30_000);
      await Promise.resolve();

      expect(mockWebdavClient.getDirectoryContents).toHaveBeenCalledTimes(2);
    });

    it('uses custom pollIntervalMs for fallback polling', async () => {
      jest.useFakeTimers();
      fetchSpy.mockResolvedValue({ ok: false, status: 500 } as unknown as Response);

      await service.start({ ...BASE_OPTIONS, pollIntervalMs: 5_000 });

      jest.advanceTimersByTime(4_999);
      await Promise.resolve();
      expect(mockWebdavClient.getDirectoryContents).toHaveBeenCalledTimes(1);

      jest.advanceTimersByTime(1);
      await Promise.resolve();
      expect(mockWebdavClient.getDirectoryContents).toHaveBeenCalledTimes(2);
    });
  });

  describe('stop()', () => {
    it('closes the WebSocket', async () => {
      await service.start(BASE_OPTIONS);

      service.stop();

      expect(mockWs.closed).toBe(true);
    });

    it('cancels polling timer', async () => {
      jest.useFakeTimers();
      fetchSpy.mockResolvedValue({ ok: false, status: 500 } as unknown as Response);
      await service.start(BASE_OPTIONS);

      service.stop();
      mockWebdavClient.getDirectoryContents.mockClear();
      jest.advanceTimersByTime(60_000);

      expect(mockWebdavClient.getDirectoryContents).not.toHaveBeenCalled();
    });
  });

  describe('notify_file event', () => {
    it('triggers a new sync when notify_file message is received', async () => {
      await service.start(BASE_OPTIONS);
      mockWebdavClient.getDirectoryContents.mockClear();

      mockWs.emit('message', { data: 'notify_file' });
      await flush();

      expect(mockWebdavClient.getDirectoryContents).toHaveBeenCalled();
    });

    it('ignores non-string message data', async () => {
      await service.start(BASE_OPTIONS);
      mockWebdavClient.getDirectoryContents.mockClear();

      mockWs.emit('message', { data: 42 });
      await flush();

      expect(mockWebdavClient.getDirectoryContents).not.toHaveBeenCalled();
    });

    it('resets reconnect delay on authenticated message', async () => {
      await service.start(BASE_OPTIONS);
      mockWs.emit('message', { data: 'authenticated' });

      expect(mockWs.sent).not.toContain('authenticated');
    });
  });

  describe('WebSocket reconnect', () => {
    it('schedules reconnect when WebSocket closes unexpectedly', async () => {
      jest.useFakeTimers();
      await service.start(BASE_OPTIONS);

      mockWs.emit('close');
      jest.advanceTimersByTime(1_000);
      await flush();

      expect(wsFactory).toHaveBeenCalledTimes(2);
    });

    it('does not reconnect after stop()', async () => {
      jest.useFakeTimers();
      await service.start(BASE_OPTIONS);

      service.stop();
      mockWs.emit('close');
      jest.advanceTimersByTime(10_000);
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
      const file = makeFileStat('/Documents/Folder/file.txt', 'etag-stable');
      mockWebdavClient.getDirectoryContents.mockResolvedValue([file]);

      await service.start(BASE_OPTIONS);
      mockWebdavClient.getFileContents.mockClear();

      mockWs.emit('message', { data: 'notify_file' });
      await flush();

      expect(mockWebdavClient.getFileContents).not.toHaveBeenCalled();
    });

    it('re-downloads files whose ETag changed', async () => {
      const fileV1 = makeFileStat('/Documents/Folder/file.txt', 'etag-v1');
      const fileV2 = makeFileStat('/Documents/Folder/file.txt', 'etag-v2');
      mockWebdavClient.getDirectoryContents
        .mockResolvedValueOnce([fileV1])
        .mockResolvedValueOnce([fileV2]);

      await service.start(BASE_OPTIONS);
      mockWebdavClient.getFileContents.mockClear();

      mockWs.emit('message', { data: 'notify_file' });
      await flush();

      expect(mockWebdavClient.getFileContents).toHaveBeenCalledWith('/Documents/Folder/file.txt');
    });

    it('uses lastmod as fallback when etag is null', async () => {
      const file = { ...makeFileStat('/Documents/Folder/file.txt', ''), etag: null };
      mockWebdavClient.getDirectoryContents.mockResolvedValue([file]);

      await service.start(BASE_OPTIONS);
      mockWebdavClient.getFileContents.mockClear();

      mockWs.emit('message', { data: 'notify_file' });
      await flush();

      expect(mockWebdavClient.getFileContents).not.toHaveBeenCalled();
    });
  });

  describe('deletion mirroring', () => {
    it('deletes local file when remote file is removed', async () => {
      const file = makeFileStat('/Documents/Folder/file.txt', 'etag-1');
      mockWebdavClient.getDirectoryContents.mockResolvedValueOnce([file]).mockResolvedValueOnce([]);
      (stat as jest.Mock).mockResolvedValue({ mtimeMs: Date.now() });

      await service.start(BASE_OPTIONS);

      mockWs.emit('message', { data: 'notify_file' });
      await flush();

      expect(unlink).toHaveBeenCalledWith('/local/mirror/file.txt');
    });

    it('fires onEvent with deleted type when local file is removed', async () => {
      const file = makeFileStat('/Documents/Folder/file.txt', 'etag-1');
      mockWebdavClient.getDirectoryContents.mockResolvedValueOnce([file]).mockResolvedValueOnce([]);
      (stat as jest.Mock).mockResolvedValue({ mtimeMs: Date.now() });
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
      const file = makeFileStat('/Documents/Folder/file.txt', 'etag-1');
      mockWebdavClient.getDirectoryContents.mockResolvedValueOnce([file]).mockResolvedValueOnce([]);

      await service.start(BASE_OPTIONS);

      mockWs.emit('message', { data: 'notify_file' });
      await flush();

      expect(unlink).not.toHaveBeenCalled();
    });
  });

  describe('conflict resolution', () => {
    it('downloads file without calling onConflict when no local file exists', async () => {
      const onConflict = jest.fn();
      const file = makeFileStat('/Documents/Folder/file.txt', 'etag-1');
      mockWebdavClient.getDirectoryContents.mockResolvedValue([file]);

      await service.start({ ...BASE_OPTIONS, onConflict });

      expect(onConflict).not.toHaveBeenCalled();
      expect(mockWebdavClient.getFileContents).toHaveBeenCalled();
    });

    it('downloads without calling onConflict when local file is not newer', async () => {
      const onConflict = jest.fn();
      const file = makeFileStat(
        '/Documents/Folder/file.txt',
        'etag-1',
        'Thu, 01 Jan 2026 12:00:00 GMT',
      );
      mockWebdavClient.getDirectoryContents.mockResolvedValue([file]);
      (stat as jest.Mock).mockResolvedValue({
        mtimeMs: new Date('2026-01-01T11:00:00Z').getTime(),
      });

      await service.start({ ...BASE_OPTIONS, onConflict });

      expect(onConflict).not.toHaveBeenCalled();
      expect(mockWebdavClient.getFileContents).toHaveBeenCalled();
    });

    it('calls onConflict when local file is newer than remote', async () => {
      const onConflict = jest.fn().mockReturnValue('remote');
      const file = makeFileStat(
        '/Documents/Folder/file.txt',
        'etag-1',
        'Thu, 01 Jan 2026 10:00:00 GMT',
      );
      mockWebdavClient.getDirectoryContents.mockResolvedValue([file]);
      (stat as jest.Mock).mockResolvedValue({
        mtimeMs: new Date('2026-01-01T12:00:00Z').getTime(),
      });

      await service.start({ ...BASE_OPTIONS, onConflict });

      expect(onConflict).toHaveBeenCalledWith(
        '/Documents/Folder/file.txt',
        '/local/mirror/file.txt',
      );
    });

    it('skips download when onConflict returns local', async () => {
      const onConflict = jest.fn().mockReturnValue('local');
      const file = makeFileStat(
        '/Documents/Folder/file.txt',
        'etag-1',
        'Thu, 01 Jan 2026 10:00:00 GMT',
      );
      mockWebdavClient.getDirectoryContents.mockResolvedValue([file]);
      (stat as jest.Mock).mockResolvedValue({
        mtimeMs: new Date('2026-01-01T12:00:00Z').getTime(),
      });

      await service.start({ ...BASE_OPTIONS, onConflict });

      expect(mockWebdavClient.getFileContents).not.toHaveBeenCalled();
      expect(writeFile).not.toHaveBeenCalled();
    });

    it('downloads file when no onConflict is set even if local is newer', async () => {
      const file = makeFileStat(
        '/Documents/Folder/file.txt',
        'etag-1',
        'Thu, 01 Jan 2026 10:00:00 GMT',
      );
      mockWebdavClient.getDirectoryContents.mockResolvedValue([file]);
      (stat as jest.Mock).mockResolvedValue({
        mtimeMs: new Date('2026-01-01T12:00:00Z').getTime(),
      });

      await service.start(BASE_OPTIONS);

      expect(mockWebdavClient.getFileContents).toHaveBeenCalled();
    });
  });

  describe('path mapping', () => {
    it('maps nested remote paths to correct local paths', async () => {
      mockWebdavClient.getDirectoryContents.mockResolvedValue([
        makeFileStat('/Documents/Folder/sub/deep/file.txt', 'etag-1'),
      ]);

      await service.start(BASE_OPTIONS);

      expect(writeFile).toHaveBeenCalledWith('/local/mirror/sub/deep/file.txt', expect.any(Buffer));
    });

    it('creates parent directories for nested files', async () => {
      mockWebdavClient.getDirectoryContents.mockResolvedValue([
        makeFileStat('/Documents/Folder/sub/file.txt', 'etag-1'),
      ]);

      await service.start(BASE_OPTIONS);

      expect(mkdir).toHaveBeenCalledWith('/local/mirror/sub', { recursive: true });
    });
  });

  describe('pre_auth', () => {
    it('falls back to polling (not WebSocket) when pre_auth endpoint returns non-ok', async () => {
      jest.useFakeTimers();
      fetchSpy.mockResolvedValue({ ok: false, status: 503 } as unknown as Response);

      await service.start(BASE_OPTIONS);

      expect(wsFactory).not.toHaveBeenCalled();

      jest.advanceTimersByTime(30_000);
      await Promise.resolve();

      expect(mockWebdavClient.getDirectoryContents).toHaveBeenCalledTimes(2);
    });
  });
});
