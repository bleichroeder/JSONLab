import React, { useState, useMemo } from 'react';
import { Editor } from '@monaco-editor/react';
import { useTheme } from '../contexts/ThemeContext';
import './MergeView.css';

interface MergeViewProps {
  baseDocument: any;
  onMerge: (mergedData: any) => void;
  onClose: () => void;
}

type MergeStrategy = 'overwrite' | 'keep-base' | 'merge-deep' | 'array-concat' | 'array-unique';
type ConflictResolution = 'base' | 'incoming' | 'manual';

interface Conflict {
  path: string;
  baseValue: any;
  incomingValue: any;
  resolution?: ConflictResolution;
  manualValue?: any;
}

export const MergeView: React.FC<MergeViewProps> = ({ baseDocument, onMerge, onClose }) => {
  const { theme } = useTheme();
  const [incomingJson, setIncomingJson] = useState('');
  const [incomingDocument, setIncomingDocument] = useState<any>(null);
  const [mergeStrategy, setMergeStrategy] = useState<MergeStrategy>('merge-deep');
  const [conflicts, setConflicts] = useState<Conflict[]>([]);
  const [showConflicts, setShowConflicts] = useState(false);

  // Parse incoming JSON
  const handleIncomingChange = (value: string | undefined) => {
    if (!value) {
      setIncomingJson('');
      setIncomingDocument(null);
      return;
    }
    
    setIncomingJson(value);
    try {
      const parsed = JSON.parse(value);
      setIncomingDocument(parsed);
      detectConflicts(baseDocument, parsed);
    } catch (e) {
      setIncomingDocument(null);
      setConflicts([]);
    }
  };

  // Detect conflicts between base and incoming
  const detectConflicts = (base: any, incoming: any, path: string = '$') => {
    const foundConflicts: Conflict[] = [];

    const traverse = (baseObj: any, incomingObj: any, currentPath: string) => {
      if (baseObj === null || incomingObj === null) return;
      if (typeof baseObj !== 'object' || typeof incomingObj !== 'object') return;

      const baseKeys = Object.keys(baseObj);
      const incomingKeys = Object.keys(incomingObj);
      const allKeys = new Set([...baseKeys, ...incomingKeys]);

      allKeys.forEach(key => {
        const newPath = currentPath === '$' ? `$.${key}` : `${currentPath}.${key}`;
        const hasBase = key in baseObj;
        const hasIncoming = key in incomingObj;

        if (hasBase && hasIncoming) {
          const baseValue = baseObj[key];
          const incomingValue = incomingObj[key];

          // Check if values are different
          if (JSON.stringify(baseValue) !== JSON.stringify(incomingValue)) {
            const baseIsObject = typeof baseValue === 'object' && baseValue !== null && !Array.isArray(baseValue);
            const incomingIsObject = typeof incomingValue === 'object' && incomingValue !== null && !Array.isArray(incomingValue);

            if (baseIsObject && incomingIsObject) {
              // Recurse into nested objects
              traverse(baseValue, incomingValue, newPath);
            } else {
              // Found a conflict
              foundConflicts.push({
                path: newPath,
                baseValue,
                incomingValue,
                resolution: 'base'
              });
            }
          }
        }
      });
    };

    if (Array.isArray(base) && Array.isArray(incoming)) {
      // Arrays at root level
      if (JSON.stringify(base) !== JSON.stringify(incoming)) {
        foundConflicts.push({
          path,
          baseValue: base,
          incomingValue: incoming,
          resolution: 'base'
        });
      }
    } else if (typeof base === 'object' && typeof incoming === 'object') {
      traverse(base, incoming, path);
    }

    setConflicts(foundConflicts);
    if (foundConflicts.length > 0) {
      setShowConflicts(true);
    }
  };

  // Deep merge implementation
  const deepMerge = (target: any, source: any): any => {
    if (Array.isArray(target) && Array.isArray(source)) {
      switch (mergeStrategy) {
        case 'array-concat':
          return [...target, ...source];
        case 'array-unique':
          const combined = [...target, ...source];
          return Array.from(new Set(combined.map((item: any) => JSON.stringify(item)))).map((item: string) => JSON.parse(item));
        case 'overwrite':
          return source;
        case 'keep-base':
          return target;
        default:
          return source; // Default for arrays
      }
    }

    if (typeof target === 'object' && target !== null && typeof source === 'object' && source !== null) {
      const result = { ...target };

      Object.keys(source).forEach(key => {
        if (key in result) {
          if (mergeStrategy === 'overwrite') {
            result[key] = source[key];
          } else if (mergeStrategy === 'keep-base') {
            // Keep base value, do nothing
          } else {
            // merge-deep
            result[key] = deepMerge(result[key], source[key]);
          }
        } else {
          result[key] = source[key];
        }
      });

      return result;
    }

    // Primitive values
    return mergeStrategy === 'keep-base' ? target : source;
  };

  // Apply manual conflict resolutions
  const applyConflictResolutions = (merged: any): any => {
    const result = JSON.parse(JSON.stringify(merged));

    conflicts.forEach(conflict => {
      if (conflict.resolution === 'manual' && conflict.manualValue !== undefined) {
        setValueAtPath(result, conflict.path, conflict.manualValue);
      } else if (conflict.resolution === 'incoming') {
        setValueAtPath(result, conflict.path, conflict.incomingValue);
      } else if (conflict.resolution === 'base') {
        setValueAtPath(result, conflict.path, conflict.baseValue);
      }
    });

    return result;
  };

  // Set value at path
  const setValueAtPath = (obj: any, path: string, value: any) => {
    const parts = path.replace(/^\$\./, '').split('.');
    let current = obj;

    for (let i = 0; i < parts.length - 1; i++) {
      if (!(parts[i] in current)) {
        current[parts[i]] = {};
      }
      current = current[parts[i]];
    }

    current[parts[parts.length - 1]] = value;
  };

  // Generate merged preview
  const mergedPreview = useMemo(() => {
    if (!incomingDocument) return JSON.stringify(baseDocument, null, 2);

    try {
      let merged = deepMerge(baseDocument, incomingDocument);
      
      if (conflicts.length > 0) {
        merged = applyConflictResolutions(merged);
      }

      return JSON.stringify(merged, null, 2);
    } catch (e) {
      return 'Error generating merge preview';
    }
  }, [baseDocument, incomingDocument, mergeStrategy, conflicts]);

  // Handle merge execution
  const handleMerge = () => {
    try {
      const merged = JSON.parse(mergedPreview);
      onMerge(merged);
      onClose();
    } catch (e) {
      alert('Failed to merge documents. Please check for errors.');
    }
  };

  // Update conflict resolution
  const updateConflictResolution = (index: number, resolution: ConflictResolution, manualValue?: any) => {
    const updated = [...conflicts];
    updated[index] = { ...updated[index], resolution, manualValue };
    setConflicts(updated);
  };

  return (
    <div className="merge-overlay" onClick={onClose}>
      <div className="merge-dialog" onClick={(e) => e.stopPropagation()}>
        <div className="merge-header">
          <h2>Merge JSON Documents</h2>
          <button onClick={onClose} className="btn-close-merge">
            <span className="material-symbols-outlined">close</span>
          </button>
        </div>

        <div className="merge-content">
          {/* Strategy Selection */}
          <div className="merge-strategy-section">
            <h3>Merge Strategy</h3>
            <div className="strategy-options">
              <label className={`strategy-option ${mergeStrategy === 'merge-deep' ? 'active' : ''}`}>
                <input
                  type="radio"
                  name="strategy"
                  value="merge-deep"
                  checked={mergeStrategy === 'merge-deep'}
                  onChange={(e) => setMergeStrategy(e.target.value as MergeStrategy)}
                />
                <div className="strategy-info">
                  <strong>Deep Merge</strong>
                  <small>Recursively merge nested objects, overwrite primitives</small>
                </div>
              </label>

              <label className={`strategy-option ${mergeStrategy === 'overwrite' ? 'active' : ''}`}>
                <input
                  type="radio"
                  name="strategy"
                  value="overwrite"
                  checked={mergeStrategy === 'overwrite'}
                  onChange={(e) => setMergeStrategy(e.target.value as MergeStrategy)}
                />
                <div className="strategy-info">
                  <strong>Overwrite</strong>
                  <small>Incoming values always replace base values</small>
                </div>
              </label>

              <label className={`strategy-option ${mergeStrategy === 'keep-base' ? 'active' : ''}`}>
                <input
                  type="radio"
                  name="strategy"
                  value="keep-base"
                  checked={mergeStrategy === 'keep-base'}
                  onChange={(e) => setMergeStrategy(e.target.value as MergeStrategy)}
                />
                <div className="strategy-info">
                  <strong>Keep Base</strong>
                  <small>Only add new properties, keep existing values</small>
                </div>
              </label>

              <label className={`strategy-option ${mergeStrategy === 'array-concat' ? 'active' : ''}`}>
                <input
                  type="radio"
                  name="strategy"
                  value="array-concat"
                  checked={mergeStrategy === 'array-concat'}
                  onChange={(e) => setMergeStrategy(e.target.value as MergeStrategy)}
                />
                <div className="strategy-info">
                  <strong>Concatenate Arrays</strong>
                  <small>Combine arrays instead of replacing</small>
                </div>
              </label>

              <label className={`strategy-option ${mergeStrategy === 'array-unique' ? 'active' : ''}`}>
                <input
                  type="radio"
                  name="strategy"
                  value="array-unique"
                  checked={mergeStrategy === 'array-unique'}
                  onChange={(e) => setMergeStrategy(e.target.value as MergeStrategy)}
                />
                <div className="strategy-info">
                  <strong>Unique Arrays</strong>
                  <small>Combine and deduplicate arrays</small>
                </div>
              </label>
            </div>
          </div>

          {/* Editors */}
          <div className="merge-editors">
            <div className="editor-panel">
              <div className="editor-header">
                <h3>Base Document</h3>
                <span className="editor-label">Current</span>
              </div>
              <Editor
                height="300px"
                language="json"
                value={JSON.stringify(baseDocument, null, 2)}
                theme={theme === 'dark' ? 'vs-dark' : 'vs-light'}
                options={{
                  readOnly: true,
                  minimap: { enabled: false },
                  lineNumbers: 'on',
                  scrollBeyondLastLine: false,
                }}
              />
            </div>

            <div className="merge-arrow">
              <span className="material-symbols-outlined">merge</span>
            </div>

            <div className="editor-panel">
              <div className="editor-header">
                <h3>Incoming Document</h3>
                <span className="editor-label">Paste or type JSON</span>
              </div>
              <Editor
                height="300px"
                language="json"
                value={incomingJson}
                onChange={handleIncomingChange}
                theme={theme === 'dark' ? 'vs-dark' : 'vs-light'}
                options={{
                  minimap: { enabled: false },
                  lineNumbers: 'on',
                  scrollBeyondLastLine: false,
                }}
              />
            </div>
          </div>

          {/* Conflicts */}
          {conflicts.length > 0 && (
            <div className="conflicts-section">
              <div className="conflicts-header" onClick={() => setShowConflicts(!showConflicts)}>
                <h3>
                  <span className="material-symbols-outlined">warning</span>
                  Conflicts Detected ({conflicts.length})
                </h3>
                <button className="btn-toggle-conflicts">
                  <span className="material-symbols-outlined">
                    {showConflicts ? 'expand_less' : 'expand_more'}
                  </span>
                </button>
              </div>

              {showConflicts && (
                <div className="conflicts-list">
                  {conflicts.map((conflict, index) => (
                    <div key={index} className="conflict-item">
                      <div className="conflict-path">
                        <code>{conflict.path}</code>
                      </div>
                      <div className="conflict-values">
                        <div className="conflict-value">
                          <label>
                            <input
                              type="radio"
                              name={`conflict-${index}`}
                              checked={conflict.resolution === 'base'}
                              onChange={() => updateConflictResolution(index, 'base')}
                            />
                            <strong>Base:</strong>
                          </label>
                          <code>{JSON.stringify(conflict.baseValue)}</code>
                        </div>
                        <div className="conflict-value">
                          <label>
                            <input
                              type="radio"
                              name={`conflict-${index}`}
                              checked={conflict.resolution === 'incoming'}
                              onChange={() => updateConflictResolution(index, 'incoming')}
                            />
                            <strong>Incoming:</strong>
                          </label>
                          <code>{JSON.stringify(conflict.incomingValue)}</code>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Preview */}
          <div className="merge-preview-section">
            <div className="preview-header">
              <h3>Merged Result Preview</h3>
              {incomingDocument && (
                <span className="preview-status">
                  <span className="material-symbols-outlined">check_circle</span>
                  Ready to merge
                </span>
              )}
            </div>
            <Editor
              height="300px"
              language="json"
              value={mergedPreview}
              theme={theme === 'dark' ? 'vs-dark' : 'vs-light'}
              options={{
                readOnly: true,
                minimap: { enabled: false },
                lineNumbers: 'on',
                scrollBeyondLastLine: false,
              }}
            />
          </div>

          {/* Actions */}
          <div className="merge-actions">
            <button className="btn-secondary" onClick={onClose}>
              Cancel
            </button>
            <button
              className="btn-primary"
              onClick={handleMerge}
              disabled={!incomingDocument}
            >
              <span className="material-symbols-outlined">merge</span>
              Apply Merge
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
