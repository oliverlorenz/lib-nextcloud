import { NextcloudCalendarService } from './NextcloudCalendarService';
import { NextcloudHeaderService } from '../shared/NextcloudHeaderService';

jest.mock('ical-expander', () => {
  return jest.fn().mockImplementation(() => ({
    all: jest.fn().mockReturnValue({
      events: [
        {
          uid: 'uid-meeting',
          startDate: { toString: (): string => '2024-01-15T10:00:00.000Z' },
          endDate: { toString: (): string => '2024-01-15T11:00:00.000Z' },
          summary: 'Meeting',
        },
      ],
      occurrences: [
        {
          startDate: { toString: (): string => '2024-01-16T10:00:00.000Z' },
          endDate: { toString: (): string => '2024-01-16T11:00:00.000Z' },
          item: { uid: 'uid-recurring', summary: 'Recurring' },
        },
      ],
    }),
    between: jest.fn().mockReturnValue({
      events: [
        {
          uid: 'uid-in-range',
          startDate: { toString: (): string => '2024-01-15T10:00:00.000Z' },
          endDate: { toString: (): string => '2024-01-15T11:00:00.000Z' },
          summary: 'Event in range',
        },
      ],
      occurrences: [],
    }),
  }));
});

const PROPFIND_RESPONSE = `<?xml version="1.0"?>
<d:multistatus xmlns:d="DAV:" xmlns:cal="urn:ietf:params:xml:ns:caldav">
  <d:response>
    <d:href>/remote.php/dav/calendars/user/</d:href>
    <d:propstat>
      <d:prop><d:displayname>user</d:displayname><d:resourcetype><d:collection/></d:resourcetype></d:prop>
      <d:status>HTTP/1.1 200 OK</d:status>
    </d:propstat>
  </d:response>
  <d:response>
    <d:href>/remote.php/dav/calendars/user/personal/</d:href>
    <d:propstat>
      <d:prop><d:displayname>Personal</d:displayname><d:resourcetype><d:collection/><cal:calendar/></d:resourcetype></d:prop>
      <d:status>HTTP/1.1 200 OK</d:status>
    </d:propstat>
  </d:response>
  <d:response>
    <d:href>/remote.php/dav/calendars/user/work/</d:href>
    <d:propstat>
      <d:prop><d:displayname>Work</d:displayname><d:resourcetype><d:collection/><cal:calendar/></d:resourcetype></d:prop>
      <d:status>HTTP/1.1 200 OK</d:status>
    </d:propstat>
  </d:response>
</d:multistatus>`;

