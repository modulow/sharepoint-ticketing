export interface ISharePointFieldMetadata {
  InternalName: string;
  Title: string;
  TypeAsString: string;
  Hidden: boolean;
  ReadOnlyField: boolean;
  Choices?: string[];
}

export interface ITicketSchema {
  title: string;
  description: string;
  requester?: string;
  category?: string;
  priority?: string;
  status?: string;
  assignedTo?: string;
  dueDate?: string;
  resolution?: string;
}

const normalize = (value: string): string => value
  .normalize('NFD')
  .replace(/[\u0300-\u036f]/g, '')
  .replace(/[^a-z0-9]/gi, '')
  .toLocaleLowerCase();

const findField = (
  fields: ISharePointFieldMetadata[],
  internalNames: string[],
  displayNames: string[],
  allowedTypes?: string[]
): string | undefined => {
  const internal = new Set(internalNames.map(normalize));
  const display = new Set(displayNames.map(normalize));
  return fields.find(field =>
    !field.Hidden &&
    (!allowedTypes || allowedTypes.indexOf(field.TypeAsString) !== -1) &&
    (internal.has(normalize(field.InternalName)) || display.has(normalize(field.Title)))
  )?.InternalName;
};

export const resolveTicketSchema = (fields: ISharePointFieldMetadata[]): ITicketSchema => {
  const title = findField(fields, ['Title'], ['Titre', 'Title', 'Subject', 'Sujet'], ['Text']);
  const description = findField(
    fields,
    ['Descriptif', 'Description'],
    ['Descriptif', 'Description'],
    ['Note', 'Text']
  );
  if (!title || !description) {
    throw new Error('EuropaTickets must expose a text Title/Titre field and a Descriptif/Description field.');
  }

  return {
    title,
    description,
    requester: findField(
      fields,
      ['Demandeur0', 'Requester'],
      ['Demandeur', 'Requester'],
      ['User']
    ),
    category: findField(fields, ['Categorie', 'Category'], ['Catégorie', 'Categorie', 'Category'], ['Choice', 'Text']),
    priority: findField(fields, ['Priorite', 'Priority'], ['Priorité', 'Priorite', 'Priority'], ['Choice', 'Text']),
    status: findField(fields, ['Statut', 'Status'], ['Statut', 'Status'], ['Choice', 'Text']),
    assignedTo: findField(
      fields,
      ['Assigned_x0020_to', 'AssignedTo', 'AssigneA', 'Agent'],
      ['Assigné à', 'Assigne a', 'Assigned to', 'Agent'],
      ['User']
    ),
    dueDate: findField(fields, ['DueDate', 'Echeance'], ['Échéance', 'Echeance', 'Due date'], ['DateTime']),
    resolution: findField(
      fields,
      ['R_x00e9_ponseaudemandeur', 'Resolution'],
      ['Réponse au demandeur', 'Reponse au demandeur', 'Resolution'],
      ['Text', 'Note']
    )
  };
};
