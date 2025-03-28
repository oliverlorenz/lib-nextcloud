import { NextcloudHeaderService } from './NextcloudHeaderService';

const IcalExpander = require('ical-expander');
export class NextcloudCalendarService {
  constructor(private nextcloudCommonService: NextcloudHeaderService) {}

  public async getEvents(
    ncBasePath: string,
    ncUsername: string,
    ncAppPassword: string,
    calendarName: string,
    start?: Date,
    end?: Date,
  ): Promise<{ start: Date; title: string }[]> {
    const response = await fetch(
      `${ncBasePath}/remote.php/dav/calendars/${ncUsername}/${calendarName}?export`,
      {
        headers: this.nextcloudCommonService.getHeaders(ncUsername, ncAppPassword),
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

    const mappedEvents = events.events.map((event) => {
      return {
        start: new Date(event.startDate.toString()),
        title: event.summary,
      };
    });

    const mappedOccurrences = events.occurrences.map((occurrence) => {
      return {
        start: new Date(occurrence.startDate.toString()),
        title: occurrence.item.summary,
      };
    });

    return mappedEvents.concat(mappedOccurrences);
  }

  public async isEventInTimeframe(
    ncBasePath: string,
    ncUsername: string,
    ncAppPassword: string,
    calendarName: string,
    eventTitle: RegExp,
    start: Date,
    end: Date,
  ): Promise<boolean> {
    const allEvents = await this.getEvents(
      ncBasePath,
      ncUsername,
      ncAppPassword,
      calendarName,
      start,
      end,
    );
    return allEvents.some((event) => {
      return eventTitle.test(event.title);
    });
  }
}
