import {
  Create,
  Identifier,
  RaRecord,
  useNotify,
  useRedirect,
  useRefresh,
} from "react-admin";
import { PageForm } from "../components/page-form";
import { useCallback } from "react";
import { usePageId } from "../hooks/use-page-id";

export const PageCreate = () => {
  const { pageId } = usePageId({ root: "new" });
  const notify = useNotify();
  const refresh = useRefresh();
  const redirect = useRedirect();

  const toPath = (pageId: string | undefined, id: string) => {
    return pageId ? `${pageId}/${id}`.replace("//", "/") : id;
  };

  const transform = useCallback(
    (data: { id: string; raw: string }) => ({
      id: toPath(pageId, data.id),
      raw: data.raw,
    }),
    [],
  );

  return (
    <Create
      resource="pages"
      transform={transform}
      title={`SlashID CMS - ${pageId} (create new page)`}
      mutationOptions={{
        onSuccess: (data: { id: string }) => {
          notify(`Page created`);
          redirect(`/page/${data.id}`);
          refresh();
        },
      }}
    >
      <PageForm />
    </Create>
  );
};
