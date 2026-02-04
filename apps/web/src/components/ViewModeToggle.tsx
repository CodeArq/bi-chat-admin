import type { ViewMode, TranscriptEntryType } from '../types'

const ENTRY_TYPE_LABELS: Record<TranscriptEntryType, string> = {
  user: 'User',
  assistant: 'Assistant',
  tool_use: 'Tool Use',
  tool_result: 'Tool Result',
  thinking: 'Thinking',
  system: 'System',
  log_event: 'Log Event',
  agent_spawn: 'Agent Spawn',
  agent_result: 'Agent Result',
  token_usage: 'Token Usage',
  compaction_summary: 'Compaction',
  approval_prompt: 'Approval',
}

interface ViewModeToggleProps {
  mode: ViewMode
  onChange: (mode: ViewMode) => void
  typeFilter?: TranscriptEntryType | 'all'
  onTypeFilterChange?: (filter: TranscriptEntryType | 'all') => void
  toolFilter?: string
  onToolFilterChange?: (filter: string) => void
  searchQuery?: string
  onSearchChange?: (query: string) => void
  onExpandAll?: () => void
  onCollapseAll?: () => void
  typeCounts?: Record<string, number>
  toolCounts?: Record<string, number>
}

export function ViewModeToggle({
  mode,
  onChange,
  typeFilter = 'all',
  onTypeFilterChange,
  toolFilter = 'all',
  onToolFilterChange,
  searchQuery = '',
  onSearchChange,
  onExpandAll,
  onCollapseAll,
  typeCounts = {},
  toolCounts = {},
}: ViewModeToggleProps) {
  const totalCount = Object.values(typeCounts).reduce((a, b) => a + b, 0)

  // Sort tool counts by frequency
  const sortedTools = Object.entries(toolCounts)
    .sort((a, b) => b[1] - a[1])

  return (
    <div className="view-mode-toggle-container">
      <div className="view-mode-toggle">
        <button
          className={`mode-btn ${mode === 'simple' ? 'active' : ''}`}
          onClick={() => onChange('simple')}
        >
          Simple
        </button>
        <button
          className={`mode-btn ${mode === 'detailed' ? 'active' : ''}`}
          onClick={() => onChange('detailed')}
        >
          Detailed
        </button>

        {mode === 'detailed' && onTypeFilterChange && (
          <>
            <select
              className="type-filter-select"
              value={typeFilter}
              onChange={(e) => onTypeFilterChange(e.target.value as TranscriptEntryType | 'all')}
            >
              <option value="all">All Types ({totalCount})</option>
              {Object.entries(ENTRY_TYPE_LABELS).map(([type, label]) => {
                const count = typeCounts[type] || 0
                if (count === 0) return null
                return (
                  <option key={type} value={type}>
                    {label} ({count})
                  </option>
                )
              })}
            </select>

            {/* Secondary tool filter when Tool Use is selected */}
            {typeFilter === 'tool_use' && onToolFilterChange && sortedTools.length > 0 && (
              <select
                className="tool-filter-select"
                value={toolFilter}
                onChange={(e) => onToolFilterChange(e.target.value)}
              >
                <option value="all">All Tools ({typeCounts['tool_use'] || 0})</option>
                {sortedTools.map(([tool, count]) => (
                  <option key={tool} value={tool}>
                    {tool} ({count})
                  </option>
                ))}
              </select>
            )}

            {/* Search bar */}
            {onSearchChange && (
              <input
                type="text"
                className="search-input"
                placeholder="Search..."
                value={searchQuery}
                onChange={(e) => onSearchChange(e.target.value)}
              />
            )}

            <button className="expand-btn" onClick={onExpandAll} title="Expand All">
              ⊞
            </button>
            <button className="expand-btn" onClick={onCollapseAll} title="Collapse All">
              ⊟
            </button>
          </>
        )}
      </div>
    </div>
  )
}
