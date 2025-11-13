import React from 'react';
import { JsonValue, JsonObject, PropertySchema } from '../types';
import { getObjectCopyLabel } from '../utils/jsonUtils';
import './PropertyEditor.css';

// Utility functions for data detection
const isValidUrl = (str: string): boolean => {
  try {
    const url = new URL(str);
    return url.protocol === 'http:' || url.protocol === 'https:';
  } catch {
    return false;
  }
};

const isImageUrl = (str: string): boolean => {
  if (!isValidUrl(str)) return false;
  const imageExtensions = ['.jpg', '.jpeg', '.png', '.gif', '.webp', '.svg', '.bmp'];
  const lowerStr = str.toLowerCase();
  return imageExtensions.some(ext => lowerStr.includes(ext));
};

const isColorValue = (str: string): boolean => {
  // Hex colors
  if (/^#([0-9A-F]{3}){1,2}$/i.test(str)) return true;
  // RGB/RGBA
  if (/^rgba?\(\s*\d+\s*,\s*\d+\s*,\s*\d+\s*(,\s*[\d.]+\s*)?\)$/i.test(str)) return true;
  // HSL/HSLA
  if (/^hsla?\(\s*\d+\s*,\s*\d+%\s*,\s*\d+%\s*(,\s*[\d.]+\s*)?\)$/i.test(str)) return true;
  // Named colors (common ones)
  const namedColors = ['red', 'blue', 'green', 'yellow', 'purple', 'orange', 'pink', 'black', 'white', 'gray', 'grey'];
  return namedColors.includes(str.toLowerCase());
};

const isTimestamp = (value: any): boolean => {
  if (typeof value === 'number') {
    // Unix timestamp (seconds or milliseconds)
    return value > 946684800 && value < 4102444800000; // Between 2000 and 2100
  }
  if (typeof value === 'string') {
    // ISO 8601 date string
    const date = new Date(value);
    return !isNaN(date.getTime()) && value.includes('-');
  }
  return false;
};

const formatTimestamp = (value: any): string => {
  let date: Date;
  if (typeof value === 'number') {
    // Detect if it's seconds or milliseconds
    date = new Date(value < 10000000000 ? value * 1000 : value);
  } else {
    date = new Date(value);
  }
  return date.toLocaleString();
};

interface PropertyEditorProps {
  property: PropertySchema;
  value: JsonValue;
  onChange: (value: JsonValue) => void;
  depth?: number;
  existingValues?: JsonValue[]; // Values from other objects for suggestions
  existingValuesWithParents?: Array<{ value: JsonValue, parent: JsonObject }>; // Values with parent context for copy from
  onAddObject?: () => void; // Callback to add an object when value is null
  onHighlight?: (path: string) => void;
  currentPath?: string;
  highlightedPath?: string | null;
  showCopyFrom?: boolean; // Show copy from dropdown for arrays
}

export const PropertyEditor: React.FC<PropertyEditorProps> = ({ 
  property, 
  value, 
  onChange, 
  existingValues = [],
  existingValuesWithParents = [],
  onAddObject,
  onHighlight,
  currentPath = '',
  highlightedPath = null,
  showCopyFrom = false
}) => {
  const [showSuggestions, setShowSuggestions] = React.useState(false);
  const [showCopyFromMenu, setShowCopyFromMenu] = React.useState(false);
  const [inputValue, setInputValue] = React.useState(String(value || ''));
  const [jsonTextValue, setJsonTextValue] = React.useState(
    typeof value === 'object' ? JSON.stringify(value, null, 2) : ''
  );
  const [isEditingJson, setIsEditingJson] = React.useState(false);
  const [showImagePreview, setShowImagePreview] = React.useState(false);
  const inputRef = React.useRef<HTMLInputElement>(null);
  const textareaRef = React.useRef<HTMLTextAreaElement>(null);
  const jsonTextareaRef = React.useRef<HTMLTextAreaElement>(null);
  const previousValueRef = React.useRef(value);

  // Auto-resize textarea based on content
  const autoResizeTextarea = (textarea: HTMLTextAreaElement | null) => {
    if (textarea) {
      textarea.style.height = 'auto';
      textarea.style.height = Math.max(textarea.scrollHeight, 40) + 'px';
    }
  };
  
  // Detect value type for contextual features
  const stringValue = String(value || '');
  const isUrl = property.type === 'string' && isValidUrl(stringValue);
  const isImage = property.type === 'string' && isImageUrl(stringValue);
  const isColor = property.type === 'string' && isColorValue(stringValue);
  const isDate = (property.type === 'string' || property.type === 'number') && isTimestamp(value);

  // Get unique existing values for suggestions
  const suggestions = React.useMemo(() => {
    if (!existingValues || existingValues.length === 0) return [];
    
    const unique = Array.from(new Set(
      existingValues
        .filter(v => v !== null && v !== undefined)
        .map(v => String(v))
    ));
    
    return unique.filter(v => 
      v.toLowerCase().includes(inputValue.toLowerCase())
    );
  }, [existingValues, inputValue]);

  React.useEffect(() => {
    setInputValue(String(value || ''));
    
    // Only update jsonTextValue if the value changed externally (not from our own onChange)
    if (typeof value === 'object' && value !== null && !isEditingJson) {
      const currentJson = JSON.stringify(value, null, 2);
      const previousJson = JSON.stringify(previousValueRef.current, null, 2);
      
      if (currentJson !== previousJson) {
        setJsonTextValue(currentJson);
      }
    }
    
    previousValueRef.current = value;
    
    // Auto-resize textareas when value changes
    setTimeout(() => {
      autoResizeTextarea(textareaRef.current);
      autoResizeTextarea(jsonTextareaRef.current);
    }, 0);
  }, [value, isEditingJson]);

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    const newValue = e.target.value;
    setInputValue(newValue);
    
    const { type } = property;

    switch (type) {
      case 'number':
        onChange(newValue === '' ? 0 : Number(newValue));
        break;
      case 'boolean':
        onChange(newValue === 'true');
        break;
      default:
        onChange(newValue);
    }
  };

  const handleSuggestionClick = (suggestion: string) => {
    const { type } = property;
    
    switch (type) {
      case 'number':
        onChange(Number(suggestion));
        break;
      case 'boolean':
        onChange(suggestion === 'true');
        break;
      default:
        onChange(suggestion);
    }
    
    setInputValue(suggestion);
    setShowSuggestions(false);
  };

  const handleCheckboxChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    onChange(e.target.checked);
  };

  const renderContextualActions = () => {
    if (!value) return null;

    return (
      <div className="contextual-actions">
        {isUrl && !isImage && (
          <button
            className="btn-contextual"
            onClick={() => window.open(stringValue, '_blank')}
            title="Open URL in new tab"
          >
            <span className="material-symbols-outlined">open_in_new</span>
          </button>
        )}
        {isImage && (
          <div 
            className="image-preview-trigger"
            onMouseEnter={() => setShowImagePreview(true)}
            onMouseLeave={() => setShowImagePreview(false)}
          >
            <button
              className="btn-contextual"
              onClick={() => window.open(stringValue, '_blank')}
              title="Preview image"
            >
              <span className="material-symbols-outlined">image</span>
            </button>
            {showImagePreview && (
              <div className="image-preview-popup">
                <img src={stringValue} alt="Preview" onError={(e) => {
                  (e.target as HTMLImageElement).style.display = 'none';
                }} />
              </div>
            )}
          </div>
        )}
        {isColor && (
          <div className="color-preview" style={{ backgroundColor: stringValue }} title={stringValue} />
        )}
        {isDate && (
          <div className="timestamp-display" title={`Raw: ${value}`}>
            <span className="material-symbols-outlined">schedule</span>
            <span className="formatted-date">{formatTimestamp(value)}</span>
          </div>
        )}
      </div>
    );
  };

  const renderInput = () => {
    switch (property.type) {
      case 'string':
        const isMultiLine = inputValue.includes('\n') || inputValue.length > 60;
        
        return (
          <div className="input-with-suggestions">
            {isMultiLine ? (
              <textarea
                ref={textareaRef}
                value={inputValue}
                onChange={(e) => {
                  handleInputChange(e);
                  autoResizeTextarea(textareaRef.current);
                }}
                onFocus={() => setShowSuggestions(true)}
                onBlur={() => setTimeout(() => setShowSuggestions(false), 200)}
                onInput={() => autoResizeTextarea(textareaRef.current)}
                className="property-textarea property-input"
                placeholder={`Enter ${property.name}`}
                rows={1}
                style={{ minHeight: '40px', resize: 'vertical' }}
              />
            ) : (
              <input
                ref={inputRef}
                type="text"
                value={inputValue}
                onChange={handleInputChange}
                onFocus={() => setShowSuggestions(true)}
                onBlur={() => setTimeout(() => setShowSuggestions(false), 200)}
                className="property-input"
                placeholder={`Enter ${property.name}`}
              />
            )}
            {showSuggestions && suggestions.length > 0 && (
              <div className="suggestions-dropdown">
                {suggestions.slice(0, 5).map((suggestion, idx) => (
                  <div
                    key={idx}
                    className="suggestion-item"
                    onClick={() => handleSuggestionClick(suggestion)}
                  >
                    {suggestion}
                  </div>
                ))}
              </div>
            )}
          </div>
        );

      case 'number':
        return (
          <div className="input-with-suggestions">
            <input
              ref={inputRef}
              type="number"
              value={inputValue}
              onChange={handleInputChange}
              onFocus={() => setShowSuggestions(true)}
              onBlur={() => setTimeout(() => setShowSuggestions(false), 200)}
              className="property-input"
              placeholder={`Enter ${property.name}`}
            />
            {showSuggestions && suggestions.length > 0 && (
              <div className="suggestions-dropdown">
                {suggestions.slice(0, 5).map((suggestion, idx) => (
                  <div
                    key={idx}
                    className="suggestion-item"
                    onClick={() => handleSuggestionClick(suggestion)}
                  >
                    {suggestion}
                  </div>
                ))}
              </div>
            )}
          </div>
        );

      case 'boolean':
        return (
          <label className="checkbox-label">
            <input
              type="checkbox"
              checked={Boolean(value)}
              onChange={handleCheckboxChange}
              className="property-checkbox"
            />
            <span>{value ? 'True' : 'False'}</span>
          </label>
        );

      case 'null':
        return (
          <div className="null-value-container">
            <input
              type="text"
              value="null"
              disabled
              className="property-input disabled"
            />
            {property.type === 'null' && onAddObject && (
              <button onClick={onAddObject} className="btn-add-object">
                + Add Object
              </button>
            )}
          </div>
        );

      case 'array':
      case 'object':
        if (value === null && onAddObject) {
          return (
            <div className="null-object-container">
              <span className="null-label">null</span>
              <button onClick={onAddObject} className="btn-add-object">
                + Add {property.type === 'array' ? 'Array' : 'Object'}
              </button>
            </div>
          );
        }
        return (
          <textarea
            ref={jsonTextareaRef}
            value={jsonTextValue}
            onChange={(e) => {
              setIsEditingJson(true);
              setJsonTextValue(e.target.value);
              autoResizeTextarea(jsonTextareaRef.current);
              try {
                const parsed = JSON.parse(e.target.value);
                onChange(parsed);
              } catch {
                // Invalid JSON, don't update parent yet
              }
            }}
            onBlur={() => {
              setIsEditingJson(false);
            }}
            onKeyDown={(e) => {
              // Allow Enter key to work normally in textarea
              if (e.key === 'Enter') {
                e.stopPropagation();
              }
            }}
            onInput={() => autoResizeTextarea(jsonTextareaRef.current)}
            className="property-textarea"
            placeholder={`Enter valid JSON ${property.type}`}
            rows={4}
            style={{ minHeight: '80px', resize: 'vertical' }}
          />
        );

      default:
        return (
          <input
            type="text"
            value={String(value || '')}
            onChange={handleInputChange}
            className="property-input"
          />
        );
    }
  };

  const handlePropertyClick = () => {
    if (onHighlight && currentPath) {
      onHighlight(currentPath);
    }
  };

  const isHighlighted = highlightedPath === currentPath;

  // Get non-null, non-current existing values for copy from
  const copyFromValues = React.useMemo(() => {
    if (!showCopyFrom) return [];
    
    // Use existingValuesWithParents if available, otherwise fall back to existingValues
    if (existingValuesWithParents.length > 0) {
      return existingValuesWithParents
        .filter(({ value: v }) => v !== null && v !== undefined && v !== value)
        .map(({ value: v, parent }, idx) => ({
          value: v,
          display: typeof v === 'object' ? JSON.stringify(v) : String(v),
          parent: parent,
          index: idx
        }));
    }
    
    return existingValues
      .filter(v => v !== null && v !== undefined && v !== value)
      .map((v, idx) => ({
        value: v,
        display: typeof v === 'object' ? JSON.stringify(v) : String(v),
        parent: null,
        index: idx
      }));
  }, [showCopyFrom, existingValues, existingValuesWithParents, value]);

  const handleCopyFromClick = (copyValue: JsonValue) => {
    onChange(copyValue);
    setShowCopyFromMenu(false);
  };

  return (
    <>
      <div 
        className={`property-editor ${isHighlighted ? 'highlighted-direct' : ''}`} 
        onClick={handlePropertyClick}
      >
        <label className="property-label">
          <span className="property-name">{property.name}</span>
          <span className="property-type">{property.type}</span>
          {showCopyFrom && copyFromValues.length > 0 && property.type === 'array' && (
            <button
              className="btn-copy-from"
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                setShowCopyFromMenu(true);
              }}
              title="Copy from another item"
            >
              <span className="material-symbols-outlined">content_copy</span>
              <span className="copy-from-text">Copy From</span>
            </button>
          )}
        </label>
        <div className="property-input-container">
          {renderInput()}
          {renderContextualActions()}
        </div>
      </div>

      {showCopyFromMenu && copyFromValues.length > 0 && (
        <div className="copy-menu-overlay" onClick={() => setShowCopyFromMenu(false)}>
          <div className="copy-menu" onClick={(e) => e.stopPropagation()}>
            <div className="copy-menu-header">
              <h4>Copy value for "{property.name}"</h4>
              <button onClick={() => setShowCopyFromMenu(false)} className="btn-close">×</button>
            </div>
            <div className="copy-menu-options">
              <div className="copy-list">
                {copyFromValues.map((item, idx) => {
                  const labelText = item.parent 
                    ? getObjectCopyLabel(item.parent, idx, true)
                    : `Item ${item.index + 1}`;
                  
                  return (
                    <button
                      key={idx}
                      onClick={() => handleCopyFromClick(item.value)}
                      className="copy-option btn-copy"
                    >
                      <span className="option-icon">📋</span>
                      <div className="option-preview">
                        <div className="option-label">{labelText}</div>
                        <pre className="option-json">{item.display.substring(0, 100)}{item.display.length > 100 ? '...' : ''}</pre>
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
};
