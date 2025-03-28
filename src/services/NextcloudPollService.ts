import {
  NextcloudPollAccess,
  NextcloudPollConfiguration,
  NextcloudPollShowResults,
  NextcloudPollType,
} from '../types';

export class NextcloudPollService {
  public async createTextPoll(
    ncBasePath: string,
    ncUsername: string,
    ncAppPassword: string,
    title: string,
    options: string[],
    config: NextcloudPollConfiguration,
  ): Promise<string> {
    const rawResponse = await fetch(`${ncBasePath}/index.php/apps/polls/api/v1.0/poll`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json;charset=utf-8',
        Authorization: `Basic ${btoa(`${ncUsername}:${ncAppPassword}`)}`,
        accept: 'application/json',
      },
      body: JSON.stringify({
        title,
        type: NextcloudPollType.TEXT,
        access: config?.access || NextcloudPollAccess.OPEN,
        showResults: config?.showResults || NextcloudPollShowResults.ALWAYS,
        expiresAt: config?.expire,
      }),
    });

    const response = await rawResponse.json();
    const pollId = response.poll.id;

    if (config) {
      await fetch(`${ncBasePath}/index.php/apps/polls/api/v1.0/poll/${pollId}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json;charset=utf-8',
          Authorization: `Basic ${btoa(`${ncUsername}:${ncAppPassword}`)}`,
          accept: 'application/json',
        },
        body: JSON.stringify({
          pollConfiguration: config,
        }),
      });
    }

    for (const option of options) {
      await fetch(`${ncBasePath}/index.php/apps/polls/api/v1.0/poll/${response.poll.id}/option`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json;charset=utf-8',
          Authorization: `Basic ${btoa(`${ncUsername}:${ncAppPassword}`)}`,
          accept: 'application/json',
        },
        body: JSON.stringify({
          pollOptionText: option,
        }),
      });
    }
    await fetch(
      `${ncBasePath}/index.php/apps/polls/api/v1.0/poll/${response.poll.id}/share/public`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json;charset=utf-8',
          Authorization: `Basic ${btoa(`${ncUsername}:${ncAppPassword}`)}`,
          accept: 'application/json',
        },
        body: JSON.stringify({
          type: 'public',
        }),
      },
    );
    const rawShareResponse = await fetch(
      `${ncBasePath}/index.php/apps/polls/api/v1.0/poll/${response.poll.id}/shares`,
      {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json;charset=utf-8',
          Authorization: `Basic ${btoa(`${ncUsername}:${ncAppPassword}`)}`,
          accept: 'application/json',
        },
      },
    );
    const shareResponse = await rawShareResponse.json();
    return shareResponse.shares[0].URL;
  }
}
