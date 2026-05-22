import { NextcloudHeaderService } from '../shared/NextcloudHeaderService';

const IcalExpander = require('ical-expander');

export class NextcloudCalendarService {
  static create(
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

  public async getEvents(
    calendarName: string,
    start?: Date,
    end?: Date,
  ): Promise<{ start: Date; title: string }[]> {
    const response = await fetch(
      `${this.ncBasePath}/remote.php/dav/calendars/${this.ncUsername}/${calendarName}?export`,
      {
        headers: this.nextcloudCommonService.getHeaders(this.ncUsername, this.ncAppPassword),
      },
    );
    const ics = await response.text();
    const icalExpander = new IcalExpander({ ics, maxIterations: 100 });

    let events: {
      events: { startDate: Date; summary: string }[];
      occurrences: { startDate: Date; item: { summary: string } }[];
    };

    if (!start && !end) {
      events = icalExpander.all();
    } else {
      events = icalExpander.between(start, end);
    }

    const mappedEvents = events.events.map((event) => ({
      start: new Date(event.startDate.toString()),
      title: event.summary,
    }));

    const mappedOccurrences = events.occurrences.map((occurrence) => ({
      start: new Date(occurrence.startDate.toString()),
      title: occurrence.item.summary,
    }));

    return mappedEvents.concat(mappedOccurrences);
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
}
