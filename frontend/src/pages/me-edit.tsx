import { Edit, useNotify, useRedirect, useRefresh } from "react-admin";
import { ToolbarWithoutDelete } from "../components/toolbar-without-delete";
import { MeForm } from "../components/me-form";
import { UserMeta } from "../types";

const transform = (data: UserMeta) => ({
  raw: {
    user: {
      name: data.user.name,
    },
  },
});

export const MeEdit = () => {
  const notify = useNotify();
  const refresh = useRefresh();
  const redirect = useRedirect();

  return (
    <Edit
      id={"me"}
      resource="users"
      transform={transform}
      title={`SlashID CMS - Welcome`}
      mutationOptions={{
        meta: { method: "PATCH" },
        onSuccess: () => {
          notify(`Your user profile has saved`);
          redirect("/");
          refresh();
        },
      }}
      mutationMode="optimistic"
    >
      <MeForm toolbar={<ToolbarWithoutDelete />} />
    </Edit>
  );
};
