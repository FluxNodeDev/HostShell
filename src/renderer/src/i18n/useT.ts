import { useCallback } from 'react'
import { useApp } from '../state/store'
import { normalizeLocale, translate } from './index'

/** 当前语言的翻译函数；语言变化时组件自动重渲染 */
export function useT(): (key: string, vars?: Record<string, string | number>) => string {
  const locale = useApp((s) => normalizeLocale(s.config.locale))
  return useCallback(
    (key: string, vars?: Record<string, string | number>) => translate(locale, key, vars),
    [locale]
  )
}
