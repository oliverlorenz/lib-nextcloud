# lib-nextcloud

A TypeScript library for interacting with Nextcloud APIs. Covers files, calendars, contacts, tags, Talk chat, and polls.

## Installation

```bash
npm install @oliverlorenz/lib-nextcloud
```

## Requirements

- Node.js >= 22
- A Nextcloud instance with an **App Password** (see [Authentication](#authentication))

## Authentication

This library uses HTTP Basic Auth with a Nextcloud [App Password](https://docs.nextcloud.com/server/latest/user_manual/en/session_management.html#managing-devices).

To create one: **Nextcloud → Settings → Security → App passwords → Generate new app password**

Never use your main account password. App passwords can be revoked individually.

## Usage

Every service provides a static `create()` factory for quick setup:

```ts
import { NextcloudFileService } from '@oliverlorenz/lib-nextcloud';

const files = NextcloudFileService.create(
  'https://nextcloud.example.com',
  'myuser',
  'app-password-here',
);
```

For dependency injection in frameworks like NestJS, you can also use the constructor directly — all services accept a `NextcloudHeaderService` instance as a last parameter.

---

## Services

### FileService

```ts
import { NextcloudFileService } from '@oliverlorenz/lib-nextcloud';

const files = NextcloudFileService.create('https://nc.example.com', 'user', 'pass');
```

| Method | Description |
|---|---|
| `upload(path, buffer)` | Upload a file buffer to a WebDAV path |
| `bulkUpload(directory, list)` | Upload multiple files into a directory |
| `download(path)` | Download a file as a `Buffer` |
| `stream(path)` | Get a readable stream for a file |
| `moveFile(source, target)` | Move or rename a file |
| `createDirectory(path)` | Create a directory via WebDAV |
| `countFiles(path, createIfNotExisting?)` | Count files in a directory (optionally create it) |
| `listFilePaths(path)` | List full paths of all files in a directory |
| `listFileBasenames(path)` | List filenames (without path) in a directory |
| `sharePublicly(path, expireDate?)` | Create a public share link |
| `shareWithUser(path, username, expireDate?)` | Share a file with another Nextcloud user |
| `addTagByFileId(fileId, tagId)` | Assign a tag to a file by its numeric IDs |
| `createFileFromTemplate(target, template)` | Copy a template file to a new path |
| `createFileFromTemplateAndReplace(target, template, replacements)` | Copy a template and apply regexp replacements |

**Examples**

```ts
// Upload
const buffer = fs.readFileSync('./report.pdf');
await files.upload('/reports/2025/report.pdf', buffer);

// Share publicly with expiry
const url = await files.sharePublicly('/reports/2025/report.pdf', new Date('2025-12-31'));
console.log(url); // https://nc.example.com/s/abc123

// List files
const paths = await files.listFilePaths('/photos');
// ['/photos/a.jpg', '/photos/b.jpg']

// Template with replacements
await files.createFileFromTemplateAndReplace(
  '/contracts/john-doe.docx',
  '/templates/contract.docx',
  [
    [/\{\{NAME\}\}/g, 'John Doe'],
    [/\{\{DATE\}\}/g, '2025-01-01'],
  ],
);
```

---

### CalendarService

```ts
import { NextcloudCalendarService } from '@oliverlorenz/lib-nextcloud';

const calendar = NextcloudCalendarService.create('https://nc.example.com', 'user', 'pass');
```

| Method | Description |
|---|---|
| `getEvents(calendarName, start?, end?)` | Fetch events from a calendar, optionally within a time range |
| `isEventInTimeframe(calendarName, titleRegex, start, end)` | Check whether a matching event exists in a time range |

**Examples**

```ts
// All events in a calendar
const events = await calendar.getEvents('personal');
// [{ start: Date, title: string }, ...]

// Events in a specific range
const events = await calendar.getEvents(
  'personal',
  new Date('2025-01-01'),
  new Date('2025-01-31'),
);

// Check for a meeting
const hasMeeting = await calendar.isEventInTimeframe(
  'work',
  /standup/i,
  new Date('2025-06-01'),
  new Date('2025-06-07'),
);
```

---

### ContactService

```ts
import { NextcloudContactService } from '@oliverlorenz/lib-nextcloud';

const contacts = NextcloudContactService.create('https://nc.example.com', 'user', 'pass');
```

| Method | Description |
|---|---|
| `getContacts(addressBook)` | Fetch all contacts from an address book |
| `getContactByPhoneNumber(addressBook, phoneNumber)` | Find a contact by phone number |

**Examples**

```ts
// All contacts
const all = await contacts.getContacts('contacts');
// [{ firstName, lastName, address, postalCode, city, email[], phoneNumber[], birthday?, username? }]

// Lookup by phone number (E.164 format recommended)
const contact = await contacts.getContactByPhoneNumber('contacts', '+491511234567');
if (contact) {
  console.log(`${contact.firstName} ${contact.lastName}`);
}
```

---

### TagService

```ts
import { NextcloudTagService } from '@oliverlorenz/lib-nextcloud';

const tags = NextcloudTagService.create('https://nc.example.com', 'user', 'pass');
```

| Method | Description |
|---|---|
| `getTags()` | Fetch all system tags |
| `createTag(name)` | Create a new system tag (idempotent — 409 is treated as success) |
| `addTagByIdToFileById(tagId, fileId)` | Assign a tag to a file by their numeric IDs |

**Examples**

```ts
await tags.createTag('processed');
await tags.addTagByIdToFileById(42, 1337);
```

---

### TalkService

```ts
import { NextcloudTalkService } from '@oliverlorenz/lib-nextcloud';

const talk = NextcloudTalkService.create('https://nc.example.com', 'user', 'pass');
```

| Method | Description |
|---|---|
| `sendTextMessage(channelId, message)` | Send a text message to a Talk room |
| `sendFileMessage(channelId, filePath)` | Share a Nextcloud file into a Talk room |
| `sendPollMessage(channelId, question, answers, maxVotes?)` | Post a poll to a Talk room |

The `channelId` is the Talk room token, visible in the URL when inside a conversation.

**Examples**

```ts
// Send a text message
const refId = await talk.sendTextMessage('abc123token', 'Deployment done!');

// Share a file
await talk.sendFileMessage('abc123token', '/reports/2025/summary.pdf');

// Post a poll
await talk.sendPollMessage('abc123token', 'When should we meet?', ['Monday', 'Tuesday', 'Wednesday']);
```

---

### PollService

```ts
import { NextcloudPollService } from '@oliverlorenz/lib-nextcloud';

const polls = NextcloudPollService.create('https://nc.example.com', 'user', 'pass');
```

| Method | Description |
|---|---|
| `createTextPoll(title, options, config)` | Create a Polls app poll and return its public share URL |

```ts
import { NextcloudPollAccess, NextcloudPollShowResults } from '@oliverlorenz/lib-nextcloud';

const url = await polls.createTextPoll(
  'Team lunch location',
  ['Italian', 'Thai', 'Mexican'],
  {
    access: NextcloudPollAccess.OPEN,
    showResults: NextcloudPollShowResults.ALWAYS,
    expire: 0,
  },
);
console.log(url); // public share link to the poll
```

---

## Development

```bash
# Install dependencies
npm install

# Build
npm run build

# Run tests with coverage
npm test

# Watch mode
npm run test:watch

# Linting
npm run lint:eslint
npm run lint:types
```

## Contributing

Bug reports and pull requests are welcome at [github.com/oliverlorenz/lib-nextcloud](https://github.com/oliverlorenz/lib-nextcloud/issues).
