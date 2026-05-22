import type { VCard4 } from 'vcard4-ts';
import type { NextcloudContact } from './NextcloudContact';

export class NextcloudContactMapper {
  public mapContact(card: VCard4): NextcloudContact {
    const rawBirthday = card.BDAY?.value;
    const day = rawBirthday?.slice(-2);
    const month = rawBirthday?.slice(-4).slice(0, -2);
    const year = rawBirthday?.slice(0, -4) !== '--' ? rawBirthday?.slice(0, -4) : '0001';
    return {
      lastName: card.N?.value.familyNames[0] || '',
      firstName: card.N?.value.givenNames[0] || '',
      address: card.ADR?.[0]?.value.streetAddress?.[0] ?? '',
      postalCode: card.ADR?.[0]?.value.postalCode?.[0] ?? '',
      city: card.ADR?.[0]?.value.locality?.[0] ?? '',
      email: card.EMAIL ? card.EMAIL.map((email) => email.value) : [],
      phoneNumber: card.TEL?.map((tel) => tel.value) || [],
      birthday: rawBirthday
        ? new Date(Number(year), Number(month) - 1, Number(day))
        : undefined,
      username: card.x?.X_SOCIALPROFILE?.[0]?.value,
    };
  }
}
