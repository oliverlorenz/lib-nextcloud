import { parseVCards } from 'vcard4-ts';
import type { VCard4 } from 'vcard4-ts';
import { NextcloudHeaderService } from '../services/NextcloudHeaderService';
import type { NextcloudContact } from './NextcloudContact';
import type { NextcloudContactMapper } from './NextcloudContactMapper';

export class NextcloudContactService {
  constructor(
    private nextcloudContactMapper: NextcloudContactMapper,
    private nextcloudCommonService: NextcloudHeaderService = new NextcloudHeaderService(),
  ) {}

  private async getRawContacts(
    ncBasePath: string,
    ncUsername: string,
    ncAppPassword: string,
    ncCalendarName: string,
  ): Promise<VCard4[]> {
    const response = await fetch(
      `${ncBasePath}/remote.php/dav/addressbooks/users/${ncUsername}/${ncCalendarName}/?export`,
      {
        headers: this.nextcloudCommonService.getHeaders(ncUsername, ncAppPassword),
      },
    );

    return parseVCards(await response.text()).vCards || [];
  }

  public async getContacts(
    ncBasePath: string,
    ncUsername: string,
    ncAppPassword: string,
    ncCalendarName: string,
  ): Promise<NextcloudContact[]> {
    const contactList = await this.getRawContacts(
      ncBasePath,
      ncUsername,
      ncAppPassword,
      ncCalendarName,
    );
    return contactList.map(this.nextcloudContactMapper.mapContact);
  }
}
