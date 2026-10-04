import {
  MSGraphClientV3,
  SPHttpClient,
  SPHttpClientResponse
} from '@microsoft/sp-http';
import type { WebPartContext } from '@microsoft/sp-webpart-base';
import type {
  ITicket,
  ITicketUpdate,
  IUserContext,
  IUserSummary
} from '../models/Ticket';
import type { ITicketService } from './ITicketService';
import {
  EUROPA_TICKETS_LIST_ID,
  KIWI_AGENTS_GROUP,
  KIWI_INTAKE_FORM_URL,
  KIWI_SITE_URL,
  LEARN_IT_GROUP_ID
} from './KiwiConfiguration';
import {
  resolveTicketSchema,
  type ISharePointFieldMetadata,
  type ITicketSchema
} from './TicketSchema';

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

interface ISharePointTicket extends Record<string, unknown> {
  Id: number;
  Author: ISharePointUser;
  Created: string;
  Modified: string;
  Attachments: boolean;
  AttachmentFiles?: unknown[];
}

interface IGraphUser {
  id: string;
  displayName?: string;
  mail?: string;
  userPrincipalName?: string;
}

interface IGraphCollection<T> {
  value: T[];
  '@odata.nextLink'?: string;
}

const LIST_ENDPOINT = `/_api/web/lists(guid'${EUROPA_TICKETS_LIST_ID}')`;
const defaultCategory: ITicket['category'] = 'Other';
const defaultPriority: ITicket['priority'] = 'Normal';
const defaultStatus: ITicket['status'] = 'New';

export class SharePointTicketService implements ITicketService {
  private schemaPromise?: Promise<ITicketSchema>;

  public constructor(private readonly context: WebPartContext) {}

  public getIntakeFormUrl(): string {
    return KIWI_INTAKE_FORM_URL;
  }

  public async getUserContext(): Promise<IUserContext> {
    const userResponse = await this.get<ISharePointUser>('/_api/web/currentuser');
    const groupsResponse = await this.get<IODataCollection<ISharePointGroup>>(
      `/_api/web/currentuser/groups?$select=Title&$filter=Title eq '${KIWI_AGENTS_GROUP.replace(/'/g, "''")}'`
    );

    return {
      user: this.mapUser(userResponse),
      isAgent: groupsResponse.value.some(group => group.Title === KIWI_AGENTS_GROUP)
    };
  }

  public async getTickets(context: IUserContext): Promise<ITicket[]> {
    const schema = await this.getSchema();
    const optionalFields = [
      schema.category,
      schema.priority,
      schema.status,
      schema.dueDate,
      schema.resolution
    ].filter((field): field is string => Boolean(field));
    const select = [
      'Id', schema.title, schema.description, ...optionalFields,
      'Created', 'Modified', 'Attachments', 'AttachmentFiles'
    ];
    const expand = ['Author', 'AttachmentFiles'];
    select.push('Author/Id', 'Author/Title', 'Author/EMail');
    if (schema.assignedTo) {
      select.push(
        `${schema.assignedTo}/Id`,
        `${schema.assignedTo}/Title`,
        `${schema.assignedTo}/EMail`
      );
      expand.push(schema.assignedTo);
    }
    const filter = context.isAgent ? '' : `&$filter=AuthorId eq ${context.user.id}`;
    const endpoint =
      `${LIST_ENDPOINT}/items` +
      `?$select=${select.join(',')}&$expand=${expand.join(',')}${filter}&$orderby=Modified desc&$top=5000`;
    const response = await this.get<IODataCollection<ISharePointTicket>>(endpoint);
    return response.value.map(item => this.mapTicket(item, schema));
  }

  public async getAssignableUsers(): Promise<IUserSummary[]> {
    let graphClient: MSGraphClientV3;
    try {
      graphClient = await this.context.msGraphClientFactory.getClient('3');
    } catch (error) {
      throw new Error(`Microsoft Graph is unavailable. Approve GroupMember.Read.All for this SPFx solution. ${this.errorMessage(error)}`);
    }

    const users: IGraphUser[] = [];
    let nextUrl: string | undefined =
      `/groups/${LEARN_IT_GROUP_ID}/transitiveMembers/microsoft.graph.user?$select=id,displayName,mail,userPrincipalName&$top=999`;
    try {
      while (nextUrl) {
        const page = await graphClient.api(nextUrl).get() as IGraphCollection<IGraphUser>;
        users.push(...page.value);
        nextUrl = page['@odata.nextLink'];
      }
    } catch (error) {
      throw new Error(
        `Unable to expand the learn.IT Microsoft 365 group. Approve GroupMember.Read.All and verify access to group ${LEARN_IT_GROUP_ID}. ${this.errorMessage(error)}`
      );
    }

    const uniqueEmails = Array.from(new Set(users
      .map(user => user.mail || user.userPrincipalName || '')
      .filter(Boolean)
      .map(email => email.toLocaleLowerCase())));
    const sharePointUsers = await Promise.all(uniqueEmails.map(email => this.ensureUser(email)));
    return sharePointUsers
      .map(user => this.mapUser(user))
      .sort((left, right) => left.displayName.localeCompare(right.displayName));
  }

