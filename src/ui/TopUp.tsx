import { useGame } from '../game/store'
import { REFILL_AMOUNT } from '../game/economy'
import { TOPUP } from '../copy'
import { Modal } from './common'

/** Сколько пополнить: пачками по REFILL_AMOUNT, но не меньше, чем нужно на один спин. */
const topUpAmount = (credits: number, cost: number) => Math.max(1, Math.ceil((cost - credits) / REFILL_AMOUNT)) * REFILL_AMOUNT

/** Окно «Пополнить»: кредиты кончились — одна кнопка возвращает бюджет. */
export function TopUp({ onClose }: { onClose: () => void }) {
  const credits = useGame((s) => s.credits)
  const cost = useGame((s) => s.cost)
  const refill = useGame((s) => s.refill)
  const amount = topUpAmount(credits, cost)

  const topUp = () => {
    refill(amount)
    onClose()
  }

  return (
    <Modal onClose={onClose} className="topup">
      <h2>{TOPUP.title}</h2>
      <p>{TOPUP.text(cost, credits)}</p>
      <div className="topup__actions">
        <button className="btn btn--ghost" onClick={onClose}>
          {TOPUP.later}
        </button>
        <button className="btn btn--refill" onClick={topUp} autoFocus>
          {TOPUP.button(amount)}
        </button>
      </div>
    </Modal>
  )
}
