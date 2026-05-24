export type NextcloudContact = {
  uid: string;
  lastName: string;
  firstName: string;
  address: string;
  postalCode: string;
  city: string;
  email: string[];
  phoneNumber: string[];
  birthday?: Date;
  username?: string;
  photo?: string;
};
