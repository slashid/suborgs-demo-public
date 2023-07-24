import { useLocation } from 'react-router-dom'

export const usePageId = ({ root }: { root: string }) => {
    const pageId = useLocation().pathname.split(`/${root}/`)[1] ?? ''
    const pageKey = `/${pageId ? `${pageId}/` : ''}`.replace('//', '/')

  return {
    pageId,
    pageKey
  }
}