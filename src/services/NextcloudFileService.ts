import moment from 'moment';
import { NextcloudHeaderService } from './NextcloudHeaderService';
import { AuthType, createClient, FileStat, WebDAVClient } from 'webdav';
import { basename } from 'path';

export class NextcloudFileService {
  constructor(private nextcloudCommonService: NextcloudHeaderService) {}

  private webdav: WebDAVClient | undefined;

  protected getWebDavClient(
    ncBasePath: string,
    ncUsername: string,
    ncAppPassword: string,
  ): WebDAVClient {
    if (!this.webdav) {
      this.webdav = createClient(`${ncBasePath}/remote.php/webdav/`, {
        authType: AuthType.Password,
        username: ncUsername,
        password: ncAppPassword,
        maxBodyLength: Infinity,
      });
    }
    return this.webdav;
  }

  public async sharePublicly(
    ncBasePath: string,
    ncUsername: string,
    ncAppPassword: string,
    ncFilePath: string,
    expireDate?: Date,
  ): Promise<string> {
    const rawShareResponse = await fetch(
      `${ncBasePath}/ocs/v2.php/apps/files_sharing/api/v1/shares`,
      {
        method: 'POST',
        headers: this.nextcloudCommonService.getOCSHeaders(ncUsername, ncAppPassword),
        body: JSON.stringify({
          path: ncFilePath,
          permissions: 3,
          expireDate: expireDate ? moment(expireDate).format('YYYY-MM-DD') : undefined,
          shareType: 3,
        }),
      },
    );
    const response = await rawShareResponse.json();
    return response.ocs.data.url;
  }

  public async shareWithUser(
    ncBasePath: string,
    ncUsername: string,
    ncAppPassword: string,
    ncFilePath: string,
    shareWithUsername: string,
    expireDate?: Date,
  ): Promise<string> {
    const rawShareResponse = await fetch(
      `${ncBasePath}/ocs/v2.php/apps/files_sharing/api/v1/shares`,
      {
        method: 'POST',
        headers: this.nextcloudCommonService.getOCSHeaders(ncUsername, ncAppPassword),
        body: JSON.stringify({
          path: ncFilePath,
          permissions: 1,
          expireDate: expireDate ? moment(expireDate).format('YYYY-MM-DD') : undefined,
          shareType: 0,
          shareWith: shareWithUsername,
        }),
      },
    );
    const response = await rawShareResponse.json();
    return response.ocs.data.url;
  }

  public async createDirectory(
    ncBasePath: string,
    ncUsername: string,
    ncAppPassword: string,
    ncDirectoryPath: string,
  ): Promise<boolean> {
    const response = await fetch(`${ncBasePath}/remote.php/webdav/${ncDirectoryPath}`, {
      method: 'MKCOL',
      headers: this.nextcloudCommonService.getOCSHeaders(ncUsername, ncAppPassword),
    });
    return response.ok;
  }

  public async addTagByFileId(
    ncBasePath: string,
    ncUsername: string,
    ncAppPassword: string,
    fileId: number,
    tagId: number,
  ): Promise<boolean> {
    const headers = new Headers();
    headers.append('Content-Type', 'application/json');
    headers.append('Accept', '*/*');
    headers.append('Authorization', `Basic ${btoa(`${ncUsername}:${ncAppPassword}`)}`);

    const response = await fetch(
      `${ncBasePath}/remote.php/dav/systemtags-relations/files/${fileId}/${tagId}`,
      {
        method: 'PUT',
        headers,
      },
    );
    if (!response.ok) {
      if (response.status === 409) {
        return true;
      }
      throw new Error('Failed to add tag to file');
    }
    return true;
  }

  public async upload(
    ncBasePath: string,
    ncUsername: string,
    ncAppPassword: string,
    filePath: string,
    fileBuffer: Buffer,
  ): Promise<boolean> {
    return await this.getWebDavClient(ncBasePath, ncUsername, ncAppPassword).putFileContents(
      filePath,
      fileBuffer,
      {},
    );
  }

