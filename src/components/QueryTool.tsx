import React, { useState } from 'react';
import { JSONPath } from 'jsonpath-plus';
import { JsonValue } from '../types';
import './QueryTool.css';

interface QueryToolProps {
  data: JsonValue;
  onResultClick?: (path: string) => void;
}

interface QueryResult {
  success: boolean;
  data?: any;
  error?: string;
  count?: number;
  paths?: string[];
  items?: Array<{ value: any; path: string }>;
}

// Generate dynamic examples based on the data structure
const generateExamples = (data: JsonValue): Array<{ label: string; query: string; description: string }> => {
  const examples: Array<{ label: string; query: string; description: string }> = [];
  
  // Helper to extract properties from data
  const extractProperties = (obj: any, maxDepth = 2, currentDepth = 0): Map<string, { type: string; sampleValue: any }> => {
    const props = new Map<string, { type: string; sampleValue: any }>();
    
    if (currentDepth >= maxDepth || !obj || typeof obj !== 'object') {
      return props;
    }
    
    if (Array.isArray(obj)) {
      if (obj.length > 0 && typeof obj[0] === 'object') {
        return extractProperties(obj[0], maxDepth, currentDepth);
      }
    } else {
      for (const [key, value] of Object.entries(obj)) {
        if (value === null || value === undefined) continue;
        
        const type = Array.isArray(value) ? 'array' : typeof value;
        if (!props.has(key)) {
          props.set(key, { type, sampleValue: value });
        }
        
        // Recurse for nested objects
        if (type === 'object' && currentDepth < maxDepth - 1) {
          const nested = extractProperties(value, maxDepth, currentDepth + 1);
          nested.forEach((v, k) => {
            if (!props.has(k)) props.set(k, v);
          });
        }
      }
    }
    
    return props;
  };
  
  const properties = extractProperties(data);
  
  // Always include basic queries
  examples.push({
    label: 'All items',
    query: '$[*]',
    description: 'Get all root-level items'
  });
  
  // Find string properties for equality filters
  const stringProps = Array.from(properties.entries()).filter(([_, v]) => v.type === 'string');
  if (stringProps.length > 0) {
    const [propName, propInfo] = stringProps[0];
    const sampleValue = typeof propInfo.sampleValue === 'string' ? propInfo.sampleValue : 'value';
    examples.push({
      label: `Filter by ${propName}`,
      query: `$[?(@.${propName} == "${sampleValue}")]`,
      description: `Items where ${propName} equals "${sampleValue}"`
    });
  }
  
  // Find numeric properties for comparison filters
  const numericProps = Array.from(properties.entries()).filter(([_, v]) => v.type === 'number');
  if (numericProps.length > 0) {
    const [propName, propInfo] = numericProps[0];
    const threshold = typeof propInfo.sampleValue === 'number' ? Math.floor(propInfo.sampleValue * 0.8) : 100;
    examples.push({
      label: `${propName} > ${threshold}`,
      query: `$[?(@.${propName} > ${threshold})]`,
      description: `Items with ${propName} greater than ${threshold}`
    });
  }
  
  // Recursive descent for common property
  if (properties.size > 0) {
    const commonProp = Array.from(properties.keys())[0];
    examples.push({
      label: `Get all ${commonProp}`,
      query: `$..${commonProp}`,
      description: `Get all "${commonProp}" properties recursively`
    });
  }
  
  // Has property check
  if (properties.size > 0) {
    const propToCheck = Array.from(properties.keys())[Math.min(1, properties.size - 1)];
    examples.push({
      label: `Has ${propToCheck}`,
      query: `$[?(@.${propToCheck})]`,
      description: `Items that have a "${propToCheck}" property`
    });
  }
  
  // Array property access if we found arrays
  const arrayProps = Array.from(properties.entries()).filter(([_, v]) => v.type === 'array');
  if (arrayProps.length > 0) {
    const [propName] = arrayProps[0];
    examples.push({
      label: `First ${propName}`,
      query: `$[*].${propName}[0]`,
      description: `Get first item from each ${propName} array`
    });
  }
  
  return examples.slice(0, 6); // Limit to 6 examples
};

interface Condition {
  id: string;
  property: string;
  operator: string;
  value: string;
}

type QueryMode = 'text' | 'visual';
type LogicOperator = 'AND' | 'OR';

