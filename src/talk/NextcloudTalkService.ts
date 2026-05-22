import { randomUUID } from 'crypto';

const TalkShareType = {
  Room: 10,
} as const;

export class NextcloudTalkService {
  public static create(
    ncBasePath: string,
    ncUsername: string,
    ncAppPassword: string,
  ): NextcloudTalkService {
    return new NextcloudTalkService(ncBasePath, ncUsername, ncAppPassword);
  }

  constructor(
    private ncBasePath: string,
    private ncUsername: string,
    private ncAppPassword: string,
  ) {}

  private getHeaders(): Headers {
    const headers = new Headers();
    headers.append('OCS-APIRequest', 'true');
    headers.append('Content-Type', 'application/json');
    headers.append('Accept', 'application/json');
    headers.append('Authorization', `Basic ${btoa(`${this.ncUsername}:${this.ncAppPassword}`)}`);
    return headers;
  }

  public async sendTextMessage(channelId: string, message: string): Promise<string> {
    const referenceId = randomUUID().toString();
    const response = await fetch(
      `${this.ncBasePath}/ocs/v2.php/apps/spreed/api/v1/chat/${channelId}`,
      {
        method: 'POST',
        body: JSON.stringify({ message, referenceId }),
        headers: this.getHeaders(),
      },
    );
    if (!response.ok) {
      throw new Error(`Failed to send message: ${response.statusText}`);
    }
    return referenceId;
  }

  public async sendFileMessage(channelId: string, ncFilePath: string): Promise<string> {
    const referenceId = randomUUID().toString();
    const response = await fetch(
      `${this.ncBasePath}/ocs/v2.php/apps/files_sharing/api/v1/shares`,
      {
        method: 'POST',
        body: JSON.stringify({ shareType: TalkShareType.Room, path: ncFilePath, shareWith: channelId }),
        headers: this.getHeaders(),
      },
    );
    if (!response.ok) {
      throw new Error(`Failed to send file: ${response.statusText}, ${await response.json()}`);
    }
    return referenceId;
  }

  public async sendPollMessage(
    channelId: string,
    question: string,
    answers: string[],
    maxVotes: number = 1,
  ): Promise<void> {
    const response = await fetch(
      `${this.ncBasePath}/ocs/v2.php/apps/spreed/api/v1/poll/${channelId}`,
      {
        method: 'POST',
        body: JSON.stringify({ question, options: answers, maxVotes, resultMode: 0 }),
        headers: this.getHeaders(),
      },
    );
    if (!response.ok) {
      throw new Error(`Failed to send poll: ${response.statusText}, ${await response.json()}`);
    }
  }
}
