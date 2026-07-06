import { Calendar, parsePropertyDatetime } from '@oliverlorenz/lib-ical';
import type { ICalComponent } from '@oliverlorenz/lib-ical';
import { NextcloudHeaderService } from '../shared/NextcloudHeaderService';

const MIN_DATE = new Date(-8640000000000000);
const MAX_DATE = new Date(8640000000000000);

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

  private readonly calendar = Calendar.create();

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
    const component = this.calendar.parse(ics);
    const events = this.calendar.listEvents(component, start ?? MIN_DATE, end ?? MAX_DATE);

    return events
      .map((event) => this.mapEventComponent(event))
      .filter(
        (event): event is { uid: string; start: Date; end: Date; title: string } =>
          event !== undefined,
      );
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
    const component = this.calendar.parse(ics);
    const event = component.components.find((c) => c.name === 'VEVENT');

    return event === undefined ? undefined : this.mapEventComponent(event);
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

  private parseEventsFromReportXml(
    xml: string,
  ): { uid: string; start: Date; end: Date; title: string }[] {
    const results: { uid: string; start: Date; end: Date; title: string }[] = [];
    const blockPattern = /<d:response>([\s\S]*?)<\/d:response>/g;
    let match: RegExpExecArray | null;

    while ((match = blockPattern.exec(xml)) !== null) {
      const block = match[1];
      const icsMatch = /<(?:\w+:)?calendar-data[^>]*>([\s\S]*?)<\/(?:\w+:)?calendar-data>/.exec(
        block,
      );
      if (icsMatch === null) continue;

      const ics = icsMatch[1].trim();
      const component = this.calendar.parse(ics);

      for (const event of component.components.filter((c) => c.name === 'VEVENT')) {
        const mapped = this.mapEventComponent(event);
        if (mapped !== undefined) {
          results.push(mapped);
        }
      }
    }

    return results;
  }

  private mapEventComponent(
    event: ICalComponent,
  ): { uid: string; start: Date; end: Date; title: string } | undefined {
    const uid = event.properties.find((p) => p.name === 'UID')?.value;
    const title = event.properties.find((p) => p.name === 'SUMMARY')?.value;
    const start = parsePropertyDatetime(event.properties.find((p) => p.name === 'DTSTART'));
    const end = parsePropertyDatetime(event.properties.find((p) => p.name === 'DTEND'));

    if (uid === undefined || title === undefined || start === null || end === null) {
      return undefined;
    }

    return { uid, start, end, title };
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
