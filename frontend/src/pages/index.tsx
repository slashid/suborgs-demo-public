import { Link, Title, useGetOne } from "react-admin";
import { UserMeta } from "../types";
import { useState } from "react";
import { Loading } from "../components/loading";
import { useGroups } from "../hooks/use-groups";
import { Oops } from "../components/oops";
import { Button, Typography } from "@mui/material";
import { MeEdit } from "./me-edit";

export const Index = () => {
  const [pages, setPages] = useState<string[] | null>(null);

  const { data, isLoading, isError } = useGetOne<UserMeta & { id: string }>(
    "users",
    { id: "me" },
  );
  const { isAdmin, isGroupsLoading, isGroupsError } = useGroups({
    root: "",
  });

  if (isLoading || isGroupsLoading) return <Loading center />;
  if (isError || !data || isGroupsError) return <Oops />;

  if (!data.user.name) return <MeEdit />;

  if (pages === null) {
    const pageList = Object.entries(data.pages)
      .filter(([key, value]) => value.includes("read") && key !== "/")
      .map(([key]) => key);

    setPages(pageList);
  }

  return (
    <>
      <Title title="SlashID CMS" />
      <div
        style={{
          display: "flex",
          alignSelf: "flex-start",
          width: "100%",
          paddingLeft: "20px",
        }}
      >
        <div>
          <h1>Index Page</h1>
          {pages && pages.length === 0 && (
            <div>
              <Typography variant="subtitle1" sx={{ marginBottom: "20px" }}>
                Looks like you're new here.
              </Typography>
              <Link to={`/new`}>
                <Button variant="contained">Create your first page</Button>
              </Link>
            </div>
          )}
          <ul>
            {pages &&
              pages.map((path) => (
                <li key={path}>
                  <Link to={`page${path}`}>{path}</Link>
                </li>
              ))}
          </ul>
        </div>
        {isAdmin && (
          <div style={{ justifySelf: "flex-end", marginLeft: "auto" }}>
            <Link to={`/new`}>
              <Button variant="text">Create child page</Button>
            </Link>
          </div>
        )}
      </div>
    </>
  );
};