export const QueryTool: React.FC<QueryToolProps> = ({ data, onResultClick }) => {
  const [mode, setMode] = useState<QueryMode>('text');
  const [query, setQuery] = useState<string>('');
  const [result, setResult] = useState<QueryResult | null>(null);
  const [showExamples, setShowExamples] = useState(false);
  const [examples, setExamples] = useState<Array<{ label: string; query: string; description: string }>>([]);
  
  // Visual query builder state
  const [conditions, setConditions] = useState<Condition[]>([]);
  const [logicOperator, setLogicOperator] = useState<LogicOperator>('AND');
  const [availableProperties, setAvailableProperties] = useState<string[]>([]);

  // Extract available properties from data
  React.useEffect(() => {
    if (data) {
      const properties = extractAllProperties(data);
      setAvailableProperties(properties);
    }
  }, [data]);

  // Generate examples when data changes
  React.useEffect(() => {
    if (data) {
      setExamples(generateExamples(data));
    }
  }, [data]);

  // Extract all property paths from the data
  const extractAllProperties = (obj: any, prefix = ''): string[] => {
    const properties: Set<string> = new Set();
    
    if (!obj || typeof obj !== 'object') return [];
    
    if (Array.isArray(obj)) {
      if (obj.length > 0 && typeof obj[0] === 'object') {
        // Extract from first array item
        return extractAllProperties(obj[0], prefix);
      }
    } else {
      Object.keys(obj).forEach(key => {
        const fullPath = prefix ? `${prefix}.${key}` : key;
        properties.add(fullPath);
        
        const value = obj[key];
        if (value && typeof value === 'object' && !Array.isArray(value)) {
          // Recurse for nested objects (limit depth to 2)
          if (prefix.split('.').length < 2) {
            extractAllProperties(value, fullPath).forEach(p => properties.add(p));
          }
        }
      });
    }
    
    return Array.from(properties).sort();
  };

  // Add a new condition
  const addCondition = () => {
    const newCondition: Condition = {
      id: Date.now().toString(),
      property: availableProperties[0] || '',
      operator: '==',
      value: ''
    };
    setConditions([...conditions, newCondition]);
  };

  // Remove a condition
  const removeCondition = (id: string) => {
    setConditions(conditions.filter(c => c.id !== id));
  };

  // Update a condition
  const updateCondition = (id: string, field: keyof Condition, value: string) => {
    setConditions(conditions.map(c => 
      c.id === id ? { ...c, [field]: value } : c
    ));
  };

  // Generate JSONPath from visual conditions
  const generateJSONPathFromConditions = (): string => {
    if (conditions.length === 0) {
      return '$[*]';
    }

    const filterExpressions = conditions.map(c => {
      const { property, operator, value } = c;
      
      // Determine if value should be quoted (string) or not (number/boolean)
      let formattedValue = value;
      if (operator === '=~' || operator === 'contains') {
        // Regex or contains - always quoted
        formattedValue = `"${value}"`;
      } else if (!isNaN(Number(value))) {
        // Numeric value
        formattedValue = value;
      } else if (value === 'true' || value === 'false' || value === 'null') {
        // Boolean or null
        formattedValue = value;
      } else {
        // String value
        formattedValue = `"${value}"`;
      }

      // Convert operator syntax
      let operatorSyntax = operator;
      if (operator === 'contains') {
        return `@.${property} =~ /${value}/i`;
      }

      return `@.${property} ${operatorSyntax} ${formattedValue}`;
    });

    const joinOperator = logicOperator === 'AND' ? ' && ' : ' || ';
    const filterExpression = filterExpressions.join(joinOperator);
    
    return `$[?(${filterExpression})]`;
  };

  // Execute visual query
  const executeVisualQuery = () => {
    const generatedQuery = generateJSONPathFromConditions();
    setQuery(generatedQuery);
    // Execute with the generated query
    executeQueryWithPath(generatedQuery);
  };

  // Modified execute to accept query parameter
  const executeQueryWithPath = (queryPath?: string) => {
    const queryToExecute = queryPath || query;
    
    try {
      if (!queryToExecute.trim()) {
        setResult({
          success: false,
          error: 'Please enter a JSONPath query',
        });
        return;
      }

      // Execute the JSONPath query
      const queryResult = JSONPath({
        path: queryToExecute,
        json: data,
        resultType: 'all',
      });

      if (queryResult && queryResult.length > 0) {
        const items = queryResult.map((item: any) => ({
          value: item.value,
          path: convertJsonPathToAppPath(item.path),
        }));

        setResult({
          success: true,
          data: items.map((item: { value: any; path: string }) => item.value),
          count: items.length,
          items: items,
        });
      } else {
        setResult({
          success: true,
          data: [],
          count: 0,
          items: [],
        });
      }
    } catch (error: any) {
      setResult({
        success: false,
        error: error.message || 'Invalid query syntax',
      });
    }
  };

  // Convert JSONPath format to app's path format
  // e.g., "$['store']['book'][0]['title']" -> ".store.book[0].title"
  // or "$[0]['name']" -> "[0].name"
  const convertJsonPathToAppPath = (jsonPath: string): string => {
    // Remove the leading $
    let path = jsonPath.replace(/^\$/, '');
    
    // Convert ['property'] to .property (for object properties)
    // Keep [number] as is (for array indices)
    path = path.replace(/\['([^']+)'\]/g, (_match, prop) => {
      // If it's a number, keep it as [number]
      if (/^\d+$/.test(prop)) {
        return `[${prop}]`;
      }
      // Otherwise convert to dot notation
      return `.${prop}`;
    });
    
    // Clean up leading dot if path starts with array index
    path = path.replace(/^\.\[/, '[');
    
    return path;
  };

  const executeQuery = () => {
    executeQueryWithPath();
  };
  
  // Old executeQuery logic - kept for reference but unused
  /* const _oldExecuteQuery = () => {
    try {
      if (!query.trim()) {
        setResult({
          success: false,
          error: 'Please enter a JSONPath query',
        });
        return;
      }

      // Execute the JSONPath query
      const queryResult = JSONPath({
        path: query,
        json: data,
        resultType: 'all', // Returns value, path, pointer, parent, parentProperty
      });

      if (queryResult && queryResult.length > 0) {
        // Create items array with both value and path
        const items = queryResult.map((item: any) => ({
          value: item.value,
          path: convertJsonPathToAppPath(item.path),
        }));

        setResult({
          success: true,
          data: items.map((item: { value: any; path: string }) => item.value),
          count: items.length,
          items: items,
        });
      } else {
        setResult({
          success: true,
          data: [],
          count: 0,
          items: [],
        });
      }
    } catch (error: any) {
      setResult({
        success: false,
        error: error.message || 'Invalid JSONPath query',
      });
    }
  }; */

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      executeQuery();
    }
  };

  const loadExample = (exampleQuery: string) => {
    setQuery(exampleQuery);
    setShowExamples(false);
  };

  const copyResult = (value: any) => {
    navigator.clipboard.writeText(JSON.stringify(value, null, 2));
  };

  const clearResults = () => {
    setResult(null);
    setQuery('');
  };

  return (
    <div className="query-tool">
      <div className="query-tool-header">
        <h2>JSON Query</h2>
        {mode === 'text' && (
          <button
            className="btn-examples"
            onClick={() => setShowExamples(!showExamples)}
          >
            {showExamples ? 'Hide' : 'Show'} Examples
          </button>
        )}
      </div>

      <div className={`examples-panel ${showExamples ? 'show' : ''}`}>
        <div className="examples-panel-content">
          <h3>Example Queries</h3>
          <div className="examples-grid">
            {examples.map((example, index) => (
              <div key={index} className="example-item">
                <button
                  className="btn-example"
                  onClick={() => loadExample(example.query)}
                  title={example.description}
                >
                  <strong>{example.label}</strong>
                  <code>{example.query}</code>
                </button>
              </div>
            ))}
          </div>
          <div className="query-help">
            <p>
              <strong>JSONPath Syntax:</strong>
            </p>
            <ul>
              <li><code>$</code> - Root element</li>
              <li><code>@</code> - Current element (in filters)</li>
              <li><code>*</code> - Wildcard (all elements)</li>
              <li><code>..</code> - Recursive descent</li>
              <li><code>[n]</code> - Array index</li>
              <li><code>[n:m]</code> - Array slice</li>
              <li><code>[?(expression)]</code> - Filter expression</li>
            </ul>
          </div>
        </div>
      </div>

      {/* Mode Tabs */}
      <div className="query-mode-tabs">
        <button 
          className={`mode-tab ${mode === 'text' ? 'active' : ''}`}
          onClick={() => setMode('text')}
        >
          <span className="material-symbols-outlined">code</span>
          <span>Text Query</span>
        </button>
        <button 
          className={`mode-tab ${mode === 'visual' ? 'active' : ''}`}
          onClick={() => setMode('visual')}
        >
          <span className="material-symbols-outlined">view_module</span>
          <span>Visual Builder</span>
        </button>
      </div>

      {/* Text Mode */}
      {mode === 'text' && (
        <div className="query-input-section">
          <div className="query-input-wrapper">
            <input
              type="text"
              className="query-input"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyPress={handleKeyPress}
              placeholder="Enter JSONPath query (e.g., $[?(@.price > 100)])"
            />
            <button className="btn-execute" onClick={executeQuery}>
              Execute
            </button>
          </div>
        </div>
      )}

      {/* Visual Mode */}
      {mode === 'visual' && (
        <div className="visual-query-builder">
          <div className="builder-header">
            <h3>Build Query Visually</h3>
            <button className="btn-add-condition" onClick={addCondition}>
              <span className="material-symbols-outlined">add</span>
              Add Condition
            </button>
          </div>

          {conditions.length > 0 && (
            <>
              <div className="logic-operator-section">
                <label>Match:</label>
                <div className="logic-buttons">
                  <button 
                    className={`btn-logic ${logicOperator === 'AND' ? 'active' : ''}`}
                    onClick={() => setLogicOperator('AND')}
                  >
                    ALL conditions (AND)
                  </button>
                  <button 
                    className={`btn-logic ${logicOperator === 'OR' ? 'active' : ''}`}
                    onClick={() => setLogicOperator('OR')}
                  >
                    ANY condition (OR)
                  </button>
                </div>
              </div>

              <div className="conditions-list">
                {conditions.map((condition, index) => (
                  <div key={condition.id} className="condition-item">
                    <div className="condition-number">{index + 1}</div>
                    <select 
                      className="condition-property"
                      value={condition.property}
                      onChange={(e) => updateCondition(condition.id, 'property', e.target.value)}
                    >
                      {availableProperties.map(prop => (
                        <option key={prop} value={prop}>{prop}</option>
                      ))}
                    </select>
                    <select 
                      className="condition-operator"
                      value={condition.operator}
                      onChange={(e) => updateCondition(condition.id, 'operator', e.target.value)}
                    >
                      <option value="==">equals (==)</option>
                      <option value="!=">not equals (!=)</option>
                      <option value=">">greater than (&gt;)</option>
                      <option value=">=">greater or equal (&gt;=)</option>
                      <option value="<">less than (&lt;)</option>
                      <option value="<=">less or equal (&lt;=)</option>
                      <option value="contains">contains</option>
                      <option value="=~">matches regex (=~)</option>
                    </select>
                    <input 
                      type="text"
                      className="condition-value"
                      value={condition.value}
                      onChange={(e) => updateCondition(condition.id, 'value', e.target.value)}
                      placeholder="Enter value..."
                    />
                    <button 
                      className="btn-remove-condition"
                      onClick={() => removeCondition(condition.id)}
                      title="Remove condition"
                    >
                      <span className="material-symbols-outlined">close</span>
                    </button>
                  </div>
                ))}
              </div>

              <div className="generated-query-section">
                <label>Generated Query:</label>
                <code className="generated-query">{generateJSONPathFromConditions()}</code>
              </div>

              <div className="builder-actions">
                <button className="btn-execute-visual" onClick={executeVisualQuery}>
                  <span className="material-symbols-outlined">play_arrow</span>
                  Execute Query
                </button>
              </div>
            </>
          )}

          {conditions.length === 0 && (
            <div className="empty-builder">
              <span className="material-symbols-outlined">filter_alt</span>
              <p>Click "Add Condition" to start building your query</p>
              <p className="hint">Visually build filters without knowing JSONPath syntax</p>
            </div>
          )}
        </div>
      )}

      {result && (
        <>
          <div className="query-results">
            {result.success ? (
              <>
                <div className="results-header">
                  <h3>
                    Results <span className="result-count">({result.count} {result.count === 1 ? 'match' : 'matches'})</span>
                  </h3>
                  {result.count! > 0 && (
                    <button 
                      className="btn-copy-all" 
                      onClick={() => copyResult(result.data)} 
                      title="Copy all results to clipboard"
                    >
                      Copy All
                    </button>
                  )}
                </div>
                {result.count! > 0 ? (
                  <div className="results-container">
                    {result.items && result.items.map((item, index) => (
                      <div key={index} className="result-item">
                        <div className="result-item-header">
                          <div className="result-item-left">
                            <span className="result-item-number">Result {index + 1}</span>
                            <code 
                              className="result-item-path"
                              onClick={() => onResultClick?.(item.path)}
                              title="Click to highlight in document"
                            >
                              {item.path}
                            </code>
                          </div>
                          <button 
                            className="btn-copy-result" 
                            onClick={() => copyResult(item.value)} 
                            title="Copy this result to clipboard"
                          >
                            Copy
                          </button>
                        </div>
                        <pre className="result-item-value">
                          {JSON.stringify(item.value, null, 2)}
                        </pre>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="no-results">
                    <p>No matches found for this query.</p>
                  </div>
                )}
              </>
            ) : (
              <div className="query-error">
                <h3>Error</h3>
                <p>{result.error}</p>
              </div>
            )}
          </div>
          <div className="query-footer">
            <button className="btn-clear" onClick={clearResults} title="Clear query and results">
              Clear Query & Results
            </button>
          </div>
        </>
      )}
    </div>
  );
};
