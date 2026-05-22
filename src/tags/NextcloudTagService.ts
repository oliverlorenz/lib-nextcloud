import { NextcloudHeaderService } from '../shared/NextcloudHeaderService';

export class NextcloudTagService {
  static create(
    ncBasePath: string,
    ncUsername: string,
    ncAppPassword: string,
  ): NextcloudTagService {
    return new NextcloudTagService(
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

  public async getTags(): Promise<boolean> {
    const response = await fetch(`${this.ncBasePath}/remote.php/dav/systemtags`, {
      method: 'PROPFIND',
      headers: this.nextcloudCommonService.getJsonResponseHeaders(this.ncUsername, this.ncAppPassword),
    });

    if (!response.ok) {
      if (response.status === 409) {
        return true;
      }
      throw new Error('Failed to get tags');
    }
    return true;
  }

  public async createTag(tagName: string): Promise<boolean> {
    const response = await fetch(`${this.ncBasePath}/remote.php/dav/systemtags`, {
      method: 'POST',
      headers: this.nextcloudCommonService.getJsonResponseHeaders(this.ncUsername, this.ncAppPassword),
      body: JSON.stringify({
        userVisible: true,
        userAssignable: true,
        canAssign: true,
        name: tagName,
      }),
    });

    if (!response.ok) {
      if (response.status === 409) {
        return true;
      }
      throw new Error('Failed to create tag');
    }
    return true;
  }

  public async addTagByIdToFileById(tagId: number, fileId: number): Promise<boolean> {
    const response = await fetch(
      `${this.ncBasePath}/remote.php/dav/systemtags-relations/files/${fileId}/${tagId}`,
      { method: 'PUT', headers: this.nextcloudCommonService.getJsonResponseHeaders(this.ncUsername, this.ncAppPassword) },
    );
    if (!response.ok) {
      if (response.status === 409) {
        return true;
      }
      throw new Error('Failed to add tag to file');
    }
    return true;
  }
}
