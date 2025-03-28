import { join, basename } from "path";
import { writeFile } from "fs/promises";
import { tmpdir } from "os";
import { AuthType, FileStat, WebDAVClient, createClient } from "webdav";

export class NextcloudService {
  private webdav: WebDAVClient;
  constructor(
    private url: string,
    username: string,
    password: string,
  ) {
    this.webdav = createClient(`${url}/remote.php/webdav/`, {
      authType: AuthType.Password,
      username,
      password,
      maxBodyLength: Infinity,
    });
  }

  async upload(filePath: string, fileBuffer: Buffer) {
    await this.webdav.putFileContents(filePath, fileBuffer, {});
  }

  async bulkUpload(path: string, list: { fileName: string; buffer: Buffer }[]) {
    return Promise.all(
      list.map((value) => {
        return this.upload(`${path}/${value.fileName}`, value.buffer);
      }),
    );
  }

  async download(filePath: string): Promise<Buffer> {
    return this.webdav.getFileContents(filePath) as unknown as Buffer;
  }

  stream(filePath: string) {
    return this.webdav.createReadStream(filePath);
  }

  async downloadToFilesystem(ncFilePath: string, outputFilePath?: string) {
    if (!outputFilePath) {
      const fileName = basename(ncFilePath);
      outputFilePath = join(tmpdir(), fileName);
    }
    const fileContent = await this.download(ncFilePath);
    await writeFile(outputFilePath, fileContent);
    return outputFilePath;
  }

  createWebDavLink(ncFilePath: string) {
    return `${this.url}/remote.php/webdav/${ncFilePath}`;
  }

  async countFiles(
    directoryPath: string,
    createIfNotExisting: boolean = false,
  ): Promise<number> {
    try {
      const results: FileStat[] = (await this.webdav.getDirectoryContents(
        directoryPath,
      )) as FileStat[];
      results.filter((entry) => {
        return entry.type === "file";
      });
      return results.length;
    } catch (err) {
      if (createIfNotExisting) {
        await this.webdav.createDirectory(directoryPath);
        return this.countFiles(directoryPath);
      }
      throw err;
    }
  }
  async listFilePaths(directoryPath: string) {
    const results: FileStat[] = (await this.webdav.getDirectoryContents(
      directoryPath,
    )) as FileStat[];
    return results
      .filter((entry) => {
        return entry.type === "file";
      })
      .map((entry) => {
        return entry.filename;
      });
  }

  async listFileBasenames(directoryPath: string) {
    return (await this.listFilePaths(directoryPath)).map((entry) => {
      return basename(entry);
    });
  }

  async moveFile(sourcePath: string, targetPath: string) {
    return this.webdav.moveFile(sourcePath, targetPath);
  }

  async createFileFromTemplate(
    targetPath: string,
    templatePath: string,
  ): Promise<string> {
    await this.upload(targetPath, await this.download(templatePath));
    return targetPath;
  }

  async createFileFromTemplateAndReplace(
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
}
