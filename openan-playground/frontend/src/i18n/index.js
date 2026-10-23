// i18n：与 openan-portal 同栈（i18next + react-i18next + browser LanguageDetector）。
// 字典：base-zh.json / base-en.json（嵌套结构，key 以 '.' 分层）。
import i18n from 'i18next'
import { initReactI18next } from 'react-i18next'
import LanguageDetector from 'i18next-browser-languagedetector'
import zh from './base-zh.json'
import en from './base-en.json'

i18n.use(LanguageDetector).use(initReactI18next).init({
  resources: {
    zh: { translation: zh },
    en: { translation: en },
  },
  fallbackLng: 'zh',
  detection: {
    order: ['localStorage', 'navigator'],
    caches: ['localStorage'],
    lookupLocalStorage: 'openan-debug-lang',
  },
  interpolation: { escapeValue: false },
})

export default i18n
