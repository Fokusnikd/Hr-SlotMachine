import { create } from 'zustand'

/** Открытые панели интерфейса. Кнопки на вывеске автомата (3D) открывают их отсюда. */
export const useUi = create<{ shortlistOpen: boolean; settingsOpen: boolean }>(() => ({
  shortlistOpen: false,
  settingsOpen: false,
}))

export const openShortlist = () => useUi.setState({ shortlistOpen: true })
export const openSettings = () => useUi.setState({ settingsOpen: true })
export const closeShortlist = () => useUi.setState({ shortlistOpen: false })
export const closeSettings = () => useUi.setState({ settingsOpen: false })
