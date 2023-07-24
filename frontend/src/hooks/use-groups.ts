import { useState } from "react";
import { useGetOne } from "react-admin";
import { UserMeta } from "../types";
import { usePageId } from "./use-page-id";

export const useGroups = ({ root }: { root: string }) => {
    const { pageKey } = usePageId({ root })
    const {
        data: user,
        isLoading: isGroupsLoading,
        isError: isGroupsError
    } = useGetOne<UserMeta & { id: string }>('users', { id: 'me' });
    
    const [initialised, setInitialsed] = useState(false)
    const [isViewer, setIsViewer] = useState(false)
    const [isEditor, setIsEditor] = useState(false)
    const [isAdmin, setIsAdmin] = useState(false)
    const [raw, setRaw] = useState<string[]>([])
  
    const initReady = !isGroupsLoading && !isGroupsError && user && !initialised

    if (initReady) {
        const groups = user?.pages?.[pageKey]
        if (groups) {
            setIsViewer(groups.includes('read'))
            setIsEditor(groups.includes('write'))
            setIsAdmin(groups.includes('admin'))
            setRaw(groups)
        }
        
        setInitialsed(true)
    }
  
    return {
        isGroupsLoading,
        isGroupsError,
        isViewer,
        isAdmin,
        isEditor,
        raw
    }
}