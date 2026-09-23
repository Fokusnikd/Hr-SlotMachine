import { useState } from 'react'
import { Modal } from './common'

/** Незаметная ссылка в углу экрана + модалка с информацией об источнике данных и приватности. */
export function PrivacyLink() {
  const [open, setOpen] = useState(false)
  return (
    <>
      <button className="privacy-link" onClick={() => setOpen(true)}>
        Данные и приватность
      </button>
      {open && (
        <Modal onClose={() => setOpen(false)} className="privacy">
          <h2>Данные и приватность</h2>
          <p>
            Профили в этой игре взяты из публичных резюме{' '}
            <a href="https://jsonresume.org/registry/" target="_blank" rel="noreferrer">
              JSON Resume Registry
            </a>{' '}
            — их авторы сами выложили эти данные в открытом виде. Профили остаются собственностью авторов; у каждой
            карточки кандидата есть ссылка на исходное резюме.
          </p>
          <p>Мы не продаём и не передаём персональные данные кандидатов третьим лицам.</p>
          <p>
            База не хранится вечно: она пересобирается по расписанию из текущего состояния реестра, а сырые снимки,
            которые давно не обновлялись или пропали из источника, автоматически удаляются из кэша.
          </p>
        </Modal>
      )}
    </>
  )
}
