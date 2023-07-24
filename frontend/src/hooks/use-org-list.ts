import { useGetOne } from "react-admin";
import { UserMeta, UserPermission } from "../types";
import { useState } from "react";

export const useOrgList = ({ withPermission = 'read' }: { withPermission?: UserPermission } = {}) => {
    const [orgs, setOrgs] = useState<string[] | null>(null)
    const { data, isLoading, isError } = useGetOne<UserMeta & { id: string }>('users', { id: 'me' });

    if (data && !orgs) {
        const orgList = Object
            .entries(data.pages)
            .filter(([, value]) => value.includes(withPermission))
            .map(([key]) => key)

        setOrgs(orgList)
    }

    return {
        orgs,
        orgsIsLoading: isLoading,
        orgsIsError: isError
    }
}