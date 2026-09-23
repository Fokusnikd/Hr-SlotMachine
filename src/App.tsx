import { useEffect, useState } from 'react'
import { Scene } from './scene/Scene'
import { HUD } from './ui/HUD'
import { WinModal } from './ui/WinModal'
import { Shortlist } from './ui/Shortlist'
import { Settings } from './ui/Settings'
import { PrivacyLink } from './ui/Privacy'
import { useGame } from './game/store'
import { sfx } from './audio/sfx'

export default function App() {
  const [shortlistOpen, setShortlistOpen] = useState(false)
  const [settingsOpen, setSettingsOpen] = useState(false)
  const sound = useGame((s) => s.settings.sound)

  useEffect(() => {
    void useGame.getState().init()
  }, [])

  useEffect(() => sfx.setEnabled(sound), [sound])

  // Звуки результата
  useEffect(
    () =>
      useGame.subscribe((s, prev) => {
        if (s.phase === 'win' && prev.phase !== 'win' && s.result?.rarity) sfx.win(s.result.rarity)
        if (s.phase === 'idle' && prev.phase === 'spinning' && s.result?.nearMiss) sfx.nearMiss()
        if (s.stats.exchanged > prev.stats.exchanged) sfx.coins(12)
      }),
    [],
  )

  // Пробел — крутить, +/− — линии
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement
      if (el.closest('input, textarea, [role="dialog"]')) return
      if (shortlistOpen || settingsOpen || useGame.getState().winOpen) return
      // + / − — добавить или убрать линию
      if (e.key === '+' || e.key === '=' || e.code === 'NumpadAdd') return useGame.getState().changeLines(1)
      if (e.key === '-' || e.code === 'NumpadSubtract') return useGame.getState().changeLines(-1)
      // Enter — открыть карточку выпавшего кандидата
      if (e.key === 'Enter' && !el.closest('button, a')) return useGame.getState().openWin()
      if (e.code !== 'Space' || e.repeat) return
      if (el.closest('button, a')) return
      e.preventDefault()
      useGame.getState().spin()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [shortlistOpen, settingsOpen])

  return (
    <div className="app">
      <div className="stage">
        <Scene />
      </div>
      <HUD onOpenShortlist={() => setShortlistOpen(true)} onOpenSettings={() => setSettingsOpen(true)} />
      <WinModal />
      <Shortlist open={shortlistOpen} onClose={() => setShortlistOpen(false)} />
      {settingsOpen && <Settings onClose={() => setSettingsOpen(false)} />}
      <PrivacyLink />
    </div>
  )
}
