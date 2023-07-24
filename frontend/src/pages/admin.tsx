import { DataGrid, GridColDef } from "@mui/x-data-grid";
import DeleteIcon from "@mui/icons-material/Delete";
import {
  Link,
  Title,
  useDataProvider,
  useGetOne,
  useNotify,
  useRedirect,
  useRefresh,
} from "react-admin";
import { OrgSwitcher } from "../components/org-switcher";
import {
  AdminPageInfo,
  AdminUserTableRow,
  User,
  UserPermission,
  UserPermissionsPatch,
} from "../types";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Loading } from "../components/loading";
import { useOrgList } from "../hooks/use-org-list";
import {
  Button,
  Autocomplete,
  IconButton,
  TextField,
  debounce,
  Switch,
  FormControlLabel,
  Checkbox,
} from "@mui/material";
import { useSlashID } from "@slashid/react";
import { createHeaders } from "../data-provider";
import { GridMultiSelect } from "../components/grid-multi-select";
import { usePageId } from "../hooks/use-page-id";
import { Oops } from "../components/oops";
import { useAdminPageInfo } from "../hooks/use-admin-page-info";

export const AdminPage = () => {
  const refresh = useRefresh();
  const redirect = useRedirect();
  const notify = useNotify();
  const dataProvider = useDataProvider();
  const { user: sidUser } = useSlashID();
  const { pageId, pageKey } = usePageId({ root: "admin" });

  const [autocompleteInputValue, setAutocompleteInputValue] =
    useState<string>("");
  const [autocompleteValue, setAutocompleteValue] = useState<User | null>(null);
  const [autocompleteOptions, setAutocompleteOptions] = useState<User[]>([]);
  const [fetching, setFetching] = useState<boolean>();

  const fetch = useMemo(
    () =>
      debounce(async (email: string, callback: (user: User | null) => void) => {
        try {
          const { headers } = createHeaders({ user: sidUser });
          const response = await globalThis.fetch(
            `http://localhost:8000/users/email/${email}`,
            { headers },
          );

          if (!response.ok) throw new Error();

          const user = await response.json();
          callback(user);
        } catch {
          callback(null);
        }
      }, 1000),
    [],
  );

  useEffect(() => {
    if (autocompleteInputValue === "") return;

    setFetching(true);

    fetch(autocompleteInputValue, (user) => {
      setFetching(false);

      if (user) setAutocompleteOptions([user]);
    });
  }, [fetch, autocompleteInputValue]);

  const { data, isAdminPageInfoLoading, isAdminPageInfoError } =
    useAdminPageInfo({ pageId });
  const { orgs, orgsIsLoading, orgsIsError } = useOrgList({
    withPermission: "admin",
  });

  const [rows, setRows] = useState<AdminUserTableRow[]>([]);

  const adminInfoUserToRow = (
    data: AdminPageInfo["users"][0],
  ): AdminUserTableRow => {
    return {
      ...data.user,
      permissions: data.permissions,
    };
  };

  useEffect(() => {
    if (!data) return;

    setRows(data.users.map((user) => adminInfoUserToRow(user)));
  }, [data]);

  const knownUsers = useMemo(() => {
    return new Set(rows.map((row) => row.id));
  }, [rows]);

  const upsertPageSettings = (data: Partial<UserPermissionsPatch>) => {
    return dataProvider.update<AdminPageInfo & { id: string }>("admin", {
      id: pageId,
      data: {
        raw: data,
      },
      previousData: {},
      meta: {
        method: "PATCH",
      },
    });
  };

  useEffect(() => {
    if (!autocompleteValue) return;

    const user = autocompleteValue;
    setAutocompleteValue(null);

    if (knownUsers.has(user.id)) return;

    const permissions: UserPermission[] = ["read"];

    setRows([
      ...rows,
      adminInfoUserToRow({
        user,
        permissions,
      }),
    ]);

    (async () => {
      try {
        const data: Partial<UserPermissionsPatch> = {
          users: [
            {
              id: user.id,
              permissions,
            },
          ],
        };

        await upsertPageSettings(data);
        refresh();
        notify(`${user.name} added to users`);
      } catch (e) {
        console.log("error, after");
        console.error(e);
        notify(`There was a problem adding ${user.name} to users`, {
          type: "error",
        });
      }
    })();
  }, [autocompleteValue]);

  const saveUserDataChange = useCallback((row: (typeof rows)[0]) => {
    const data = {
      users: [
        {
          id: row.id,
          permissions: row.permissions,
        },
      ],
    };

    upsertPageSettings(data).then(() => {
      refresh();
      notify("Groups saved");
    });

    return {
      ...row,
      permissions: row.permissions,
    };
  }, []);

  const updatePublicSetting = async (
    event: React.ChangeEvent<HTMLInputElement>,
  ) => {
    const isPublic = event.target.checked;

    await upsertPageSettings({
      public: isPublic,
    });

    refresh();

    if (isPublic) {
      notify(`${pageId} is now public`);
    } else {
      notify(`${pageId} is now private`);
    }
  };

  if (isAdminPageInfoLoading || orgsIsLoading) return <Loading center />;
  if (isAdminPageInfoError || orgsIsError || !orgs || !data) return <Oops />;

  const columns: GridColDef[] = [
    {
      field: "name",
      headerName: "Name",
      flex: 1,
    },
    {
      field: "permissions",
      headerName: "Groups",
      flex: 1,
      editable: true,
      valueGetter: (params) =>
        [...params.value].sort((a: string, b: string) => a.localeCompare(b)),
      renderEditCell: (params) => (
        <GridMultiSelect {...params} options={["read", "write", "admin"]} />
      ),
    },
    {
      field: "emails",
      headerName: "Email handles",
      valueGetter: (params) => params.value.join(", "),
      flex: 1,
    },
    {
      field: "phones",
      headerName: "Phone handles",
      valueGetter: (params) => params.value.join(", "),
      flex: 1,
    },
    {
      field: "action",
      headerName: "Action",
      sortable: false,
      renderCell: ({ id, row }) => {
        const [loading, setLoading] = useState(false);
        const onClick = async (e: any) => {
          e.preventDefault();

          const { id: userId, name } = row;

          if (!id) {
            notify("There was a problem removing this user", { type: "error" });
            return;
          }

          const data = {
            users: [
              {
                id: userId,
                permissions: [],
              },
            ],
          };

          setLoading(true);

          setRows(rows.filter((row) => row.id !== id));

          await upsertPageSettings(data);

          refresh();
          notify(`${name} removed from users`);
        };

        return (
          <IconButton onClick={onClick} disabled={loading}>
            <DeleteIcon />
          </IconButton>
        );
      },
    },
  ];

  return (
    <>
      <Title title={`SlashID CMS - ${pageId} (admin dashboard)`} />
      <div style={{ display: "flex" }}>
        <OrgSwitcher
          orgs={orgs}
          value={pageKey}
          label="Switch dashboard context"
          onSelect={(org) => redirect(`/admin${org}`)}
        />
        <FormControlLabel
          sx={{ alignSelf: "center", marginLeft: "20px" }}
          control={
            <Checkbox
              defaultChecked={data.public}
              onChange={updatePublicSetting}
            />
          }
          label="Public"
        />
        <Link
          to={`/page/${pageId}`}
          style={{
            marginLeft: "auto",
            justifySelf: "flex-end",
            alignSelf: "center",
          }}
        >
          <Button variant="text">Return to page</Button>
        </Link>
      </div>
      <Autocomplete
        getOptionLabel={(user: User) => {
          const pretty = `${user.name} <${user.emails[0]}${
            user.emails.length > 1 ? `, + ${user.emails.length - 1} more` : ""
          }>`;
          if (knownUsers.has(user.id)) return `${pretty} (already added)`;
          return user.name;
        }}
        filterOptions={(x) => x}
        options={autocompleteOptions}
        autoComplete
        includeInputInList
        filterSelectedOptions
        value={autocompleteValue}
        onChange={(_, newValue: User | null) => {
          setAutocompleteInputValue("");
          setAutocompleteOptions([]);
          setAutocompleteValue(newValue);
        }}
        onInputChange={(_, newInputValue) => {
          setAutocompleteOptions([]);
          setAutocompleteInputValue(newInputValue);
        }}
        renderInput={(params) => (
          <TextField {...params} label={"Add a user (enter email)"} fullWidth />
        )}
        loadingText={"Searching..."}
        noOptionsText={
          !autocompleteInputValue
            ? "Begin typing to search for a user"
            : "No user found with that email"
        }
        loading={fetching}
        clearOnBlur={true}
        onBlur={() => {
          setAutocompleteOptions([]);
        }}
      />
      <DataGrid
        rows={rows}
        columns={columns}
        initialState={{
          pagination: {
            paginationModel: {
              pageSize: 5,
            },
          },
        }}
        pageSizeOptions={[5]}
        disableRowSelectionOnClick
        autoPageSize
        processRowUpdate={saveUserDataChange}
      />
    </>
  );
};
