import { type ReactNode } from 'react'

interface ModalProps {
  open: boolean
  onClose: () => void
  children: ReactNode
}

export function Modal({ open, onClose, children }: ModalProps) {
  if (!open) return null

  return (
    <div className="modal-overlay" onClick={(e) => {
      if (e.target === e.currentTarget) onClose()
    }}>
      <div className="modal">
        {children}
      </div>
    </div>
  )
}
