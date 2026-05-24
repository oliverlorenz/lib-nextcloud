import { parseVCards } from 'vcard4-ts';
import type { VCard4 } from 'vcard4-ts';
import { NextcloudHeaderService } from '../shared/NextcloudHeaderService';
import type { NextcloudContact } from './NextcloudContact';
import { NextcloudContactMapper } from './NextcloudContactMapper';

export class NextcloudContactService {
  public static create(
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
    const escapedPhoneNumber = phoneNumber
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');

    const body = `<?xml version="1.0" encoding="UTF-8"?>
<card:addressbook-query xmlns:d="DAV:" xmlns:card="urn:ietf:params:xml:ns:carddav">
  <d:prop>
    <d:getetag/>
    <card:address-data/>
  </d:prop>
  <card:filter test="anyof">
    <card:prop-filter name="TEL">
      <card:text-match collation="i;unicode-casemap" match-type="contains">${escapedPhoneNumber}</card:text-match>
    </card:prop-filter>
  </card:filter>
</card:addressbook-query>`;

    const headers = this.nextcloudCommonService.getHeaders(this.ncUsername, this.ncAppPassword);
    headers.append('Content-Type', 'application/xml');
    headers.append('Depth', '1');

    const response = await fetch(
      `${this.ncBasePath}/remote.php/dav/addressbooks/users/${this.ncUsername}/${ncAddressBookName}/`,
      { method: 'REPORT', headers, body },
    );

    const xmlText = await response.text();
    const addressDataRegex = /<[^:>\s]+:address-data[^>]*>([\s\S]*?)<\/[^:>\s]+:address-data>/g;

    for (const match of xmlText.matchAll(addressDataRegex)) {
      const vCardText = match[1].trim();
      const parsed = parseVCards(vCardText).vCards;
      if (parsed && parsed.length > 0) {
        return this.nextcloudContactMapper.mapContact(parsed[0]);
      }
    }
    return undefined;
  }

  public async getContacts(ncAddressBookName: string): Promise<NextcloudContact[]> {
    const contactList = await this.getRawContacts(ncAddressBookName);
    return contactList.map((card) => this.nextcloudContactMapper.mapContact(card));
  }
}
