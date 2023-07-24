import { Authenticated } from "react-admin";
import { useGroups } from "../hooks/use-groups";
import { UserPermission } from "../types";
import { Loading } from "./loading";
import { Oops } from "./oops";
import { usePageId } from "../hooks/use-page-id";
import { useAdminPageInfo } from "../hooks/use-admin-page-info";

interface Props {
  root: string;
  belongsTo: UserPermission[];
  children: any;
  fallback?: any;
}

export const Groups = (props: Props) => (
  <Authenticated>
    <AssertGroups {...props} />
  </Authenticated>
);

const AssertGroups = ({
  root,
  belongsTo,
  children,
  fallback = <Oops message="You do not have permission to view this page" />,
}: Props) => {
  const { pageId } = usePageId({ root });
  const { raw, isGroupsLoading, isGroupsError } = useGroups({
    root,
  });
  const { data, isAdminPageInfoLoading, isAdminPageInfoError } =
    useAdminPageInfo({ pageId });

  if (isGroupsLoading || isAdminPageInfoLoading) return <Loading center />;
  if (isGroupsError || isAdminPageInfoError) return <Oops />;
  if (data?.public) return children;

  for (const permission of belongsTo) {
    if (!raw.includes(permission)) return fallback;
  }

  return children;
};
