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
});
