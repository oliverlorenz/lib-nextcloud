import { NextcloudFileService } from './NextcloudFileService';
import { NextcloudHeaderService } from '../shared/NextcloudHeaderService';
import { createClient } from 'webdav';

jest.mock('webdav', () => ({
  AuthType: { Password: 'password' },
  createClient: jest.fn(),
}));

describe('NextcloudFileService', () => {
  let service: NextcloudFileService;
  let fetchSpy: jest.SpyInstance;
  let mockWebdavClient: {
    putFileContents: jest.Mock;
    getFileContents: jest.Mock;
    createReadStream: jest.Mock;
    getDirectoryContents: jest.Mock;
    createDirectory: jest.Mock;
    moveFile: jest.Mock;
    deleteFile: jest.Mock;
  };

  beforeEach(() => {
    mockWebdavClient = {
      putFileContents: jest.fn().mockResolvedValue(true),
      getFileContents: jest.fn().mockResolvedValue(Buffer.from('content')),
      createReadStream: jest.fn().mockReturnValue({}),
      getDirectoryContents: jest.fn().mockResolvedValue([]),
      createDirectory: jest.fn().mockResolvedValue(undefined),
      moveFile: jest.fn().mockResolvedValue(undefined),
      deleteFile: jest.fn().mockResolvedValue(undefined),
    };
    (createClient as jest.Mock).mockReturnValue(mockWebdavClient);
    service = new NextcloudFileService(
      'https://nc.example.com',
      'user',
      'pass',
      new NextcloudHeaderService(),
    );
    fetchSpy = jest.spyOn(global, 'fetch').mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({}),
    } as unknown as Response);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  it('create() returns an instance without manual dependency injection', () => {
    expect(NextcloudFileService.create('https://nc.example.com', 'user', 'pass')).toBeInstanceOf(
      NextcloudFileService,
    );
  });

  describe('sharePublicly', () => {
    it('returns share URL from response', async () => {
      fetchSpy.mockResolvedValue({
        ok: true,
        json: () =>
          Promise.resolve({ ocs: { data: { url: 'https://nc.example.com/s/share123' } } }),
      } as unknown as Response);

      const url = await service.sharePublicly('/photos/image.jpg');

      expect(url).toBe('https://nc.example.com/s/share123');
    });

    it('posts to shares endpoint', async () => {
      fetchSpy.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ ocs: { data: { url: '' } } }),
      } as unknown as Response);

      await service.sharePublicly('/file.txt');

      expect(fetchSpy).toHaveBeenCalledWith(
        'https://nc.example.com/ocs/v2.php/apps/files_sharing/api/v1/shares',
        expect.objectContaining({ method: 'POST' }),
      );
    });

    it('includes formatted expireDate in request body when provided', async () => {
      fetchSpy.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ ocs: { data: { url: '' } } }),
      } as unknown as Response);

      await service.sharePublicly('/file.txt', new Date('2025-12-31'));

      expect(fetchSpy).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({ body: expect.stringContaining('2025-12-31') }),
      );
    });

    it('throws when response is not ok', async () => {
      fetchSpy.mockResolvedValue({
        ok: false,
        status: 403,
        statusText: 'Forbidden',
      } as unknown as Response);

      await expect(service.sharePublicly('/file.txt')).rejects.toThrow('Failed to share publicly');
    });
  });

  describe('shareWithUser', () => {
    it('returns share URL', async () => {
      fetchSpy.mockResolvedValue({
        ok: true,
        json: () =>
          Promise.resolve({ ocs: { data: { url: 'https://nc.example.com/s/user-share' } } }),
      } as unknown as Response);

      const url = await service.shareWithUser('/file.txt', 'otheruser');

      expect(url).toBe('https://nc.example.com/s/user-share');
    });

    it('includes shareWith username in request body', async () => {
      fetchSpy.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ ocs: { data: { url: '' } } }),
      } as unknown as Response);

      await service.shareWithUser('/file.txt', 'alice');

      expect(fetchSpy).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({ body: expect.stringContaining('alice') }),
      );
    });

    it('throws when response is not ok', async () => {
      fetchSpy.mockResolvedValue({
        ok: false,
        status: 404,
        statusText: 'Not Found',
      } as unknown as Response);

      await expect(service.shareWithUser('/file.txt', 'alice')).rejects.toThrow(
        'Failed to share with user',
      );
    });
  });

  describe('createDirectory', () => {
    it('sends MKCOL request to correct URL and returns true on success', async () => {
      fetchSpy.mockResolvedValue({ ok: true } as unknown as Response);

      const result = await service.createDirectory('new-dir');

      expect(result).toBe(true);
      expect(fetchSpy).toHaveBeenCalledWith(
        'https://nc.example.com/remote.php/webdav/new-dir',
        expect.objectContaining({ method: 'MKCOL' }),
      );
    });

    it('returns false when request fails', async () => {
      fetchSpy.mockResolvedValue({ ok: false } as unknown as Response);

      const result = await service.createDirectory('new-dir');

      expect(result).toBe(false);
    });
  });

  describe('addTagByFileId', () => {
    it('sends PUT request to correct URL and returns true on success', async () => {
      fetchSpy.mockResolvedValue({ ok: true } as unknown as Response);

      const result = await service.addTagByFileId(123, 456);

      expect(result).toBe(true);
      expect(fetchSpy).toHaveBeenCalledWith(
        'https://nc.example.com/remote.php/dav/systemtags-relations/files/123/456',
        expect.objectContaining({ method: 'PUT' }),
      );
    });

    it('returns true for 409 conflict (tag already assigned)', async () => {
      fetchSpy.mockResolvedValue({ ok: false, status: 409 } as unknown as Response);

      const result = await service.addTagByFileId(123, 456);

      expect(result).toBe(true);
    });

    it('throws on unexpected error', async () => {
      fetchSpy.mockResolvedValue({ ok: false, status: 500 } as unknown as Response);

      await expect(service.addTagByFileId(123, 456)).rejects.toThrow('Failed to add tag to file');
    });
  });

  describe('upload', () => {
    it('calls WebDAV putFileContents with correct arguments', async () => {
      const buffer = Buffer.from('data');

      await service.upload('/file.txt', buffer);

      expect(mockWebdavClient.putFileContents).toHaveBeenCalledWith('/file.txt', buffer, {});
    });
  });

  describe('bulkUpload', () => {
    it('uploads all files and returns results', async () => {
      const list = [
        { fileName: 'a.txt', buffer: Buffer.from('a') },
        { fileName: 'b.txt', buffer: Buffer.from('b') },
      ];

      const results = await service.bulkUpload('/uploads', list);

      expect(results).toHaveLength(2);
      expect(mockWebdavClient.putFileContents).toHaveBeenCalledWith(
        '/uploads/a.txt',
        list[0].buffer,
        {},
      );
      expect(mockWebdavClient.putFileContents).toHaveBeenCalledWith(
        '/uploads/b.txt',
        list[1].buffer,
        {},
      );
    });

    it('returns empty array for empty list', async () => {
      const results = await service.bulkUpload('/uploads', []);

      expect(results).toEqual([]);
    });
  });

  describe('download', () => {
    it('returns file buffer from WebDAV', async () => {
      const expectedBuffer = Buffer.from('file content');
      mockWebdavClient.getFileContents.mockResolvedValue(expectedBuffer);

      const result = await service.download('/file.txt');

      expect(result).toBe(expectedBuffer);
      expect(mockWebdavClient.getFileContents).toHaveBeenCalledWith('/file.txt');
    });
  });

  describe('stream', () => {
    it('returns readable stream from WebDAV', () => {
      const mockStream = { pipe: jest.fn() };
      mockWebdavClient.createReadStream.mockReturnValue(mockStream);

      const result = service.stream('/file.txt');

      expect(result).toBe(mockStream);
      expect(mockWebdavClient.createReadStream).toHaveBeenCalledWith('/file.txt');
    });
  });

  describe('countFiles', () => {
    it('returns count of files only, excluding directories', async () => {
      mockWebdavClient.getDirectoryContents.mockResolvedValue([
        { type: 'file', filename: 'a.txt' },
        { type: 'file', filename: 'b.txt' },
        { type: 'directory', filename: 'subdir' },
      ]);

      const count = await service.countFiles('/photos');

      expect(count).toBe(2);
    });

    it('creates directory and retries when not found and createIfNotExisting is true', async () => {
      mockWebdavClient.getDirectoryContents
        .mockRejectedValueOnce(new Error('Not Found'))
        .mockResolvedValueOnce([{ type: 'file', filename: 'a.txt' }]);

      const count = await service.countFiles('/new-dir', true);

      expect(mockWebdavClient.createDirectory).toHaveBeenCalledWith('/new-dir');
      expect(count).toBe(1);
    });

    it('throws when directory not found and createIfNotExisting is false', async () => {
      mockWebdavClient.getDirectoryContents.mockRejectedValue(new Error('Not Found'));

      await expect(service.countFiles('/missing')).rejects.toThrow('Not Found');
    });
  });

  describe('listFilePaths', () => {
    it('returns only file paths, excluding directories', async () => {
      mockWebdavClient.getDirectoryContents.mockResolvedValue([
        { type: 'file', filename: '/photos/a.jpg' },
        { type: 'directory', filename: '/photos/sub' },
        { type: 'file', filename: '/photos/b.jpg' },
      ]);

      const paths = await service.listFilePaths('/photos');

      expect(paths).toEqual(['/photos/a.jpg', '/photos/b.jpg']);
    });
  });

  describe('listFileBasenames', () => {
    it('returns basenames of files', async () => {
      mockWebdavClient.getDirectoryContents.mockResolvedValue([
        { type: 'file', filename: '/photos/a.jpg' },
        { type: 'file', filename: '/photos/b.jpg' },
      ]);

      const basenames = await service.listFileBasenames('/photos');

      expect(basenames).toEqual(['a.jpg', 'b.jpg']);
    });
  });

  describe('moveFile', () => {
    it('calls WebDAV moveFile with source and target paths', async () => {
      await service.moveFile('/old.txt', '/new.txt');

      expect(mockWebdavClient.moveFile).toHaveBeenCalledWith('/old.txt', '/new.txt');
    });
  });

  describe('deleteFile', () => {
    it('calls WebDAV deleteFile with the given path', async () => {
      await service.deleteFile('/docs/note.md');

      expect(mockWebdavClient.deleteFile).toHaveBeenCalledWith('/docs/note.md');
    });

    it('throws when WebDAV deleteFile rejects', async () => {
      mockWebdavClient.deleteFile.mockRejectedValue(new Error('404 Not Found'));

      await expect(service.deleteFile('/docs/missing.md')).rejects.toThrow('404 Not Found');
    });
  });

  describe('createFileFromTemplate', () => {
    it('downloads template and uploads to target path', async () => {
      const templateBuffer = Buffer.from('template content');
      mockWebdavClient.getFileContents.mockResolvedValue(templateBuffer);

      const result = await service.createFileFromTemplate('/target.txt', '/template.txt');

      expect(result).toBe('/target.txt');
      expect(mockWebdavClient.getFileContents).toHaveBeenCalledWith('/template.txt');
      expect(mockWebdavClient.putFileContents).toHaveBeenCalledWith(
        '/target.txt',
        templateBuffer,
        {},
      );
    });
  });

  describe('createFileFromTemplateAndReplace', () => {
    it('applies replacements and uploads to target path', async () => {
      mockWebdavClient.getFileContents.mockResolvedValue(
        Buffer.from('Hello {{NAME}}, welcome to {{PLACE}}!'),
      );

      const result = await service.createFileFromTemplateAndReplace(
        '/target.txt',
        '/template.txt',
        [
          [/\{\{NAME\}\}/, 'World'],
          [/\{\{PLACE\}\}/, 'Berlin'],
        ],
      );

      expect(result).toBe('/target.txt');
      const uploadedBuffer = mockWebdavClient.putFileContents.mock.calls[0][1] as Buffer;
      expect(uploadedBuffer.toString()).toBe('Hello World, welcome to Berlin!');
    });
  });

  describe('appendToFile', () => {
    it('appends line to file ending with newline', async () => {
      mockWebdavClient.getFileContents.mockResolvedValue(Buffer.from('existing\n'));

      await service.appendToFile('/log.txt', 'new line');

      expect(mockWebdavClient.putFileContents).toHaveBeenCalledWith(
        '/log.txt',
        Buffer.from('existing\nnew line\n'),
        {},
      );
    });

    it('inserts newline before line when file does not end with newline', async () => {
      mockWebdavClient.getFileContents.mockResolvedValue(Buffer.from('existing'));

      await service.appendToFile('/log.txt', 'new line');

      expect(mockWebdavClient.putFileContents).toHaveBeenCalledWith(
        '/log.txt',
        Buffer.from('existing\nnew line\n'),
        {},
      );
    });

    it('appends line to empty file', async () => {
      mockWebdavClient.getFileContents.mockResolvedValue(Buffer.from(''));

      await service.appendToFile('/log.txt', 'first line');

      expect(mockWebdavClient.putFileContents).toHaveBeenCalledWith(
        '/log.txt',
        Buffer.from('first line\n'),
        {},
      );
    });

    it('creates file with just the new line when file does not yet exist on NC', async () => {
      mockWebdavClient.getFileContents.mockRejectedValue(new Error('404 Not Found'));

      await service.appendToFile('/log.txt', 'first line');

      expect(mockWebdavClient.putFileContents).toHaveBeenCalledWith(
        '/log.txt',
        Buffer.from('first line\n'),
        {},
      );
    });
  });

  describe('listDirectoryContents', () => {
    it('returns mapped DirectoryEntry objects for all entries', async () => {
      mockWebdavClient.getDirectoryContents.mockResolvedValue([
        {
          filename: '/Photos/image.jpg',
          type: 'file',
          lastmod: 'Thu, 01 Jan 2026 00:00:00 GMT',
          size: 100,
          etag: null,
        },
        {
          filename: '/Photos/sub',
          type: 'directory',
          lastmod: 'Thu, 01 Jan 2026 00:00:00 GMT',
          size: 0,
          etag: null,
        },
      ]);

      const result = await service.listDirectoryContents('/Photos');

      expect(result).toEqual([
        { filename: '/Photos/image.jpg', type: 'file', lastmod: 'Thu, 01 Jan 2026 00:00:00 GMT' },
        { filename: '/Photos/sub', type: 'directory', lastmod: 'Thu, 01 Jan 2026 00:00:00 GMT' },
      ]);
    });

    it('passes deep option to WebDAV client', async () => {
      mockWebdavClient.getDirectoryContents.mockResolvedValue([]);

      await service.listDirectoryContents('/Photos', { deep: true });

      expect(mockWebdavClient.getDirectoryContents).toHaveBeenCalledWith('/Photos', { deep: true });
    });

    it('defaults to non-deep listing', async () => {
      mockWebdavClient.getDirectoryContents.mockResolvedValue([]);

      await service.listDirectoryContents('/Photos');

      expect(mockWebdavClient.getDirectoryContents).toHaveBeenCalledWith('/Photos', {
        deep: false,
      });
    });

    it('returns empty array for empty directory', async () => {
      mockWebdavClient.getDirectoryContents.mockResolvedValue([]);

      const result = await service.listDirectoryContents('/Photos');

      expect(result).toEqual([]);
    });
  });
});
