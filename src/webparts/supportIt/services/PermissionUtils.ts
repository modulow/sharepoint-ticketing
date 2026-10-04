export interface IBasePermissions {
  High: string | number;
  Low: string | number;
}

const EDIT_LIST_ITEMS_MASK = 4;

export const hasEditListItems = (permissions: IBasePermissions): boolean =>
  (Number(permissions.Low) & EDIT_LIST_ITEMS_MASK) === EDIT_LIST_ITEMS_MASK;

