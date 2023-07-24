import { Edit, useNotify, useRedirect, useRefresh } from "react-admin";
import { PageForm } from "../components/page-form";
import { usePageId } from "../hooks/use-page-id";
import { ToolbarWithoutDelete } from "../components/toolbar-without-delete";

const transform = (data: { id: string; raw: string }) => ({
  id: data.id,
  raw: data.raw,
});

export const PageEdit = () => {
  const { pageId } = usePageId({ root: "edit" });
  const notify = useNotify();
  const refresh = useRefresh();
  const redirect = useRedirect();

  return (
    <Edit
      id={pageId}
      resource="pages"
      transform={transform}
      title={`SlashID CMS - ${pageId} (edit)`}
      mutationOptions={{
        onSuccess: () => {
          notify(`Page saved`);
          redirect(`/page/${pageId}`);
          refresh();
        },
      }}
      mutationMode="pessimistic"
    >
      <PageForm name={pageId} edit toolbar={<ToolbarWithoutDelete />} />
    </Edit>
  );
};
