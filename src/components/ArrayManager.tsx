import React from 'react';
import { JsonArray, JsonObject, JsonValue } from '../types';
import { inferObjectSchema, createDefaultObject, getObjectCopyLabel } from '../utils/jsonUtils';
import { ObjectEditor } from './ObjectEditor';
import './ArrayManager.css';

interface ArrayManagerProps {
  data: JsonArray;
  onUpdate: (newArray: JsonArray) => void;
  onHighlight?: (path: string) => void;
  currentPath?: string;
  highlightedPath?: string | null;
}

export const ArrayManager: React.FC<ArrayManagerProps> = ({ data, onUpdate, onHighlight, currentPath = '', highlightedPath = null }) => {
  const [showAddForm, setShowAddForm] = React.useState(false);
  const [newItem, setNewItem] = React.useState<JsonObject>({});
  const [showCopyMenu, setShowCopyMenu] = React.useState(false);

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

  // Infer schema from the first object in the array (if it's an array of objects)
  const schema = React.useMemo(() => {
    if (data.length > 0 && typeof data[0] === 'object' && data[0] !== null && !Array.isArray(data[0])) {
      return inferObjectSchema(data[0] as JsonObject);
    }
    return null;
  }, [data]);

  // Get existing objects for copying
  const existingObjects = React.useMemo(() => {
    return data.filter(item => 
      typeof item === 'object' && item !== null && !Array.isArray(item)
    ) as JsonObject[];
  }, [data]);

  const handleAddItem = () => {
    if (schema) {
      if (existingObjects.length > 0) {
        // Show copy menu if we have existing objects
        setShowCopyMenu(true);
      } else {
        // No existing objects, create default
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
    // Deep copy the object
    const copiedItem = JSON.parse(JSON.stringify(sourceObject));
    setNewItem(copiedItem);
    setShowAddForm(true);
    setShowCopyMenu(false);
  };

  const handleSaveNewItem = () => {
    onUpdate([...data, newItem]);
    setShowAddForm(false);
    setNewItem({});
  };

  const handleCancelAdd = () => {
    setShowAddForm(false);
    setNewItem({});
  };

  const handleDeleteItem = (index: number) => {
    const newArray = data.filter((_, i) => i !== index);
    onUpdate(newArray);
  };

  const handleUpdateItem = (index: number, updatedItem: JsonValue) => {
    const newArray = [...data];
    newArray[index] = updatedItem;
    onUpdate(newArray);
  };

  const handleMoveUp = (index: number) => {
    if (index === 0) return; // Can't move up the first item
    const newArray = [...data];
    [newArray[index - 1], newArray[index]] = [newArray[index], newArray[index - 1]];
    onUpdate(newArray);
  };

  const handleMoveDown = (index: number) => {
    if (index === data.length - 1) return; // Can't move down the last item
    const newArray = [...data];
    [newArray[index], newArray[index + 1]] = [newArray[index + 1], newArray[index]];
    onUpdate(newArray);
  };

  if (!Array.isArray(data)) {
    return <div className="array-manager-error">Invalid array data</div>;
  }

  return (
    <div className="array-manager">
      <div className="array-header">
        <span className="array-length">{data.length} items</span>
        {schema && (
          <button onClick={handleAddItem} className="btn-add">
            + Add Item
          </button>
        )}
      </div>

      <div className="array-content">
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
              siblingData={data
                .filter(obj => typeof obj === 'object' && obj !== null && !Array.isArray(obj))
                .map(obj => obj as JsonObject)}
            />
          </div>
        </div>
      )}

      <div className="array-items">
        {data.map((item, index) => {
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
                    disabled={index === data.length - 1}
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
                    siblingData={data
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

        {data.length === 0 && (
          <div className="empty-array">
            <p>This array is empty.</p>
            {schema && <p>Click "Add Item" to add your first item.</p>}
          </div>
        )}
      </div>
    </div>
  );
};
