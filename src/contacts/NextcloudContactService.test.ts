import { NextcloudContactService } from './NextcloudContactService';
import { NextcloudContactMapper } from './NextcloudContactMapper';
import type { NextcloudContact } from './NextcloudContact';

jest.mock('vcard4-ts', () => ({
  parseVCards: jest.fn().mockReturnValue({ vCards: [] }),
}));

import { parseVCards } from 'vcard4-ts';

describe('NextcloudContactService', () => {
  let service: NextcloudContactService;
  let mockMapper: { mapContact: jest.Mock };
  let fetchSpy: jest.SpyInstance;

  beforeEach(() => {
    mockMapper = { mapContact: jest.fn() };
    service = new NextcloudContactService(
      'https://nc.example.com',
      'user',
      'pass',
      mockMapper as unknown as NextcloudContactMapper,
    );
    fetchSpy = jest.spyOn(global, 'fetch').mockResolvedValue({
      text: () => Promise.resolve('BEGIN:VCARD\nEND:VCARD'),
    } as unknown as Response);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  it('create() returns an instance without manual dependency injection', () => {
    expect(NextcloudContactService.create('https://nc.example.com', 'user', 'pass')).toBeInstanceOf(
      NextcloudContactService,
    );
  });

  describe('getContacts', () => {
    it('fetches from correct address book URL', async () => {
      await service.getContacts('contacts');

      expect(fetchSpy).toHaveBeenCalledWith(
        'https://nc.example.com/remote.php/dav/addressbooks/users/user/contacts/?export',
        expect.any(Object),
      );
    });

    it('returns empty array when address book has no contacts', async () => {
      (parseVCards as jest.Mock).mockReturnValueOnce({ vCards: [] });

      const contacts = await service.getContacts('contacts');

      expect(contacts).toEqual([]);
    });

    it('maps each vCard to a contact via mapper', async () => {
      const mockCard = { N: { value: { familyNames: ['Doe'], givenNames: ['John'] } } };
      const mockContact: NextcloudContact = {
        uid: 'abc-123',
        lastName: 'Doe',
        firstName: 'John',
        address: '',
        postalCode: '',
        city: '',
        email: [],
        phoneNumber: [],
      };
      (parseVCards as jest.Mock).mockReturnValueOnce({ vCards: [mockCard] });
      mockMapper.mapContact.mockReturnValue(mockContact);

      const contacts = await service.getContacts('contacts');

      expect(mockMapper.mapContact).toHaveBeenCalledWith(mockCard);
      expect(contacts).toHaveLength(1);
      expect(contacts[0]).toEqual(mockContact);
    });

    it('maps multiple vCards', async () => {
      const mockCards = [
        { N: { value: { familyNames: ['A'] } } },
        { N: { value: { familyNames: ['B'] } } },
      ];
      (parseVCards as jest.Mock).mockReturnValueOnce({ vCards: mockCards });
      mockMapper.mapContact.mockReturnValue({
        lastName: '',
        firstName: '',
        address: '',
        postalCode: '',
        city: '',
        email: [],
        phoneNumber: [],
      });

      const contacts = await service.getContacts('contacts');

      expect(contacts).toHaveLength(2);
      expect(mockMapper.mapContact).toHaveBeenCalledTimes(2);
    });

    it('uses address book name in URL', async () => {
      await service.getContacts('my-book');

      expect(fetchSpy).toHaveBeenCalledWith(
        expect.stringContaining('/my-book/'),
        expect.any(Object),
      );
    });
  });

  describe('getContactByPhoneNumber', () => {
    const makeMultiStatusXml = (addressDataContent: string): string =>
      `<?xml version="1.0" encoding="UTF-8"?>
<d:multistatus xmlns:d="DAV:" xmlns:card="urn:ietf:params:xml:ns:carddav">
  <d:response>
    <d:propstat>
      <d:prop>
        <card:address-data>${addressDataContent}</card:address-data>
      </d:prop>
    </d:propstat>
  </d:response>
</d:multistatus>`;

    const emptyMultiStatusXml =
      '<d:multistatus xmlns:d="DAV:" xmlns:card="urn:ietf:params:xml:ns:carddav"></d:multistatus>';

    const mockFetchXml = (xml: string): void => {
      fetchSpy.mockResolvedValueOnce({
        text: () => Promise.resolve(xml),
      } as unknown as Response);
    };

    it('uses REPORT method', async () => {
      mockFetchXml(emptyMultiStatusXml);

      await service.getContactByPhoneNumber('contacts', '+493333333333');

      expect(fetchSpy).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({ method: 'REPORT' }),
      );
    });

    it('fetches from correct CardDAV URL without ?export', async () => {
      mockFetchXml(emptyMultiStatusXml);

      await service.getContactByPhoneNumber('contacts', '+493333333333');

      expect(fetchSpy).toHaveBeenCalledWith(
        'https://nc.example.com/remote.php/dav/addressbooks/users/user/contacts/',
        expect.any(Object),
      );
    });

    it('includes phone number in request body', async () => {
      mockFetchXml(emptyMultiStatusXml);

      await service.getContactByPhoneNumber('contacts', '+493333333333');

      const [, options] = fetchSpy.mock.calls[0] as [string, RequestInit];
      expect(options.body).toContain('+493333333333');
    });

    it('sends Depth: 1 header', async () => {
      mockFetchXml(emptyMultiStatusXml);

      await service.getContactByPhoneNumber('contacts', '+493333333333');

      const [, options] = fetchSpy.mock.calls[0] as [string, RequestInit];
      const headers = options.headers as Headers;
      expect(headers.get('Depth')).toBe('1');
    });

    it('sends Content-Type: application/xml header', async () => {
      mockFetchXml(emptyMultiStatusXml);

      await service.getContactByPhoneNumber('contacts', '+493333333333');

      const [, options] = fetchSpy.mock.calls[0] as [string, RequestInit];
      const headers = options.headers as Headers;
      expect(headers.get('Content-Type')).toBe('application/xml');
    });

    it('returns undefined when response contains no address-data', async () => {
      mockFetchXml(emptyMultiStatusXml);

      const result = await service.getContactByPhoneNumber('contacts', '+499999999999');

      expect(result).toBeUndefined();
    });

    it('returns undefined when parsed vCard list is empty', async () => {
      const vCardText = 'BEGIN:VCARD\nVERSION:4.0\nEND:VCARD';
      mockFetchXml(makeMultiStatusXml(vCardText));
      (parseVCards as jest.Mock).mockReturnValueOnce({ vCards: [] });

      const result = await service.getContactByPhoneNumber('contacts', '+493333333333');

      expect(result).toBeUndefined();
    });

    it('returns the mapped contact from the first matching address-data', async () => {
      const vCardText = 'BEGIN:VCARD\nVERSION:4.0\nFN:John Doe\nEND:VCARD';
      const mockCard = { FN: { value: 'John Doe' } };
      const mockContact: NextcloudContact = {
        uid: 'abc-123',
        lastName: 'Doe',
        firstName: 'John',
        address: '',
        postalCode: '',
        city: '',
        email: [],
        phoneNumber: ['+493333333333'],
      };
      mockFetchXml(makeMultiStatusXml(vCardText));
      (parseVCards as jest.Mock).mockReturnValueOnce({ vCards: [mockCard] });
      mockMapper.mapContact.mockReturnValueOnce(mockContact);

      const result = await service.getContactByPhoneNumber('contacts', '+493333333333');

      expect(result).toEqual(mockContact);
    });

    it('passes extracted vCard text to parseVCards', async () => {
      const vCardText = 'BEGIN:VCARD\nVERSION:4.0\nFN:Test\nEND:VCARD';
      mockFetchXml(makeMultiStatusXml(vCardText));
      (parseVCards as jest.Mock).mockReturnValueOnce({ vCards: [] });

      await service.getContactByPhoneNumber('contacts', '+493333333333');

      expect(parseVCards).toHaveBeenCalledWith(vCardText);
    });

    it('escapes XML special characters in phone number', async () => {
      mockFetchXml(emptyMultiStatusXml);

      await service.getContactByPhoneNumber('contacts', '+49&123<>');

      const [, options] = fetchSpy.mock.calls[0] as [string, RequestInit];
      expect(options.body).toContain('+49&amp;123&lt;&gt;');
    });

    it('uses address book name in URL', async () => {
      mockFetchXml(emptyMultiStatusXml);

      await service.getContactByPhoneNumber('my-book', '+493333333333');

      expect(fetchSpy).toHaveBeenCalledWith(
        expect.stringContaining('/my-book/'),
        expect.any(Object),
      );
    });
  });

  describe('updateContact', () => {
    const uid = 'test-uid-123';
    const baseVCard = [
      'BEGIN:VCARD',
      'VERSION:4.0',
      `UID:${uid}`,
      'FN:John Doe',
      'N:Doe;John;;;',
      'TEL;TYPE=CELL:+49111111111',
      'EMAIL:john@example.com',
      'BDAY:19900115',
      'ADR:;;Main St;Berlin;;12345;Germany',
      'X-SOCIALPROFILE:johndoe',
      'END:VCARD',
    ].join('\r\n');

    const mockGetVCard = (vCard: string): void => {
      fetchSpy.mockResolvedValueOnce({
        text: () => Promise.resolve(vCard),
      } as unknown as Response);
      fetchSpy.mockResolvedValueOnce({} as Response);
    };

    const getPutBody = (): string => {
      const [, putCall] = fetchSpy.mock.calls as [string, RequestInit][];
      return putCall[1].body as string;
    };

    it('fetches the vCard via GET before updating', async () => {
      mockGetVCard(baseVCard);

      await service.updateContact('contacts', uid, { phoneNumber: ['+49999999999'] });

      expect(fetchSpy.mock.calls[0][0]).toBe(
        `https://nc.example.com/remote.php/dav/addressbooks/users/user/contacts/${uid}.vcf`,
      );
    });

    it('sends PUT to the correct contact URL', async () => {
      mockGetVCard(baseVCard);

      await service.updateContact('contacts', uid, { phoneNumber: ['+49999999999'] });

      const [putUrl, putOptions] = fetchSpy.mock.calls[1] as [string, RequestInit];
      expect(putUrl).toBe(
        `https://nc.example.com/remote.php/dav/addressbooks/users/user/contacts/${uid}.vcf`,
      );
      expect(putOptions.method).toBe('PUT');
    });

    it('sends Content-Type: text/vcard; charset=utf-8 header', async () => {
      mockGetVCard(baseVCard);

      await service.updateContact('contacts', uid, { phoneNumber: ['+49999999999'] });

      const [, putOptions] = fetchSpy.mock.calls[1] as [string, RequestInit];
      const headers = putOptions.headers as Headers;
      expect(headers.get('Content-Type')).toBe('text/vcard; charset=utf-8');
    });

    it('uses address book name in both GET and PUT URLs', async () => {
      mockGetVCard(baseVCard);

      await service.updateContact('my-book', uid, { phoneNumber: ['+49999999999'] });

      expect(fetchSpy.mock.calls[0][0]).toContain('/my-book/');
      expect(fetchSpy.mock.calls[1][0]).toContain('/my-book/');
    });

    describe('phoneNumber update', () => {
      it('replaces all TEL lines with new phone numbers', async () => {
        mockGetVCard(baseVCard);

        await service.updateContact('contacts', uid, { phoneNumber: ['+49999999999'] });

        const body = getPutBody();
        expect(body).toContain('TEL:+49999999999');
        expect(body).not.toContain('+49111111111');
      });

      it('adds multiple TEL lines when multiple phone numbers are provided', async () => {
        mockGetVCard(baseVCard);

        await service.updateContact('contacts', uid, {
          phoneNumber: ['+49111000001', '+49111000002'],
        });

        const body = getPutBody();
        expect(body).toContain('TEL:+49111000001');
        expect(body).toContain('TEL:+49111000002');
      });

      it('removes all TEL lines when empty array is provided', async () => {
        mockGetVCard(baseVCard);

        await service.updateContact('contacts', uid, { phoneNumber: [] });

        const body = getPutBody();
        expect(body).not.toMatch(/^TEL[;:]/m);
      });

      it('preserves other fields when updating phone numbers', async () => {
        mockGetVCard(baseVCard);

        await service.updateContact('contacts', uid, { phoneNumber: ['+49999999999'] });

        const body = getPutBody();
        expect(body).toContain('EMAIL:john@example.com');
        expect(body).toContain('N:Doe;John;;;');
      });
    });

    describe('email update', () => {
      it('replaces all EMAIL lines with new emails', async () => {
        mockGetVCard(baseVCard);

        await service.updateContact('contacts', uid, { email: ['new@example.com'] });

        const body = getPutBody();
        expect(body).toContain('EMAIL:new@example.com');
        expect(body).not.toContain('john@example.com');
      });

      it('adds multiple EMAIL lines when multiple emails are provided', async () => {
        mockGetVCard(baseVCard);

        await service.updateContact('contacts', uid, {
          email: ['a@example.com', 'b@example.com'],
        });

        const body = getPutBody();
        expect(body).toContain('EMAIL:a@example.com');
        expect(body).toContain('EMAIL:b@example.com');
      });

      it('removes all EMAIL lines when empty array is provided', async () => {
        mockGetVCard(baseVCard);

        await service.updateContact('contacts', uid, { email: [] });

        const body = getPutBody();
        expect(body).not.toMatch(/^EMAIL[;:]/m);
      });

      it('preserves other fields when updating emails', async () => {
        mockGetVCard(baseVCard);

        await service.updateContact('contacts', uid, { email: ['new@example.com'] });

        const body = getPutBody();
        expect(body).toContain('TEL;TYPE=CELL:+49111111111');
        expect(body).toContain('N:Doe;John;;;');
      });
    });

    describe('lastName update', () => {
      it('updates the family name in the N property', async () => {
        mockGetVCard(baseVCard);

        await service.updateContact('contacts', uid, { lastName: 'Smith' });

        const body = getPutBody();
        expect(body).toMatch(/^N:Smith;John/m);
      });

      it('preserves existing firstName when only lastName is updated', async () => {
        mockGetVCard(baseVCard);

        await service.updateContact('contacts', uid, { lastName: 'Smith' });

        const body = getPutBody();
        expect(body).toMatch(/^N:Smith;John/m);
      });

      it('updates the FN property to match new name', async () => {
        mockGetVCard(baseVCard);

        await service.updateContact('contacts', uid, { lastName: 'Smith' });

        const body = getPutBody();
        expect(body).toMatch(/^FN:John Smith/m);
      });
    });

    describe('firstName update', () => {
      it('updates the given name in the N property', async () => {
        mockGetVCard(baseVCard);

        await service.updateContact('contacts', uid, { firstName: 'Jane' });

        const body = getPutBody();
        expect(body).toMatch(/^N:Doe;Jane/m);
      });

      it('preserves existing lastName when only firstName is updated', async () => {
        mockGetVCard(baseVCard);

        await service.updateContact('contacts', uid, { firstName: 'Jane' });

        const body = getPutBody();
        expect(body).toMatch(/^N:Doe;Jane/m);
      });

      it('updates both N and FN when both firstName and lastName are provided', async () => {
        mockGetVCard(baseVCard);

        await service.updateContact('contacts', uid, { firstName: 'Jane', lastName: 'Smith' });

        const body = getPutBody();
        expect(body).toMatch(/^N:Smith;Jane/m);
        expect(body).toMatch(/^FN:Jane Smith/m);
      });

      it('adds N and FN lines when neither is present in the vCard', async () => {
        const minimalVCard = 'BEGIN:VCARD\r\nVERSION:4.0\r\nEND:VCARD';
        mockGetVCard(minimalVCard);

        await service.updateContact('contacts', uid, { firstName: 'Jane', lastName: 'Smith' });

        const body = getPutBody();
        expect(body).toMatch(/^N:Smith;Jane/m);
        expect(body).toMatch(/^FN:Jane Smith/m);
      });
    });

    describe('birthday update', () => {
      it('replaces existing BDAY line', async () => {
        mockGetVCard(baseVCard);

        await service.updateContact('contacts', uid, { birthday: new Date(1995, 5, 15) });

        const body = getPutBody();
        expect(body).toContain('BDAY:19950615');
        expect(body).not.toContain('BDAY:19900115');
      });

      it('adds BDAY line when not present', async () => {
        const vCardWithoutBday = baseVCard.replace('BDAY:19900115\r\n', '');
        mockGetVCard(vCardWithoutBday);

        await service.updateContact('contacts', uid, { birthday: new Date(1995, 5, 15) });

        const body = getPutBody();
        expect(body).toContain('BDAY:19950615');
      });
    });

    describe('address update', () => {
      it('updates street address while preserving other ADR components', async () => {
        mockGetVCard(baseVCard);

        await service.updateContact('contacts', uid, { address: 'New Street 42' });

        const body = getPutBody();
        expect(body).toMatch(/^ADR[^\r\n]*:;;New Street 42;Berlin;;12345;Germany/m);
      });

      it('updates postal code while preserving other ADR components', async () => {
        mockGetVCard(baseVCard);

        await service.updateContact('contacts', uid, { postalCode: '99999' });

        const body = getPutBody();
        expect(body).toMatch(/^ADR[^\r\n]*:;;Main St;Berlin;;99999;Germany/m);
      });

      it('updates city while preserving other ADR components', async () => {
        mockGetVCard(baseVCard);

        await service.updateContact('contacts', uid, { city: 'Hamburg' });

        const body = getPutBody();
        expect(body).toMatch(/^ADR[^\r\n]*:;;Main St;Hamburg;;12345;Germany/m);
      });

      it('adds ADR line when not present', async () => {
        const vCardWithoutAdr = baseVCard.replace('ADR:;;Main St;Berlin;;12345;Germany\r\n', '');
        mockGetVCard(vCardWithoutAdr);

        await service.updateContact('contacts', uid, {
          address: 'New St',
          city: 'Munich',
          postalCode: '80001',
        });

        const body = getPutBody();
        expect(body).toContain('ADR:;;New St;Munich;;80001;');
      });
    });

    describe('username update', () => {
      it('replaces existing X-SOCIALPROFILE line', async () => {
        mockGetVCard(baseVCard);

        await service.updateContact('contacts', uid, { username: 'newhandle' });

        const body = getPutBody();
        expect(body).toContain('X-SOCIALPROFILE:newhandle');
        expect(body).not.toContain('X-SOCIALPROFILE:johndoe');
      });

      it('adds X-SOCIALPROFILE line when not present', async () => {
        const vCardWithoutProfile = baseVCard.replace('X-SOCIALPROFILE:johndoe\r\n', '');
        mockGetVCard(vCardWithoutProfile);

        await service.updateContact('contacts', uid, { username: 'newhandle' });

        const body = getPutBody();
        expect(body).toContain('X-SOCIALPROFILE:newhandle');
      });
    });
  });
});
