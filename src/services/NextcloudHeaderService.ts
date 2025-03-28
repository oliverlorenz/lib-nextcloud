export class NextcloudHeaderService {
  getHeaders(ncUsername: string, ncAppPassword: string) {
    const headers = new Headers();
    headers.append(
      "Authorization",
      `Basic ${btoa(`${ncUsername}:${ncAppPassword}`)}`,
    );
    return headers;
  }

  getJsonResponseHeaders(ncUsername: string, ncAppPassword: string) {
    const headers = this.getHeaders(ncUsername, ncAppPassword);
    headers.append("Content-Type", "application/json");
    headers.append("Accept", "application/json");
    return headers;
  }

  getOCSHeaders(ncUsername: string, ncAppPassword: string) {
    const headers = this.getJsonResponseHeaders(ncUsername, ncAppPassword);
    headers.append("OCS-APIRequest", "true");
    return headers;
  }
}
