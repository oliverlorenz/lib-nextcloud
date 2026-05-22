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
    expect(NextcloudContactService.create('https://nc.example.com', 'user', 'pass')).toBeInstanceOf(NextcloudContactService);
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
        lastName: '', firstName: '', address: '', postalCode: '', city: '', email: [], phoneNumber: [],
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
    const makeContact = (phoneNumber: string[]): NextcloudContact => ({
      lastName: '', firstName: '', address: '', postalCode: '', city: '', email: [], phoneNumber,
    });

    beforeEach(() => {
      const contacts = [
        makeContact(['+491111111111', '+492222222222']),
        makeContact(['+493333333333']),
        makeContact([]),
      ];
      (parseVCards as jest.Mock).mockReturnValue({ vCards: contacts });
      mockMapper.mapContact.mockImplementation((card: NextcloudContact) => card);
    });

    it('returns the contact matching the phone number', async () => {
      const result = await service.getContactByPhoneNumber('contacts', '+493333333333');

      expect(result?.phoneNumber).toContain('+493333333333');
    });

    it('returns contact that has the number among multiple numbers', async () => {
      const result = await service.getContactByPhoneNumber('contacts', '+492222222222');

      expect(result?.phoneNumber).toContain('+492222222222');
    });

    it('returns undefined when no contact has the phone number', async () => {
      const result = await service.getContactByPhoneNumber('contacts', '+499999999999');

      expect(result).toBeUndefined();
    });
  });
});
