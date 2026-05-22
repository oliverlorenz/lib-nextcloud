import { parseVCards } from 'vcard4-ts';
import type { VCard4 } from 'vcard4-ts';
import { NextcloudHeaderService } from '../shared/NextcloudHeaderService';
import type { NextcloudContact } from './NextcloudContact';
import { NextcloudContactMapper } from './NextcloudContactMapper';

export class NextcloudContactService {
  static create(
    ncBasePath: string,
    ncUsername: string,
    ncAppPassword: string,
  ): NextcloudContactService {
    return new NextcloudContactService(
      ncBasePath,
      ncUsername,
      ncAppPassword,
      new NextcloudContactMapper(),
    );
  }

  constructor(
    private ncBasePath: string,
    private ncUsername: string,
    private ncAppPassword: string,
    private nextcloudContactMapper: NextcloudContactMapper,
    private nextcloudCommonService: NextcloudHeaderService = new NextcloudHeaderService(),
  ) {}

  private async getRawContacts(ncAddressBookName: string): Promise<VCard4[]> {
    const response = await fetch(
      `${this.ncBasePath}/remote.php/dav/addressbooks/users/${this.ncUsername}/${ncAddressBookName}/?export`,
      {
        headers: this.nextcloudCommonService.getHeaders(this.ncUsername, this.ncAppPassword),
      },
    );
    return parseVCards(await response.text()).vCards || [];
  }

  public async getContactByPhoneNumber(
    ncAddressBookName: string,
    phoneNumber: string,
  ): Promise<NextcloudContact | undefined> {
    const contacts = await this.getContacts(ncAddressBookName);
    return contacts.find((contact) => contact.phoneNumber.includes(phoneNumber));
  }

  public async getContacts(ncAddressBookName: string): Promise<NextcloudContact[]> {
    const contactList = await this.getRawContacts(ncAddressBookName);
    return contactList.map((card) => this.nextcloudContactMapper.mapContact(card));
  }
}
