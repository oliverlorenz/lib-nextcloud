import type { NextcloudPollConfiguration } from './NextcloudPollTypes';
import { NextcloudPollType } from './NextcloudPollTypes';

export class NextcloudPollService {
  public static create(
    ncBasePath: string,
    ncUsername: string,
    ncAppPassword: string,
  ): NextcloudPollService {
    return new NextcloudPollService(ncBasePath, ncUsername, ncAppPassword);
  }

  constructor(
    private ncBasePath: string,
    private ncUsername: string,
    private ncAppPassword: string,
  ) {}

  public async createTextPoll(
    title: string,
    options: string[],
    config: NextcloudPollConfiguration,
  ): Promise<string> {
    const createRaw = await fetch(`${this.ncBasePath}/index.php/apps/polls/api/v1.0/poll`, {
      method: 'POST',
      headers: this.getHeaders(),
      body: JSON.stringify({
        title,
        type: NextcloudPollType.TEXT,
        access: config.access,
        showResults: config.showResults,
        expiresAt: config.expire,
      }),
    });
    if (!createRaw.ok) {
      throw new Error(`Failed to create poll: ${createRaw.status} ${createRaw.statusText}`);
    }
    const createResponse = await createRaw.json();
    const pollId = createResponse.poll.id;

    const updateRaw = await fetch(
      `${this.ncBasePath}/index.php/apps/polls/api/v1.0/poll/${pollId}`,
      {
        method: 'PUT',
        headers: this.getHeaders(),
        body: JSON.stringify({ pollConfiguration: config }),
      },
    );
    if (!updateRaw.ok) {
      throw new Error(`Failed to update poll: ${updateRaw.status} ${updateRaw.statusText}`);
    }

    for (const option of options) {
      const optionRaw = await fetch(
        `${this.ncBasePath}/index.php/apps/polls/api/v1.0/poll/${pollId}/option`,
        {
          method: 'POST',
          headers: this.getHeaders(),
          body: JSON.stringify({ pollOptionText: option }),
        },
      );
      if (!optionRaw.ok) {
        throw new Error(
          `Failed to add poll option "${option}": ${optionRaw.status} ${optionRaw.statusText}`,
        );
      }
    }

    const shareRaw = await fetch(
      `${this.ncBasePath}/index.php/apps/polls/api/v1.0/poll/${pollId}/share/public`,
      {
        method: 'POST',
        headers: this.getHeaders(),
        body: JSON.stringify({ type: 'public' }),
      },
    );
    if (!shareRaw.ok) {
      throw new Error(`Failed to create poll share: ${shareRaw.status} ${shareRaw.statusText}`);
    }

    const sharesRaw = await fetch(
      `${this.ncBasePath}/index.php/apps/polls/api/v1.0/poll/${pollId}/shares`,
      { method: 'GET', headers: this.getHeaders() },
    );
    if (!sharesRaw.ok) {
      throw new Error(`Failed to fetch poll shares: ${sharesRaw.status} ${sharesRaw.statusText}`);
    }
    const sharesResponse = await sharesRaw.json();
    return sharesResponse.shares[0].URL;
  }

  private getHeaders(): HeadersInit {
    return {
      'Content-Type': 'application/json;charset=utf-8',
      Authorization: `Basic ${btoa(`${this.ncUsername}:${this.ncAppPassword}`)}`,
      accept: 'application/json',
    };
  }
}
