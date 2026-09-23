import { useState } from 'react'
import { Modal } from './common'

/** Незаметная ссылка в углу экрана + модалка с информацией об источнике данных и приватности. */
export function PrivacyLink() {
  const [open, setOpen] = useState(false)
  return (
    <>
      <button className="privacy-link" onClick={() => setOpen(true)}>
        Data & Privacy
      </button>
      {open && (
        <Modal onClose={() => setOpen(false)} className="privacy">
          <h2>Data & Privacy</h2>
          <p>
            Profiles in this game are pulled from public resumes on{' '}
            <a href="https://jsonresume.org/registry/" target="_blank" rel="noreferrer">
              JSON Resume Registry
            </a>{' '}
            — their authors published this data openly themselves. Profiles remain the property of their authors;
            every candidate card links back to the original resume.
          </p>
          <p>We don't sell or share candidates' personal data with third parties.</p>
          <p>
            The database isn't kept forever: it's rebuilt on a schedule from the registry's current state, and raw
            snapshots that haven't been updated in a long time or have vanished from the source are automatically
            purged from the cache.
          </p>
        </Modal>
      )}
    </>
  )
}
