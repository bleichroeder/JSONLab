import React from 'react';
import { JsonValue, VersionHistoryItem } from '../types';
import { formatJson } from '../utils/jsonUtils';
import { GraphView } from './GraphView';
import { SchemaView } from './SchemaView';
import { CompareView } from './CompareView';
import { ConvertView } from './ConvertView';
import { AnalyzeView } from './AnalyzeView';
import FormatView from './FormatView';
import Editor from '@monaco-editor/react';
import { useTheme } from '../contexts/ThemeContext';
import type * as Monaco from 'monaco-editor';
import './DocumentViewer.css';

interface DocumentViewerProps {
  data: JsonValue;
  onUpdate: (newData: JsonValue) => void;
  highlightPath?: string | null;
  versionHistory: VersionHistoryItem[];
  currentVersionIndex: number;
  onUndo: () => void;
  onRedo: () => void;
}

export const DocumentViewer: React.FC<DocumentViewerProps> = ({ 
  data, 
  onUpdate, 
  highlightPath,
  versionHistory,
  currentVersionIndex,
  onUndo,
  onRedo 
}) => {
  const { theme } = useTheme();
  const [showChartModal, setShowChartModal] = React.useState(false);
  const [showSchemaModal, setShowSchemaModal] = React.useState(false);
  const [showCompareModal, setShowCompareModal] = React.useState(false);
  const [showConvertModal, setShowConvertModal] = React.useState(false);
  const [showAnalyzeModal, setShowAnalyzeModal] = React.useState(false);
  const [showFormatModal, setShowFormatModal] = React.useState(false);
  const [rawJson, setRawJson] = React.useState(formatJson(data));
  const [error, setError] = React.useState<string | null>(null);
  const debounceTimerRef = React.useRef<number | null>(null);
  const editorRef = React.useRef<Monaco.editor.IStandaloneCodeEditor | null>(null);
  const decorationsRef = React.useRef<string[]>([]);
  const isUserEditRef = React.useRef<boolean>(false);

  React.useEffect(() => {
    // Only update editor content if the change didn't come from user editing
    if (!isUserEditRef.current) {
      setRawJson(formatJson(data));
    }
    // Reset the flag
    isUserEditRef.current = false;
  }, [data]);

  // Handle editor mount
  const handleEditorDidMount = (editor: Monaco.editor.IStandaloneCodeEditor) => {
    editorRef.current = editor;
  };

  // Apply highlighting decorations when highlightPath changes
  React.useEffect(() => {
    if (!editorRef.current || !highlightPath) {
      // Clear decorations if no highlight path
      if (editorRef.current && decorationsRef.current.length > 0) {
        decorationsRef.current = editorRef.current.deltaDecorations(decorationsRef.current, []);
      }
      return;
    }

    const editor = editorRef.current;
    const model = editor.getModel();
    if (!model) return;

    // Parse the highlight path to find the target in JSON
    const lines = rawJson.split('\n');
    const pathSegments: Array<{type: 'index' | 'property', value: string}> = [];
    const matches = highlightPath.match(/\[(\d+)\]|([^.\[\]]+)/g);
    
    if (matches) {
      matches.forEach(match => {
        if (match.startsWith('[')) {
          pathSegments.push({ type: 'index', value: match.replace(/[\[\]]/g, '') });
        } else {
          pathSegments.push({ type: 'property', value: match });
        }
      });
    }

    let startLine = -1;
    let endLine = -1;
    let currentSegmentIndex = 0;
    let arrayIndexCounter = 0;
    let objectDepth = 0;
    let targetDepth = 0;
    let trackingArrayDepth = -1;
    let inTargetStructure = false;

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const trimmed = line.trim();
      
      // Opening bracket/brace
      if (trimmed.endsWith('{') || trimmed.endsWith('[')) {
        const isArray = trimmed.endsWith('[');
        
        if (currentSegmentIndex < pathSegments.length && 
            pathSegments[currentSegmentIndex].type === 'index' && 
            isArray &&
            trackingArrayDepth === -1) {
          arrayIndexCounter = 0;
          trackingArrayDepth = objectDepth;
          objectDepth++;
        } else if (currentSegmentIndex < pathSegments.length && 
                   pathSegments[currentSegmentIndex].type === 'index' && 
                   trackingArrayDepth !== -1 &&
                   objectDepth === trackingArrayDepth + 1 &&
                   trimmed === '{') {
          if (arrayIndexCounter === parseInt(pathSegments[currentSegmentIndex].value)) {
            currentSegmentIndex++;
            trackingArrayDepth = -1;
            
            // If this is the last segment, we found the target object
            if (currentSegmentIndex === pathSegments.length) {
              startLine = i + 1; // Monaco uses 1-based line numbers
              targetDepth = objectDepth + 1; // Set to depth AFTER incrementing
              inTargetStructure = true;
            }
          } else {
            arrayIndexCounter++;
          }
          objectDepth++;
        } else {
          objectDepth++;
        }
      }
      
      // Check for property match
      if (currentSegmentIndex < pathSegments.length && 
          pathSegments[currentSegmentIndex].type === 'property') {
        if (line.includes(`"${pathSegments[currentSegmentIndex].value}"`) && trimmed.includes(':')) {
          // Check if the value is an object or array (multi-line) or a simple value (single line)
          if (trimmed.endsWith('{') || trimmed.endsWith('[')) {
            // Multi-line value - mark start and continue looking for end
            startLine = i + 1;
            targetDepth = objectDepth + 1; // Set to depth AFTER incrementing
            inTargetStructure = true;
            currentSegmentIndex++;
            objectDepth++;
          } else if (trimmed.includes(':')) {
            // Simple value - just this line
            currentSegmentIndex++;
            if (currentSegmentIndex === pathSegments.length) {
              startLine = i + 1;
              endLine = i + 1;
              break;
            }
          }
        }
      }
      
      // Closing bracket/brace
      if (trimmed.startsWith('}') || trimmed.startsWith(']')) {
        // Check if we're exiting the target structure BEFORE decrementing
        if (inTargetStructure && objectDepth === targetDepth) {
          endLine = i + 1;
          break;
        }
        
        objectDepth--;
        
        if (trackingArrayDepth !== -1 && objectDepth <= trackingArrayDepth) {
          trackingArrayDepth = -1;
        }
      }
    }

    // If we found a start but no end, highlight just the start line
    if (startLine !== -1 && endLine === -1) {
      endLine = startLine;
    }

    if (startLine !== -1 && endLine !== -1) {
      // Create decorations for all lines in the range
      const newDecorations = [];
      for (let line = startLine; line <= endLine; line++) {
        newDecorations.push({
          range: new (window as any).monaco.Range(line, 1, line, 1),
          options: {
            isWholeLine: true,
            className: 'highlighted-line',
            glyphMarginClassName: line === startLine ? 'highlighted-line-glyph' : undefined
          }
        });
      }
      
      decorationsRef.current = editor.deltaDecorations(decorationsRef.current, newDecorations);
      
      // Scroll to the highlighted line (center on the start line)
      editor.revealLineInCenter(startLine);
    }
  }, [highlightPath, rawJson]);

  // Close modal on Escape key
  React.useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (showChartModal) setShowChartModal(false);
        if (showSchemaModal) setShowSchemaModal(false);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [showChartModal, showSchemaModal]);

  // Cleanup debounce timer on unmount
  React.useEffect(() => {
    return () => {
      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current);
      }
    };
  }, []);

  // Auto-save with debounce when JSON changes
  const handleJsonChange = (value: string | undefined) => {
    const newValue = value || '';
    setRawJson(newValue);

    // Clear existing timer
    if (debounceTimerRef.current) {
      clearTimeout(debounceTimerRef.current);
    }

    // Set new timer to auto-save after 1 second of inactivity
    debounceTimerRef.current = window.setTimeout(() => {
      try {
        const parsed = JSON.parse(newValue);
        // Mark that this update is coming from user editing
        isUserEditRef.current = true;
        onUpdate(parsed);
        setError(null);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Invalid JSON');
      }
    }, 1000);
  };

  // Keyboard shortcuts for undo/redo
  React.useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'z' && !e.shiftKey) {
        e.preventDefault();
        onUndo();
      } else if ((e.ctrlKey || e.metaKey) && (e.key === 'y' || (e.key === 'z' && e.shiftKey))) {
        e.preventDefault();
        onRedo();
      }
    };
    
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onUndo, onRedo]);

  const canUndo = currentVersionIndex > 0;
  const canRedo = currentVersionIndex < versionHistory.length - 1;

  return (
    <>
      <div className="document-viewer">
        <div className="viewer-header">
          <div className="view-toolbar">
            <button 
              onClick={() => setShowCompareModal(true)} 
              className="btn-toolbar"
            >
              <span className="material-symbols-outlined">compare</span>
              <span className="btn-toolbar-label">Compare</span>
            </button>
            <button 
              onClick={() => setShowSchemaModal(true)} 
              className="btn-toolbar"
            >
              <span className="material-symbols-outlined">code</span>
              <span className="btn-toolbar-label">Schema</span>
            </button>
            <button 
              onClick={() => setShowChartModal(true)} 
              className="btn-toolbar"
            >
              <span className="material-symbols-outlined">account_tree</span>
              <span className="btn-toolbar-label">Graph</span>
            </button>
            <button 
              onClick={() => setShowConvertModal(true)} 
              className="btn-toolbar"
            >
              <span className="material-symbols-outlined">transform</span>
              <span className="btn-toolbar-label">Convert</span>
            </button>
            <button 
              onClick={() => setShowAnalyzeModal(true)} 
              className="btn-toolbar"
            >
              <span className="material-symbols-outlined">troubleshoot</span>
              <span className="btn-toolbar-label">Analyze</span>
            </button>
            <button 
              onClick={() => setShowFormatModal(true)} 
              className="btn-toolbar"
            >
              <span className="material-symbols-outlined">auto_fix</span>
              <span className="btn-toolbar-label">Format</span>
            </button>
          </div>
        </div>

        {error && (
          <div className="error-message">
            {error}
          </div>
        )}

        <div className="editor-container">
          <div className="floating-history-controls">
            <button 
              onClick={() => {
                if (editorRef.current) {
                  editorRef.current.getAction('editor.action.formatDocument')?.run();
                }
              }} 
              className="btn-history" 
              title="Beautify JSON (Format Document)"
            >
              <span className="material-symbols-outlined">auto_awesome</span>
            </button>
            <div className="history-divider"></div>
            <button 
              onClick={onUndo} 
              className="btn-history" 
              disabled={!canUndo}
              title="Undo (Ctrl+Z)"
            >
              <span className="material-symbols-outlined">undo</span>
            </button>
            <div className="history-divider"></div>
            <button 
              onClick={onRedo} 
              className="btn-history" 
              disabled={!canRedo}
              title="Redo (Ctrl+Y)"
            >
              <span className="material-symbols-outlined">redo</span>
            </button>
            {versionHistory.length > 0 && (
              <>
                <div className="history-divider"></div>
                <span className="version-indicator">
                  {currentVersionIndex + 1}/{versionHistory.length}
                </span>
              </>
            )}
          </div>
          <Editor
            height="100%"
            language="json"
            value={rawJson}
            onChange={handleJsonChange}
            onMount={handleEditorDidMount}
            theme={theme === 'dark' ? 'vs-dark' : 'vs-light'}
            options={{
              automaticLayout: true,
              minimap: { 
                enabled: true,
                side: 'right',
                showSlider: 'mouseover',
                renderCharacters: false,
                maxColumn: 80
              },
              scrollBeyondLastLine: false,
              fontSize: 14,
              lineNumbers: 'on',
              folding: true,
              tabSize: 2,
              formatOnPaste: false,
              formatOnType: false
            }}
          />
        </div>
      </div>

      {/* JSON Graph Modal */}
      {showChartModal && (
        <div className="chart-modal-overlay" onClick={() => setShowChartModal(false)}>
          <div className="chart-modal-content" onClick={(e) => e.stopPropagation()}>
            <div className="chart-modal-header">
              <h2>Interactive JSON Graph</h2>
              <button 
                className="btn-close-modal" 
                onClick={() => setShowChartModal(false)}
                aria-label="Close"
              >
                <span className="material-symbols-outlined">close</span>
              </button>
            </div>
            <div className="chart-modal-body">
              <GraphView data={data} />
            </div>
          </div>
        </div>
      )}

      {/* Schema View Modal */}
      {showSchemaModal && (
        <div className="chart-modal-overlay" onClick={() => setShowSchemaModal(false)}>
          <div className="schema-modal-content" onClick={(e) => e.stopPropagation()}>
            <div className="chart-modal-header">
              <h2>Schema Generator</h2>
              <button 
                className="btn-close-modal" 
                onClick={() => setShowSchemaModal(false)}
                aria-label="Close"
              >
                <span className="material-symbols-outlined">close</span>
              </button>
            </div>
            <div className="chart-modal-body">
              <SchemaView data={data} />
            </div>
          </div>
        </div>
      )}

      {/* Compare View Modal */}
      {showCompareModal && (
        <CompareView
          currentDocument={rawJson}
          versionHistory={versionHistory}
          onClose={() => setShowCompareModal(false)}
          onRestore={(content) => {
            try {
              const parsed = JSON.parse(content);
              onUpdate(parsed);
            } catch (e) {
              console.error('Failed to restore version:', e);
            }
          }}
        />
      )}

      {/* Convert View Modal */}
      {showConvertModal && (
        <ConvertView
          jsonContent={rawJson}
          onClose={() => setShowConvertModal(false)}
        />
      )}

      {/* Analyze View Modal */}
      {showAnalyzeModal && (
        <AnalyzeView
          jsonContent={rawJson}
          onClose={() => setShowAnalyzeModal(false)}
        />
      )}

      {/* Format View Modal */}
      {showFormatModal && (
        <FormatView
          jsonContent={rawJson}
          onApply={(formattedJson) => {
            setRawJson(formattedJson);
            try {
              const parsed = JSON.parse(formattedJson);
              onUpdate(parsed);
            } catch (e) {
              setError('Invalid JSON after formatting');
            }
          }}
          onClose={() => setShowFormatModal(false)}
        />
      )}
    </>
  );
};
