import moment from 'moment';
import { parseVCards, VCard4 } from 'vcard4-ts';
import { NextcloudHeaderService } from './NextcloudHeaderService';

export type Contact = {
  lastName: string;
  firstName: string;
  address: string;
  postalCode: string;
  city: string;
  email: string;
  phoneNumber: string;
  birthday: Date;
  username?: string;
};
export class NextcloudContactService {
  constructor(private nextcloudCommonService: NextcloudHeaderService) {}

  private async getRawContacts(
    ncBasePath: string,
    ncUsername: string,
    ncAppPassword: string,
    ncCalenderName: string,
  ): Promise<VCard4[]> {
    const response = await fetch(
      `${ncBasePath}/remote.php/dav/addressbooks/users/${ncUsername}/${ncCalenderName}/?export`,
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
    ncCalenderName: string,
  ): Promise<Contact[]> {
    const contactList = await this.getRawContacts(
      ncBasePath,
      ncUsername,
      ncAppPassword,
      ncCalenderName,
    );
    return contactList.map(this.mapContact);
  }

  protected mapContact(card: VCard4): Contact {
    const rawBirthday = card.BDAY?.value;
    const day = rawBirthday?.slice(-2);
    const month = rawBirthday?.slice(-4).slice(0, -2);
    const year = rawBirthday?.slice(0, -4) !== '--' ? rawBirthday?.slice(0, -4) : '0001';

    return {
      lastName: card.N?.value.familyNames[0] || '',
      firstName: card.N?.value.givenNames[0] || '',
      address: card.ADR
        ? // @ts-ignore
          card.ADR[0].value.streetAddress[0]
        : '',
      // @ts-ignore
      postalCode: card.ADR ? card.ADR[0].value.postalCode[0] : '',
      // @ts-ignore
      city: card.ADR ? card.ADR[0].value.locality[0] : '',
      email: card.EMAIL ? card.EMAIL[0].value : '',
      phoneNumber: card.TEL ? card.TEL[0].value : '',
      birthday: moment(`${day}.${month}.${year}`).toDate(),
      username: card.x?.X_SOCIALPROFILE[0].value,
    };
  }
}