  public async updateTicket(id: number, update: ITicketUpdate): Promise<void> {
    const schema = await this.getSchema();
    const endpoint = `${LIST_ENDPOINT}/items(${id})`;
    const body: Record<string, string | number | null> = {};
    if (schema.status && update.status !== undefined) body[schema.status] = update.status;
    if (schema.priority && update.priority !== undefined) body[schema.priority] = update.priority;
    if (schema.dueDate && update.dueDate !== undefined) {
      body[schema.dueDate] = update.dueDate ? new Date(`${update.dueDate}T12:00:00`).toISOString() : null;
    }
    if (schema.resolution && update.resolution !== undefined) {
      const response = update.resolution?.trim() || null;
      if (response && response.length > 255 && schema.resolution === 'R_x00e9_ponseaudemandeur') {
        throw new Error('The requester reply is limited to 255 characters by the Kiwi list.');
      }
      body[schema.resolution] = response;
    }
    if (!Object.keys(body).length && update.assignedToId === undefined && !update.clearAssignment) {
      throw new Error('EuropaTickets does not expose any supported editable fields.');
    }
    if (update.clearAssignment) {
      if (!schema.assignedTo) throw new Error('EuropaTickets does not expose an assignment field.');
      body[`${schema.assignedTo}Id`] = null;
    } else if (update.assignedToId !== undefined) {
      if (!schema.assignedTo) throw new Error('EuropaTickets does not expose an assignment field.');
      body[`${schema.assignedTo}Id`] = update.assignedToId;
    }
    await this.post<void>(
      endpoint,
      body,
      { 'IF-MATCH': '*', 'X-HTTP-Method': 'MERGE' }
    );
  }

  private getSchema(): Promise<ITicketSchema> {
    if (!this.schemaPromise) {
      this.schemaPromise = this.get<IODataCollection<ISharePointFieldMetadata>>(
        `${LIST_ENDPOINT}/fields?$select=InternalName,Title,TypeAsString,Hidden,ReadOnlyField`
      ).then(response => resolveTicketSchema(response.value));
    }
    return this.schemaPromise;
  }

  private async ensureUser(email: string): Promise<ISharePointUser> {
    return this.post<ISharePointUser>(
      '/_api/web/ensureuser',
      { logonName: email }
    );
  }

  private async get<T>(serverRelativeUrl: string): Promise<T> {
    const response = await this.context.spHttpClient.get(
      `${KIWI_SITE_URL}${serverRelativeUrl}`,
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
      `${KIWI_SITE_URL}${serverRelativeUrl}`,
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

  private mapTicket(item: ISharePointTicket, schema: ITicketSchema): ITicket {
    const assignedTo = schema.assignedTo ? item[schema.assignedTo] as ISharePointUser | undefined : undefined;
    const category = schema.category ? String(item[schema.category] || '') : '';
    const priority = schema.priority ? String(item[schema.priority] || '') : '';
    const status = schema.status ? String(item[schema.status] || '') : '';
    return {
      id: item.Id,
      subject: String(item[schema.title] || ''),
      description: String(item[schema.description] || ''),
      category: (category || defaultCategory) as ITicket['category'],
      priority: (priority || defaultPriority) as ITicket['priority'],
      status: (status || defaultStatus) as ITicket['status'],
      assignedTo: assignedTo ? this.mapUser(assignedTo) : undefined,
      dueDate: schema.dueDate ? String(item[schema.dueDate] || '') || undefined : undefined,
      resolution: schema.resolution ? String(item[schema.resolution] || '') || undefined : undefined,
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

  private errorMessage(error: unknown): string {
    return error instanceof Error ? error.message : String(error);
  }
}
