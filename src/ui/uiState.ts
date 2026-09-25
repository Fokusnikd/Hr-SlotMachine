import { create } from 'zustand'

/** Открытые панели интерфейса. Кнопки на вывеске автомата (3D) открывают их отсюда. */
export const useUi = create<{ shortlistOpen: boolean; settingsOpen: boolean; topUpOpen: boolean }>(() => ({
  shortlistOpen: false,
  settingsOpen: false,
  topUpOpen: false,
}))

export const openShortlist = () => useUi.setState({ shortlistOpen: true })
export const openSettings = () => useUi.setState({ settingsOpen: true })
export const closeShortlist = () => useUi.setState({ shortlistOpen: false })
export const closeSettings = () => useUi.setState({ settingsOpen: false })
/** Окно «Пополнить» — открывается само, когда кредитов не хватает на спин. */
export const openTopUp = () => useUi.setState({ topUpOpen: true })
export const closeTopUp = () => useUi.setState({ topUpOpen: false })
