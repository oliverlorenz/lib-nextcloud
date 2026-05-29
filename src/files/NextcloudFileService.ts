import { NextcloudHeaderService } from '../shared/NextcloudHeaderService';
import { AuthType, createClient, FileStat, WebDAVClient } from 'webdav';
import { basename, join } from 'path';
import { promises as fs } from 'fs';

const ShareType = {
  PublicLink: 3,
  User: 0,
} as const;

const SharePermissions = {
  ReadWrite: 3,
  ReadOnly: 1,
} as const;

export class NextcloudFileService {
  public static create(
    ncBasePath: string,
    ncUsername: string,
    ncAppPassword: string,
  ): NextcloudFileService {
    return new NextcloudFileService(
      ncBasePath,
      ncUsername,
      ncAppPassword,
      new NextcloudHeaderService(),
    );
  }

  constructor(
    private ncBasePath: string,
    private ncUsername: string,
    private ncAppPassword: string,
    private nextcloudCommonService: NextcloudHeaderService,
  ) {}

  private webdav: WebDAVClient | undefined;

  private getWebDavClient(): WebDAVClient {
    if (!this.webdav) {
      this.webdav = createClient(`${this.ncBasePath}/remote.php/webdav/`, {
        authType: AuthType.Password,
        username: this.ncUsername,
        password: this.ncAppPassword,
        maxBodyLength: Infinity,
      });
    }
    return this.webdav;
  }

  public async sharePublicly(ncFilePath: string, expireDate?: Date): Promise<string> {
    const raw = await fetch(`${this.ncBasePath}/ocs/v2.php/apps/files_sharing/api/v1/shares`, {
      method: 'POST',
      headers: this.nextcloudCommonService.getOCSHeaders(this.ncUsername, this.ncAppPassword),
      body: JSON.stringify({
        path: ncFilePath,
        permissions: SharePermissions.ReadWrite,
        expireDate: expireDate ? expireDate.toISOString().slice(0, 10) : undefined,
        shareType: ShareType.PublicLink,
      }),
    });
    if (!raw.ok) {
      throw new Error(`Failed to share publicly: ${raw.status} ${raw.statusText}`);
    }
    const response = await raw.json();
    return response.ocs.data.url;
  }

  public async shareWithUser(
    ncFilePath: string,
    shareWithUsername: string,
    expireDate?: Date,
  ): Promise<string> {
    const raw = await fetch(`${this.ncBasePath}/ocs/v2.php/apps/files_sharing/api/v1/shares`, {
      method: 'POST',
      headers: this.nextcloudCommonService.getOCSHeaders(this.ncUsername, this.ncAppPassword),
      body: JSON.stringify({
        path: ncFilePath,
        permissions: SharePermissions.ReadOnly,
        expireDate: expireDate ? expireDate.toISOString().slice(0, 10) : undefined,
        shareType: ShareType.User,
        shareWith: shareWithUsername,
      }),
    });
    if (!raw.ok) {
      throw new Error(`Failed to share with user: ${raw.status} ${raw.statusText}`);
    }
    const response = await raw.json();
    return response.ocs.data.url;
  }

  public async createDirectory(ncDirectoryPath: string): Promise<boolean> {
    const response = await fetch(`${this.ncBasePath}/remote.php/webdav/${ncDirectoryPath}`, {
      method: 'MKCOL',
      headers: this.nextcloudCommonService.getOCSHeaders(this.ncUsername, this.ncAppPassword),
    });
    return response.ok;
  }

