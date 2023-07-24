import { SlashIDProvider, useSlashID } from "@slashid/react";
import {
  Admin as ReactAdmin,
  AuthProvider,
  CustomRoutes,
  DataProvider,
  Layout,
  AppBar,
  TitlePortal,
  UserMenu,
  Logout,
} from "react-admin";
import { Route } from "react-router-dom";
import { Login } from "./pages/login";
import { ReactNode, useMemo } from "react";
import { createAuthProvider } from "./auth-provider";
import "@slashid/react/style.css";
import { CircularProgress, Container } from "@mui/material";
import { Page } from "./pages/page";
import { Index } from "./pages";
import { createDataProvider } from "./data-provider";
import { PageEdit } from "./pages/edit";
import { PageCreate } from "./pages/create";
import { AdminPage } from "./pages/admin";
import { Groups } from "./components/groups";
import { MeEdit } from "./pages/me-edit";

type WithSlashIDProps = {
  children: ReactNode;
};

const WithSlashID = ({ children }: WithSlashIDProps) => {
  return (
    <SlashIDProvider
      oid="b6f94b67-d20f-7fc3-51df-bf6e3b82683e"
      tokenStorage="localStorage"
      baseApiUrl="https://api.slashid.com"
    >
      {children}
    </SlashIDProvider>
  );
};

const Noop = () => {
  return <div />;
};

const CustomLayout = (props: any) => (
  <Layout
    {...props}
    sidebar={Noop}
    sx={{
      // '& .RaLayout-content': { padding: 0 },
      "& .RaAppBar-toolbar .RaAppBar-menuButton": {
        display: "none !important",
      },
      "& .RaAppBar-toolbar .RaLoadingIndicator-loader": {
        display: "none !important",
      },
    }}
  />
);

const CMS = () => {
  const { user, logOut, sdkState, sid } = useSlashID();

  const dataProvider: DataProvider = useMemo(() => {
    return createDataProvider({ user });
  }, [sid?.baseURL, sid?.oid, user]);

  const authProvider: AuthProvider = useMemo(() => {
    return createAuthProvider({ logOut, user });
  }, [logOut, user]);

  if (!["ready", "authenticating"].includes(sdkState)) {
    return (
      <Container maxWidth="xs">
        <CircularProgress />
      </Container>
    );
  }

  return (
    <ReactAdmin
      loginPage={<Login />}
      layout={CustomLayout}
      authProvider={authProvider}
      dataProvider={dataProvider}
    >
      <CustomRoutes>
        <Route
          index
          element={
            <Groups root="" belongsTo={["read"]}>
              <Index />
            </Groups>
          }
        />
        <Route
          // new is allowed for index and pages
          path="me"
          element={<MeEdit />}
        />
        <Route
          // new is allowed for index and pages
          path="new/*"
          element={
            <Groups root="admin" belongsTo={["admin"]}>
              <PageCreate />
            </Groups>
          }
        />
        <Route
          // edit is only allowed for pages, not for index
          path="edit/:path/*"
          element={
            <Groups root="admin" belongsTo={["write"]}>
              <PageEdit />
            </Groups>
          }
        />
        <Route
          // page must have a path
          path="page/:path/*"
          element={
            <Groups root="page" belongsTo={["read"]}>
              <Page />
            </Groups>
          }
        />
        <Route
          // admin is only allowed for pages, not the index
          path="admin/:path/*"
          element={
            <Groups root="admin" belongsTo={["admin"]}>
              <AdminPage />
            </Groups>
          }
        />
      </CustomRoutes>
    </ReactAdmin>
  );
};

export const App = () => (
  <WithSlashID>
    <CMS />
  </WithSlashID>
);
