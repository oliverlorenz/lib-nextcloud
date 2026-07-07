export type NextcloudCalendarEventAttendee = {
  email: string;
  name?: string;
  status?: string;
};

export type NextcloudCalendarEvent = {
  uid: string;
  start: Date;
  end: Date;
  title: string;
  location?: string;
  attendees?: NextcloudCalendarEventAttendee[];
};
