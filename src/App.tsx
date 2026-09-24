import { useEffect, useState } from 'react'
import { Scene } from './scene/Scene'
import { HUD } from './ui/HUD'
import { WinModal } from './ui/WinModal'
import { Shortlist } from './ui/Shortlist'
import { Settings } from './ui/Settings'
import { PrivacyLink } from './ui/Privacy'
import { useGame } from './game/store'
import { music, sfx } from './audio/sfx'
import { HIRES_TO_WIN, REJECTS_TO_LOSE } from './game/bonus'

const bonusPlaying = (s: ReturnType<typeof useGame.getState>) => s.phase === 'bonus' && s.bonus?.status === 'play'

export default function App() {
  const [shortlistOpen, setShortlistOpen] = useState(false)
  const [settingsOpen, setSettingsOpen] = useState(false)
  const sound = useGame((s) => s.settings.sound)

  useEffect(() => {
    void useGame.getState().init()
  }, [])

  useEffect(() => {
    sfx.setEnabled(sound)
    // Звук включили посреди бонуса — музыка подхватывается.
    if (sound && bonusPlaying(useGame.getState())) music.start()
  }, [sound])

  // Звуки результата
  useEffect(
    () =>
      useGame.subscribe((s, prev) => {
        if (s.phase === 'win' && prev.phase !== 'win' && s.result?.rarity) sfx.win(s.result.rarity)
        if (s.phase === 'idle' && prev.phase === 'spinning' && s.result?.nearMiss) sfx.nearMiss()
        if (s.stats.exchanged > prev.stats.exchanged) sfx.coins(12)
        // Музыка бонуса: играет, пока идёт партия; на исходе — затухает под фанфары/утешение.
        const on = bonusPlaying(s)
        if (on && !bonusPlaying(prev)) music.start()
        if (!on && bonusPlaying(prev)) music.stop(s.bonus && s.bonus.status !== 'play' ? 0.35 : 0.8)
        if (on && s.bonus !== prev.bonus && s.bonus)
          music.setIntensity(s.bonus.hires >= HIRES_TO_WIN - 1 || s.bonus.rejects >= REJECTS_TO_LOSE - 1 ? 1 : 0)
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
