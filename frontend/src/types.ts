export interface User {
  id: string;
  name: string;
  phones: string[];
  emails: string[];
}

export interface UserMeta {
  pages: Record<string, UserPermission[]>;
  user: User;
}

export interface UserWithPermissions extends User {
  permissions?: string[];
}

export type UserPermission = "read" | "write" | "admin";

export interface AdminPageInfo {
  public: boolean;
  users: {
    user: User;
    permissions: UserPermission[];
  }[];
}

export interface UserPermissionsPatch {
  public: boolean;
  users: {
    id: string;
    permissions: UserPermission[];
  }[];
}

export interface AdminUserTableRow {
  permissions: UserPermission[];
  id: string;
  name: string;
  phones: string[];
  emails: string[];
}
[];