  public async addTagByFileId(fileId: number, tagId: number): Promise<boolean> {
    const response = await fetch(
      `${this.ncBasePath}/remote.php/dav/systemtags-relations/files/${fileId}/${tagId}`,
      {
        method: 'PUT',
        headers: this.nextcloudCommonService.getJsonResponseHeaders(
          this.ncUsername,
          this.ncAppPassword,
        ),
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

  public async upload(filePath: string, fileBuffer: Buffer): Promise<boolean> {
    return await this.getWebDavClient().putFileContents(filePath, fileBuffer, {});
  }

  public async bulkUpload(
    path: string,
    list: { fileName: string; buffer: Buffer }[],
  ): Promise<boolean[]> {
    return Promise.all(list.map((value) => this.upload(`${path}/${value.fileName}`, value.buffer)));
  }

  public async download(filePath: string): Promise<Buffer> {
    return this.getWebDavClient().getFileContents(filePath) as unknown as Buffer;
  }

  public stream(filePath: string): NodeJS.ReadableStream {
    return this.getWebDavClient().createReadStream(filePath);
  }

  public async countFiles(
    directoryPath: string,
    createIfNotExisting: boolean = false,
  ): Promise<number> {
    try {
      const results: FileStat[] = (await this.getWebDavClient().getDirectoryContents(
        directoryPath,
      )) as FileStat[];
      return results.filter((entry) => entry.type === 'file').length;
    } catch (err) {
      if (createIfNotExisting) {
        await this.getWebDavClient().createDirectory(directoryPath);
        return this.countFiles(directoryPath);
      }
      throw err;
    }
  }

  public async listFilePaths(directoryPath: string): Promise<string[]> {
    const results: FileStat[] = (await this.getWebDavClient().getDirectoryContents(
      directoryPath,
    )) as FileStat[];
    return results.filter((entry) => entry.type === 'file').map((entry) => entry.filename);
  }

  public async listFileBasenames(directoryPath: string): Promise<string[]> {
    return (await this.listFilePaths(directoryPath)).map((entry) => basename(entry));
  }

  public async moveFile(sourcePath: string, targetPath: string): Promise<void> {
    return this.getWebDavClient().moveFile(sourcePath, targetPath);
  }

  public async createFileFromTemplate(targetPath: string, templatePath: string): Promise<string> {
    await this.upload(targetPath, await this.download(templatePath));
    return targetPath;
  }

  public async createFileFromTemplateAndReplace(
    targetPath: string,
    templatePath: string,
    replacementList: [RegExp, string][],
  ): Promise<string> {
    const buffer = await this.download(templatePath);
    let documentToUpload = buffer.toString();
    for (const [regexp, replacement] of replacementList) {
      documentToUpload = documentToUpload.replace(regexp, replacement);
    }
    await this.upload(targetPath, Buffer.from(documentToUpload));
    return targetPath;
  }

  public async appendToFile(ncPath: string, line: string, localNcRoot?: string): Promise<void> {
    const localFilePath = localNcRoot ? join(localNcRoot, ncPath) : undefined;
    const content = localFilePath
      ? (await fs.readFile(localFilePath)).toString()
      : (await this.download(ncPath)).toString();
    const separator = content.length === 0 || content.endsWith('\n') ? '' : '\n';
    const updated = Buffer.from(content + separator + line + '\n');
    if (localFilePath) {
      await fs.writeFile(localFilePath, updated);
    }
    await this.upload(ncPath, updated);
  }

  public async mirrorDirectory(ncPath: string, localPath: string): Promise<void> {
    const entries = (await this.getWebDavClient().getDirectoryContents(ncPath, {
      deep: true,
    })) as FileStat[];

    await fs.mkdir(join(localPath, ncPath), { recursive: true });

    const sorted = [...entries].sort((a, b) => {
      if (a.type === b.type) return 0;
      return a.type === 'directory' ? -1 : 1;
    });

    for (const entry of sorted) {
      if (entry.filename === ncPath) continue;
      const localEntryPath = join(localPath, entry.filename);

      if (entry.type === 'directory') {
        await fs.mkdir(localEntryPath, { recursive: true });
      } else {
        await this.downloadIfOutOfSync(entry, localEntryPath);
      }
    }
  }

  private async downloadIfOutOfSync(entry: FileStat, localFilePath: string): Promise<void> {
    const remoteLastMod = new Date(entry.lastmod).getTime();
    try {
      const stat = await fs.stat(localFilePath);
      if (stat.mtimeMs >= remoteLastMod) return;
    } catch {
      // file does not exist locally
    }
    const content = await this.download(entry.filename);
    await fs.writeFile(localFilePath, content);
  }
}
