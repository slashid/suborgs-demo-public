import { useGetOne } from "react-admin";
import { AdminPageInfo } from "../types";

export const useAdminPageInfo = ({ pageId }: { pageId: string }) => {
  const { data, isLoading, isError } = useGetOne<
    AdminPageInfo & { id: string }
  >("admin", {
    id: pageId,
  });

  return {
    data,
    isAdminPageInfoLoading: isLoading,
    isAdminPageInfoError: isError,
  };
};
