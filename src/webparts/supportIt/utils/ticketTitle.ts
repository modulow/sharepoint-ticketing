export const TICKET_TITLE_PREFIX = 'Learn IT Helpdesk';
export const TICKET_TITLE_MAX_LENGTH = 255;

export function normalizeTicketTitle(value: string): string {
  let subject = value.trim();
  const existingPrefix = /^Learn IT Helpdesk(?:\s*-\s*|\s+|$)/i;
  while (existingPrefix.test(subject)) {
    subject = subject.replace(existingPrefix, '').trim();
  }
  if (!subject) {
    throw new Error('A ticket subject is required after Learn IT Helpdesk.');
  }
  const title = `${TICKET_TITLE_PREFIX} - ${subject}`;
  if (title.length > TICKET_TITLE_MAX_LENGTH) {
    throw new Error(`The complete ticket title must not exceed 255 characters, including "Learn IT Helpdesk - ". Shorten the subject to ${TICKET_TITLE_MAX_LENGTH - TICKET_TITLE_PREFIX.length - 3} characters; no text has been removed.`);
  }
  return title;
}
