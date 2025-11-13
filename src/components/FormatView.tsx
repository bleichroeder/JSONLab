import React, { useState, useMemo } from 'react';
import { Editor } from '@monaco-editor/react';
import { useTheme } from '../contexts/ThemeContext';
import './FormatView.css';

interface FormatViewProps {
  jsonContent: string;
  onApply: (formattedJson: string) => void;
  onClose: () => void;
}

type CaseType = 'camelCase' | 'PascalCase' | 'snake_case' | 'kebab-case' | 'UPPER_CASE' | 'none';
type FormatType = 'minify' | 'pretty' | 'compact';
type SpacingType = '2-space' | '4-space' | 'tab';
type SortOrder = 'asc' | 'desc';

interface ArrayPath {
  path: string;
  displayPath: string;
  arrayLength: number;
  sampleItem: any;
}

const FormatView: React.FC<FormatViewProps> = ({ jsonContent, onApply, onClose }) => {
  const { theme } = useTheme();
  const [activeTab, setActiveTab] = useState<'casing' | 'rename' | 'format' | 'spacing' | 'sort'>('casing');
  
  // Casing options
  const [selectedCase, setSelectedCase] = useState<CaseType>('none');
  
  // Rename options
  const [findPattern, setFindPattern] = useState('');
  const [replacePattern, setReplacePattern] = useState('');
  const [useRegex, setUseRegex] = useState(false);
  const [prefix, setPrefix] = useState('');
  const [suffix, setSuffix] = useState('');
  
  // Format options
  const [formatType, setFormatType] = useState<FormatType>('pretty');
  
  // Spacing options
  const [spacingType, setSpacingType] = useState<SpacingType>('2-space');
  
  // Sort options
  const [selectedArrayPath, setSelectedArrayPath] = useState<string>('');
  const [sortProperty, setSortProperty] = useState<string>('');
  const [sortOrder, setSortOrder] = useState<SortOrder>('asc');
  const [availableArrays, setAvailableArrays] = useState<ArrayPath[]>([]);
  const [availableProperties, setAvailableProperties] = useState<string[]>([]);

  // Find all arrays in the JSON structure
  React.useEffect(() => {
    try {
      const data = JSON.parse(jsonContent);
      const arrays: ArrayPath[] = [];
      
      const findArrays = (obj: any, path: string = '', displayPath: string = 'root') => {
        if (Array.isArray(obj)) {
          if (obj.length > 0) {
            arrays.push({
              path,
              displayPath: displayPath || 'root',
              arrayLength: obj.length,
              sampleItem: obj[0]
            });
          }
          // Check items in array
          obj.forEach((item, index) => {
            if (typeof item === 'object' && item !== null) {
              findArrays(item, `${path}[${index}]`, `${displayPath}[${index}]`);
            }
          });
        } else if (obj !== null && typeof obj === 'object') {
          Object.keys(obj).forEach(key => {
            const newPath = path ? `${path}.${key}` : key;
            const newDisplayPath = displayPath === 'root' ? key : `${displayPath}.${key}`;
            findArrays(obj[key], newPath, newDisplayPath);
          });
        }
      };
      
      if (Array.isArray(data)) {
        arrays.push({
          path: '',
          displayPath: 'root',
          arrayLength: data.length,
          sampleItem: data[0]
        });
        findArrays(data, '', 'root');
      } else {
        findArrays(data);
      }
      
      setAvailableArrays(arrays);
      if (arrays.length > 0 && !selectedArrayPath) {
        setSelectedArrayPath(arrays[0].path);
      }
    } catch (e) {
      setAvailableArrays([]);
    }
  }, [jsonContent]);

  // Update available properties when array selection changes
  React.useEffect(() => {
    const selectedArray = availableArrays.find(arr => arr.path === selectedArrayPath);
    if (selectedArray && selectedArray.sampleItem) {
      const sample = selectedArray.sampleItem;
      if (typeof sample === 'object' && sample !== null && !Array.isArray(sample)) {
        const props = Object.keys(sample);
        setAvailableProperties(props);
        if (props.length > 0 && !sortProperty) {
          setSortProperty(props[0]);
        }
      } else {
        // Primitive array
        setAvailableProperties([]);
        setSortProperty('');
      }
    } else {
      setAvailableProperties([]);
      setSortProperty('');
    }
  }, [selectedArrayPath, availableArrays]);

  // Case transformation functions
  const toCamelCase = (str: string): string => {
    return str.replace(/[-_\s](.)/g, (_, char) => char.toUpperCase())
              .replace(/^(.)/, (_, char) => char.toLowerCase());
  };

  const toPascalCase = (str: string): string => {
    return str.replace(/[-_\s](.)/g, (_, char) => char.toUpperCase())
              .replace(/^(.)/, (_, char) => char.toUpperCase());
  };

  const toSnakeCase = (str: string): string => {
    return str.replace(/([A-Z])/g, '_$1')
              .replace(/[-\s]/g, '_')
              .replace(/^_/, '')
              .toLowerCase();
  };

  const toKebabCase = (str: string): string => {
    return str.replace(/([A-Z])/g, '-$1')
              .replace(/[_\s]/g, '-')
              .replace(/^-/, '')
              .toLowerCase();
  };

  const toUpperCase = (str: string): string => {
    return toSnakeCase(str).toUpperCase();
  };

  const transformCase = (key: string, caseType: CaseType): string => {
    if (caseType === 'none') return key;
    
    switch (caseType) {
      case 'camelCase':
        return toCamelCase(key);
      case 'PascalCase':
        return toPascalCase(key);
      case 'snake_case':
        return toSnakeCase(key);
      case 'kebab-case':
        return toKebabCase(key);
      case 'UPPER_CASE':
        return toUpperCase(key);
      default:
        return key;
    }
  };

  // Recursive key transformation
  const transformKeys = (obj: any, transformer: (key: string) => string): any => {
    if (Array.isArray(obj)) {
      return obj.map(item => transformKeys(item, transformer));
    } else if (obj !== null && typeof obj === 'object') {
      return Object.keys(obj).reduce((acc, key) => {
        const newKey = transformer(key);
        acc[newKey] = transformKeys(obj[key], transformer);
        return acc;
      }, {} as any);
    }
    return obj;
  };

  // Apply casing transformation
  const applyCasing = (data: any): string => {
    if (selectedCase === 'none') return jsonContent;
    
    const transformed = transformKeys(data, (key) => transformCase(key, selectedCase));
    return JSON.stringify(transformed, null, 2);
  };

  // Apply bulk rename
  const applyRename = (data: any): string => {
    const transformer = (key: string): string => {
      let newKey = key;
      
      // Apply find/replace
      if (findPattern) {
        if (useRegex) {
          try {
            const regex = new RegExp(findPattern, 'g');
            newKey = newKey.replace(regex, replacePattern);
          } catch (e) {
            // Invalid regex, skip
          }
        } else {
          newKey = newKey.split(findPattern).join(replacePattern);
        }
      }
      
      // Apply prefix/suffix
      if (prefix) newKey = prefix + newKey;
      if (suffix) newKey = newKey + suffix;
      
      return newKey;
    };
    
    const transformed = transformKeys(data, transformer);
    return JSON.stringify(transformed, null, 2);
  };

  // Apply formatting
  const applyFormatting = (data: any): string => {
    switch (formatType) {
      case 'minify':
        return JSON.stringify(data);
      case 'compact':
        return JSON.stringify(data, null, 0);
      case 'pretty':
        return JSON.stringify(data, null, 2);
      default:
        return JSON.stringify(data, null, 2);
    }
  };

  // Apply spacing
  const applySpacing = (data: any): string => {
    let indent: string | number = 2;
    
    switch (spacingType) {
      case '2-space':
        indent = 2;
        break;
      case '4-space':
        indent = 4;
        break;
      case 'tab':
        indent = '\t';
        break;
    }
    
    return JSON.stringify(data, null, indent);
  };

  // Apply sorting
  const applySort = (data: any): string => {
    if (!selectedArrayPath && selectedArrayPath !== '') return JSON.stringify(data, null, 2);
    
    // Deep clone to avoid mutating original
    const clonedData = JSON.parse(JSON.stringify(data));
    
    const sortArray = (arr: any[]): any[] => {
      const sorted = [...arr];
      
      if (sortProperty && sorted.length > 0 && typeof sorted[0] === 'object' && sorted[0] !== null) {
        // Sort by property
        sorted.sort((a, b) => {
          const aVal = a?.[sortProperty];
          const bVal = b?.[sortProperty];
          
          if (aVal === undefined || aVal === null) return 1;
          if (bVal === undefined || bVal === null) return -1;
          
          let comparison = 0;
          if (typeof aVal === 'string' && typeof bVal === 'string') {
            comparison = aVal.localeCompare(bVal);
          } else if (typeof aVal === 'number' && typeof bVal === 'number') {
            comparison = aVal - bVal;
          } else if (typeof aVal === 'boolean' && typeof bVal === 'boolean') {
            comparison = (aVal === bVal) ? 0 : aVal ? 1 : -1;
          } else {
            comparison = String(aVal).localeCompare(String(bVal));
          }
          
          return sortOrder === 'asc' ? comparison : -comparison;
        });
      } else {
        // Sort primitives
        sorted.sort((a, b) => {
          if (a === undefined || a === null) return 1;
          if (b === undefined || b === null) return -1;
          
          let comparison = 0;
          if (typeof a === 'string' && typeof b === 'string') {
            comparison = a.localeCompare(b);
          } else if (typeof a === 'number' && typeof b === 'number') {
            comparison = a - b;
          } else if (typeof a === 'boolean' && typeof b === 'boolean') {
            comparison = (a === b) ? 0 : a ? 1 : -1;
          } else {
            comparison = String(a).localeCompare(String(b));
          }
          
          return sortOrder === 'asc' ? comparison : -comparison;
        });
      }
      
      return sorted;
    };
    
    const sortData = (obj: any, path: string): any => {
      if (path === '') {
        // Root is an array
        if (Array.isArray(obj)) {
          return sortArray(obj);
        }
        return obj;
      }
      
      const parts = path.split('.');
      const traverse = (current: any, index: number): any => {
        if (index >= parts.length) {
          if (Array.isArray(current)) {
            return sortArray(current);
          }
          return current;
        }
        
        const key = parts[index];
        if (Array.isArray(current)) {
          return current.map(item => {
            if (typeof item === 'object' && item !== null && key in item) {
              const newItem = { ...item };
              newItem[key] = traverse(item[key], index + 1);
              return newItem;
            }
            return item;
          });
        } else if (current !== null && typeof current === 'object') {
          if (key in current) {
            const newObj = { ...current };
            newObj[key] = traverse(current[key], index + 1);
            return newObj;
          }
        }
        return current;
      };
      
      return traverse(obj, 0);
    };
    
    const sorted = sortData(clonedData, selectedArrayPath);
    return JSON.stringify(sorted, null, 2);
  };

  // Generate preview
  const preview = useMemo(() => {
    try {
      const data = JSON.parse(jsonContent);
      
      switch (activeTab) {
        case 'casing':
          return applyCasing(data);
        case 'rename':
          return applyRename(data);
        case 'format':
          return applyFormatting(data);
        case 'spacing':
          return applySpacing(data);
        case 'sort':
          return applySort(data);
        default:
          return jsonContent;
      }
    } catch (e) {
      return 'Invalid JSON';
    }
  }, [jsonContent, activeTab, selectedCase, findPattern, replacePattern, useRegex, prefix, suffix, formatType, spacingType, selectedArrayPath, sortProperty, sortOrder, availableArrays]);

  const handleApply = () => {
    onApply(preview);
    onClose();
  };

  return (
    <div className="format-modal-overlay" onClick={onClose}>
      <div className="format-modal-content" onClick={(e) => e.stopPropagation()}>
        <div className="format-modal-header">
          <h2>Format Document</h2>
          <button 
            className="btn-close-modal" 
            onClick={onClose}
            aria-label="Close"
          >
            <span className="material-symbols-outlined">close</span>
          </button>
        </div>

        <div className="format-modal-body">
          <div className="format-sidebar">
            <div className="format-tabs">
              <button 
                className={`format-tab ${activeTab === 'casing' ? 'active' : ''}`}
                onClick={() => setActiveTab('casing')}
              >
                <span className="material-symbols-outlined">text_format</span>
                <span>Property Casing</span>
              </button>
              <button 
                className={`format-tab ${activeTab === 'rename' ? 'active' : ''}`}
                onClick={() => setActiveTab('rename')}
              >
                <span className="material-symbols-outlined">find_replace</span>
                <span>Bulk Rename</span>
              </button>
              <button 
                className={`format-tab ${activeTab === 'format' ? 'active' : ''}`}
                onClick={() => setActiveTab('format')}
              >
                <span className="material-symbols-outlined">code</span>
                <span>Minify / Pretty</span>
              </button>
              <button 
                className={`format-tab ${activeTab === 'spacing' ? 'active' : ''}`}
                onClick={() => setActiveTab('spacing')}
              >
                <span className="material-symbols-outlined">space_bar</span>
                <span>Spacing</span>
              </button>
              <button 
                className={`format-tab ${activeTab === 'sort' ? 'active' : ''}`}
                onClick={() => setActiveTab('sort')}
              >
                <span className="material-symbols-outlined">sort</span>
                <span>Sort Arrays</span>
              </button>
            </div>

            <div className="format-options">
              {/* Casing Options */}
              {activeTab === 'casing' && (
                <div className="option-group">
                  <h3>Convert Property Names</h3>
                  <div className="radio-group">
                    <label className="radio-label">
                      <input 
                        type="radio" 
                        name="casing" 
                        checked={selectedCase === 'camelCase'}
                        onChange={() => setSelectedCase('camelCase')}
                      />
                      <span>camelCase</span>
                      <code className="example">firstName</code>
                    </label>
                    <label className="radio-label">
                      <input 
                        type="radio" 
                        name="casing" 
                        checked={selectedCase === 'PascalCase'}
                        onChange={() => setSelectedCase('PascalCase')}
                      />
                      <span>PascalCase</span>
                      <code className="example">FirstName</code>
                    </label>
                    <label className="radio-label">
                      <input 
                        type="radio" 
                        name="casing" 
                        checked={selectedCase === 'snake_case'}
                        onChange={() => setSelectedCase('snake_case')}
                      />
                      <span>snake_case</span>
                      <code className="example">first_name</code>
                    </label>
                    <label className="radio-label">
                      <input 
                        type="radio" 
                        name="casing" 
                        checked={selectedCase === 'kebab-case'}
                        onChange={() => setSelectedCase('kebab-case')}
                      />
                      <span>kebab-case</span>
                      <code className="example">first-name</code>
                    </label>
                    <label className="radio-label">
                      <input 
                        type="radio" 
                        name="casing" 
                        checked={selectedCase === 'UPPER_CASE'}
                        onChange={() => setSelectedCase('UPPER_CASE')}
                      />
                      <span>UPPER_CASE</span>
                      <code className="example">FIRST_NAME</code>
                    </label>
                  </div>
                </div>
              )}

              {/* Rename Options */}
              {activeTab === 'rename' && (
                <div className="option-group">
                  <h3>Find & Replace</h3>
                  <div className="input-group">
                    <label>Find Pattern</label>
                    <input 
                      type="text" 
                      value={findPattern}
                      onChange={(e) => setFindPattern(e.target.value)}
                      placeholder="e.g., old_"
                    />
                  </div>
                  <div className="input-group">
                    <label>Replace With</label>
                    <input 
                      type="text" 
                      value={replacePattern}
                      onChange={(e) => setReplacePattern(e.target.value)}
                      placeholder="e.g., new_"
                    />
                  </div>
                  <label className="checkbox-label">
                    <input 
                      type="checkbox" 
                      checked={useRegex}
                      onChange={(e) => setUseRegex(e.target.checked)}
                    />
                    <span>Use Regular Expression</span>
                  </label>
                  
                  <h3 style={{ marginTop: '20px' }}>Prefix / Suffix</h3>
                  <div className="input-group">
                    <label>Add Prefix</label>
                    <input 
                      type="text" 
                      value={prefix}
                      onChange={(e) => setPrefix(e.target.value)}
                      placeholder="e.g., api_"
                    />
                  </div>
                  <div className="input-group">
                    <label>Add Suffix</label>
                    <input 
                      type="text" 
                      value={suffix}
                      onChange={(e) => setSuffix(e.target.value)}
                      placeholder="e.g., _v2"
                    />
                  </div>
                </div>
              )}

              {/* Format Options */}
              {activeTab === 'format' && (
                <div className="option-group">
                  <h3>Output Format</h3>
                  <div className="radio-group">
                    <label className="radio-label">
                      <input 
                        type="radio" 
                        name="format" 
                        checked={formatType === 'minify'}
                        onChange={() => setFormatType('minify')}
                      />
                      <span>Minify</span>
                      <small>Remove all whitespace</small>
                    </label>
                    <label className="radio-label">
                      <input 
                        type="radio" 
                        name="format" 
                        checked={formatType === 'compact'}
                        onChange={() => setFormatType('compact')}
                      />
                      <span>Compact</span>
                      <small>Single line per object</small>
                    </label>
                    <label className="radio-label">
                      <input 
                        type="radio" 
                        name="format" 
                        checked={formatType === 'pretty'}
                        onChange={() => setFormatType('pretty')}
                      />
                      <span>Pretty Print</span>
                      <small>Fully formatted with indentation</small>
                    </label>
                  </div>
                </div>
              )}

              {/* Spacing Options */}
              {activeTab === 'spacing' && (
                <div className="option-group">
                  <h3>Indentation Style</h3>
                  <div className="radio-group">
                    <label className="radio-label">
                      <input 
                        type="radio" 
                        name="spacing" 
                        checked={spacingType === '2-space'}
                        onChange={() => setSpacingType('2-space')}
                      />
                      <span>2 Spaces</span>
                    </label>
                    <label className="radio-label">
                      <input 
                        type="radio" 
                        name="spacing" 
                        checked={spacingType === '4-space'}
                        onChange={() => setSpacingType('4-space')}
                      />
                      <span>4 Spaces</span>
                    </label>
                    <label className="radio-label">
                      <input 
                        type="radio" 
                        name="spacing" 
                        checked={spacingType === 'tab'}
                        onChange={() => setSpacingType('tab')}
                      />
                      <span>Tabs</span>
                    </label>
                  </div>
                </div>
              )}

              {/* Sort Options */}
              {activeTab === 'sort' && (
                <div className="option-group">
                  <h3>Select Array to Sort</h3>
                  {availableArrays.length === 0 ? (
                    <p className="no-arrays-message">No arrays found in document</p>
                  ) : (
                    <>
                      <div className="input-group">
                        <label>Array Path</label>
                        <select 
                          value={selectedArrayPath}
                          onChange={(e) => setSelectedArrayPath(e.target.value)}
                          className="array-select"
                        >
                          {availableArrays.map((arr, index) => (
                            <option key={index} value={arr.path}>
                              {arr.displayPath} ({arr.arrayLength} items)
                            </option>
                          ))}
                        </select>
                      </div>
                      
                      {availableProperties.length > 0 && (
                        <div className="input-group">
                          <label>Sort By Property</label>
                          <select 
                            value={sortProperty}
                            onChange={(e) => setSortProperty(e.target.value)}
                            className="property-select"
                          >
                            {availableProperties.map((prop, index) => (
                              <option key={index} value={prop}>
                                {prop}
                              </option>
                            ))}
                          </select>
                        </div>
                      )}
                      
                      {availableProperties.length === 0 && selectedArrayPath !== undefined && (
                        <p className="info-message">
                          <span className="material-symbols-outlined">info</span>
                          This array contains primitive values and will be sorted directly.
                        </p>
                      )}
                      
                      <h3 style={{ marginTop: '20px' }}>Sort Order</h3>
                      <div className="radio-group">
                        <label className="radio-label">
                          <input 
                            type="radio" 
                            name="sortOrder" 
                            checked={sortOrder === 'asc'}
                            onChange={() => setSortOrder('asc')}
                          />
                          <span>Ascending</span>
                          <small>A → Z, 0 → 9</small>
                        </label>
                        <label className="radio-label">
                          <input 
                            type="radio" 
                            name="sortOrder" 
                            checked={sortOrder === 'desc'}
                            onChange={() => setSortOrder('desc')}
                          />
                          <span>Descending</span>
                          <small>Z → A, 9 → 0</small>
                        </label>
                      </div>
                    </>
                  )}
                </div>
              )}
            </div>

            <div className="format-actions">
              <button className="btn-secondary" onClick={onClose}>
                Cancel
              </button>
              <button className="btn-primary" onClick={handleApply}>
                Apply Format
              </button>
            </div>
          </div>

          <div className="format-preview">
            <h3>Preview</h3>
            <div className="preview-editor">
              <Editor
                key={`${activeTab}-${selectedArrayPath}-${sortProperty}-${sortOrder}`}
                height="100%"
                defaultLanguage="json"
                value={preview}
                theme={theme === 'dark' ? 'vs-dark' : 'light'}
                options={{
                  readOnly: true,
                  minimap: { enabled: false },
                  scrollBeyondLastLine: false,
                  lineNumbers: 'on',
                  wordWrap: 'on',
                  formatOnPaste: false,
                  formatOnType: false,
                  tabSize: 2,
                  folding: true,
                  renderWhitespace: 'none',
                }}
              />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default FormatView;