describe('NextcloudCalendarService', () => {
  let service: NextcloudCalendarService;
  let fetchSpy: jest.SpyInstance;

  beforeEach(() => {
    service = new NextcloudCalendarService(
      'https://nc.example.com',
      'user',
      'pass',
      new NextcloudHeaderService(),
    );
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
    expect(
      NextcloudCalendarService.create('https://nc.example.com', 'user', 'pass'),
    ).toBeInstanceOf(NextcloudCalendarService);
  });

  describe('getCalendars', () => {
    beforeEach(() => {
      fetchSpy.mockResolvedValue({
        text: () => Promise.resolve(PROPFIND_RESPONSE),
      } as unknown as Response);
    });

    it('makes a PROPFIND request with Depth 1 to the calendars URL', async () => {
      await service.getCalendars();

      expect(fetchSpy).toHaveBeenCalledWith(
        'https://nc.example.com/remote.php/dav/calendars/user/',
        expect.objectContaining({ method: 'PROPFIND' }),
      );
      const headers: Headers = (fetchSpy.mock.calls[0] as [string, { headers: Headers }])[1].headers;
      expect(headers.get('Depth')).toBe('1');
    });

    it('returns all calendars excluding the root collection', async () => {
      const calendars = await service.getCalendars();

      expect(calendars).toHaveLength(2);
    });

    it('returns correct name and displayName for each calendar', async () => {
      const calendars = await service.getCalendars();

      expect(calendars[0]).toEqual({ name: 'personal', displayName: 'Personal' });
      expect(calendars[1]).toEqual({ name: 'work', displayName: 'Work' });
    });

    it('falls back to the slug as displayName when displayname element is absent', async () => {
      fetchSpy.mockResolvedValue({
        text: () =>
          Promise.resolve(
            `<?xml version="1.0"?><d:multistatus xmlns:d="DAV:"><d:response><d:href>/remote.php/dav/calendars/user/</d:href><d:propstat><d:prop></d:prop></d:propstat></d:response><d:response><d:href>/remote.php/dav/calendars/user/personal/</d:href><d:propstat><d:prop></d:prop></d:propstat></d:response></d:multistatus>`,
          ),
      } as unknown as Response);

      const calendars = await service.getCalendars();

      expect(calendars).toHaveLength(1);
      expect(calendars[0]).toEqual({ name: 'personal', displayName: 'personal' });
    });

    it('returns empty array when no calendars are present', async () => {
      fetchSpy.mockResolvedValue({
        text: () =>
          Promise.resolve(
            `<?xml version="1.0"?><d:multistatus xmlns:d="DAV:"><d:response><d:href>/remote.php/dav/calendars/user/</d:href><d:propstat><d:prop><d:displayname>user</d:displayname></d:prop></d:propstat></d:response></d:multistatus>`,
          ),
      } as unknown as Response);

      const calendars = await service.getCalendars();

      expect(calendars).toEqual([]);
    });
  });

  describe('searchEvents', () => {
    const REPORT_RESPONSE = `<?xml version="1.0"?>
<d:multistatus xmlns:d="DAV:" xmlns:cal="urn:ietf:params:xml:ns:caldav">
  <d:response>
    <d:href>/remote.php/dav/calendars/user/personal/uid-meeting.ics</d:href>
    <d:propstat>
      <d:prop>
        <cal:calendar-data>BEGIN:VCALENDAR
BEGIN:VEVENT
UID:uid-meeting
SUMMARY:Team Meeting
END:VEVENT
END:VCALENDAR</cal:calendar-data>
      </d:prop>
    </d:propstat>
  </d:response>
</d:multistatus>`;

    beforeEach(() => {
      fetchSpy.mockResolvedValue({
        text: () => Promise.resolve(REPORT_RESPONSE),
      } as unknown as Response);
    });

    it('makes a REPORT request with Depth 1 to the correct URL', async () => {
      await service.searchEvents('personal', 'Meeting');

      expect(fetchSpy).toHaveBeenCalledWith(
        'https://nc.example.com/remote.php/dav/calendars/user/personal/',
        expect.objectContaining({ method: 'REPORT' }),
      );
      const headers: Headers = (fetchSpy.mock.calls[0] as [string, { headers: Headers }])[1].headers;
      expect(headers.get('Depth')).toBe('1');
    });

    it('includes the query in the REPORT body as a text-match', async () => {
      await service.searchEvents('personal', 'Meeting');

      const body: string = (fetchSpy.mock.calls[0] as [string, { body: string }])[1].body;
      expect(body).toContain('<c:text-match');
      expect(body).toContain('Meeting');
    });

    it('XML-escapes special characters in the query', async () => {
      await service.searchEvents('personal', '<Besprechung & Co>');

      const body: string = (fetchSpy.mock.calls[0] as [string, { body: string }])[1].body;
      expect(body).toContain('&lt;Besprechung &amp; Co&gt;');
      expect(body).not.toContain('<Besprechung');
    });

    it('returns events parsed from the calendar-data in the response', async () => {
      const icalExpanderMock = require('ical-expander');
      icalExpanderMock.mockImplementationOnce(() => ({
        all: jest.fn().mockReturnValue({
          events: [{ uid: 'uid-meeting', startDate: { toString: (): string => '2024-01-15T10:00:00.000Z' }, endDate: { toString: (): string => '2024-01-15T11:00:00.000Z' }, summary: 'Meeting' }],
          occurrences: [],
        }),
      }));

      const events = await service.searchEvents('personal', 'Meeting');

      expect(events).toHaveLength(1);
      expect(events[0].uid).toBe('uid-meeting');
      expect(events[0].title).toBe('Meeting');
    });

    it('returns occurrences parsed from the calendar-data in the response', async () => {
      const icalExpanderMock = require('ical-expander');
      icalExpanderMock.mockImplementationOnce(() => ({
        all: jest.fn().mockReturnValue({
          events: [],
          occurrences: [
            {
              startDate: { toString: (): string => '2024-01-16T10:00:00.000Z' },
              endDate: { toString: (): string => '2024-01-16T11:00:00.000Z' },
              item: { uid: 'uid-recurring', summary: 'Recurring' },
            },
          ],
        }),
      }));

      const events = await service.searchEvents('personal', 'Recurring');

      expect(events).toHaveLength(1);
      expect(events[0].uid).toBe('uid-recurring');
    });

    it('returns an empty array when no events match', async () => {
      fetchSpy.mockResolvedValue({
        text: () =>
          Promise.resolve(
            '<?xml version="1.0"?><d:multistatus xmlns:d="DAV:"></d:multistatus>',
          ),
      } as unknown as Response);

      const events = await service.searchEvents('personal', 'nonexistent');

      expect(events).toEqual([]);
    });
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

    it('returns uid for events and occurrences', async () => {
      const events = await service.getEvents('personal');

      expect(events[0].uid).toBe('uid-meeting');
      expect(events[1].uid).toBe('uid-recurring');
    });

    it('returns end dates as Date objects for events and occurrences', async () => {
      const events = await service.getEvents('personal');

      expect(events[0].end).toEqual(new Date('2024-01-15T11:00:00.000Z'));
      expect(events[1].end).toEqual(new Date('2024-01-16T11:00:00.000Z'));
    });

    it('returns only range events when date range given', async () => {
      const events = await service.getEvents(
        'personal',
        new Date('2024-01-01'),
        new Date('2024-01-31'),
      );

      expect(events).toHaveLength(1);
      expect(events[0].title).toBe('Event in range');
    });

    it('returns uid for range events', async () => {
      const events = await service.getEvents(
        'personal',
        new Date('2024-01-01'),
        new Date('2024-01-31'),
      );

      expect(events[0].uid).toBe('uid-in-range');
    });

    it('returns event start dates as Date objects', async () => {
      const events = await service.getEvents('personal');

      expect(events[0].start).toBeInstanceOf(Date);
    });
  });

  describe('getEvent', () => {
    beforeEach(() => {
      fetchSpy.mockResolvedValue({
        status: 200,
        text: () => Promise.resolve('BEGIN:VCALENDAR\nEND:VCALENDAR'),
      } as unknown as Response);
    });

    it('fetches from the correct single-event URL', async () => {
      await service.getEvent('personal', 'uid-meeting');

      expect(fetchSpy).toHaveBeenCalledWith(
        'https://nc.example.com/remote.php/dav/calendars/user/personal/uid-meeting.ics',
        expect.any(Object),
      );
    });

    it('returns the event when found as a regular event', async () => {
      const event = await service.getEvent('personal', 'uid-meeting');

      expect(event).toEqual({
        uid: 'uid-meeting',
        start: new Date('2024-01-15T10:00:00.000Z'),
        end: new Date('2024-01-15T11:00:00.000Z'),
        title: 'Meeting',
      });
    });

    it('returns the event when found as an occurrence', async () => {
      const icalExpanderMock = require('ical-expander');
      icalExpanderMock.mockImplementationOnce(() => ({
        all: jest.fn().mockReturnValue({
          events: [],
          occurrences: [
            {
              startDate: { toString: (): string => '2024-01-16T10:00:00.000Z' },
              endDate: { toString: (): string => '2024-01-16T11:00:00.000Z' },
              item: { uid: 'uid-recurring', summary: 'Recurring' },
            },
          ],
        }),
      }));

      const event = await service.getEvent('personal', 'uid-recurring');

      expect(event).toEqual({
        uid: 'uid-recurring',
        start: new Date('2024-01-16T10:00:00.000Z'),
        end: new Date('2024-01-16T11:00:00.000Z'),
        title: 'Recurring',
      });
    });

    it('returns undefined when the server responds with 404', async () => {
      fetchSpy.mockResolvedValue({ status: 404 } as unknown as Response);

      const event = await service.getEvent('personal', 'nonexistent-uid');

      expect(event).toBeUndefined();
    });

    it('returns undefined when the ICS contains no events or occurrences', async () => {
      const icalExpanderMock = require('ical-expander');
      icalExpanderMock.mockImplementationOnce(() => ({
        all: jest.fn().mockReturnValue({ events: [], occurrences: [] }),
      }));

      const event = await service.getEvent('personal', 'empty-uid');

      expect(event).toBeUndefined();
    });
  });

  describe('getEventsByUids', () => {
    it('returns all found events', async () => {
      const icalExpanderMock = require('ical-expander');
      icalExpanderMock
        .mockImplementationOnce(() => ({
          all: jest.fn().mockReturnValue({
            events: [{ uid: 'uid-meeting', startDate: { toString: (): string => '2024-01-15T10:00:00.000Z' }, endDate: { toString: (): string => '2024-01-15T11:00:00.000Z' }, summary: 'Meeting' }],
            occurrences: [],
          }),
        }))
        .mockImplementationOnce(() => ({
          all: jest.fn().mockReturnValue({
            events: [{ uid: 'uid-in-range', startDate: { toString: (): string => '2024-01-15T10:00:00.000Z' }, endDate: { toString: (): string => '2024-01-15T11:00:00.000Z' }, summary: 'Event in range' }],
            occurrences: [],
          }),
        }));

      const events = await service.getEventsByUids('personal', ['uid-meeting', 'uid-in-range']);

      expect(events).toHaveLength(2);
      expect(events.map((e) => e.uid)).toEqual(['uid-meeting', 'uid-in-range']);
    });

    it('skips UIDs that return 404', async () => {
      fetchSpy
        .mockResolvedValueOnce({
          status: 200,
          text: () => Promise.resolve('BEGIN:VCALENDAR\nEND:VCALENDAR'),
        } as unknown as Response)
        .mockResolvedValueOnce({ status: 404 } as unknown as Response);

      const events = await service.getEventsByUids('personal', ['uid-meeting', 'nonexistent']);

      expect(events).toHaveLength(1);
      expect(events[0].uid).toBe('uid-meeting');
    });

    it('returns an empty array when all UIDs return 404', async () => {
      fetchSpy.mockResolvedValue({ status: 404 } as unknown as Response);

      const events = await service.getEventsByUids('personal', ['a', 'b']);

      expect(events).toEqual([]);
    });

    it('returns an empty array for an empty UIDs list', async () => {
      const events = await service.getEventsByUids('personal', []);

      expect(events).toEqual([]);
      expect(fetchSpy).not.toHaveBeenCalled();
    });
  });

  describe('getEventOrFail', () => {
    it('returns the event when found', async () => {
      const event = await service.getEventOrFail('personal', 'uid-meeting');

      expect(event.uid).toBe('uid-meeting');
    });

    it('throws when the event is not found', async () => {
      fetchSpy.mockResolvedValue({ status: 404 } as unknown as Response);

      await expect(service.getEventOrFail('personal', 'nonexistent-uid')).rejects.toThrow(
        'Event not found: nonexistent-uid',
      );
    });
  });

  describe('createEvent', () => {
    beforeEach(() => {
      fetchSpy.mockResolvedValue({ ok: true } as unknown as Response);
      jest.spyOn(crypto, 'randomUUID').mockReturnValue('test-uid-1234' as ReturnType<typeof crypto.randomUUID>);
    });

    it('makes a PUT request to the correct CalDAV URL', async () => {
      await service.createEvent('personal', 'Team Standup', new Date('2024-03-01T09:00:00Z'), new Date('2024-03-01T09:30:00Z'));

      expect(fetchSpy).toHaveBeenCalledWith(
        'https://nc.example.com/remote.php/dav/calendars/user/personal/test-uid-1234.ics',
        expect.objectContaining({ method: 'PUT' }),
      );
    });

    it('sends Content-Type text/calendar header', async () => {
      await service.createEvent('personal', 'Team Standup', new Date('2024-03-01T09:00:00Z'), new Date('2024-03-01T09:30:00Z'));

      const headers: Headers = (fetchSpy.mock.calls[0] as [string, { headers: Headers }])[1].headers;
      expect(headers.get('Content-Type')).toBe('text/calendar; charset=utf-8');
    });

    it('sends ICS body with correct SUMMARY, DTSTART, DTEND, and UID', async () => {
      await service.createEvent('personal', 'Team Standup', new Date('2024-03-01T09:00:00Z'), new Date('2024-03-01T09:30:00Z'));

      const body: string = (fetchSpy.mock.calls[0] as [string, { body: string }])[1].body;
      expect(body).toContain('SUMMARY:Team Standup');
      expect(body).toContain('DTSTART:20240301T090000Z');
      expect(body).toContain('DTEND:20240301T093000Z');
      expect(body).toContain('UID:test-uid-1234');
    });

    it('wraps event in valid VCALENDAR and VEVENT blocks', async () => {
      await service.createEvent('personal', 'Meeting', new Date('2024-03-01T10:00:00Z'), new Date('2024-03-01T11:00:00Z'));

      const body: string = (fetchSpy.mock.calls[0] as [string, { body: string }])[1].body;
      expect(body).toContain('BEGIN:VCALENDAR');
      expect(body).toContain('END:VCALENDAR');
      expect(body).toContain('BEGIN:VEVENT');
      expect(body).toContain('END:VEVENT');
    });
  });

  describe('updateEvent', () => {
    beforeEach(() => {
      fetchSpy.mockResolvedValue({ ok: true } as unknown as Response);
    });

    it('makes a PUT request to the correct URL with the given UID', async () => {
      await service.updateEvent('personal', 'existing-uid', 'Updated Title', new Date('2024-03-01T09:00:00Z'), new Date('2024-03-01T09:30:00Z'));

      expect(fetchSpy).toHaveBeenCalledWith(
        'https://nc.example.com/remote.php/dav/calendars/user/personal/existing-uid.ics',
        expect.objectContaining({ method: 'PUT' }),
      );
    });

    it('sends ICS body with updated SUMMARY, DTSTART, and DTEND', async () => {
      await service.updateEvent('personal', 'existing-uid', 'Updated Title', new Date('2024-06-01T14:00:00Z'), new Date('2024-06-01T15:00:00Z'));

      const body: string = (fetchSpy.mock.calls[0] as [string, { body: string }])[1].body;
      expect(body).toContain('SUMMARY:Updated Title');
      expect(body).toContain('DTSTART:20240601T140000Z');
      expect(body).toContain('DTEND:20240601T150000Z');
      expect(body).toContain('UID:existing-uid');
    });

    it('sends Content-Type text/calendar header', async () => {
      await service.updateEvent('personal', 'existing-uid', 'Title', new Date('2024-03-01T09:00:00Z'), new Date('2024-03-01T09:30:00Z'));

      const headers: Headers = (fetchSpy.mock.calls[0] as [string, { headers: Headers }])[1].headers;
      expect(headers.get('Content-Type')).toBe('text/calendar; charset=utf-8');
    });
  });

  describe('deleteEvent', () => {
    beforeEach(() => {
      fetchSpy.mockResolvedValue({ ok: true } as unknown as Response);
    });

    it('makes a DELETE request to the correct URL', async () => {
      await service.deleteEvent('personal', 'uid-to-delete');

      expect(fetchSpy).toHaveBeenCalledWith(
        'https://nc.example.com/remote.php/dav/calendars/user/personal/uid-to-delete.ics',
        expect.objectContaining({ method: 'DELETE' }),
      );
    });

    it('sends auth headers', async () => {
      await service.deleteEvent('personal', 'uid-to-delete');

      const headers: Headers = (fetchSpy.mock.calls[0] as [string, { headers: Headers }])[1].headers;
      expect(headers.get('Authorization')).not.toBeNull();
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
