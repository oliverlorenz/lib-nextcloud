import { NextcloudFileService } from './NextcloudFileService';
import { NextcloudHeaderService } from './NextcloudHeaderService';
import { WebDAVClient, FileStat } from 'webdav';

describe('NextcloudFileService', () => {
  it('countFiles should ignore directories', async () => {
    const headerService = new NextcloudHeaderService();
    const service = new NextcloudFileService(headerService);

    const mockResults: FileStat[] = [
      { type: 'file', filename: '/file1.txt' } as FileStat,
      { type: 'file', filename: '/file2.txt' } as FileStat,
      { type: 'directory', filename: '/subdir' } as FileStat,
    ];

    const mockClient = {
      getDirectoryContents: jest.fn().mockResolvedValue(mockResults),
    } as unknown as WebDAVClient;

    jest
      .spyOn(service as unknown as { getWebDavClient: () => WebDAVClient }, 'getWebDavClient')
      .mockReturnValue(mockClient);

    const count = await service.countFiles('base', 'user', 'pass', '/');

    expect(count).toBe(2);
  });
});

