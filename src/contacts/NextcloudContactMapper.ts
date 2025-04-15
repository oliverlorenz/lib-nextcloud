import type { VCard4 } from 'vcard4-ts';
import type { NextcloudContact } from './NextcloudContact';
import moment from 'moment';

export class NextcloudContactMapper {
  public mapContact(card: VCard4): NextcloudContact {
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
      birthday: rawBirthday ? moment(`${day}.${month}.${year}`).toDate() : undefined,
      username: card.x?.X_SOCIALPROFILE?.[0]?.value,
    };
  }
}
