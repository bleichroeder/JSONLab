import React from 'react';
import { JsonValue, JsonObject, JsonArray } from '../types';
import { inferObjectSchema, createDefaultObject, getObjectCopyLabel } from '../utils/jsonUtils';
import { ObjectEditor } from './ObjectEditor';
import './DataEditor.css';

interface DataEditorProps {
  data: JsonValue;
  onUpdate: (newData: JsonValue) => void;
  onHighlight?: (path: string) => void;
  currentPath?: string;
  highlightedPath?: string | null;
}

export const DataEditor: React.FC<DataEditorProps> = ({ 
  data, 
  onUpdate, 
  onHighlight, 
  currentPath = '', 
  highlightedPath = null 
}) => {
  const isArray = Array.isArray(data);
  const isObject = data !== null && typeof data === 'object' && !isArray;
  const isPrimitive = !isArray && !isObject;

  // Array state
  const [showAddForm, setShowAddForm] = React.useState(false);
  const [newItem, setNewItem] = React.useState<JsonObject>({});
  const [showCopyMenu, setShowCopyMenu] = React.useState(false);
  
  // Search state
  const [searchTerm, setSearchTerm] = React.useState('');
  const [searchResults, setSearchResults] = React.useState<string[]>([]);
  const [currentResultIndex, setCurrentResultIndex] = React.useState(0);
  const searchDebounceRef = React.useRef<number | null>(null);

  // Scroll highlighted element into view
  React.useEffect(() => {
    if (highlightedPath) {
      setTimeout(() => {
        const highlightedElement = document.querySelector('.highlighted-direct');
        if (highlightedElement) {
          highlightedElement.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }
      }, 100);
    }
  }, [highlightedPath]);

  // Array-specific logic
  const schema = React.useMemo(() => {
    if (isArray && data.length > 0 && typeof data[0] === 'object' && data[0] !== null && !Array.isArray(data[0])) {
      return inferObjectSchema(data[0] as JsonObject);
    }
    return null;
  }, [isArray, data]);

  const existingObjects = React.useMemo(() => {
    if (!isArray) return [];
    return (data as JsonArray).filter(item => 
      typeof item === 'object' && item !== null && !Array.isArray(item)
    ) as JsonObject[];
  }, [isArray, data]);

  // Get count for header
  const getCount = () => {
    if (isArray) return `${(data as JsonArray).length} items`;
    if (isObject) return `${Object.keys(data as JsonObject).length} properties`;
    return 'Primitive value';
  };

  // Array handlers
  const handleAddItem = () => {
    if (schema) {
      if (existingObjects.length > 0) {
        setShowCopyMenu(true);
      } else {
        handleCreateDefaultItem();
      }
    }
  };

  const handleCreateDefaultItem = () => {
    if (schema) {
      const defaultItem = createDefaultObject(schema);
      setNewItem(defaultItem);
      setShowAddForm(true);
      setShowCopyMenu(false);
    }
  };

  const handleCopyFromExisting = (sourceObject: JsonObject) => {
    const copiedItem = JSON.parse(JSON.stringify(sourceObject));
    setNewItem(copiedItem);
    setShowAddForm(true);
    setShowCopyMenu(false);
  };

  const handleSaveNewItem = () => {
    if (isArray) {
      onUpdate([...(data as JsonArray), newItem]);
      setShowAddForm(false);
      setNewItem({});
    }
  };

  const handleCancelAdd = () => {
    setShowAddForm(false);
    setNewItem({});
  };

  const handleDeleteItem = (index: number) => {
    if (isArray) {
      const newArray = (data as JsonArray).filter((_, i) => i !== index);
      onUpdate(newArray);
    }
  };

  const handleUpdateItem = (index: number, updatedItem: JsonValue) => {
    if (isArray) {
      const newArray = [...(data as JsonArray)];
      newArray[index] = updatedItem;
      onUpdate(newArray);
    }
  };

  const handleMoveUp = (index: number) => {
    if (isArray && index > 0) {
      const newArray = [...(data as JsonArray)];
      [newArray[index - 1], newArray[index]] = [newArray[index], newArray[index - 1]];
      onUpdate(newArray);
    }
  };

  const handleMoveDown = (index: number) => {
    if (isArray && index < (data as JsonArray).length - 1) {
      const newArray = [...(data as JsonArray)];
      [newArray[index], newArray[index + 1]] = [newArray[index + 1], newArray[index]];
      onUpdate(newArray);
    }
  };

  // Search functionality
  const searchInData = (searchValue: string) => {
    if (!searchValue.trim()) {
      setSearchResults([]);
      setCurrentResultIndex(0);
      return;
    }

    const results: string[] = [];
    const searchLower = searchValue.toLowerCase();

    const searchObject = (obj: any, path: string = '') => {
      if (typeof obj === 'object' && obj !== null) {
        if (Array.isArray(obj)) {
          obj.forEach((item, index) => {
            const itemPath = path ? `${path}[${index}]` : `[${index}]`;
            searchObject(item, itemPath);
          });
        } else {
          Object.entries(obj).forEach(([key, value]) => {
            const propPath = path ? `${path}.${key}` : key;
            
            // Check if key matches
            if (key.toLowerCase().includes(searchLower)) {
              results.push(propPath);
            }
            
            // Check if value matches (for primitives)
            if (typeof value === 'string' && value.toLowerCase().includes(searchLower)) {
              results.push(propPath);
            } else if (typeof value === 'number' && value.toString().includes(searchValue)) {
              results.push(propPath);
            } else if (typeof value === 'boolean' && value.toString().toLowerCase().includes(searchLower)) {
              results.push(propPath);
            }
            
            // Recursively search nested objects/arrays
            if (typeof value === 'object' && value !== null) {
              searchObject(value, propPath);
            }
          });
        }
      }
    };

    searchObject(data);
    setSearchResults(results);
    setCurrentResultIndex(0);
    
    // Highlight first result
    if (results.length > 0 && onHighlight) {
      onHighlight(results[0]);
    }
  };

  const handleSearchChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value;
    setSearchTerm(value);

    // Clear existing debounce timer
    if (searchDebounceRef.current) {
      clearTimeout(searchDebounceRef.current);
    }

    // Set new debounce timer
    searchDebounceRef.current = window.setTimeout(() => {
      searchInData(value);
    }, 300);
  };

  const handleNextResult = () => {
    if (searchResults.length > 0) {
      const nextIndex = (currentResultIndex + 1) % searchResults.length;
      setCurrentResultIndex(nextIndex);
      if (onHighlight) {
        onHighlight(searchResults[nextIndex]);
      }
    }
  };

  const handlePrevResult = () => {
    if (searchResults.length > 0) {
      const prevIndex = currentResultIndex === 0 ? searchResults.length - 1 : currentResultIndex - 1;
      setCurrentResultIndex(prevIndex);
      if (onHighlight) {
        onHighlight(searchResults[prevIndex]);
      }
    }
  };

  const handleClearSearch = () => {
    setSearchTerm('');
    setSearchResults([]);
    setCurrentResultIndex(0);
    if (onHighlight) {
      onHighlight('');
    }
  };

  if (isPrimitive) {
    return (
      <div className="data-editor">
        <div className="data-editor-header">
          <span className="data-count">{getCount()}</span>
        </div>
        <div className="data-editor-content">
          <div className="primitive-editor">
            <div className="primitive-type">{typeof data}</div>
            <pre className="primitive-value">{JSON.stringify(data, null, 2)}</pre>
          </div>
        </div>
      </div>
    );
  }

  if (isArray) {
    const arrayData = data as JsonArray;
    
    return (
      <div className="data-editor">
        <div className="data-editor-header">
          <span className="data-count">{getCount()}</span>
          <div className="search-container">
            <div className="search-input-wrapper">
              <span className="material-symbols-outlined search-icon">search</span>
              <input
                type="text"
                className="search-input"
                placeholder="Search..."
                value={searchTerm}
                onChange={handleSearchChange}
              />
              {searchTerm && (
                <button className="btn-clear-search" onClick={handleClearSearch} title="Clear search">
                  <span className="material-symbols-outlined">close</span>
                </button>
              )}
            </div>
            {searchResults.length > 0 && (
              <div className="search-results-info">
                <span className="search-count">{currentResultIndex + 1}/{searchResults.length}</span>
                <button className="btn-nav-result" onClick={handlePrevResult} title="Previous result">
                  <span className="material-symbols-outlined">keyboard_arrow_up</span>
                </button>
                <button className="btn-nav-result" onClick={handleNextResult} title="Next result">
                  <span className="material-symbols-outlined">keyboard_arrow_down</span>
                </button>
              </div>
            )}
          </div>
          {schema && (
            <button onClick={handleAddItem} className="btn-add">
              + Add Item
            </button>
          )}
        </div>
        <div className="data-editor-content">
          {showCopyMenu && existingObjects.length > 0 && (
            <div className="copy-menu-overlay" onClick={() => setShowCopyMenu(false)}>
              <div className="copy-menu" onClick={(e) => e.stopPropagation()}>
                <div className="copy-menu-header">
                  <h4>Add New Item</h4>
                  <button onClick={() => setShowCopyMenu(false)} className="btn-close">×</button>
                </div>
                <div className="copy-menu-options">
                  <button 
                    onClick={handleCreateDefaultItem}
                    className="copy-option btn-default"
                  >
                    <span className="option-icon">+</span>
                    <span className="option-text">Create with Default Values</span>
                  </button>
                  <div className="copy-divider">or copy from existing:</div>
                  <div className="copy-list">
                    {existingObjects.map((obj, idx) => {
                      const labelText = getObjectCopyLabel(obj, idx, true);
                      
                      return (
                        <button
                          key={idx}
                          onClick={() => handleCopyFromExisting(obj)}
                          className="copy-option btn-copy"
                        >
                          <span className="option-icon">📋</span>
                          <div className="option-preview">
                            <div className="option-label">{labelText}</div>
                            <pre className="option-json">{JSON.stringify(obj, null, 2).slice(0, 100)}...</pre>
                          </div>
                        </button>
                      );
                    })}
                  </div>
                </div>
              </div>
            </div>
          )}

          {showAddForm && schema && (
            <div className="add-form">
              <div className="add-form-header">
                <h4>Add New Item</h4>
                <div className="add-form-actions">
                  <button onClick={handleSaveNewItem} className="btn-save">
                    Save
                  </button>
                  <button onClick={handleCancelAdd} className="btn-cancel">
                    Cancel
                  </button>
                </div>
              </div>
              <div className="add-form-fields">
                <ObjectEditor
                  data={newItem}
                  onUpdate={setNewItem}
                  depth={0}
                  maxDepth={5}
                  siblingData={arrayData
                    .filter(obj => typeof obj === 'object' && obj !== null && !Array.isArray(obj))
                    .map(obj => obj as JsonObject)}
                />
              </div>
            </div>
          )}

          <div className="array-items">
            {arrayData.map((item, index) => {
              const itemPath = currentPath ? `${currentPath}[${index}]` : `[${index}]`;
              
              const isHighlighted = highlightedPath === itemPath;
              const isParentOfHighlighted = highlightedPath && itemPath && 
                highlightedPath.startsWith(itemPath) && 
                highlightedPath !== itemPath;
              
              return (
                <div key={index} className="array-item">
                  <div 
                    className={`array-item-header ${isHighlighted ? 'highlighted-direct' : ''} ${isParentOfHighlighted ? 'highlighted-parent' : ''}`}
                    onClick={() => onHighlight && onHighlight(itemPath)}
                  >
                    <span className="item-index">Item {index + 1}</span>
                    <div className="array-item-actions">
                      <button 
                        onClick={(e) => {
                          e.stopPropagation();
                          handleMoveUp(index);
                        }} 
                        className="btn-move"
                        title="Move up"
                        disabled={index === 0}
                      >
                        ↑
                      </button>
                      <button 
                        onClick={(e) => {
                          e.stopPropagation();
                          handleMoveDown(index);
                        }} 
                        className="btn-move"
                        title="Move down"
                        disabled={index === arrayData.length - 1}
                      >
                        ↓
                      </button>
                      <button 
                        onClick={(e) => {
                          e.stopPropagation();
                          handleDeleteItem(index);
                        }} 
                        className="btn-delete"
                        title="Delete item"
                      >
                        ×
                      </button>
                    </div>
                  </div>
                  <div className={`array-item-content ${isHighlighted ? 'highlighted-direct' : ''} ${isParentOfHighlighted ? 'highlighted-parent' : ''}`}>
                    {typeof item === 'object' && item !== null && !Array.isArray(item) ? (
                      <ObjectEditor
                        data={item as JsonObject}
                        onUpdate={(updatedItem) => handleUpdateItem(index, updatedItem)}
                        depth={1}
                        maxDepth={5}
                        siblingData={arrayData
                          .filter((_, i) => i !== index)
                          .filter(obj => typeof obj === 'object' && obj !== null && !Array.isArray(obj))
                          .map(obj => obj as JsonObject)}
                        onHighlight={onHighlight}
                        highlightedPath={highlightedPath}
                        currentPath={itemPath}
                      />
                    ) : (
                      <pre className="primitive-value">{JSON.stringify(item, null, 2)}</pre>
                    )}
                  </div>
                </div>
              );
            })}
          </div>

          {arrayData.length === 0 && (
            <div className="empty-array">
              <p>This array is empty.</p>
              {schema && <p>Click "Add Item" to add your first item.</p>}
            </div>
          )}
        </div>
      </div>
    );
  }

  // isObject
  return (
    <div className="data-editor">
      <div className="data-editor-header">
        <span className="data-count">{getCount()}</span>
        <div className="search-container">
          <div className="search-input-wrapper">
            <span className="material-symbols-outlined search-icon">search</span>
            <input
              type="text"
              className="search-input"
              placeholder="Search properties..."
              value={searchTerm}
              onChange={handleSearchChange}
            />
            {searchTerm && (
              <button className="btn-clear-search" onClick={handleClearSearch} title="Clear search">
                <span className="material-symbols-outlined">close</span>
              </button>
            )}
          </div>
          {searchResults.length > 0 && (
            <div className="search-results-info">
              <span className="search-count">{currentResultIndex + 1}/{searchResults.length}</span>
              <button className="btn-nav-result" onClick={handlePrevResult} title="Previous result">
                <span className="material-symbols-outlined">keyboard_arrow_up</span>
              </button>
              <button className="btn-nav-result" onClick={handleNextResult} title="Next result">
                <span className="material-symbols-outlined">keyboard_arrow_down</span>
              </button>
            </div>
          )}
        </div>
      </div>
      <div className="data-editor-content">
        <ObjectEditor
          data={data as JsonObject}
          onUpdate={onUpdate as (newData: JsonObject) => void}
          depth={0}
          maxDepth={5}
          onHighlight={onHighlight}
          currentPath={currentPath}
          highlightedPath={highlightedPath}
        />
      </div>
    </div>
  );
};
