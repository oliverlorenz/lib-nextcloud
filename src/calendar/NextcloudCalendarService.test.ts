import { NextcloudCalendarService } from './NextcloudCalendarService';
import { NextcloudHeaderService } from '../shared/NextcloudHeaderService';

jest.mock('ical-expander', () => {
  return jest.fn().mockImplementation(() => ({
    all: jest.fn().mockReturnValue({
      events: [{ startDate: { toString: () => '2024-01-15T10:00:00.000Z' }, summary: 'Meeting' }],
      occurrences: [
        {
          startDate: { toString: () => '2024-01-16T10:00:00.000Z' },
          item: { summary: 'Recurring' },
        },
      ],
    }),
    between: jest.fn().mockReturnValue({
      events: [
        { startDate: { toString: () => '2024-01-15T10:00:00.000Z' }, summary: 'Event in range' },
      ],
      occurrences: [],
    }),
  }));
});

describe('NextcloudCalendarService', () => {
  let service: NextcloudCalendarService;
  let fetchSpy: jest.SpyInstance;

  beforeEach(() => {
    service = new NextcloudCalendarService('https://nc.example.com', 'user', 'pass', new NextcloudHeaderService());
    fetchSpy = jest.spyOn(global, 'fetch').mockResolvedValue({
      text: () => Promise.resolve('BEGIN:VCALENDAR\nEND:VCALENDAR'),
    } as unknown as Response);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  it('create() returns an instance without manual dependency injection', () => {
    expect(NextcloudCalendarService.create('https://nc.example.com', 'user', 'pass')).toBeInstanceOf(NextcloudCalendarService);
  });

  describe('getEvents', () => {
    it('fetches from correct URL', async () => {
      await service.getEvents('personal');

      expect(fetchSpy).toHaveBeenCalledWith(
        'https://nc.example.com/remote.php/dav/calendars/user/personal?export',
        expect.any(Object),
      );
    });

    it('returns events and occurrences when no date range given', async () => {
      const events = await service.getEvents('personal');

      expect(events).toHaveLength(2);
      expect(events[0].title).toBe('Meeting');
      expect(events[1].title).toBe('Recurring');
    });

    it('returns only range events when date range given', async () => {
      const events = await service.getEvents('personal', new Date('2024-01-01'), new Date('2024-01-31'));

      expect(events).toHaveLength(1);
      expect(events[0].title).toBe('Event in range');
    });

    it('returns event start dates as Date objects', async () => {
      const events = await service.getEvents('personal');

      expect(events[0].start).toBeInstanceOf(Date);
    });
  });

  describe('isEventInTimeframe', () => {
    it('returns true when event title matches regex', async () => {
      const result = await service.isEventInTimeframe(
        'personal',
        /Event in range/,
        new Date('2024-01-01'),
        new Date('2024-01-31'),
      );

      expect(result).toBe(true);
    });

    it('returns false when event title does not match regex', async () => {
      const result = await service.isEventInTimeframe(
        'personal',
        /No such event/,
        new Date('2024-01-01'),
        new Date('2024-01-31'),
      );

      expect(result).toBe(false);
    });
  });
});
