import { NextcloudTagService } from './NextcloudTagService';
import { NextcloudHeaderService } from '../shared/NextcloudHeaderService';

describe('NextcloudTagService', () => {
  let service: NextcloudTagService;
  let fetchSpy: jest.SpyInstance;

  beforeEach(() => {
    service = new NextcloudTagService(
      'https://nc.example.com',
      'user',
      'pass',
      new NextcloudHeaderService(),
    );
    fetchSpy = jest.spyOn(global, 'fetch').mockResolvedValue({
      ok: true,
      text: () => Promise.resolve(''),
    } as unknown as Response);
    jest.spyOn(console, 'log').mockImplementation();
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  it('create() returns an instance without manual dependency injection', () => {
    expect(NextcloudTagService.create('https://nc.example.com', 'user', 'pass')).toBeInstanceOf(
      NextcloudTagService,
    );
  });

  describe('getTags', () => {
    it('sends PROPFIND request to systemtags endpoint', async () => {
      await service.getTags();

      expect(fetchSpy).toHaveBeenCalledWith(
        'https://nc.example.com/remote.php/dav/systemtags',
        expect.objectContaining({ method: 'PROPFIND' }),
      );
    });

    it('returns true on success', async () => {
      const result = await service.getTags();

      expect(result).toBe(true);
    });

    it('returns true for 409 conflict', async () => {
      fetchSpy.mockResolvedValue({
        ok: false,
        status: 409,
        text: () => Promise.resolve(''),
      } as unknown as Response);

      const result = await service.getTags();

      expect(result).toBe(true);
    });

    it('throws for other error responses', async () => {
      fetchSpy.mockResolvedValue({
        ok: false,
        status: 500,
        text: () => Promise.resolve(''),
      } as unknown as Response);

      await expect(service.getTags()).rejects.toThrow('Failed to get tags');
    });
  });

  describe('createTag', () => {
    it('sends POST request with tag name in body', async () => {
      await service.createTag('important');

      expect(fetchSpy).toHaveBeenCalledWith(
        'https://nc.example.com/remote.php/dav/systemtags',
        expect.objectContaining({
          method: 'POST',
          body: expect.stringContaining('important'),
        }),
      );
    });

    it('returns true on success', async () => {
      const result = await service.createTag('urgent');

      expect(result).toBe(true);
    });

    it('returns true for 409 conflict (tag already exists)', async () => {
      fetchSpy.mockResolvedValue({ ok: false, status: 409 } as unknown as Response);

      const result = await service.createTag('existing');

      expect(result).toBe(true);
    });

    it('throws for other error responses', async () => {
      fetchSpy.mockResolvedValue({ ok: false, status: 500 } as unknown as Response);

      await expect(service.createTag('tag')).rejects.toThrow('Failed to create tag');
    });
  });

  describe('addTagByIdToFileById', () => {
    it('sends PUT request to correct URL', async () => {
      await service.addTagByIdToFileById(10, 20);

      expect(fetchSpy).toHaveBeenCalledWith(
        'https://nc.example.com/remote.php/dav/systemtags-relations/files/20/10',
        expect.objectContaining({ method: 'PUT' }),
      );
    });

    it('returns true on success', async () => {
      const result = await service.addTagByIdToFileById(10, 20);

      expect(result).toBe(true);
    });

    it('returns true for 409 conflict (already tagged)', async () => {
      fetchSpy.mockResolvedValue({ ok: false, status: 409 } as unknown as Response);

      const result = await service.addTagByIdToFileById(10, 20);

      expect(result).toBe(true);
    });

    it('throws for other errors', async () => {
      fetchSpy.mockResolvedValue({ ok: false, status: 403 } as unknown as Response);

      await expect(service.addTagByIdToFileById(10, 20)).rejects.toThrow(
        'Failed to add tag to file',
      );
    });
  });
});
