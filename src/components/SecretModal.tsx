import { Modal } from './Modal'
import { useToast } from '~/hooks/useToast'

interface SecretModalProps {
  open: boolean
  onClose: () => void
  webhookUrl: string
  webhookSecret: string
}

export function SecretModal({
  open,
  onClose,
  webhookUrl,
  webhookSecret,
}: SecretModalProps) {
  const { toast } = useToast()

  function copyToClipboard(text: string) {
    navigator.clipboard.writeText(text)
    toast('Copied!')
  }

  return (
    <Modal open={open} onClose={onClose}>
      <h3>Webhook Secret</h3>
      <div className="warning-box">
        Save this secret now — it will not be shown again.
      </div>

      <div style={{ margin: '12px 0' }}>
        <label style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
          Webhook URL
        </label>
        <div className="secret-display">
          {webhookUrl}
          <button
            className="btn btn-sm copy-btn"
            onClick={() => copyToClipboard(webhookUrl)}
          >
            Copy
          </button>
        </div>
      </div>

      <div style={{ margin: '12px 0' }}>
        <label style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
          Secret
        </label>
        <div className="secret-display">
          {webhookSecret}
          <button
            className="btn btn-sm copy-btn"
            onClick={() => copyToClipboard(webhookSecret)}
          >
            Copy
          </button>
        </div>
      </div>

      <div style={{ marginTop: '16px', textAlign: 'right' }}>
        <button className="btn btn-primary" onClick={onClose}>
          I've Saved This
        </button>
      </div>
    </Modal>
  )
}
