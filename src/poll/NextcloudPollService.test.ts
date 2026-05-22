import { NextcloudPollService } from './NextcloudPollService';
import { NextcloudPollAccess, NextcloudPollShowResults } from './NextcloudPollTypes';

describe('NextcloudPollService', () => {
  let service: NextcloudPollService;
  let fetchSpy: jest.SpyInstance;

  beforeEach(() => {
    service = new NextcloudPollService('https://nc.example.com', 'user', 'pass');
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  it('create() returns an instance without manual dependency injection', () => {
    expect(NextcloudPollService.create('https://nc.example.com', 'user', 'pass')).toBeInstanceOf(
      NextcloudPollService,
    );
  });

  describe('createTextPoll', () => {
    const okJson = (data: unknown): Response =>
      ({ ok: true, json: (): Promise<unknown> => Promise.resolve(data) }) as unknown as Response;

    it('creates poll with options and returns share URL', async () => {
      fetchSpy = jest
        .spyOn(global, 'fetch')
        .mockResolvedValueOnce(okJson({ poll: { id: '42' } }))
        .mockResolvedValueOnce(okJson({}))
        .mockResolvedValueOnce(okJson({}))
        .mockResolvedValueOnce(okJson({}))
        .mockResolvedValueOnce(okJson({}))
        .mockResolvedValueOnce(okJson({ shares: [{ URL: 'https://nc.example.com/s/abc123' }] }));

      const url = await service.createTextPoll('Best option?', ['Option A', 'Option B'], {
        access: NextcloudPollAccess.OPEN,
        showResults: NextcloudPollShowResults.ALWAYS,
      });

      expect(url).toBe('https://nc.example.com/s/abc123');
    });

    it('posts to poll creation endpoint', async () => {
      fetchSpy = jest
        .spyOn(global, 'fetch')
        .mockResolvedValueOnce(okJson({ poll: { id: '1' } }))
        .mockResolvedValue(okJson({ shares: [{ URL: 'https://url' }] }));

      await service.createTextPoll('Title', ['A'], {
        access: NextcloudPollAccess.OPEN,
        showResults: NextcloudPollShowResults.ALWAYS,
      });

      expect(fetchSpy).toHaveBeenCalledWith(
        'https://nc.example.com/index.php/apps/polls/api/v1.0/poll',
        expect.objectContaining({ method: 'POST' }),
      );
    });

    it('posts one request per option', async () => {
      fetchSpy = jest
        .spyOn(global, 'fetch')
        .mockResolvedValueOnce(okJson({ poll: { id: '1' } }))
        .mockResolvedValue(okJson({ shares: [{ URL: 'https://url' }] }));

      await service.createTextPoll('Title', ['A', 'B', 'C'], {
        access: NextcloudPollAccess.OPEN,
        showResults: NextcloudPollShowResults.ALWAYS,
      });

      const optionCalls = fetchSpy.mock.calls.filter(([url]) =>
        (url as string).includes('/option'),
      );
      expect(optionCalls).toHaveLength(3);
    });

    it('throws when poll creation fails', async () => {
      fetchSpy = jest
        .spyOn(global, 'fetch')
        .mockResolvedValue({
          ok: false,
          status: 500,
          statusText: 'Internal Server Error',
        } as unknown as Response);

      await expect(
        service.createTextPoll('Title', ['A'], {
          access: NextcloudPollAccess.OPEN,
          showResults: NextcloudPollShowResults.ALWAYS,
        }),
      ).rejects.toThrow('Failed to create poll');
    });

    it('throws when adding a poll option fails', async () => {
      fetchSpy = jest
        .spyOn(global, 'fetch')
        .mockResolvedValueOnce(okJson({ poll: { id: '1' } }))
        .mockResolvedValueOnce(okJson({}))
        .mockResolvedValueOnce({
          ok: false,
          status: 422,
          statusText: 'Unprocessable Entity',
        } as unknown as Response);

      await expect(
        service.createTextPoll('Title', ['A', 'B'], {
          access: NextcloudPollAccess.OPEN,
          showResults: NextcloudPollShowResults.ALWAYS,
        }),
      ).rejects.toThrow('Failed to add poll option');
    });
  });
});
