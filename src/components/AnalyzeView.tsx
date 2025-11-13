import React from 'react';
import { useTheme } from '../contexts/ThemeContext';
import './AnalyzeView.css';

interface AnalyzeViewProps {
  jsonContent: string;
  onClose: () => void;
}

type IssueSeverity = 'error' | 'warning' | 'info';

interface Issue {
  type: string;
  severity: IssueSeverity;
  path: string;
  message: string;
  details?: string;
}

interface AnalysisResult {
  issues: Issue[];
  stats: {
    totalKeys: number;
    maxDepth: number;
    totalArrays: number;
    totalObjects: number;
    largestArray: number;
    largestString: number;
  };
}

export const AnalyzeView: React.FC<AnalyzeViewProps> = ({ 
  jsonContent, 
  onClose 
}) => {
  useTheme(); // For theme context
  const [analysis, setAnalysis] = React.useState<AnalysisResult | null>(null);
  const [isAnalyzing, setIsAnalyzing] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  React.useEffect(() => {
    analyzeJson();
  }, [jsonContent]);

  const analyzeJson = () => {
    setIsAnalyzing(true);
    setError(null);
    
    try {
      const parsed = JSON.parse(jsonContent);
      const issues: Issue[] = [];
      const keyFrequency = new Map<string, number>();
      let totalKeys = 0;
      let maxDepth = 0;
      let totalArrays = 0;
      let totalObjects = 0;
      let largestArray = 0;
      let largestString = 0;

      const traverse = (obj: any, path: string = '$', depth: number = 0) => {
        maxDepth = Math.max(maxDepth, depth);

        // Check depth
        if (depth > 10) {
          issues.push({
            type: 'Deep Nesting',
            severity: 'warning',
            path,
            message: `Deeply nested structure (depth: ${depth})`,
            details: 'Consider flattening the data structure for better performance'
          });
        }

        if (Array.isArray(obj)) {
          totalArrays++;
          largestArray = Math.max(largestArray, obj.length);

          // Check for large arrays
          if (obj.length > 1000) {
            issues.push({
              type: 'Large Array',
              severity: 'warning',
              path,
              message: `Large array with ${obj.length} items`,
              details: 'Consider pagination or chunking for better performance'
            });
          }

          // Check for empty arrays
          if (obj.length === 0) {
            issues.push({
              type: 'Empty Structure',
              severity: 'info',
              path,
              message: 'Empty array',
              details: 'This array contains no items'
            });
          }

          // Check for duplicate IDs in array of objects
          if (obj.length > 0 && typeof obj[0] === 'object' && obj[0] !== null) {
            const idFields = ['id', '_id', 'ID', 'uuid', 'key'];
            
            for (const idField of idFields) {
              if (idField in obj[0]) {
                const ids = new Set();
                const duplicates: any[] = [];
                
                obj.forEach((item: any, idx: number) => {
                  const id = item[idField];
                  if (id !== null && id !== undefined) {
                    if (ids.has(id)) {
                      duplicates.push({ id, index: idx });
                    }
                    ids.add(id);
                  }
                });

                if (duplicates.length > 0) {
                  issues.push({
                    type: 'Duplicate IDs',
                    severity: 'error',
                    path: `${path}[*].${idField}`,
                    message: `Found ${duplicates.length} duplicate ${idField} value(s)`,
                    details: `Duplicates: ${duplicates.map(d => `${d.id} (index ${d.index})`).slice(0, 3).join(', ')}${duplicates.length > 3 ? '...' : ''}`
                  });
                }
                break; // Only check first ID field found
              }
            }

            // Check for inconsistent structure
            const firstKeys = Object.keys(obj[0]).sort().join(',');
            obj.forEach((item: any, idx: number) => {
              if (typeof item === 'object' && item !== null) {
                const itemKeys = Object.keys(item).sort().join(',');
                if (itemKeys !== firstKeys) {
                  issues.push({
                    type: 'Inconsistent Structure',
                    severity: 'warning',
                    path: `${path}[${idx}]`,
                    message: 'Object has different keys than first item',
                    details: `Expected: ${firstKeys.split(',').slice(0, 5).join(', ')}...`
                  });
                }
              }
            });
          }

          obj.forEach((item, idx) => {
            traverse(item, `${path}[${idx}]`, depth + 1);
          });
        } else if (typeof obj === 'object' && obj !== null) {
          totalObjects++;
          const keys = Object.keys(obj);

          // Check for empty objects
          if (keys.length === 0) {
            issues.push({
              type: 'Empty Structure',
              severity: 'info',
              path,
              message: 'Empty object',
              details: 'This object has no properties'
            });
          }

          totalKeys += keys.length;

          keys.forEach(key => {
            // Track key frequency
            keyFrequency.set(key, (keyFrequency.get(key) || 0) + 1);

            const value = obj[key];
            const childPath = `${path}.${key}`;

            // Check for null/undefined values
            if (value === null) {
              issues.push({
                type: 'Null Value',
                severity: 'info',
                path: childPath,
                message: 'Property has null value',
                details: 'Consider removing or providing a default value'
              });
            }

            // Check for large strings
            if (typeof value === 'string') {
              largestString = Math.max(largestString, value.length);
              if (value.length > 10000) {
                issues.push({
                  type: 'Large String',
                  severity: 'warning',
                  path: childPath,
                  message: `Large string value (${value.length} characters)`,
                  details: 'Consider storing large text in separate files or databases'
                });
              }
            }

            traverse(value, childPath, depth + 1);
          });
        }
      };

      traverse(parsed);

      // Check for duplicate keys across the document
      keyFrequency.forEach((count, key) => {
        if (count > 50) {
          issues.push({
            type: 'Repeated Key',
            severity: 'info',
            path: `*`,
            message: `Key "${key}" appears ${count} times`,
            details: 'High repetition might indicate denormalized data'
          });
        }
      });

      setAnalysis({
        issues: issues.sort((a, b) => {
          const severityOrder = { error: 0, warning: 1, info: 2 };
          return severityOrder[a.severity] - severityOrder[b.severity];
        }),
        stats: {
          totalKeys,
          maxDepth,
          totalArrays,
          totalObjects,
          largestArray,
          largestString
        }
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Analysis failed');
    } finally {
      setIsAnalyzing(false);
    }
  };

  const getSeverityColor = (severity: IssueSeverity): string => {
    switch (severity) {
      case 'error': return 'var(--danger-color)';
      case 'warning': return '#f59e0b';
      case 'info': return 'var(--primary-color)';
    }
  };

  const getSeverityIcon = (severity: IssueSeverity): string => {
    switch (severity) {
      case 'error': return 'error';
      case 'warning': return 'warning';
      case 'info': return 'info';
    }
  };

  const groupedIssues = React.useMemo(() => {
    if (!analysis) return {};
    
    return analysis.issues.reduce((acc, issue) => {
      if (!acc[issue.type]) {
        acc[issue.type] = [];
      }
      acc[issue.type].push(issue);
      return acc;
    }, {} as Record<string, Issue[]>);
  }, [analysis]);

  return (
    <div className="chart-modal-overlay" onClick={onClose}>
      <div className="analyze-modal-content" onClick={(e) => e.stopPropagation()}>
        <div className="chart-modal-header">
          <h2>JSON Analysis & Anomaly Detection</h2>
          <button 
            className="btn-close-modal" 
            onClick={onClose}
            aria-label="Close"
          >
            <span className="material-symbols-outlined">close</span>
          </button>
        </div>

        {error && (
          <div className="analyze-error">
            <span className="material-symbols-outlined">error</span>
            <span>{error}</span>
          </div>
        )}

        {isAnalyzing && (
          <div className="analyzing-indicator">
            <span className="material-symbols-outlined spin">progress_activity</span>
            <span>Analyzing...</span>
          </div>
        )}

        {analysis && (
          <div className="analyze-content">
            {/* Statistics Summary */}
            <div className="stats-summary">
              <h3>Document Statistics</h3>
              <div className="stats-grid">
                <div className="stat-card">
                  <span className="stat-label">Total Keys</span>
                  <span className="stat-value">{analysis.stats.totalKeys}</span>
                </div>
                <div className="stat-card">
                  <span className="stat-label">Max Depth</span>
                  <span className="stat-value">{analysis.stats.maxDepth}</span>
                </div>
                <div className="stat-card">
                  <span className="stat-label">Arrays</span>
                  <span className="stat-value">{analysis.stats.totalArrays}</span>
                </div>
                <div className="stat-card">
                  <span className="stat-label">Objects</span>
                  <span className="stat-value">{analysis.stats.totalObjects}</span>
                </div>
                <div className="stat-card">
                  <span className="stat-label">Largest Array</span>
                  <span className="stat-value">{analysis.stats.largestArray}</span>
                </div>
                <div className="stat-card">
                  <span className="stat-label">Longest String</span>
                  <span className="stat-value">{analysis.stats.largestString}</span>
                </div>
              </div>
            </div>

            {/* Issues */}
            <div className="issues-section">
              <h3>
                Issues Found ({analysis.issues.length})
                {analysis.issues.length === 0 && ' ✓'}
              </h3>
              
              {analysis.issues.length === 0 ? (
                <div className="no-issues">
                  <span className="material-symbols-outlined">check_circle</span>
                  <p>No issues detected! Your JSON structure looks good.</p>
                </div>
              ) : (
                <div className="issues-list">
                  {Object.entries(groupedIssues).map(([type, issues]) => (
                    <div key={type} className="issue-group">
                      <div className="issue-group-header">
                        <span className="issue-type-badge">{type}</span>
                        <span className="issue-count">{issues.length}</span>
                      </div>
                      {issues.map((issue, idx) => (
                        <div key={idx} className="issue-card">
                          <div className="issue-header">
                            <span 
                              className="material-symbols-outlined issue-icon"
                              style={{ color: getSeverityColor(issue.severity) }}
                            >
                              {getSeverityIcon(issue.severity)}
                            </span>
                            <div className="issue-info">
                              <div className="issue-message">{issue.message}</div>
                              <div className="issue-path">{issue.path}</div>
                            </div>
                          </div>
                          {issue.details && (
                            <div className="issue-details">{issue.details}</div>
                          )}
                        </div>
                      ))}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
