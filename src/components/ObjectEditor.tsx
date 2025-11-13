import React from 'react';
import { JsonValue, JsonObject } from '../types';
import { inferObjectSchema, createDefaultObjectWithNesting, getObjectCopyLabel } from '../utils/jsonUtils';
import { PropertyEditor } from './PropertyEditor';
import './ObjectEditor.css';

interface ObjectEditorProps {
  data: JsonObject;
  onUpdate: (newData: JsonObject) => void;
  depth?: number;
  maxDepth?: number;
  label?: string;
  siblingData?: JsonObject[]; // Other objects at the same level for value suggestions
  onHighlight?: (path: string) => void;
  currentPath?: string;
  highlightedPath?: string | null;
  onDelete?: () => void; // Callback to delete this nested object (set to null)
}

export const ObjectEditor: React.FC<ObjectEditorProps> = ({ 
  data, 
  onUpdate, 
  depth = 0,
  maxDepth = 5,
  label,
  siblingData = [],
  onHighlight,
  highlightedPath = null,
  currentPath = '',
  onDelete
}) => {
  const [isExpanded, setIsExpanded] = React.useState(depth < 2); // Auto-expand first 2 levels
  const maxDepthTextareaRef = React.useRef<HTMLTextAreaElement>(null);

  // Auto-resize textarea based on content
  const autoResizeTextarea = (textarea: HTMLTextAreaElement | null) => {
    if (textarea) {
      textarea.style.height = 'auto';
      textarea.style.height = Math.max(textarea.scrollHeight, 100) + 'px';
    }
  };

  // Scroll highlighted element into view
  React.useEffect(() => {
    if (highlightedPath) {
      // Small delay to ensure DOM is updated
      setTimeout(() => {
        const highlightedElement = document.querySelector('.highlighted-direct');
        if (highlightedElement) {
          highlightedElement.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }
      }, 100);
    }
  }, [highlightedPath]);
  const [showCopyMenu, setShowCopyMenu] = React.useState<{ key: string } | null>(null);

  const schema = React.useMemo(() => {
    return inferObjectSchema(data);
  }, [data]);

  const handlePropertyChange = (key: string, value: JsonValue) => {
    onUpdate({ ...data, [key]: value });
  };

  const handleNestedObjectChange = (key: string, newNestedData: JsonObject) => {
    onUpdate({ ...data, [key]: newNestedData });
  };

  const handleAddObject = (key: string) => {
    // Try to infer schema from sibling objects
    const siblingObjects = siblingData
      .map(obj => obj[key])
      .filter(val => val !== null && typeof val === 'object' && !Array.isArray(val)) as JsonObject[];
    
    if (siblingObjects.length > 0) {
      // Show menu to choose between default or copy
      setShowCopyMenu({ key });
    } else {
      // No siblings, just create default
      handleCreateDefaultObject(key);
    }
  };

  const handleCreateDefaultObject = (key: string) => {
    // Try to infer schema from sibling objects
    const siblingObjects = siblingData
      .map(obj => obj[key])
      .filter(val => val !== null && typeof val === 'object' && !Array.isArray(val)) as JsonObject[];
    
    let newObject: JsonObject = {};
    
    if (siblingObjects.length > 0) {
      // Infer schema from first non-null sibling and create object with default values
      const sampleObject = siblingObjects[0];
      const schema = inferObjectSchema(sampleObject);
      newObject = createDefaultObjectWithNesting(schema);
    }
    
    onUpdate({ ...data, [key]: newObject });
    setShowCopyMenu(null);
  };

  const handleCopyFromExisting = (key: string, sourceObject: JsonObject) => {
    // Deep copy the object
    const copiedObject = JSON.parse(JSON.stringify(sourceObject));
    onUpdate({ ...data, [key]: copiedObject });
    setShowCopyMenu(null);
  };

  const getExistingObjectsForProperty = (key: string): Array<{ obj: JsonObject, parent: JsonObject }> => {
    return siblingData
      .map(parent => ({ obj: parent[key], parent }))
      .filter(({ obj }) => obj !== null && typeof obj === 'object' && !Array.isArray(obj)) as Array<{ obj: JsonObject, parent: JsonObject }>;
  };

  // Get existing values for a property from sibling objects
  const getExistingValues = (propertyName: string): JsonValue[] => {
    return siblingData
      .map(obj => obj[propertyName])
      .filter(val => val !== null && val !== undefined);
  };

  // Get existing values with parent context for copy from feature
  const getExistingValuesWithParents = (propertyName: string): Array<{ value: JsonValue, parent: JsonObject }> => {
    return siblingData
      .map(parent => ({ value: parent[propertyName], parent }))
      .filter(({ value }) => value !== null && value !== undefined);
  };

  // Auto-resize textarea when data changes
  React.useEffect(() => {
    autoResizeTextarea(maxDepthTextareaRef.current);
  }, [data]);

  if (depth >= maxDepth) {
    return (
      <div className="object-editor-max-depth">
        <div className="max-depth-warning">
          Max nesting depth reached. Edit as JSON:
        </div>
        <textarea
          ref={maxDepthTextareaRef}
          value={JSON.stringify(data, null, 2)}
          onChange={(e) => {
            autoResizeTextarea(maxDepthTextareaRef.current);
            try {
              const parsed = JSON.parse(e.target.value);
              if (typeof parsed === 'object' && !Array.isArray(parsed)) {
                onUpdate(parsed);
              }
            } catch {
              // Invalid JSON, don't update
            }
          }}
          onInput={() => autoResizeTextarea(maxDepthTextareaRef.current)}
          className="json-textarea"
          rows={6}
          style={{ minHeight: '100px', resize: 'vertical' }}
        />
      </div>
    );
  }

  const handleObjectClick = () => {
    setIsExpanded(!isExpanded);
    if (onHighlight && currentPath) {
      onHighlight(currentPath);
    }
  };

  const isHighlighted = highlightedPath === currentPath;
  const isParentOfHighlighted = highlightedPath && currentPath && 
    highlightedPath.startsWith(currentPath) && 
    highlightedPath !== currentPath;

  return (
    <div className={`object-editor depth-${depth} ${isHighlighted ? 'highlighted-direct' : ''} ${isParentOfHighlighted ? 'highlighted-parent' : ''}`}>
      {label && (
        <div className="object-header" onClick={handleObjectClick}>
          <span className="expand-icon">{isExpanded ? '▼' : '▶'}</span>
          <span className="object-label">{label}</span>
          <span className="object-type">object</span>
          <span className="property-count">{Object.keys(data).length} properties</span>
          {onDelete && (
            <button 
              onClick={(e) => {
                e.stopPropagation();
                if (window.confirm(`Delete "${label}" object? It will be set to null.`)) {
                  onDelete();
                }
              }} 
              className="btn-delete-nested"
              title="Delete object"
            >
              ×
            </button>
          )}
        </div>
      )}

      {isExpanded && (
        <div className="object-properties">
          {schema.properties.map((prop) => {
            const value = data[prop.name];
            const isNestedObject = 
              prop.type === 'object' && 
              value !== null && 
              typeof value === 'object' && 
              !Array.isArray(value);

            if (isNestedObject) {
              const nestedPath = currentPath ? `${currentPath}.${prop.name}` : prop.name;
              return (
                <div key={prop.name} className="nested-object-container">
                  <ObjectEditor
                    data={value as JsonObject}
                    onUpdate={(newData) => handleNestedObjectChange(prop.name, newData)}
                    depth={depth + 1}
                    maxDepth={maxDepth}
                    label={prop.name}
                    siblingData={siblingData.map(obj => {
                      const nestedVal = obj[prop.name];
                      return (nestedVal && typeof nestedVal === 'object' && !Array.isArray(nestedVal)) 
                        ? nestedVal as JsonObject 
                        : {};
                    }).filter(obj => Object.keys(obj).length > 0)}
                    onHighlight={onHighlight}
                    highlightedPath={highlightedPath}
                    currentPath={nestedPath}
                    onDelete={() => handlePropertyChange(prop.name, null)}
                  />
                </div>
              );
            }

            const propPath = currentPath ? `${currentPath}.${prop.name}` : prop.name;
            const existingObjectsForProp = getExistingObjectsForProperty(prop.name);
            const showingCopyMenuForProp = showCopyMenu?.key === prop.name;
            const existingValuesForProp = getExistingValues(prop.name);
            const existingValuesWithParentsForProp = getExistingValuesWithParents(prop.name);
            // Only show Copy From for array properties
            const shouldShowCopyFrom = prop.type === 'array' && siblingData.length > 0 && existingValuesForProp.length > 0;
            
            return (
              <div key={prop.name} className="property-with-menu">
                <PropertyEditor
                  property={prop}
                  value={value}
                  onChange={(newValue) => handlePropertyChange(prop.name, newValue)}
                  existingValues={existingValuesForProp}
                  existingValuesWithParents={existingValuesWithParentsForProp}
                  onAddObject={value === null ? () => handleAddObject(prop.name) : undefined}
                  onHighlight={onHighlight}
                  highlightedPath={highlightedPath}
                  currentPath={propPath}
                  showCopyFrom={shouldShowCopyFrom}
                />
                
                {showingCopyMenuForProp && existingObjectsForProp.length > 0 && (
                  <div className="copy-menu-overlay" onClick={() => setShowCopyMenu(null)}>
                    <div className="copy-menu" onClick={(e) => e.stopPropagation()}>
                      <div className="copy-menu-header">
                        <h4>Add Object for "{prop.name}"</h4>
                        <button onClick={() => setShowCopyMenu(null)} className="btn-close">×</button>
                      </div>
                      <div className="copy-menu-options">
                        <button 
                          onClick={() => handleCreateDefaultObject(prop.name)}
                          className="copy-option btn-default"
                        >
                          <span className="option-icon">+</span>
                          <span className="option-text">Create with Default Values</span>
                        </button>
                        <div className="copy-divider">or copy from existing:</div>
                        <div className="copy-list">
                          {existingObjectsForProp.map(({ obj, parent }, idx) => {
                            const labelText = getObjectCopyLabel(obj, idx, false, parent);
                            
                            return (
                              <button
                                key={idx}
                                onClick={() => handleCopyFromExisting(prop.name, obj)}
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
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};
