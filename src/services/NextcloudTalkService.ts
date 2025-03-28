import { randomUUID } from "crypto";

export class NextcloudTalkService {
  public async sendTextMessage(
    ncBasePath: string,
    ncUsername: string,
    ncAppPassword: string,
    channelId: string,
    message: string,
  ): Promise<string> {
    const headers = new Headers();
    headers.append('OCS-APIRequest', 'true');
    headers.append('Content-Type', 'application/json');
    headers.append('Accept', 'application/json');
    headers.append('Authorization', `Basic ${btoa(`${ncUsername}:${ncAppPassword}`)}`);

    const referenceId = randomUUID().toString();

    const response = await fetch(`${ncBasePath}/ocs/v2.php/apps/spreed/api/v1/chat/${channelId}`, {
      method: 'POST',
      body: JSON.stringify({ message, referenceId }),
      headers,
    });
    if (!response.ok) {
      throw new Error(`Failed to send message: ${response.statusText}`);
    }
    return referenceId;
  }

  public async sendFileMessage(
    ncBasePath: string,
    ncUsername: string,
    ncAppPassword: string,
    channelId: string,
    ncFilePath: string,
  ): Promise<string> {
    const headers = new Headers();
    headers.append('OCS-APIRequest', 'true');
    headers.append('Content-Type', 'application/json');
    headers.append('Accept', 'application/json');
    headers.append('Authorization', `Basic ${btoa(`${ncUsername}:${ncAppPassword}`)}`);

    const referenceId = randomUUID().toString();

    console.log('Sending file', {
      shareType: 10,
      path: ncFilePath,
      shareWith: channelId,
    });

    const response = await fetch(`${ncBasePath}/ocs/v2.php/apps/files_sharing/api/v1/shares`, {
      method: 'POST',
      body: JSON.stringify({
        shareType: 10,
        path: ncFilePath,
        shareWith: channelId,
      }),
      headers,
    });
    if (!response.ok) {
      throw new Error(`Failed to send file: ${response.statusText}, ${await response.json()}`);
    }
    return referenceId;
  }

  public async sendPollMessage(
    ncBasePath: string,
    ncUsername: string,
    ncAppPassword: string,
    channelId: string,
    question: string,
    answers: string[],
    maxVotes: number = 1,
  ): Promise<void> {
    const headers = new Headers();
    headers.append('OCS-APIRequest', 'true');
    headers.append('Content-Type', 'application/json');
    headers.append('Accept', 'application/json');
    headers.append('Authorization', `Basic ${btoa(`${ncUsername}:${ncAppPassword}`)}`);

    const response = await fetch(`${ncBasePath}/ocs/v2.php/apps/spreed/api/v1/poll/${channelId}`, {
      method: 'POST',
      body: JSON.stringify({
        question,
        options: answers,
        maxVotes,
        resultMode: 0,
      }),
      headers,
    });
    if (!response.ok) {
      throw new Error(`Failed to send poll: ${response.statusText}, ${await response.json()}`);
    }
    return;
  }
}
