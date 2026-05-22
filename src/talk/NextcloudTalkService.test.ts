import { NextcloudTalkService } from './NextcloudTalkService';

describe('NextcloudTalkService', () => {
  let service: NextcloudTalkService;
  let fetchSpy: jest.SpyInstance;

  beforeEach(() => {
    service = new NextcloudTalkService('https://nc.example.com', 'user', 'pass');
    fetchSpy = jest.spyOn(global, 'fetch').mockResolvedValue({
      ok: true,
    } as unknown as Response);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  it('create() returns an instance without manual dependency injection', () => {
    expect(NextcloudTalkService.create('https://nc.example.com', 'user', 'pass')).toBeInstanceOf(NextcloudTalkService);
  });

  describe('sendTextMessage', () => {
    it('posts message to correct Talk endpoint', async () => {
      await service.sendTextMessage('my-channel', 'Hello!');

      expect(fetchSpy).toHaveBeenCalledWith(
        'https://nc.example.com/ocs/v2.php/apps/spreed/api/v1/chat/my-channel',
        expect.objectContaining({ method: 'POST' }),
      );
    });

    it('includes message text in request body', async () => {
      await service.sendTextMessage('channel', 'Test message');

      expect(fetchSpy).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({ body: expect.stringContaining('Test message') }),
      );
    });

    it('returns a UUID referenceId', async () => {
      const referenceId = await service.sendTextMessage('channel', 'Hi');

      expect(referenceId).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i);
    });

    it('throws when fetch fails', async () => {
      fetchSpy.mockResolvedValue({ ok: false, statusText: 'Unauthorized' } as unknown as Response);

      await expect(service.sendTextMessage('channel', 'Hi')).rejects.toThrow(
        'Failed to send message: Unauthorized',
      );
    });
  });

  describe('sendFileMessage', () => {
    it('posts to shares endpoint with shareType 10', async () => {
      await service.sendFileMessage('my-channel', '/files/doc.pdf');

      expect(fetchSpy).toHaveBeenCalledWith(
        'https://nc.example.com/ocs/v2.php/apps/files_sharing/api/v1/shares',
        expect.objectContaining({
          method: 'POST',
          body: expect.stringContaining('"shareType":10'),
        }),
      );
    });

    it('includes channel ID as shareWith', async () => {
      await service.sendFileMessage('my-channel', '/doc.pdf');

      expect(fetchSpy).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({ body: expect.stringContaining('my-channel') }),
      );
    });

    it('returns a UUID referenceId', async () => {
      const referenceId = await service.sendFileMessage('channel', '/doc.pdf');

      expect(referenceId).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i);
    });

    it('throws when fetch fails', async () => {
      fetchSpy.mockResolvedValue({
        ok: false,
        statusText: 'Forbidden',
        json: () => Promise.resolve({ message: 'Access denied' }),
      } as unknown as Response);

      await expect(service.sendFileMessage('channel', '/file.pdf')).rejects.toThrow(
        'Failed to send file',
      );
    });
  });

  describe('sendPollMessage', () => {
    it('posts poll to correct Talk endpoint', async () => {
      await service.sendPollMessage('channel-token', 'Vote?', ['Yes', 'No']);

      expect(fetchSpy).toHaveBeenCalledWith(
        'https://nc.example.com/ocs/v2.php/apps/spreed/api/v1/poll/channel-token',
        expect.objectContaining({ method: 'POST' }),
      );
    });

    it('uses default maxVotes of 1', async () => {
      await service.sendPollMessage('channel', 'Q?', ['A', 'B']);

      expect(fetchSpy).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({ body: expect.stringContaining('"maxVotes":1') }),
      );
    });

    it('sends custom maxVotes when specified', async () => {
      await service.sendPollMessage('channel', 'Q?', ['A', 'B', 'C'], 3);

      expect(fetchSpy).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({ body: expect.stringContaining('"maxVotes":3') }),
      );
    });

    it('throws when fetch fails', async () => {
      fetchSpy.mockResolvedValue({
        ok: false,
        statusText: 'Internal Server Error',
        json: () => Promise.resolve({}),
      } as unknown as Response);

      await expect(service.sendPollMessage('channel', 'Q?', ['A'])).rejects.toThrow(
        'Failed to send poll',
      );
    });
  });
});
