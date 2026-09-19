import {
  SPHttpClient,
  SPHttpClientResponse
} from '@microsoft/sp-http';
import type { WebPartContext } from '@microsoft/sp-webpart-base';
import type {
  INewTicket,
  ITicket,
  ITicketUpdate,
  IUserContext,
  IUserSummary
} from '../models/Ticket';
import type { ITicketService } from './ITicketService';

interface IODataCollection<T> {
  value: T[];
}

interface ISharePointUser {
  Id: number;
  Title: string;
  EMail?: string;
}

interface ISharePointGroup {
  Title: string;
}

interface ISharePointTicket {
  Id: number;
  Title: string;
  Description: string;
  Category: ITicket['category'];
  Priority: ITicket['priority'];
  Status: ITicket['status'];
  AssignedTo?: ISharePointUser;
  DueDate?: string;
  Resolution?: string;
  Author: ISharePointUser;
  Created: string;
  Modified: string;
  Attachments: boolean;
  AttachmentFiles?: unknown[];
}

const LIST_TITLE = 'Tickets';
const AGENTS_GROUP = 'Support IT Agents';

export class SharePointTicketService implements ITicketService {
  public constructor(private readonly context: WebPartContext) {}

  public async getUserContext(): Promise<IUserContext> {
    const userResponse = await this.get<ISharePointUser>('/_api/web/currentuser');
    const groupsResponse = await this.get<IODataCollection<ISharePointGroup>>(
      `/_api/web/currentuser/groups?$select=Title&$filter=Title eq '${AGENTS_GROUP.replace(/'/g, "''")}'`
    );

    return {
      user: this.mapUser(userResponse),
      isAgent: groupsResponse.value.some(group => group.Title === AGENTS_GROUP)
    };
  }

  public async getTickets(context: IUserContext): Promise<ITicket[]> {
    const select = [
      'Id', 'Title', 'Description', 'Category', 'Priority', 'Status',
      'AssignedTo/Id', 'AssignedTo/Title', 'AssignedTo/EMail',
      'DueDate', 'Resolution', 'Author/Id', 'Author/Title', 'Author/EMail',
      'Created', 'Modified', 'Attachments', 'AttachmentFiles'
    ].join(',');
    const filter = context.isAgent ? '' : `&$filter=AuthorId eq ${context.user.id}`;
    const endpoint =
      `/_api/web/lists/getbytitle('${LIST_TITLE}')/items` +
      `?$select=${select}&$expand=Author,AssignedTo,AttachmentFiles${filter}&$orderby=Modified desc&$top=5000`;
    const response = await this.get<IODataCollection<ISharePointTicket>>(endpoint);
    return response.value.map(item => this.mapTicket(item));
  }

  public async createTicket(ticket: INewTicket): Promise<ITicket> {
    const endpoint = `/_api/web/lists/getbytitle('${LIST_TITLE}')/items`;
    const response = await this.post<ISharePointTicket>(endpoint, {
      Title: ticket.subject.trim(),
      Description: ticket.description.trim(),
      Category: ticket.category,
      Priority: ticket.priority,
      Status: 'New'
    });

    return this.getTicket(response.Id);
  }

  public async getAssignableUsers(): Promise<IUserSummary[]> {
    const response = await this.get<IODataCollection<ISharePointUser>>(
      '/_api/web/siteusers?$select=Id,Title,EMail&$orderby=Title&$top=500'
    );
    return response.value
      .filter(user => Boolean(user.EMail))
      .map(user => this.mapUser(user));
  }

  public async updateTicket(id: number, update: ITicketUpdate): Promise<void> {
    const endpoint = `/_api/web/lists/getbytitle('${LIST_TITLE}')/items(${id})`;
    const body: Record<string, string | number | null> = {
      Status: update.status,
      Priority: update.priority,
      DueDate: update.dueDate ? new Date(`${update.dueDate}T12:00:00`).toISOString() : null,
      Resolution: update.resolution?.trim() || null
    };
    if (update.clearAssignment) {
      body.AssignedToId = null;
    } else if (update.assignedToId !== undefined) {
      body.AssignedToId = update.assignedToId;
    }
    await this.post<void>(
      endpoint,
      body,
      { 'IF-MATCH': '*', 'X-HTTP-Method': 'MERGE' }
    );
  }

  private async getTicket(id: number): Promise<ITicket> {
    const endpoint =
      `/_api/web/lists/getbytitle('${LIST_TITLE}')/items(${id})` +
      '?$select=Id,Title,Description,Category,Priority,Status,AssignedTo/Id,AssignedTo/Title,' +
      'AssignedTo/EMail,DueDate,Resolution,Author/Id,Author/Title,Author/EMail,Created,Modified,' +
      'Attachments,AttachmentFiles&$expand=Author,AssignedTo,AttachmentFiles';
    return this.mapTicket(await this.get<ISharePointTicket>(endpoint));
  }

  private async get<T>(serverRelativeUrl: string): Promise<T> {
    const response = await this.context.spHttpClient.get(
      `${this.context.pageContext.web.absoluteUrl}${serverRelativeUrl}`,
      SPHttpClient.configurations.v1,
      { headers: { Accept: 'application/json;odata=nometadata' } }
    );
    await this.ensureSuccess(response);
    return response.json() as Promise<T>;
  }

  private async post<T>(
    serverRelativeUrl: string,
    body: object,
    additionalHeaders: Record<string, string> = {}
  ): Promise<T> {
    const response = await this.context.spHttpClient.post(
      `${this.context.pageContext.web.absoluteUrl}${serverRelativeUrl}`,
      SPHttpClient.configurations.v1,
      {
        headers: {
          Accept: 'application/json;odata=nometadata',
          'Content-Type': 'application/json;odata=nometadata',
          ...additionalHeaders
        },
        body: JSON.stringify(body)
      }
    );
    await this.ensureSuccess(response);
    if (response.status === 204) {
      return undefined as T;
    }
    return response.json() as Promise<T>;
  }

  private async ensureSuccess(response: SPHttpClientResponse): Promise<void> {
    if (response.ok) {
      return;
    }

    let detail = response.statusText;
    try {
      const body = await response.json() as { error?: { message?: string } };
      detail = body.error?.message || detail;
    } catch {
      const text = await response.text();
      detail = text || detail;
    }
    throw new Error(`SharePoint ${response.status}: ${detail}`);
  }

  private mapTicket(item: ISharePointTicket): ITicket {
    return {
      id: item.Id,
      subject: item.Title,
      description: item.Description,
      category: item.Category,
      priority: item.Priority,
      status: item.Status,
      assignedTo: item.AssignedTo ? this.mapUser(item.AssignedTo) : undefined,
      dueDate: item.DueDate,
      resolution: item.Resolution,
      author: this.mapUser(item.Author),
      created: item.Created,
      modified: item.Modified,
      attachmentCount: item.AttachmentFiles?.length ?? (item.Attachments ? 1 : 0)
    };
  }

  private mapUser(user: ISharePointUser): IUserSummary {
    return {
      id: user.Id,
      displayName: user.Title,
      email: user.EMail || ''
    };
  }
}
