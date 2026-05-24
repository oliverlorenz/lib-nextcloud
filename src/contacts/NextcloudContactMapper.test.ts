import { NextcloudContactMapper } from './NextcloudContactMapper';
import type { VCard4 } from 'vcard4-ts';

describe('NextcloudContactMapper', () => {
  let mapper: NextcloudContactMapper;

  beforeEach(() => {
    mapper = new NextcloudContactMapper();
  });

  it('should be defined', () => {
    expect(mapper).toBeDefined();
  });

  describe('mapContact', () => {
    it('maps all fields from a complete VCard4', () => {
      const card = {
        UID: { value: 'abc-def-123' },
        N: { value: { familyNames: ['Doe'], givenNames: ['John'] } },
        ADR: [
          {
            value: {
              streetAddress: ['Main St 1'],
              postalCode: ['12345'],
              locality: ['Berlin'],
            },
          },
        ],
        EMAIL: [{ value: 'john@example.com' }, { value: 'john2@example.com' }],
        TEL: [{ value: '+491234567890' }, { value: '+490987654321' }],
        BDAY: { value: '19900115' },
        x: { X_SOCIALPROFILE: [{ value: 'johndoe' }] },
      } as unknown as VCard4;

      const contact = mapper.mapContact(card);

      expect(contact.uid).toBe('abc-def-123');
      expect(contact.lastName).toBe('Doe');
      expect(contact.firstName).toBe('John');
      expect(contact.address).toBe('Main St 1');
      expect(contact.postalCode).toBe('12345');
      expect(contact.city).toBe('Berlin');
      expect(contact.email).toEqual(['john@example.com', 'john2@example.com']);
      expect(contact.phoneNumber).toEqual(['+491234567890', '+490987654321']);
      expect(contact.birthday).toBeInstanceOf(Date);
      expect(contact.username).toBe('johndoe');
    });

    it('returns empty string for uid when UID is absent', () => {
      const card = {} as unknown as VCard4;

      const contact = mapper.mapContact(card);

      expect(contact.uid).toBe('');
    });

    it('returns empty strings and arrays for missing optional fields', () => {
      const card = {} as unknown as VCard4;

      const contact = mapper.mapContact(card);

      expect(contact.lastName).toBe('');
      expect(contact.firstName).toBe('');
      expect(contact.address).toBe('');
      expect(contact.postalCode).toBe('');
      expect(contact.city).toBe('');
      expect(contact.email).toEqual([]);
      expect(contact.phoneNumber).toEqual([]);
      expect(contact.birthday).toBeUndefined();
      expect(contact.username).toBeUndefined();
    });

    it('returns undefined birthday when BDAY is absent', () => {
      const card = {
        N: { value: { familyNames: ['Smith'], givenNames: ['Jane'] } },
      } as unknown as VCard4;

      const contact = mapper.mapContact(card);

      expect(contact.birthday).toBeUndefined();
    });

    it('parses birthday with full year (YYYYMMDD format)', () => {
      const card = { BDAY: { value: '19900115' } } as unknown as VCard4;

      const contact = mapper.mapContact(card);

      expect(contact.birthday).toBeInstanceOf(Date);
    });

    it('parses birthday without year (--MMDD format)', () => {
      const card = { BDAY: { value: '--0229' } } as unknown as VCard4;

      const contact = mapper.mapContact(card);

      expect(contact.birthday).toBeInstanceOf(Date);
    });

    it('maps multiple email addresses', () => {
      const card = {
        EMAIL: [{ value: 'a@example.com' }, { value: 'b@example.com' }, { value: 'c@example.com' }],
      } as unknown as VCard4;

      const contact = mapper.mapContact(card);

      expect(contact.email).toHaveLength(3);
      expect(contact.email).toContain('b@example.com');
    });

    it('maps multiple phone numbers', () => {
      const card = {
        TEL: [{ value: '+491111111111' }, { value: '+492222222222' }],
      } as unknown as VCard4;

      const contact = mapper.mapContact(card);

      expect(contact.phoneNumber).toHaveLength(2);
    });

    it('returns undefined username when X_SOCIALPROFILE is absent', () => {
      const card = { x: {} } as unknown as VCard4;

      const contact = mapper.mapContact(card);

      expect(contact.username).toBeUndefined();
    });

    it('maps photo when PHOTO is present', () => {
      const card = {
        PHOTO: [{ value: 'data:image/jpeg;base64,/9j/abc123' }],
      } as unknown as VCard4;

      const contact = mapper.mapContact(card);

      expect(contact.photo).toBe('data:image/jpeg;base64,/9j/abc123');
    });

    it('returns undefined photo when PHOTO is absent', () => {
      const card = {} as unknown as VCard4;

      const contact = mapper.mapContact(card);

      expect(contact.photo).toBeUndefined();
    });

    it('maps organization from ORG property', () => {
      const card = {
        ORG: [{ value: ['Acme Corp'] }],
      } as unknown as VCard4;

      const contact = mapper.mapContact(card);

      expect(contact.organization).toBe('Acme Corp');
    });

    it('returns undefined organization when ORG is absent', () => {
      const card = {} as unknown as VCard4;

      const contact = mapper.mapContact(card);

      expect(contact.organization).toBeUndefined();
    });
  });
});
