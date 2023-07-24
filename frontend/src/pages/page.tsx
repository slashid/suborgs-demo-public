import { Link, Title, useGetOne } from "react-admin";
import { Loading } from "../components/loading";
import { useGroups } from "../hooks/use-groups";
import { usePageId } from "../hooks/use-page-id";
import { Oops } from "../components/oops";
import { Button } from "@mui/material";

export const Page = () => {
  const root = "page";
  const { pageId } = usePageId({ root });
  const { data, isLoading, isError } = useGetOne("pages", { id: pageId });
  const { isEditor, isAdmin, isGroupsLoading, isGroupsError } = useGroups({
    root,
  });

  if (isLoading || isGroupsLoading) return <Loading center />;

  if (isError || isGroupsError) return <Oops />;

  return (
    <>
      <Title title={`SlashID CMS - ${pageId}`} />
      <div
        style={{
          background: data.raw,
          width: "100%",
          height: "100%",
        }}
      >
        <div
          style={{
            alignSelf: "flex-start",
            display: "flex",
            justifyContent: "flex-end",
            width: "100%",
          }}
        >
          {isEditor && (
            <Link to={`/edit/${pageId}`}>
              <Button variant="text">Edit page</Button>
            </Link>
          )}
          {isAdmin && (
            <>
              <Link to={`/new/${pageId}`}>
                <Button variant="text">Create child page</Button>
              </Link>
              <Link to={`/admin/${pageId}`}>
                <Button variant="text">Admin panel</Button>
              </Link>
            </>
          )}
        </div>
        <div
          style={{
            width: "100%",
            height: "100%",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <div style={{ fontSize: "64px" }}>{pageId}</div>
        </div>
      </div>
    </>
  );
};
