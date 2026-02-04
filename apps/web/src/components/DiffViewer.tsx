import { useState, useEffect } from 'react'
import { useBridge } from '../context/BridgeContext'

type DiffViewMode = 'stacked' | 'side-by-side'
type DiffScope = 'changes' | 'whole-file'

interface DiffViewerProps {
  filePath: string
  oldString: string
  newString: string
  isModal?: boolean
  onClose?: () => void
}

export function DiffViewer({ filePath, oldString, newString, isModal = false, onClose }: DiffViewerProps) {
  const { fetchWithAuth } = useBridge()

  // Load preference from localStorage, default to auto-detect
  const [viewMode, setViewMode] = useState<DiffViewMode>(() => {
    const saved = localStorage.getItem('diffViewMode')
    if (saved === 'stacked' || saved === 'side-by-side') return saved
    // Auto-detect based on screen width
    return window.innerWidth >= 768 ? 'side-by-side' : 'stacked'
  })

  // Scope: changes only vs whole file (only available in modal)
  const [scope, setScope] = useState<DiffScope>('changes')
  const [fullFileContent, setFullFileContent] = useState<string | null>(null)
  const [loadingFile, setLoadingFile] = useState(false)
  const [fileError, setFileError] = useState<string | null>(null)

  const oldLines = oldString.split('\n')
  const newLines = newString.split('\n')

  // Fetch full file when scope changes to 'whole-file'
  useEffect(() => {
    if (scope === 'whole-file' && !fullFileContent && !loadingFile && !fileError) {
      setLoadingFile(true)
      fetchWithAuth(`/files/read?path=${encodeURIComponent(filePath)}`)
        .then(res => {
          if (!res.ok) throw new Error('Failed to read file')
          return res.json()
        })
        .then(data => {
          setFullFileContent(data.content)
          setLoadingFile(false)
        })
        .catch(err => {
          setFileError(err.message)
          setLoadingFile(false)
        })
    }
  }, [scope, filePath, fullFileContent, loadingFile, fileError])

  // Handle responsive auto-switch
  useEffect(() => {
    const handleResize = () => {
      const saved = localStorage.getItem('diffViewMode')
      // Only auto-switch if user hasn't set a preference
      if (!saved) {
        setViewMode(window.innerWidth >= 768 ? 'side-by-side' : 'stacked')
      }
    }

    window.addEventListener('resize', handleResize)
    return () => window.removeEventListener('resize', handleResize)
  }, [])

  // Handle escape key to close modal
  useEffect(() => {
    if (!isModal) return

    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && onClose) onClose()
    }

    window.addEventListener('keydown', handleEscape)
    return () => window.removeEventListener('keydown', handleEscape)
  }, [isModal, onClose])

  const toggleViewMode = () => {
    const newMode = viewMode === 'stacked' ? 'side-by-side' : 'stacked'
    setViewMode(newMode)
    localStorage.setItem('diffViewMode', newMode)
  }

  const toggleScope = () => {
    setScope(scope === 'changes' ? 'whole-file' : 'changes')
  }

  // Render the whole file with changes highlighted
  const renderWholeFile = () => {
    if (loadingFile) {
      return <div className="diff-loading">Loading file...</div>
    }
    if (fileError) {
      return <div className="diff-error">Error: {fileError}</div>
    }
    if (!fullFileContent) {
      return null
    }

    const fullLines = fullFileContent.split('\n')

    // Find where the old content appears in the file
    // This is a simplified approach - finds first match
    const oldFirstLine = oldLines[0]
    let changeStartIndex = fullLines.findIndex(line => line === oldFirstLine)
    if (changeStartIndex === -1) changeStartIndex = 0

    return (
      <div className="diff-whole-file">
        <div className="diff-lines">
          {fullLines.map((line, i) => {
            const isInChangeRange = i >= changeStartIndex && i < changeStartIndex + oldLines.length
            const isChanged = isInChangeRange && oldLines[i - changeStartIndex] !== undefined

            return (
              <div
                key={i}
                className={`diff-line ${isChanged ? 'changed-context' : ''}`}
              >
                <span className="diff-line-num">{i + 1}</span>
                <span className="diff-line-content">{line || ' '}</span>
                {isChanged && <span className="diff-change-marker">←</span>}
              </div>
            )
          })}
        </div>
        <div className="diff-change-preview">
          <div className="change-preview-header">Changes at lines {changeStartIndex + 1}-{changeStartIndex + oldLines.length}:</div>
          <div className="change-preview-content">
            <div className="preview-old">
              <span className="preview-label">- Remove:</span>
              <pre>{oldString}</pre>
            </div>
            <div className="preview-new">
              <span className="preview-label">+ Add:</span>
              <pre>{newString}</pre>
            </div>
          </div>
        </div>
      </div>
    )
  }

  // Render changes-only view (original)
  const renderChangesOnly = () => (
    <div className={`diff-content ${viewMode}`}>
      <div className="diff-removed">
        <div className="diff-label">- REMOVE</div>
        <div className="diff-lines">
          {oldLines.map((line, i) => (
            <div key={`old-${i}`} className="diff-line removed">
              <span className="diff-line-num">{i + 1}</span>
              <span className="diff-line-content">{line || ' '}</span>
            </div>
          ))}
        </div>
      </div>
      <div className="diff-added">
        <div className="diff-label">+ ADD</div>
        <div className="diff-lines">
          {newLines.map((line, i) => (
            <div key={`new-${i}`} className="diff-line added">
              <span className="diff-line-num">{i + 1}</span>
              <span className="diff-line-content">{line || ' '}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  )

  const content = (
    <div className={`diff-viewer ${isModal ? 'modal-content' : ''}`}>
      <div className="diff-toolbar">
        <span className="diff-file-path">{filePath}</span>
        <div className="diff-actions">
          {isModal && (
            <button
              className={`diff-toggle-btn ${scope === 'whole-file' ? 'active' : ''}`}
              onClick={toggleScope}
              title="Toggle between changes only and whole file"
            >
              {scope === 'changes' ? '◐ Changes Only' : '◉ Whole File'}
            </button>
          )}
          <button
            className={`diff-toggle-btn ${viewMode === 'stacked' ? 'active' : ''}`}
            onClick={toggleViewMode}
            title="Toggle view mode"
          >
            {viewMode === 'stacked' ? '☰ Stacked' : '⧉ Side-by-Side'}
          </button>
        </div>
      </div>

      {scope === 'changes' ? renderChangesOnly() : renderWholeFile()}

      <div className="diff-stats">
        <span className="stat removed">-{oldLines.length} lines</span>
        <span className="stat added">+{newLines.length} lines</span>
        {fullFileContent && <span className="stat total">{fullFileContent.split('\n').length} total lines</span>}
      </div>
    </div>
  )

  if (isModal) {
    return (
      <div className="diff-modal-overlay" onClick={onClose}>
        <div className="diff-modal" onClick={(e) => e.stopPropagation()}>
          <button className="diff-modal-close" onClick={onClose}>✕</button>
          {content}
        </div>
      </div>
    )
  }

  return content
}
