import { NextcloudHeaderService } from '../shared/NextcloudHeaderService';

const icalExpander = require('ical-expander');

export class NextcloudCalendarService {
  public static create(
    ncBasePath: string,
    ncUsername: string,
    ncAppPassword: string,
  ): NextcloudCalendarService {
    return new NextcloudCalendarService(
      ncBasePath,
      ncUsername,
      ncAppPassword,
      new NextcloudHeaderService(),
    );
  }

  constructor(
    private ncBasePath: string,
    private ncUsername: string,
    private ncAppPassword: string,
    private nextcloudCommonService: NextcloudHeaderService,
  ) {}

  public async getCalendars(): Promise<{ name: string; displayName: string }[]> {
    const headers = this.nextcloudCommonService.getHeaders(this.ncUsername, this.ncAppPassword);
    headers.append('Depth', '1');
    headers.append('Content-Type', 'application/xml; charset=utf-8');

    const response = await fetch(
      `${this.ncBasePath}/remote.php/dav/calendars/${this.ncUsername}/`,
      {
        method: 'PROPFIND',
        headers,
        body: '<?xml version="1.0" encoding="UTF-8"?><d:propfind xmlns:d="DAV:" xmlns:cal="urn:ietf:params:xml:ns:caldav"><d:prop><d:resourcetype/><d:displayname/></d:prop></d:propfind>',
      },
    );

    const xml = await response.text();
    return this.parseCalendarsFromXml(xml);
  }

  public async getEvents(
    calendarName: string,
    start?: Date,
    end?: Date,
  ): Promise<{ uid: string; start: Date; end: Date; title: string }[]> {
    const response = await fetch(
      `${this.ncBasePath}/remote.php/dav/calendars/${this.ncUsername}/${calendarName}?export`,
      {
        headers: this.nextcloudCommonService.getHeaders(this.ncUsername, this.ncAppPassword),
      },
    );
    const ics = await response.text();
    const expander = new icalExpander({ ics, maxIterations: 100 });

    let events: {
      events: { uid: string; startDate: Date; endDate: Date; summary: string }[];
      occurrences: { startDate: Date; endDate: Date; item: { uid: string; summary: string } }[];
    };

    if (!start && !end) {
      events = expander.all();
    } else {
      events = expander.between(start, end);
    }

    const mappedEvents = events.events.map((event) => ({
      uid: event.uid,
      start: new Date(event.startDate.toString()),
      end: new Date(event.endDate.toString()),
      title: event.summary,
    }));

    const mappedOccurrences = events.occurrences.map((occurrence) => ({
      uid: occurrence.item.uid,
      start: new Date(occurrence.startDate.toString()),
      end: new Date(occurrence.endDate.toString()),
      title: occurrence.item.summary,
    }));

    return mappedEvents.concat(mappedOccurrences);
  }

  public async getEvent(
    calendarName: string,
    uid: string,
  ): Promise<{ uid: string; start: Date; end: Date; title: string } | undefined> {
    const response = await fetch(
      `${this.ncBasePath}/remote.php/dav/calendars/${this.ncUsername}/${calendarName}/${uid}.ics`,
      {
        headers: this.nextcloudCommonService.getHeaders(this.ncUsername, this.ncAppPassword),
      },
    );

    if (response.status === 404) {
      return undefined;
    }

    const ics = await response.text();
    const expander = new icalExpander({ ics, maxIterations: 100 });
    const { events, occurrences } = expander.all() as {
      events: { uid: string; startDate: Date; endDate: Date; summary: string }[];
      occurrences: { startDate: Date; endDate: Date; item: { uid: string; summary: string } }[];
    };

    const event = events[0];
    if (event !== undefined) {
      return {
        uid: event.uid,
        start: new Date(event.startDate.toString()),
        end: new Date(event.endDate.toString()),
        title: event.summary,
      };
    }

    const occurrence = occurrences[0];
    if (occurrence !== undefined) {
      return {
        uid: occurrence.item.uid,
        start: new Date(occurrence.startDate.toString()),
        end: new Date(occurrence.endDate.toString()),
        title: occurrence.item.summary,
      };
    }

    return undefined;
  }

  public async getEventOrFail(
    calendarName: string,
    uid: string,
  ): Promise<{ uid: string; start: Date; end: Date; title: string }> {
    const result = await this.getEvent(calendarName, uid);
    if (result === undefined) {
      throw new Error(`Event not found: ${uid}`);
    }
    return result;
  }

  public async getEventsByUids(
    calendarName: string,
    uids: string[],
  ): Promise<{ uid: string; start: Date; end: Date; title: string }[]> {
    const results = await Promise.all(uids.map((uid) => this.getEvent(calendarName, uid)));
    return results.filter((event) => event !== undefined);
  }

  public async searchEvents(
    calendarName: string,
    query: string,
  ): Promise<{ uid: string; start: Date; end: Date; title: string }[]> {
    const headers = this.nextcloudCommonService.getHeaders(this.ncUsername, this.ncAppPassword);
    headers.append('Content-Type', 'application/xml; charset=utf-8');
    headers.append('Depth', '1');

    const response = await fetch(
      `${this.ncBasePath}/remote.php/dav/calendars/${this.ncUsername}/${calendarName}/`,
      {
        method: 'REPORT',
        headers,
        body: `<?xml version="1.0" encoding="UTF-8"?><c:calendar-query xmlns:d="DAV:" xmlns:c="urn:ietf:params:xml:ns:caldav"><d:prop><c:calendar-data/></d:prop><c:filter><c:comp-filter name="VCALENDAR"><c:comp-filter name="VEVENT"><c:prop-filter name="SUMMARY"><c:text-match collation="i;unicode-casemap">${this.escapeXml(query)}</c:text-match></c:prop-filter></c:comp-filter></c:comp-filter></c:filter></c:calendar-query>`,
      },
    );

    const xml = await response.text();
    return this.parseEventsFromReportXml(xml);
  }

