import { useEffect } from 'react'
import { useGame } from '../game/store'
import { REFILL_AMOUNT } from '../game/economy'
import { TOPUP } from '../copy'
import { sfx } from '../audio/sfx'
import { Modal } from './common'

/** Сколько пополнить: пачками по REFILL_AMOUNT, но не меньше, чем нужно на один спин. */
const topUpAmount = (credits: number, cost: number) => Math.max(1, Math.ceil((cost - credits) / REFILL_AMOUNT)) * REFILL_AMOUNT

/** Окно «Пополнить»: кредиты кончились — одна кнопка возвращает бюджет. Поверх всех окон, с сигналом. */
export function TopUp({ onClose }: { onClose: () => void }) {
  const credits = useGame((s) => s.credits)
  const cost = useGame((s) => s.cost)
  const refill = useGame((s) => s.refill)
  const amount = topUpAmount(credits, cost)

  useEffect(() => sfx.broke(), [])

  const topUp = () => {
    refill(amount)
    onClose()
  }

  return (
    <Modal onClose={onClose} className="topup">
      <div className="topup__icon" aria-hidden="true">
        💸
      </div>
      <h2>{TOPUP.title}</h2>
      <div className="topup__balance">
        <div>
          <span className="topup__num topup__num--low">{credits} ◎</span>
          <span className="topup__label">{TOPUP.left}</span>
        </div>
        <div>
          <span className="topup__num">{cost} ◎</span>
          <span className="topup__label">{TOPUP.perSpin}</span>
        </div>
      </div>
      <p>{TOPUP.text(cost, credits)}</p>
      <div className="topup__actions">
        <button className="btn btn--refill topup__go" onClick={topUp} autoFocus>
          {TOPUP.button(amount)}
        </button>
        <button className="btn btn--ghost topup__later" onClick={onClose}>
          {TOPUP.later}
        </button>
      </div>
    </Modal>
  )
}
