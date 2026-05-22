export class NextcloudHeaderService {
  public getHeaders(ncUsername: string, ncAppPassword: string): Headers {
    const headers = new Headers();
    headers.append('Authorization', `Basic ${btoa(`${ncUsername}:${ncAppPassword}`)}`);
    return headers;
  }

  public getJsonResponseHeaders(ncUsername: string, ncAppPassword: string): Headers {
    const headers = this.getHeaders(ncUsername, ncAppPassword);
    headers.append('Content-Type', 'application/json');
    headers.append('Accept', 'application/json');
    return headers;
  }

  public getOCSHeaders(ncUsername: string, ncAppPassword: string): Headers {
    const headers = this.getJsonResponseHeaders(ncUsername, ncAppPassword);
    headers.append('OCS-APIRequest', 'true');
    return headers;
  }
}