  public async isEventInTimeframe(
    calendarName: string,
    eventTitle: RegExp,
    start: Date,
    end: Date,
  ): Promise<boolean> {
    const allEvents = await this.getEvents(calendarName, start, end);
    return allEvents.some((event) => eventTitle.test(event.title));
  }

  public async createEvent(
    calendarName: string,
    title: string,
    start: Date,
    end: Date,
  ): Promise<void> {
    const uid = crypto.randomUUID();
    const headers = this.nextcloudCommonService.getHeaders(this.ncUsername, this.ncAppPassword);
    headers.append('Content-Type', 'text/calendar; charset=utf-8');

    await fetch(
      `${this.ncBasePath}/remote.php/dav/calendars/${this.ncUsername}/${calendarName}/${uid}.ics`,
      {
        method: 'PUT',
        headers,
        body: this.buildIcs(uid, title, start, end),
      },
    );
  }

  public async updateEvent(
    calendarName: string,
    uid: string,
    title: string,
    start: Date,
    end: Date,
  ): Promise<void> {
    const headers = this.nextcloudCommonService.getHeaders(this.ncUsername, this.ncAppPassword);
    headers.append('Content-Type', 'text/calendar; charset=utf-8');

    await fetch(
      `${this.ncBasePath}/remote.php/dav/calendars/${this.ncUsername}/${calendarName}/${uid}.ics`,
      {
        method: 'PUT',
        headers,
        body: this.buildIcs(uid, title, start, end),
      },
    );
  }

  public async deleteEvent(calendarName: string, uid: string): Promise<void> {
    await fetch(
      `${this.ncBasePath}/remote.php/dav/calendars/${this.ncUsername}/${calendarName}/${uid}.ics`,
      {
        method: 'DELETE',
        headers: this.nextcloudCommonService.getHeaders(this.ncUsername, this.ncAppPassword),
      },
    );
  }

  private parseEventsFromReportXml(xml: string): { uid: string; start: Date; end: Date; title: string }[] {
    const results: { uid: string; start: Date; end: Date; title: string }[] = [];
    const blockPattern = /<d:response>([\s\S]*?)<\/d:response>/g;
    let match: RegExpExecArray | null;

    while ((match = blockPattern.exec(xml)) !== null) {
      const block = match[1];
      const icsMatch = /<(?:\w+:)?calendar-data[^>]*>([\s\S]*?)<\/(?:\w+:)?calendar-data>/.exec(block);
      if (icsMatch === null) continue;

      const ics = icsMatch[1].trim();
      const expander = new icalExpander({ ics, maxIterations: 100 });
      const { events, occurrences } = expander.all() as {
        events: { uid: string; startDate: Date; endDate: Date; summary: string }[];
        occurrences: { startDate: Date; endDate: Date; item: { uid: string; summary: string } }[];
      };

      for (const event of events) {
        results.push({
          uid: event.uid,
          start: new Date(event.startDate.toString()),
          end: new Date(event.endDate.toString()),
          title: event.summary,
        });
      }

      for (const occurrence of occurrences) {
        results.push({
          uid: occurrence.item.uid,
          start: new Date(occurrence.startDate.toString()),
          end: new Date(occurrence.endDate.toString()),
          title: occurrence.item.summary,
        });
      }
    }

    return results;
  }

  private escapeXml(value: string): string {
    return value
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&apos;');
  }

  private parseCalendarsFromXml(xml: string): { name: string; displayName: string }[] {
    const rootHref = `/remote.php/dav/calendars/${this.ncUsername}/`;
    const results: { name: string; displayName: string }[] = [];
    const blockPattern = /<d:response>([\s\S]*?)<\/d:response>/g;
    let match: RegExpExecArray | null;

    while ((match = blockPattern.exec(xml)) !== null) {
      const block = match[1];
      const hrefMatch = /<d:href>([^<]+)<\/d:href>/.exec(block);
      if (hrefMatch === null) continue;

      const href = hrefMatch[1].trim();
      if (href === rootHref) continue;

      const name = href.replace(/\/$/, '').split('/').pop();
      if (name === undefined || name === '') continue;

      const displayNameMatch = /<d:displayname>([^<]*)<\/d:displayname>/.exec(block);
      const displayName = displayNameMatch !== null ? displayNameMatch[1] : name;

      results.push({ name, displayName });
    }

    return results;
  }

  private buildIcs(uid: string, title: string, start: Date, end: Date): string {
    return [
      'BEGIN:VCALENDAR',
      'VERSION:2.0',
      'PRODID:-//oliverlorenz/lib-nextcloud//EN',
      'BEGIN:VEVENT',
      `UID:${uid}`,
      `DTSTAMP:${this.formatDateForIcs(new Date())}`,
      `DTSTART:${this.formatDateForIcs(start)}`,
      `DTEND:${this.formatDateForIcs(end)}`,
      `SUMMARY:${title}`,
      'END:VEVENT',
      'END:VCALENDAR',
    ].join('\r\n');
  }

  private formatDateForIcs(date: Date): string {
    const pad = (n: number): string => n.toString().padStart(2, '0');
    return (
      date.getUTCFullYear().toString() +
      pad(date.getUTCMonth() + 1) +
      pad(date.getUTCDate()) +
      'T' +
      pad(date.getUTCHours()) +
      pad(date.getUTCMinutes()) +
      pad(date.getUTCSeconds()) +
      'Z'
    );
  }
}
