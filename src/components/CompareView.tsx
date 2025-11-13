import React from 'react';
import { DiffEditor } from '@monaco-editor/react';
import { useTheme } from '../contexts/ThemeContext';
import { VersionHistoryItem } from '../types';
import './CompareView.css';

interface CompareViewProps {
  currentDocument: string;
  versionHistory: VersionHistoryItem[];
  onClose: () => void;
  onRestore?: (content: string) => void;
}

export const CompareView: React.FC<CompareViewProps> = ({ 
  currentDocument, 
  versionHistory,
  onClose,
  onRestore
}) => {
  const { theme } = useTheme();
  const [compareSource, setCompareSource] = React.useState<'version' | 'upload' | 'paste'>('version');
  const [selectedVersionIndex, setSelectedVersionIndex] = React.useState<number>(
    versionHistory.length > 1 ? versionHistory.length - 2 : 0
  );
  const [uploadedContent, setUploadedContent] = React.useState<string>('');
  const [pastedContent, setPastedContent] = React.useState<string>('{\n  \n}');
  const [isTransitioning, setIsTransitioning] = React.useState(false);
  const [showRestoreConfirm, setShowRestoreConfirm] = React.useState(false);
  const fileInputRef = React.useRef<HTMLInputElement>(null);
  const transitionTimerRef = React.useRef<number | null>(null);

  // When switching to paste mode, initialize with placeholder if empty
  React.useEffect(() => {
    if (compareSource === 'paste' && !pastedContent) {
      setPastedContent('{\n  \n}');
    }
  }, [compareSource, pastedContent]);

  // Handle version change with smooth transition
  const handleVersionChange = (newIndex: number) => {
    setIsTransitioning(true);
    setSelectedVersionIndex(newIndex);
    
    // Clear any existing timer
    if (transitionTimerRef.current) {
      window.clearTimeout(transitionTimerRef.current);
    }
    
    // Reset transition state after animation
    transitionTimerRef.current = window.setTimeout(() => {
      setIsTransitioning(false);
    }, 150);
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = (event) => {
        const content = event.target?.result as string;
        setUploadedContent(content);
      };
      reader.readAsText(file);
    }
  };

  const getOriginalContent = (): string => {
    switch (compareSource) {
      case 'version':
        return versionHistory[selectedVersionIndex]?.content || '';
      case 'upload':
        return uploadedContent;
      case 'paste':
        return pastedContent;
      default:
        return '';
    }
  };

  const formatTimestamp = (timestamp: number): string => {
    const date = new Date(timestamp);
    return date.toLocaleString();
  };

  const handleRestoreClick = () => {
    setShowRestoreConfirm(true);
  };

  const handleRestoreConfirm = () => {
    if (!onRestore) return;
    
    const contentToRestore = getOriginalContent();
    if (contentToRestore) {
      onRestore(contentToRestore);
      setShowRestoreConfirm(false);
      onClose();
    }
  };

  const handleRestoreCancel = () => {
    setShowRestoreConfirm(false);
  };

  const canRestore = compareSource === 'version' && onRestore;

  return (
    <div className="chart-modal-overlay" onClick={onClose}>
      <div className="compare-modal-content" onClick={(e) => e.stopPropagation()}>
        <div className="chart-modal-header">
          <h2>Compare Documents</h2>
          <button 
            className="btn-close-modal" 
            onClick={onClose}
            aria-label="Close"
          >
            <span className="material-symbols-outlined">close</span>
          </button>
        </div>

        <div className="compare-controls">
          <div className="compare-control-row">
            <div className="compare-source-group">
              <label className="control-label">Compare with:</label>
              <div className="compare-source-selector">
                <label className="radio-label">
                  <input 
                    type="radio" 
                    value="version" 
                    checked={compareSource === 'version'}
                    onChange={(e) => setCompareSource(e.target.value as 'version')}
                  />
                  Previous Version
                </label>
                <label className="radio-label">
                  <input 
                    type="radio" 
                    value="upload" 
                    checked={compareSource === 'upload'}
                    onChange={(e) => setCompareSource(e.target.value as 'upload')}
                  />
                  Upload File
                </label>
                <label className="radio-label">
                  <input 
                    type="radio" 
                    value="paste" 
                    checked={compareSource === 'paste'}
                    onChange={(e) => setCompareSource(e.target.value as 'paste')}
                  />
                  Paste JSON
                </label>
              </div>
            </div>

            {compareSource === 'version' && (
              <>
                <div className="version-selector">
                  <select 
                    id="version-select"
                    value={selectedVersionIndex}
                    onChange={(e) => handleVersionChange(Number(e.target.value))}
                    className="version-select"
                  >
                    {versionHistory.map((version, index) => (
                      <option key={index} value={index}>
                        Version {index + 1} - {version.label} ({formatTimestamp(version.timestamp)})
                      </option>
                    ))}
                  </select>
                </div>
                {canRestore && (
                  <button 
                    className="btn-restore-version"
                    onClick={handleRestoreClick}
                    title="Restore this version"
                  >
                    <span className="material-symbols-outlined">restore</span>
                    Restore Version
                  </button>
                )}
              </>
            )}
          </div>

          {compareSource === 'version' && versionHistory.length > 1 && (
            <div className="timeline-scrubber">
              <div className="timeline-header">
                <span className="timeline-label">
                  <span className="material-symbols-outlined">schedule</span>
                  Timeline
                </span>
                <span className="timeline-info">
                  Version {selectedVersionIndex + 1} of {versionHistory.length} - {formatTimestamp(versionHistory[selectedVersionIndex].timestamp)}
                </span>
              </div>
              <div className="timeline-slider-container">
                <div className="timeline-markers">
                  {versionHistory.map((_, index) => {
                    // Calculate position accounting for thumb behavior:
                    // At min (0), thumb center is at 0%; at max, thumb center is at 100%
                    // So marker positions should match: (index / (length-1)) * 100%
                    // But remove the container padding offset since markers are absolutely positioned
                    const percent = versionHistory.length > 1 
                      ? (index / (versionHistory.length - 1)) * 100 
                      : 50;
                    return (
                      <div 
                        key={index}
                        className={`timeline-marker ${index === selectedVersionIndex ? 'active' : ''} ${index === versionHistory.length - 1 ? 'current' : ''}`}
                        style={{ left: `${percent}%` }}
                        onClick={() => handleVersionChange(index)}
                        title={`Version ${index + 1}`}
                      />
                    );
                  })}
                </div>
                <input
                  type="range"
                  min="0"
                  max={versionHistory.length - 1}
                  value={selectedVersionIndex}
                  onChange={(e) => handleVersionChange(Number(e.target.value))}
                  className="timeline-slider"
                  style={{
                    // @ts-ignore - CSS custom property
                    '--progress': `${(selectedVersionIndex / (versionHistory.length - 1)) * 100}%`
                  }}
                />
              </div>
            </div>
          )}

          {compareSource === 'upload' && (
            <div className="compare-control-row">
              <div className="upload-control">
                <input 
                  ref={fileInputRef}
                  type="file" 
                  accept=".json"
                  onChange={handleFileUpload}
                  style={{ display: 'none' }}
                />
                <button 
                  onClick={() => fileInputRef.current?.click()}
                  className="btn-upload"
                >
                  <span className="material-symbols-outlined">upload_file</span>
                  Choose File
                </button>
                {uploadedContent && (
                  <span className="file-status">({uploadedContent.length} chars loaded)</span>
                )}
              </div>
            </div>
          )}
        </div>

        <div className="diff-pane-labels">
          <div className="pane-label pane-label-original">
            <span className="material-symbols-outlined">
              {compareSource === 'version' && 'history'}
              {compareSource === 'upload' && 'upload_file'}
              {compareSource === 'paste' && 'edit_note'}
            </span>
            <span>
              {compareSource === 'version' && `Version ${selectedVersionIndex + 1}`}
              {compareSource === 'upload' && 'Uploaded File'}
              {compareSource === 'paste' && 'Paste JSON Here (editable)'}
            </span>
          </div>
          <div className="pane-label pane-label-current">
            <span className="material-symbols-outlined">edit_document</span>
            <span>Current Document</span>
          </div>
        </div>

        <div className={`diff-editor-container ${isTransitioning ? 'transitioning' : ''}`}>
          <DiffEditor
            height="100%"
            language="json"
            original={getOriginalContent()}
            modified={currentDocument}
            theme={theme === 'dark' ? 'vs-dark' : 'light'}
            options={{
              renderSideBySide: true,
              minimap: { enabled: false },
              scrollBeyondLastLine: false,
              fontSize: 13,
              lineNumbers: 'on',
              folding: true,
              wordWrap: 'on',
              readOnly: false,
              originalEditable: compareSource === 'paste',
            }}
            onMount={(editor) => {
              const originalEditor = editor.getOriginalEditor();
              const modifiedEditor = editor.getModifiedEditor();
              
              // Make modified (right) editor always read-only
              modifiedEditor.updateOptions({ readOnly: true });
              
              // Make original (left) editor editable only in paste mode
              originalEditor.updateOptions({ 
                readOnly: compareSource !== 'paste' 
              });
              
              // Listen for changes in paste mode
              if (compareSource === 'paste') {
                originalEditor.onDidChangeModelContent(() => {
                  const content = originalEditor.getValue();
                  setPastedContent(content);
                });
              }
            }}
          />
        </div>

        <div className="diff-legend">
          <div className="legend-item">
            <span className="legend-color legend-deleted"></span>
            <span>Deleted</span>
          </div>
          <div className="legend-item">
            <span className="legend-color legend-added"></span>
            <span>Added</span>
          </div>
          <div className="legend-item">
            <span className="legend-color legend-modified"></span>
            <span>Modified</span>
          </div>
        </div>
      </div>

      {/* Restore Confirmation Modal */}
      {showRestoreConfirm && (
        <div className="confirm-overlay" onClick={handleRestoreCancel}>
          <div className="confirm-dialog" onClick={(e) => e.stopPropagation()}>
            <div className="confirm-icon">
              <span className="material-symbols-outlined">restore</span>
            </div>
            <h3 className="confirm-title">Restore Version?</h3>
            <p className="confirm-message">
              This will replace your current document with the selected version and create a new history entry.
            </p>
            <div className="confirm-actions">
              <button className="btn-confirm-cancel" onClick={handleRestoreCancel}>
                Cancel
              </button>
              <button className="btn-confirm-restore" onClick={handleRestoreConfirm}>
                <span className="material-symbols-outlined">restore</span>
                Restore
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
