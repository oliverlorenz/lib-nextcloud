import moment from "moment";
import { NextcloudHeaderService } from "./NextcloudHeaderService";

export class NextcloudFileService {
  constructor(private nextcloudCommonService: NextcloudHeaderService) {}

  async sharePublicly(
    ncBasePath: string,
    ncUsername: string,
    ncAppPassword: string,
    ncFilePath: string,
    expireDate?: Date,
  ) {
    const rawShareResponse = await fetch(
      `${ncBasePath}/ocs/v2.php/apps/files_sharing/api/v1/shares`,
      {
        method: "POST",
        headers: this.nextcloudCommonService.getOCSHeaders(
          ncUsername,
          ncAppPassword,
        ),
        body: JSON.stringify({
          path: ncFilePath,
          permissions: 3,
          expireDate: expireDate
            ? moment(expireDate).format("YYYY-MM-DD")
            : undefined,
          shareType: 3,
        }),
      },
    );
    const response = await rawShareResponse.json();
    return response.ocs.data.url;
  }

  async shareWithUser(
    ncBasePath: string,
    ncUsername: string,
    ncAppPassword: string,
    ncFilePath: string,
    shareWithUsername: string,
    expireDate?: Date,
  ) {
    const rawShareResponse = await fetch(
      `${ncBasePath}/ocs/v2.php/apps/files_sharing/api/v1/shares`,
      {
        method: "POST",
        headers: this.nextcloudCommonService.getOCSHeaders(
          ncUsername,
          ncAppPassword,
        ),
        body: JSON.stringify({
          path: ncFilePath,
          permissions: 1,
          expireDate: expireDate
            ? moment(expireDate).format("YYYY-MM-DD")
            : undefined,
          shareType: 0,
          shareWith: shareWithUsername,
        }),
      },
    );
    const response = await rawShareResponse.json();
    return response.ocs.data.url;
  }

  async createDirectory(
    ncBasePath: string,
    ncUsername: string,
    ncAppPassword: string,
    ncDirectoryPath: string,
  ) {
    return fetch(`${ncBasePath}/remote.php/webdav/${ncDirectoryPath}`, {
      method: "MKCOL",
      headers: this.nextcloudCommonService.getOCSHeaders(
        ncUsername,
        ncAppPassword,
      ),
    });
  }

  async addTagByFileId(
    ncBasePath: string,
    ncUsername: string,
    ncAppPassword: string,
    fileId: number,
    tagId: number,
  ) {
    const headers = new Headers();
    headers.append("Content-Type", "application/json");
    headers.append("Accept", "*/*");
    headers.append(
      "Authorization",
      `Basic ${btoa(`${ncUsername}:${ncAppPassword}`)}`,
    );

    const response = await fetch(
      `${ncBasePath}/remote.php/dav/systemtags-relations/files/${fileId}/${tagId}`,
      {
        method: "PUT",
        headers,
      },
    );
    if (!response.ok) {
      if (response.status === 409) {
        return true;
      }
      throw new Error("Failed to add tag to file");
    }
    return true;
  }
}
