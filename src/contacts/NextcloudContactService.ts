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

  public async updateContact(
    ncAddressBookName: string,
    contactUid: string,
    updates: Partial<Omit<NextcloudContact, 'uid'>>,
  ): Promise<void> {
    const rawVCard = await this.getRawVCardText(ncAddressBookName, contactUid);
    const updatedVCard = this.applyContactUpdates(rawVCard, updates);
    const headers = this.nextcloudCommonService.getHeaders(this.ncUsername, this.ncAppPassword);
    headers.append('Content-Type', 'text/vcard; charset=utf-8');
    await fetch(
      `${this.ncBasePath}/remote.php/dav/addressbooks/users/${this.ncUsername}/${ncAddressBookName}/${contactUid}.vcf`,
      { method: 'PUT', headers, body: updatedVCard },
    );
  }

  private async getRawVCardText(ncAddressBookName: string, uid: string): Promise<string> {
    const response = await fetch(
      `${this.ncBasePath}/remote.php/dav/addressbooks/users/${this.ncUsername}/${ncAddressBookName}/${uid}.vcf`,
      { headers: this.nextcloudCommonService.getHeaders(this.ncUsername, this.ncAppPassword) },
    );
    return response.text();
  }

  private applyContactUpdates(
    rawVCard: string,
    updates: Partial<Omit<NextcloudContact, 'uid'>>,
  ): string {
    let vCard = rawVCard;

    if (updates.phoneNumber !== undefined) {
      vCard = vCard.replace(/^TEL[;:][^\r\n]*/gm, '');
      vCard = vCard.replace(/(\r?\n){2,}/g, '\r\n');
      const lines = updates.phoneNumber.map((n) => `TEL:${n}`).join('\r\n');
      if (lines) vCard = vCard.replace(/END:VCARD/, `${lines}\r\nEND:VCARD`);
    }

    if (updates.email !== undefined) {
      vCard = vCard.replace(/^EMAIL[;:][^\r\n]*/gm, '');
      vCard = vCard.replace(/(\r?\n){2,}/g, '\r\n');
      const lines = updates.email.map((e) => `EMAIL:${e}`).join('\r\n');
      if (lines) vCard = vCard.replace(/END:VCARD/, `${lines}\r\nEND:VCARD`);
    }

    if (updates.birthday !== undefined) {
      const bday = this.formatVCardDate(updates.birthday);
      if (/^BDAY[;:]/m.test(vCard)) {
        vCard = vCard.replace(/^BDAY[;:][^\r\n]*/m, `BDAY:${bday}`);
      } else {
        vCard = vCard.replace(/END:VCARD/, `BDAY:${bday}\r\nEND:VCARD`);
      }
    }

    if (updates.lastName !== undefined || updates.firstName !== undefined) {
      vCard = this.updateVCardNField(vCard, updates.lastName, updates.firstName);
    }

    if (
      updates.address !== undefined ||
      updates.postalCode !== undefined ||
      updates.city !== undefined
    ) {
      vCard = this.updateVCardAdrField(vCard, updates.address, updates.postalCode, updates.city);
    }

    if (updates.username !== undefined) {
      if (/^X-SOCIALPROFILE[;:]/m.test(vCard)) {
        vCard = vCard.replace(
          /^X-SOCIALPROFILE[;:][^\r\n]*/m,
          `X-SOCIALPROFILE:${updates.username}`,
        );
      } else {
        vCard = vCard.replace(
          /END:VCARD/,
          `X-SOCIALPROFILE:${updates.username}\r\nEND:VCARD`,
        );
      }
    }

    return vCard;
  }

  private formatVCardDate(date: Date): string {
    const y = date.getFullYear().toString().padStart(4, '0');
    const m = (date.getMonth() + 1).toString().padStart(2, '0');
    const d = date.getDate().toString().padStart(2, '0');
    return `${y}${m}${d}`;
  }

  private updateVCardNField(vCard: string, lastName?: string, firstName?: string): string {
    const nMatch = vCard.match(/^N[;:][^\r\n]*/m);
    let familyName = '';
    let givenName = '';
    let restComponents = ';;';
    if (nMatch) {
      const colonIdx = nMatch[0].indexOf(':');
      const parts = nMatch[0].slice(colonIdx + 1).split(';');
      familyName = parts[0] ?? '';
      givenName = parts[1] ?? '';
      restComponents = parts.slice(2).join(';');
    }
    const newFamilyName = lastName ?? familyName;
    const newGivenName = firstName ?? givenName;
    const newN = `N:${newFamilyName};${newGivenName};${restComponents}`;
    const newFN = `FN:${[newGivenName, newFamilyName].filter(Boolean).join(' ')}`;
    if (nMatch) {
      vCard = vCard.replace(/^N[;:][^\r\n]*/m, newN);
    } else {
      vCard = vCard.replace(/END:VCARD/, `${newN}\r\nEND:VCARD`);
    }
    if (/^FN[;:]/m.test(vCard)) {
      vCard = vCard.replace(/^FN[;:][^\r\n]*/m, newFN);
    } else {
      vCard = vCard.replace(/END:VCARD/, `${newFN}\r\nEND:VCARD`);
    }
    return vCard;
  }

  private updateVCardAdrField(
    vCard: string,
    address?: string,
    postalCode?: string,
    city?: string,
  ): string {
    // ADR value components: poBox;extAddress;streetAddress;locality;region;postalCode;country
    const adrMatch = vCard.match(/^ADR[^\r\n]*/m);
    if (adrMatch) {
      const line = adrMatch[0];
      const colonIdx = line.indexOf(':');
      const prefix = line.slice(0, colonIdx + 1);
      const parts = line.slice(colonIdx + 1).split(';');
      while (parts.length < 7) parts.push('');
      if (address !== undefined) parts[2] = address;
      if (city !== undefined) parts[3] = city;
      if (postalCode !== undefined) parts[5] = postalCode;
      vCard = vCard.replace(/^ADR[^\r\n]*/m, `${prefix}${parts.join(';')}`);
    } else {
      const street = address ?? '';
      const locality = city ?? '';
      const postal = postalCode ?? '';
      vCard = vCard.replace(/END:VCARD/, `ADR:;;${street};${locality};;${postal};\r\nEND:VCARD`);
    }
    return vCard;
  }
}
