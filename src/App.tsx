import { useEffect } from 'react'
import { Scene } from './scene/Scene'
import { closeSettings, closeShortlist, closeTopUp, openTopUp, useUi } from './ui/uiState'
import { WinModal } from './ui/WinModal'
import { Shortlist } from './ui/Shortlist'
import { Settings } from './ui/Settings'
import { PrivacyLink } from './ui/Privacy'
import { TopUp } from './ui/TopUp'
import { useGame } from './game/store'
import { music, sfx } from './audio/sfx'
import { HIRES_TO_WIN, REJECTS_TO_LOSE } from './game/bonus'
import { REELS } from './game/outcome'
import { pressLinesKey } from './scene/SlotMachine'

const bonusPlaying = (s: ReturnType<typeof useGame.getState>) => s.phase === 'bonus' && s.bonus?.status === 'play'

export default function App() {
  const shortlistOpen = useUi((s) => s.shortlistOpen)
  const settingsOpen = useUi((s) => s.settingsOpen)
  const topUpOpen = useUi((s) => s.topUpOpen)
  const sound = useGame((s) => s.settings.sound)
  const masterVol = useGame((s) => s.settings.masterVol)
  const musicVol = useGame((s) => s.settings.musicVol)
  const sfxVol = useGame((s) => s.settings.sfxVol)

  useEffect(() => {
    void useGame.getState().init()
    sfx.init()
  }, [])

  useEffect(() => {
    sfx.configure({ muted: !sound, master: masterVol, music: musicVol, sfx: sfxVol })
    // Звук включили посреди бонуса — музыка подхватывается.
    if (sound && bonusPlaying(useGame.getState())) music.start()
  }, [sound, masterVol, musicVol, sfxVol])

  // Звуки игры по изменениям состояния
  useEffect(
    () =>
      useGame.subscribe((s, prev) => {
        // Линии: каждая звучит своей нотой, когда становится последней включённой (добавили или убрали).
        if (s.lines.length !== prev.lines.length && prev.lines.length > 0 && s.lines.length > 0) sfx.lineNote(s.lines[s.lines.length - 1].note)
        // Барабаны: луп на время вращения, тише с каждой остановкой.
        if (s.spinId !== prev.spinId && s.phase === 'spinning') sfx.spinStart()
        if (s.stoppedReels !== prev.stoppedReels && s.stoppedReels > 0) sfx.reelsLeft(REELS - s.stoppedReels, REELS)
        if (prev.phase === 'spinning' && s.phase !== 'spinning' && s.stoppedReels < REELS) sfx.reelsLeft(0, REELS)
        // Все барабаны встали и выпал бонус — фанфары до открытия окна миниигры.
        if (s.stoppedReels === REELS && prev.stoppedReels < REELS && s.result?.bonus) sfx.bonusFanfare()
        // Выигрыш — один звук по лучшему кандидату (wins[0]). После бонуса не звучит: победа уже
        // озвучена в момент, когда открыта последняя папка с матчем. Пустой спин и «почти» — без звука.
        if (s.phase === 'win' && prev.phase === 'spinning' && s.result?.wins[0]) sfx.win(s.result.wins[0].rarity)
        if (s.stats.exchanged > prev.stats.exchanged) sfx.cash()
        const mini = s.phase === 'bonus' || s.phase === 'upgrade'
        if (mini !== (prev.phase === 'bonus' || prev.phase === 'upgrade')) sfx.miniGame(mini)
        if (s.phase === 'bonus' && prev.phase !== 'bonus') sfx.bonusOpened()
        if (prev.phase === 'upgrade' && s.phase !== 'upgrade') sfx.wheelEnd()
        // Музыка бонуса: играет, пока идёт партия; на исходе — затухает под фанфары/утешение.
        const on = bonusPlaying(s)
        if (on && !bonusPlaying(prev)) music.start()
        if (!on && bonusPlaying(prev)) music.stop(s.bonus && s.bonus.status !== 'play' ? 0.35 : 0.8)
        if (on && s.bonus !== prev.bonus && s.bonus)
          music.setIntensity(s.bonus.hires >= HIRES_TO_WIN - 1 || s.bonus.rejects >= REJECTS_TO_LOSE - 1 ? 1 : 0)
      }),
    [],
  )

  // Кредиты кончились — окно «Пополнить». Открывается один раз: когда спин полностью разыгран
  // (вернулись в idle из спина/бонуса/карточки), или при попытке крутить без денег.
  // Закрыли без пополнения — снова откроется только на следующей попытке спина.
  useEffect(
    () =>
      useGame.subscribe((s, prev) => {
        const settled = s.phase === 'idle' && prev.phase !== 'idle'
        if ((settled && s.credits < s.cost) || s.brokeAttempts > prev.brokeAttempts) openTopUp()
      }),
    [],
  )

  // Пробел — крутить, +/− — линии
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement
      if (el.closest('input, textarea, [role="dialog"]')) return
      if (shortlistOpen || settingsOpen || topUpOpen || useGame.getState().winOpen) return
      // + / − — добавить или убрать линию
      if (e.key === '+' || e.key === '=' || e.code === 'NumpadAdd') return pressLinesKey(1)
      if (e.key === '-' || e.code === 'NumpadSubtract') return pressLinesKey(-1)
      // Enter — открыть карточку выпавшего кандидата
      if (e.key === 'Enter' && !el.closest('button, a')) return useGame.getState().openWin()
      if (e.code !== 'Space' || e.repeat) return
      if (el.closest('button, a')) return
      e.preventDefault()
      useGame.getState().spin()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [shortlistOpen, settingsOpen, topUpOpen])

  return (
    <div className="app">
      <div className="stage">
        <Scene />
      </div>
      <WinModal />
      <Shortlist open={shortlistOpen} onClose={closeShortlist} />
      {settingsOpen && <Settings onClose={closeSettings} />}
      {topUpOpen && <TopUp onClose={closeTopUp} />}
      <PrivacyLink />
    </div>
  )
}
