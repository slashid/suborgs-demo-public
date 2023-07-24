import { User as SlashIDUser } from "@slashid/slashid";
import {
  type DataProvider,
  fetchUtils
} from "react-admin";
import { stringify } from "query-string";

const { fetchJson } = fetchUtils;

interface Props {
  user?: SlashIDUser;
};

export const createHeaders = ({ user }: { user?: SlashIDUser }) => {
  return {
    headers: new Headers({
      authorization: `Bearer ${user?.token}`,
    })
  }
}

export const createDataProvider = ({ user }: Props): DataProvider => {
  const { headers } = createHeaders({ user })

  const baseURL = `http://localhost:8000`;

  const dataProvider: DataProvider = {
    getOne: (resource, { id, meta = {} }): any => {
      const queryString = meta?.query
        ? `?${stringify(meta.query)}`
        : '';

      const url = `${baseURL}/${resource}${id ? `/${id}` : ""}${queryString}`;

        console.log('meta', meta, queryString, url)

      return fetch(url, { headers }).then(async (response) => {
        const content = await (async () => {
          try {
            const json = await response.clone().json();
            if (typeof json === "object") return json;
            throw Error();
          } catch {
            return {
              raw: await response.clone().text(),
            };
          }
        })();

        return {
          data: {
            id,
            ...content,
          },
        };
      });
    },    

    create: (resource, { data }) => {
        const url = `${baseURL}/${resource}/${data.id}`;
        const body = JSON.stringify(data.raw);

        return fetchJson(url, { method: "POST", headers, body }).then(
        ({ json }) => ({
            data: {
              id: data.id,
              ...json,
            },
        })
        );
    },

    update: (resource, { id, data, meta }) => {
        const queryString = meta?.query
          ? `?${stringify(meta.query)}`
          : '';
        const url = `${baseURL}/${resource}/${id}${queryString}`;
        const body = JSON.stringify(data.raw);
        const method = meta?.method ?? "PUT"

        return fetchJson(url, { method, body, headers })
          .then(({ json }) => ({
              data: {
                id: data.id,
                ...json
              }
          }));
    },

    getList: () => {
      throw new Error('Not implemented')
    },
    
    getMany: () => {
      throw new Error('Not implemented')
    },

    getManyReference: () => {
      throw new Error('Not implemented')
    },

    updateMany: () => {
      throw new Error('Not implemented')
    },

    delete: () => {
      throw new Error('Not implemented')
    },

    deleteMany: () => {
      throw new Error('Not implemented')
    }
  };

  return dataProvider;
};
