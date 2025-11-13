import React from 'react';
import { FileUploader } from './components/FileUploader';
import { DocumentViewer } from './components/DocumentViewer';
import { DataEditor } from './components/DataEditor';
import { ResizablePanels } from './components/ResizablePanels';
import { QueryTool } from './components/QueryTool';
import { JsonValue, JsonArray, JsonObject, DocumentState, VersionHistoryItem } from './types';
import { parseJson } from './utils/jsonUtils';
import { useTheme } from './contexts/ThemeContext';
import logo_dark from './assets/JSONLab_Logo_Dark.png';
import logo_light from './assets/JSONLab_Logo_Light.png';
import './App.css';

// Maximum number of versions to keep in history
const MAX_HISTORY_LENGTH = 50;

function App() {
  const { theme, toggleTheme } = useTheme();
  const [document, setDocument] = React.useState<DocumentState>({
    raw: '',
    parsed: null,
    isValid: false,
    error: null,
  });
  const [filename, setFilename] = React.useState<string>('');
  const [highlightPath, setHighlightPath] = React.useState<string | null>(null);
  const [versionHistory, setVersionHistory] = React.useState<VersionHistoryItem[]>([]);
  const [currentVersionIndex, setCurrentVersionIndex] = React.useState<number>(-1);
  const [showRestorePrompt, setShowRestorePrompt] = React.useState(false);
  const [savedSession, setSavedSession] = React.useState<any>(null);

  // Load from localStorage on mount
  React.useEffect(() => {
    try {
      const saved = localStorage.getItem('objectlab-session');
      if (saved) {
        const session = JSON.parse(saved);
        // Only show prompt if there's actual content
        if (session.document?.parsed && session.versionHistory?.length > 0) {
          setSavedSession(session);
          setShowRestorePrompt(true);
        }
      }
    } catch (error) {
      console.error('Failed to load saved session:', error);
    }
  }, []);

  // Save to localStorage whenever document or history changes
  React.useEffect(() => {
    if (document.parsed && versionHistory.length > 0) {
      try {
        const session = {
          document,
          filename,
          versionHistory,
          currentVersionIndex,
          timestamp: Date.now(),
        };
        const sessionData = JSON.stringify(session);
        
        // Check if data is too large (localStorage typically has 5-10MB limit)
        // If over 4MB, we'll trim history more aggressively
        if (sessionData.length > 4 * 1024 * 1024) {
          console.warn('Session data too large, trimming history');
          const reducedHistory = versionHistory.slice(-Math.floor(MAX_HISTORY_LENGTH / 2));
          const reducedSession = {
            ...session,
            versionHistory: reducedHistory,
            currentVersionIndex: Math.min(currentVersionIndex, reducedHistory.length - 1),
          };
          localStorage.setItem('objectlab-session', JSON.stringify(reducedSession));
        } else {
          localStorage.setItem('objectlab-session', sessionData);
        }
      } catch (error) {
        console.error('Failed to save session:', error);
        // If QuotaExceededError, try saving with reduced history
        if (error instanceof DOMException && error.name === 'QuotaExceededError') {
          try {
            const reducedHistory = versionHistory.slice(-10);
            const reducedSession = {
              document,
              filename,
              versionHistory: reducedHistory,
              currentVersionIndex: Math.min(currentVersionIndex, reducedHistory.length - 1),
              timestamp: Date.now(),
            };
            localStorage.setItem('objectlab-session', JSON.stringify(reducedSession));
          } catch (retryError) {
            console.error('Failed to save even reduced session:', retryError);
          }
        }
      }
    }
  }, [document, filename, versionHistory, currentVersionIndex]);

  const handleRestoreSession = () => {
    if (savedSession) {
      setDocument(savedSession.document);
      setFilename(savedSession.filename || '');
      
      // Restore history but enforce limit
      const history = savedSession.versionHistory || [];
      const trimmedHistory = history.length > MAX_HISTORY_LENGTH
        ? history.slice(history.length - MAX_HISTORY_LENGTH)
        : history;
      
      setVersionHistory(trimmedHistory);
      
      // Adjust index if history was trimmed
      const originalIndex = savedSession.currentVersionIndex ?? -1;
      const adjustedIndex = history.length > MAX_HISTORY_LENGTH
        ? Math.max(0, originalIndex - (history.length - MAX_HISTORY_LENGTH))
        : originalIndex;
      
      setCurrentVersionIndex(adjustedIndex);
      setShowRestorePrompt(false);
    }
  };

  const handleDismissRestore = () => {
    setShowRestorePrompt(false);
    localStorage.removeItem('objectlab-session');
  };

  const handleCloseRestore = () => {
    // Just close the prompt without deleting the session
    setShowRestorePrompt(false);
  };

  const handleFileLoad = (content: string, name: string) => {
    const result = parseJson(content);
    
    if (result.success && result.data !== undefined) {
      setDocument({
        raw: content,
        parsed: result.data,
        isValid: true,
        error: null,
      });
      setFilename(name);
      
      // Initialize version history with loaded file
      const initialVersion: VersionHistoryItem = {
        content,
        timestamp: Date.now(),
        label: 'File loaded'
      };
      setVersionHistory([initialVersion]);
      setCurrentVersionIndex(0);
    } else {
      setDocument({
        raw: content,
        parsed: null,
        isValid: false,
        error: result.error || 'Failed to parse JSON',
      });
      setFilename(name);
    }
  };

  const handleDocumentUpdate = (newData: JsonValue) => {
    const newContent = JSON.stringify(newData, null, 2);
    setDocument({
      raw: newContent,
      parsed: newData,
      isValid: true,
      error: null,
    });
    
    // Add to version history
    const newVersion: VersionHistoryItem = {
      content: newContent,
      timestamp: Date.now(),
      label: 'Edit'
    };
    
    // If we're not at the latest version, remove future history
    const newHistory = currentVersionIndex >= 0 
      ? versionHistory.slice(0, currentVersionIndex + 1)
      : [];
    
    // Add new version and enforce history limit
    const updatedHistory = [...newHistory, newVersion];
    
    // Keep only the most recent MAX_HISTORY_LENGTH versions
    const trimmedHistory = updatedHistory.length > MAX_HISTORY_LENGTH
      ? updatedHistory.slice(updatedHistory.length - MAX_HISTORY_LENGTH)
      : updatedHistory;
    
    setVersionHistory(trimmedHistory);
    setCurrentVersionIndex(trimmedHistory.length - 1);
  };
  
  const handleUndo = () => {
    if (currentVersionIndex > 0) {
      const newIndex = currentVersionIndex - 1;
      const version = versionHistory[newIndex];
      const result = parseJson(version.content);
      
      if (result.success && result.data !== undefined) {
        setDocument({
          raw: version.content,
          parsed: result.data,
          isValid: true,
          error: null,
        });
        setCurrentVersionIndex(newIndex);
      }
    }
  };
  
  const handleRedo = () => {
    if (currentVersionIndex < versionHistory.length - 1) {
      const newIndex = currentVersionIndex + 1;
      const version = versionHistory[newIndex];
      const result = parseJson(version.content);
      
      if (result.success && result.data !== undefined) {
        setDocument({
          raw: version.content,
          parsed: result.data,
          isValid: true,
          error: null,
        });
        setCurrentVersionIndex(newIndex);
      }
    }
  };

  const handleArrayUpdate = (newArray: JsonArray) => {
    handleDocumentUpdate(newArray);
  };

  const handleDownload = () => {
    if (!document.parsed) return;

    const blob = new Blob([JSON.stringify(document.parsed, null, 2)], {
      type: 'application/json',
    });
    const url = URL.createObjectURL(blob);
    const a = window.document.createElement('a');
    a.href = url;
    a.download = filename || 'document.json';
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleReset = () => {
    setDocument({
      raw: '',
      parsed: null,
      isValid: false,
      error: null,
    });
    setFilename('');
  };

  // Calculate document statistics
  const getDocumentStats = () => {
    if (!document.parsed) return null;
    
    const countNodes = (obj: any): number => {
      if (obj === null || typeof obj !== 'object') return 1;
      if (Array.isArray(obj)) {
        return 1 + obj.reduce((sum: number, item) => sum + countNodes(item), 0);
      }
      return 1 + Object.values(obj).reduce((sum: number, val) => sum + countNodes(val), 0);
    };

    const countProperties = (obj: any): number => {
      if (obj === null || typeof obj !== 'object') return 0;
      if (Array.isArray(obj)) {
        return obj.reduce((sum: number, item) => sum + countProperties(item), 0);
      }
      return Object.keys(obj).length + Object.values(obj).reduce((sum: number, val) => sum + countProperties(val), 0);
    };

    const countArrays = (obj: any): number => {
      if (obj === null || typeof obj !== 'object') return 0;
      if (Array.isArray(obj)) {
        return 1 + obj.reduce((sum: number, item) => sum + countArrays(item), 0);
      }
      return Object.values(obj).reduce((sum: number, val) => sum + countArrays(val), 0);
    };

    const countObjects = (obj: any): number => {
      if (obj === null || typeof obj !== 'object') return 0;
      if (Array.isArray(obj)) {
        return obj.reduce((sum: number, item) => sum + countObjects(item), 0);
      }
      return 1 + Object.values(obj).reduce((sum: number, val) => sum + countObjects(val), 0);
    };

    const type = Array.isArray(document.parsed) ? 'Array' : 'Object';
    const itemCount = Array.isArray(document.parsed) ? document.parsed.length : Object.keys(document.parsed as JsonObject).length;
    
    return {
      type,
      itemCount,
      totalNodes: countNodes(document.parsed),
      totalProperties: countProperties(document.parsed),
      totalArrays: countArrays(document.parsed),
      totalObjects: countObjects(document.parsed),
      size: new Blob([document.raw]).size
    };
  };

  const stats = getDocumentStats();

  return (
    <div className="app">
      <header className="app-header">
        <div className="header-content">
          <div className="header-title">
            <img src={theme === 'light' ? logo_light : logo_dark} alt="JSONLab" className="app-logo" />
          </div>
          {document.parsed && stats && (
            <>
              <div className="header-stats">
                <div className="stat-compact header-filename-stat">
                  <span className="material-symbols-outlined file-icon">description</span>
                  <span className="file-name">{filename}</span>
                </div>
                <div className="stat-divider-compact"></div>
                <div className="stat-compact">
                  <span className="stat-label-compact">Type:</span>
                  <span className="stat-value-compact">{stats.type}</span>
                </div>
                <div className="stat-divider-compact"></div>
                <div className="stat-compact">
                  <span className="stat-label-compact">{stats.type === 'Array' ? 'Items:' : 'Props:'}</span>
                  <span className="stat-value-compact">{stats.itemCount}</span>
                </div>
                <div className="stat-divider-compact"></div>
                <div className="stat-compact">
                  <span className="stat-label-compact">Nodes:</span>
                  <span className="stat-value-compact">{stats.totalNodes}</span>
                </div>
                <div className="stat-divider-compact"></div>
                <div className="stat-compact">
                  <span className="stat-label-compact">Size:</span>
                  <span className="stat-value-compact">{(stats.size / 1024).toFixed(1)} KB</span>
                </div>
              </div>
              <div className="header-actions">
                <button onClick={toggleTheme} className="btn-header btn-theme" title={`Switch to ${theme === 'light' ? 'dark' : 'light'} mode`}>
                  <span className="material-symbols-outlined">{theme === 'light' ? 'dark_mode' : 'light_mode'}</span>
                </button>
                <button onClick={handleDownload} className="btn-header btn-download">
                  <span className="material-symbols-outlined">download</span>
                  Download
                </button>
                <button onClick={handleReset} className="btn-header btn-reset">
                  <span className="material-symbols-outlined">upload_file</span>
                  New File
                </button>
              </div>
            </>
          )}
          {!document.parsed && (
            <div className="header-actions">
              <button onClick={toggleTheme} className="btn-header btn-theme" title={`Switch to ${theme === 'light' ? 'dark' : 'light'} mode`}>
                <span className="material-symbols-outlined">{theme === 'light' ? 'dark_mode' : 'light_mode'}</span>
              </button>
            </div>
          )}
        </div>
      </header>

      <main className="app-main">
        {!document.parsed ? (
          <div className="upload-section">
            <FileUploader onFileLoad={handleFileLoad} />
            {document.error && (
              <div className="error-banner">
                <strong>Error:</strong> {document.error}
              </div>
            )}
          </div>
        ) : (
          <div className="document-section">
            <div className="query-section">
              <QueryTool 
                data={document.parsed} 
                onResultClick={setHighlightPath}
              />
            </div>

            <ResizablePanels
              leftPanel={
                <div className="viewer-panel">
                  <DocumentViewer 
                    data={document.parsed} 
                    onUpdate={handleDocumentUpdate}
                    highlightPath={highlightPath}
                    versionHistory={versionHistory}
                    currentVersionIndex={currentVersionIndex}
                    onUndo={handleUndo}
                    onRedo={handleRedo}
                  />
                </div>
              }
              rightPanel={
                <div className="data-panel">
                  {document.parsed && (
                    <DataEditor
                      data={document.parsed}
                      onUpdate={handleDocumentUpdate}
                      onHighlight={setHighlightPath}
                      highlightedPath={highlightPath}
                      currentPath=""
                    />
                  )}
                </div>
              }
            />
          </div>
        )}
      </main>

      {/* Restore Session Prompt */}
      {showRestorePrompt && (
        <div className="restore-overlay" onClick={handleCloseRestore}>
          <div className="restore-dialog" onClick={(e) => e.stopPropagation()}>
            <div className="restore-icon">
              <span className="material-symbols-outlined">history</span>
            </div>
            <h3 className="restore-title">Continue where you left off?</h3>
            <p className="restore-message">
              We found your previous work session{savedSession?.filename ? ` (${savedSession.filename})` : ''}.
              Would you like to restore it?
            </p>
            <div className="restore-details">
              <div className="restore-detail-item">
                <span className="material-symbols-outlined">schedule</span>
                <span>Last saved: {savedSession?.timestamp ? new Date(savedSession.timestamp).toLocaleString() : 'Unknown'}</span>
              </div>
              {savedSession?.versionHistory?.length > 0 && (
                <div className="restore-detail-item">
                  <span className="material-symbols-outlined">layers</span>
                  <span>{savedSession.versionHistory.length} version{savedSession.versionHistory.length !== 1 ? 's' : ''} in history</span>
                </div>
              )}
            </div>
            <div className="restore-actions">
              <button className="btn-restore-dismiss" onClick={handleDismissRestore}>
                Start Fresh
              </button>
              <button className="btn-restore-load" onClick={handleRestoreSession}>
                <span className="material-symbols-outlined">restore</span>
                Restore Session
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default App;
