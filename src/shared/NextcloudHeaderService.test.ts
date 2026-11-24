import { describe, it, expect, beforeEach } from 'vitest';
import { NextcloudHeaderService } from './NextcloudHeaderService.js';

describe('NextcloudHeaderService', () => {
  let service: NextcloudHeaderService;

  beforeEach(() => {
    service = new NextcloudHeaderService();
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('getHeaders', () => {
    it('returns Authorization header with base64 encoded credentials', () => {
      const headers = service.getHeaders('user', 'pass');
      expect(headers.get('Authorization')).toBe(`Basic ${btoa('user:pass')}`);
    });

    it('does not include Content-Type header', () => {
      const headers = service.getHeaders('user', 'pass');
      expect(headers.get('Content-Type')).toBeNull();
    });
  });

  describe('getJsonResponseHeaders', () => {
    it('returns Authorization, Content-Type and Accept headers', () => {
      const headers = service.getJsonResponseHeaders('user', 'pass');
      expect(headers.get('Authorization')).toBe(`Basic ${btoa('user:pass')}`);
      expect(headers.get('Content-Type')).toBe('application/json');
      expect(headers.get('Accept')).toBe('application/json');
    });
  });

  describe('getOCSHeaders', () => {
    it('returns OCS-APIRequest header in addition to JSON headers', () => {
      const headers = service.getOCSHeaders('user', 'pass');
      expect(headers.get('Authorization')).toBe(`Basic ${btoa('user:pass')}`);
      expect(headers.get('Content-Type')).toBe('application/json');
      expect(headers.get('Accept')).toBe('application/json');
      expect(headers.get('OCS-APIRequest')).toBe('true');
    });
  });
});