  public async bulkUpload(
    ncBasePath: string,
    ncUsername: string,
    ncAppPassword: string,
    path: string,
    list: { fileName: string; buffer: Buffer }[],
  ): Promise<boolean[]> {
    return Promise.all(
      list.map((value) => {
        return this.upload(
          ncBasePath,
          ncUsername,
          ncAppPassword,
          `${path}/${value.fileName}`,
          value.buffer,
        );
      }),
    );
  }

  public async download(
    ncBasePath: string,
    ncUsername: string,
    ncAppPassword: string,
    filePath: string,
  ): Promise<Buffer> {
    return this.getWebDavClient(ncBasePath, ncUsername, ncAppPassword).getFileContents(
      filePath,
    ) as unknown as Buffer;
  }

  public stream(
    ncBasePath: string,
    ncUsername: string,
    ncAppPassword: string,
    filePath: string,
  ): NodeJS.ReadableStream {
    return this.getWebDavClient(ncBasePath, ncUsername, ncAppPassword).createReadStream(filePath);
  }

  public async countFiles(
    ncBasePath: string,
    ncUsername: string,
    ncAppPassword: string,
    directoryPath: string,
    createIfNotExisting: boolean = false,
  ): Promise<number> {
    try {
      const results: FileStat[] = (await this.getWebDavClient(
        ncBasePath,
        ncUsername,
        ncAppPassword,
      ).getDirectoryContents(directoryPath)) as FileStat[];
      results.filter((entry) => {
        return entry.type === 'file';
      });
      return results.length;
    } catch (err) {
      if (createIfNotExisting) {
        await this.getWebDavClient(ncBasePath, ncUsername, ncAppPassword).createDirectory(
          directoryPath,
        );
        return this.countFiles(ncBasePath, ncUsername, ncAppPassword, directoryPath);
      }
      throw err;
    }
  }

  public async listFilePaths(
    ncBasePath: string,
    ncUsername: string,
    ncAppPassword: string,
    directoryPath: string,
  ): Promise<string[]> {
    const results: FileStat[] = (await this.getWebDavClient(
      ncBasePath,
      ncUsername,
      ncAppPassword,
    ).getDirectoryContents(directoryPath)) as FileStat[];
    return results
      .filter((entry) => {
        return entry.type === 'file';
      })
      .map((entry) => {
        return entry.filename;
      });
  }

  public async listFileBasenames(
    ncBasePath: string,
    ncUsername: string,
    ncAppPassword: string,
    directoryPath: string,
  ): Promise<string[]> {
    return (await this.listFilePaths(ncBasePath, ncUsername, ncAppPassword, directoryPath)).map(
      (entry) => {
        return basename(entry);
      },
    );
  }

  public async moveFile(
    ncBasePath: string,
    ncUsername: string,
    ncAppPassword: string,
    sourcePath: string,
    targetPath: string,
  ): Promise<void> {
    return this.getWebDavClient(ncBasePath, ncUsername, ncAppPassword).moveFile(
      sourcePath,
      targetPath,
    );
  }

  public async createFileFromTemplate(
    ncBasePath: string,
    ncUsername: string,
    ncAppPassword: string,
    targetPath: string,
    templatePath: string,
  ): Promise<string> {
    await this.upload(
      ncBasePath,
      ncUsername,
      ncAppPassword,
      targetPath,
      await this.download(ncBasePath, ncUsername, ncAppPassword, templatePath),
    );
    return targetPath;
  }

  public async createFileFromTemplateAndReplace(
    ncBasePath: string,
    ncUsername: string,
    ncAppPassword: string,
    targetPath: string,
    templatePath: string,
    replacementList: [RegExp, string][],
  ): Promise<string> {
    const buffer = await this.download(ncBasePath, ncUsername, ncAppPassword, templatePath);
    let documentToUpload = buffer.toString();
    for (const [regexp, replacement] of replacementList) {
      documentToUpload = documentToUpload.replace(regexp, replacement);
    }
    await this.upload(
      ncBasePath,
      ncUsername,
      ncAppPassword,
      targetPath,
      Buffer.from(documentToUpload),
    );
    return targetPath;
  }
}
