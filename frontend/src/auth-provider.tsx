import { User as SlashIDUser } from "@slashid/slashid";
import { type AuthProvider } from "react-admin";
import { createDataProvider } from "./data-provider";
import { UserMeta } from "./types";

interface Props {
  user: SlashIDUser | undefined;
  logOut: () => void;
}

export const createAuthProvider = ({ logOut, user }: Props): AuthProvider => {
  const dataProvider = createDataProvider({ user });
  let internalUser: SlashIDUser | undefined = user;

  const authProvider: AuthProvider = {
    login: (newUser: SlashIDUser) => {
      internalUser = newUser;
      return Promise.resolve();
    },
    logout: () => {
      logOut();
      return Promise.resolve();
    },
    checkAuth: () => {
      return internalUser ? Promise.resolve() : Promise.reject();
    },
    checkError: (error: any) => {
      const status = error.status;
      if (status === 401 || status === 403) {
        localStorage.removeItem("username");
        return Promise.reject();
      }
      // other error code (404, 500, etc): no need to log out
      return Promise.resolve();
    },
    getIdentity: async () => {
      const { data } = await dataProvider.getOne<UserMeta & { id: string }>(
        "users",
        { id: "me" },
      );

      return {
        id: data.user.id,
        fullName: data.user.name || "",
      };
    },
    getPermissions: () => Promise.resolve(""),
  };

  return authProvider;
};
