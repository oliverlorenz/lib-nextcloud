import { NextcloudHeaderService } from './NextcloudHeaderService';

export class NextcloudTagService {
  constructor(private nextcloudCommonService: NextcloudHeaderService) {}

  public async getTags(
    ncBasePath: string,
    ncUsername: string,
    ncAppPassword: string,
  ): Promise<boolean> {
    const headers = new Headers();
    headers.append('Content-Type', 'application/json');
    headers.append('Accept', 'application/json');
    headers.append('Authorization', `Basic ${btoa(`${ncUsername}:${ncAppPassword}`)}`);

    const response = await fetch(`${ncBasePath}/remote.php/dav/systemtags`, {
      method: 'PROPFIND',
      headers,
    });

    const data = await response.text();
    console.log(data);

    if (!response.ok) {
      if (response.status === 409) {
        return true;
      }
      throw new Error('Failed to create tag');
    }
    return true;
  }

  public async createTag(
    ncBasePath: string,
    ncUsername: string,
    ncAppPassword: string,
    tagName: string,
  ): Promise<boolean> {
    const headers = new Headers();
    headers.append('Content-Type', 'application/json');
    headers.append('Accept', 'application/json');
    headers.append('Authorization', `Basic ${btoa(`${ncUsername}:${ncAppPassword}`)}`);

    const response = await fetch(`${ncBasePath}/remote.php/dav/systemtags`, {
      method: 'POST',
      headers,
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

  public async addTagByIdToFileById(
    ncBasePath: string,
    ncUsername: string,
    ncAppPassword: string,
    tagId: number,
    fileId: number,
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
}
