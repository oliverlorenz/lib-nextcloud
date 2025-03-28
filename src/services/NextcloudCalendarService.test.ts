import { NextcloudCalendarService } from './NextcloudCalendarService';
import { NextcloudHeaderService } from './NextcloudHeaderService';

describe('NextcloudCalendarService', () => {
  it('should be defined', () => {
    const nextcloudHeaderService = new NextcloudHeaderService();
    const service = new NextcloudCalendarService(nextcloudHeaderService);
    expect(service).toBeDefined();
  });
});
