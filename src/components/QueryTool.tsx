import React, { useState } from 'react';
import { JSONPath } from 'jsonpath-plus';
import { JsonValue } from '../types';
import { js2xml } from 'xml-js';
import Papa from 'papaparse';
import yaml from 'js-yaml';
import { stringify as tomlStringify } from 'smol-toml';
import './QueryTool.css';

interface QueryToolProps {
  data: JsonValue;
  onResultClick?: (path: string) => void;
  initialState?: {
    mode: 'text' | 'visual';
    query: string;
    result: any;
    conditions: any[];
    logicOperator: 'AND' | 'OR';
  };
  onStateChange?: (state: {
    mode: 'text' | 'visual';
    query: string;
    result: any;
    conditions: any[];
    logicOperator: 'AND' | 'OR';
  }) => void;
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

export const QueryTool: React.FC<QueryToolProps> = ({ data, onResultClick, initialState, onStateChange }) => {
  const [mode, setMode] = useState<QueryMode>(initialState?.mode || 'text');
  const [query, setQuery] = useState<string>(initialState?.query || '');
  const [result, setResult] = useState<QueryResult | null>(initialState?.result || null);
  const [examples, setExamples] = useState<Array<{ label: string; query: string; description: string }>>([]);
  
  // Visual query builder state
  const [conditions, setConditions] = useState<Condition[]>(initialState?.conditions || []);
  const [logicOperator, setLogicOperator] = useState<LogicOperator>(initialState?.logicOperator || 'AND');
  const [availableProperties, setAvailableProperties] = useState<string[]>([]);
  const [propertyValues, setPropertyValues] = useState<Map<string, any[]>>(new Map());

  // Sync state changes back to parent
  React.useEffect(() => {
    if (onStateChange) {
      onStateChange({
        mode,
        query,
        result,
        conditions,
        logicOperator
      });
    }
  }, [mode, query, result, conditions, logicOperator, onStateChange]);

  // Extract unique values for each property
  const extractPropertyValues = (obj: any, prefix = '', depth = 0): Map<string, any[]> => {
    const valuesMap = new Map<string, any[]>();
    
    if (!obj || typeof obj !== 'object' || depth > 5) return valuesMap;
    
    if (Array.isArray(obj)) {
      // For arrays, collect values from all items
      obj.forEach(item => {
        const itemValues = extractPropertyValues(item, prefix, depth);
        itemValues.forEach((values, key) => {
          const existing = valuesMap.get(key) || [];
          valuesMap.set(key, [...existing, ...values]);
        });
      });
    } else {
      // For objects, collect property values
      Object.keys(obj).forEach(key => {
        const fullPath = prefix ? `${prefix}.${key}` : key;
        const value = obj[key];
        
        // Store the value if it's a primitive
        if (value !== null && value !== undefined) {
          if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
            valuesMap.set(fullPath, [value]);
          } else if (typeof value === 'object' && !Array.isArray(value)) {
            // Recurse for nested objects
            const nestedValues = extractPropertyValues(value, fullPath, depth + 1);
            nestedValues.forEach((values, nestedKey) => {
              const existing = valuesMap.get(nestedKey) || [];
              valuesMap.set(nestedKey, [...existing, ...values]);
            });
          } else if (Array.isArray(value)) {
            // For arrays, recurse into items
            const nestedValues = extractPropertyValues(value, fullPath, depth + 1);
            nestedValues.forEach((values, nestedKey) => {
              const existing = valuesMap.get(nestedKey) || [];
              valuesMap.set(nestedKey, [...existing, ...values]);
            });
          }
        }
      });
    }
    
    return valuesMap;
  };

  // Extract available properties from data
  React.useEffect(() => {
    if (data) {
      const properties = extractAllProperties(data);
      setAvailableProperties(properties);
      
      // Extract unique values for each property
      const values = extractPropertyValues(data);
      // Deduplicate values for each property
      const uniqueValues = new Map<string, any[]>();
      values.forEach((vals, key) => {
        const unique = Array.from(new Set(vals)).slice(0, 20); // Limit to 20 unique values
        uniqueValues.set(key, unique);
      });
      setPropertyValues(uniqueValues);
    }
  }, [data]);

  // Generate examples when data changes
  React.useEffect(() => {
    if (data) {
      setExamples(generateExamples(data));
    }
  }, [data]);

  // Extract all property paths from the data
  const extractAllProperties = (obj: any, prefix = '', depth = 0): string[] => {
    const properties: Set<string> = new Set();
    
    if (!obj || typeof obj !== 'object' || depth > 5) return [];
    
    if (Array.isArray(obj)) {
      if (obj.length > 0 && typeof obj[0] === 'object') {
        // Extract from first array item
        return extractAllProperties(obj[0], prefix, depth);
      }
    } else {
      Object.keys(obj).forEach(key => {
        const fullPath = prefix ? `${prefix}.${key}` : key;
        properties.add(fullPath);
        
        const value = obj[key];
        if (value && typeof value === 'object' && !Array.isArray(value)) {
          // Recurse for nested objects
          extractAllProperties(value, fullPath, depth + 1).forEach(p => properties.add(p));
        } else if (Array.isArray(value) && value.length > 0 && typeof value[0] === 'object') {
          // Recurse into arrays of objects
          extractAllProperties(value[0], fullPath, depth + 1).forEach(p => properties.add(p));
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

  // Generate suggestions for visual builder value input
  const generateVisualValueSuggestions = (_conditionId: string, property: string, currentValue: string) => {
    const values = propertyValues.get(property);
    if (!values || values.length === 0) {
      return [];
    }

    // Filter values based on current input
    const filtered = currentValue.trim() === ''
      ? values
      : values.filter(v => 
          String(v).toLowerCase().includes(currentValue.toLowerCase())
        );

    return filtered.slice(0, 15).map(v => ({
      text: String(v),
      description: `Value: ${String(v)}`
    }));
  };

  // Handle value input change in visual builder
  const handleVisualValueChange = (conditionId: string, property: string, value: string, inputElement: HTMLInputElement) => {
    updateCondition(conditionId, 'value', value);
    
    // Generate and show suggestions
    const newSuggestions = generateVisualValueSuggestions(conditionId, property, value);
    setVisualSuggestions(prev => ({ ...prev, [conditionId]: newSuggestions }));
    setActiveVisualInput(newSuggestions.length > 0 ? conditionId : null);
    
    // Calculate position
    if (newSuggestions.length > 0) {
      const rect = inputElement.getBoundingClientRect();
      setSuggestionsPosition({
        top: rect.bottom + 4,
        left: rect.left,
        width: rect.width
      });
    }
  };

  // Apply suggestion in visual builder
  const applyVisualSuggestion = (conditionId: string, suggestionText: string) => {
    updateCondition(conditionId, 'value', suggestionText);
    setVisualSuggestions(prev => ({ ...prev, [conditionId]: [] }));
    setActiveVisualInput(null);
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

      let queryResult;
      
      // Try to execute the query, catching errors from missing nested properties
      try {
        queryResult = JSONPath({
          path: queryToExecute,
          json: data,
          resultType: 'all',
          wrap: false,
        });
      } catch (execError: any) {
        // If error is about missing properties, it means the filter didn't match anything
        const errMsg = execError.message || '';
        if (errMsg.includes('Cannot read propert') || 
            errMsg.includes('undefined is not an object')) {
          queryResult = [];
        } else {
          // Re-throw other errors (actual syntax errors)
          throw execError;
        }
      }

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
  };

  const copyResult = (value: any) => {
    navigator.clipboard.writeText(JSON.stringify(value, null, 2));
  };

  const clearResults = () => {
    setResult(null);
    setQuery('');
  };

  const [showExportMenu, setShowExportMenu] = useState(false);
  const [validationError, setValidationError] = useState<string | null>(null);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [suggestions, setSuggestions] = useState<Array<{text: string, description: string}>>([]);
  const [, setCursorPosition] = useState(0);
  const [suggestionsPosition, setSuggestionsPosition] = useState({ top: 0, left: 0, width: 0 });
  const queryInputRef = React.useRef<HTMLInputElement>(null);
  const [visualSuggestions, setVisualSuggestions] = useState<{[key: string]: Array<{text: string, description: string}>}>({});
  const [activeVisualInput, setActiveVisualInput] = useState<string | null>(null);
  const visualInputRefs = React.useRef<{[key: string]: HTMLInputElement}>({});

  const flattenObject = (obj: any, prefix = ''): any => {
    const flattened: any = {};
    
    for (const key in obj) {
      if (obj.hasOwnProperty(key)) {
        const value = obj[key];
        const newKey = prefix ? `${prefix}.${key}` : key;
        
        if (value === null || value === undefined) {
          flattened[newKey] = '';
        } else if (Array.isArray(value)) {
          flattened[newKey] = JSON.stringify(value);
        } else if (typeof value === 'object') {
          Object.assign(flattened, flattenObject(value, newKey));
        } else {
          flattened[newKey] = value;
        }
      }
    }
    
    return flattened;
  };

  const validateQuery = (queryText: string): string | null => {
    if (!queryText.trim()) return null;

    // Check if query starts with $
    if (!queryText.startsWith('$')) {
      return 'Query must start with $ (root)';
    }

    // Check for unmatched brackets
    const openBrackets = (queryText.match(/\[/g) || []).length;
    const closeBrackets = (queryText.match(/\]/g) || []).length;
    if (openBrackets !== closeBrackets) {
      return 'Unmatched brackets in query';
    }

    // Check for unmatched parentheses in filters
    const openParens = (queryText.match(/\(/g) || []).length;
    const closeParens = (queryText.match(/\)/g) || []).length;
    if (openParens !== closeParens) {
      return 'Unmatched parentheses in filter expression';
    }

    // Check for invalid filter syntax
    const filterMatch = queryText.match(/\[\?\(([^)]+)\)\]/);
    if (filterMatch) {
      const filterExpr = filterMatch[1];
      // Must contain @ for current item
      if (!filterExpr.includes('@')) {
        return 'Filter expression must reference current item with @';
      }
    }

    // Don't validate incomplete queries
    if (queryText.endsWith('(') || queryText.endsWith('[') || queryText.endsWith('.')) {
      return null;
    }

    // For syntax-only validation, just check basic structure
    // Don't execute against data as it may cause false errors for valid queries
    return null;
  };

  const generateSuggestions = (queryText: string, cursorPos: number): Array<{text: string, description: string}> => {
    const suggestions: Array<{text: string, description: string}> = [];
    const textBeforeCursor = queryText.substring(0, cursorPos);
    const lastChar = textBeforeCursor[textBeforeCursor.length - 1];
    const afterDot = textBeforeCursor.match(/\.([^.\[\]\(\)\s<>=!&|"']*?)$/);
    const afterAt = textBeforeCursor.match(/@\.([^.\[\]\(\)\s<>=!&|"']*?)$/);
    
    // Check if we're inside quotes after an operator and property (support nested paths)
    const insideQuotes = textBeforeCursor.match(/@\.((?:[\w]+\.)*[\w]+)\s*[=!<>]+\s*["']([^"]*)$/);
    const afterOperator = textBeforeCursor.match(/@\.((?:[\w]+\.)*[\w]+)\s*[=!<>]+\s*$/);

    // If typing after @ in a filter
    if (afterAt && availableProperties.length > 0) {
      const partial = afterAt[1].toLowerCase();
      const currentPath = partial.substring(0, partial.lastIndexOf('.') + 1);
      const searchTerm = partial.substring(partial.lastIndexOf('.') + 1);
      
      availableProperties
        .filter(prop => {
          // For nested properties, show completions for the current level
          if (currentPath) {
            return prop.toLowerCase().startsWith(partial);
          }
          // For root level, show all matches
          return prop.toLowerCase().startsWith(searchTerm);
        })
        .slice(0, 15)
        .forEach(prop => {
          suggestions.push({
            text: prop,
            description: `Property: ${prop}`
          });
        });
    }
    // If typing after . for property access
    else if (afterDot && availableProperties.length > 0) {
      const partial = afterDot[1].toLowerCase();
      
      // Try to find what prefix was before this dot
      const beforeDot = textBeforeCursor.substring(0, textBeforeCursor.lastIndexOf('.'));
      const pathMatch = beforeDot.match(/@\.([\w.]+)$/);
      const basePath = pathMatch ? pathMatch[1] + '.' : '';
      
      availableProperties
        .filter(prop => {
          if (basePath) {
            // Show properties that start with basePath + partial
            return prop.toLowerCase().startsWith((basePath + partial).toLowerCase());
          }
          return prop.toLowerCase().startsWith(partial);
        })
        .slice(0, 15)
        .forEach(prop => {
          suggestions.push({
            text: basePath ? prop.substring(basePath.length) : prop,
            description: `Property: ${prop}`
          });
        });
    }
    // If at the start or after $ or [
    else if (queryText === '$' || lastChar === '$' || lastChar === '[') {
      suggestions.push(
        { text: '[*]', description: 'All elements in array' },
        { text: '[0]', description: 'First element' },
        { text: '[?(@', description: 'Start filter expression' },
        { text: '..', description: 'Recursive descent' }
      );

      // Add top-level properties
      if (availableProperties.length > 0 && lastChar !== '[') {
        availableProperties
          .filter(prop => !prop.includes('.'))
          .slice(0, 5)
          .forEach(prop => {
            suggestions.push({
              text: `.${prop}`,
              description: `Property: ${prop}`
            });
          });
      }
    }
    // If in a filter expression
    else if (textBeforeCursor.includes('[?(') && !textBeforeCursor.match(/\[\?\([^)]+\)\]/)) {
      if (lastChar === '@') {
        suggestions.push(
          { text: '.', description: 'Access property' }
        );
      } else if (textBeforeCursor.match(/@\.[^\s<>=!&|]*$/)) {
        suggestions.push(
          { text: ' == ', description: 'Equals' },
          { text: ' != ', description: 'Not equals' },
          { text: ' > ', description: 'Greater than' },
          { text: ' < ', description: 'Less than' },
          { text: ' >= ', description: 'Greater or equal' },
          { text: ' <= ', description: 'Less or equal' },
          { text: ' =~ /', description: 'Regex match' }
        );
      } else if (afterOperator || insideQuotes) {
        // Extract the property name (support nested paths)
        const propertyMatch = textBeforeCursor.match(/@\.((?:[\w]+\.)*[\w]+)/);
        if (propertyMatch) {
          const propName = propertyMatch[1];
          const values = propertyValues.get(propName);
          
          if (values && values.length > 0) {
            // Get partial value if inside quotes
            const partial = insideQuotes ? insideQuotes[2].toLowerCase() : '';
            
            // Suggest actual values from the data
            values
              .filter(val => {
                if (!partial) return true;
                return String(val).toLowerCase().includes(partial);
              })
              .slice(0, 10)
              .forEach(val => {
                const isString = typeof val === 'string';
                const displayValue = isString ? `"${val}"` : String(val);
                const insertValue = insideQuotes ? String(val) : displayValue;
                suggestions.push({
                  text: insertValue,
                  description: `Existing value in ${propName}`
                });
              });
          }
        }
        
        // Also suggest generic value types if no specific values or at the end
        if (afterOperator && suggestions.length === 0) {
          suggestions.push(
            { text: '""', description: 'String value' },
            { text: '0', description: 'Number value' },
            { text: 'true', description: 'Boolean true' },
            { text: 'false', description: 'Boolean false' }
          );
        }
      }
    }

    return suggestions;
  };

  const handleQueryChange = (newQuery: string) => {
    setQuery(newQuery);
    
    // Validate in real-time
    const error = validateQuery(newQuery);
    setValidationError(error);

    // Generate suggestions
    if (queryInputRef.current) {
      const cursorPos = queryInputRef.current.selectionStart || 0;
      setCursorPosition(cursorPos);
      const newSuggestions = generateSuggestions(newQuery, cursorPos);
      setSuggestions(newSuggestions);
      setShowSuggestions(newSuggestions.length > 0 && newQuery.length > 0);
      
      // Calculate position for fixed dropdown
      if (newSuggestions.length > 0 && newQuery.length > 0) {
        const rect = queryInputRef.current.getBoundingClientRect();
        setSuggestionsPosition({
          top: rect.bottom + 4,
          left: rect.left,
          width: rect.width
        });
      }
    }
  };

  const applySuggestion = (suggestionText: string) => {
    if (!queryInputRef.current) return;

    const selectionStart = queryInputRef.current.selectionStart || 0;
    const selectionEnd = queryInputRef.current.selectionEnd || 0;
    const hasSelection = selectionStart !== selectionEnd;

    let newQuery = '';
    let newCursorPos = selectionStart;
    
    if (hasSelection) {
      // If there's a selection, replace the selected text
      const textBeforeSelection = query.substring(0, selectionStart);
      const textAfterSelection = query.substring(selectionEnd);
      
      // Check if we're replacing a value inside quotes
      const insideQuotesMatch = textBeforeSelection.match(/@\.((?:[\w]+\.)*[\w]+)\s*[=!<>]+\s*["']$/);
      if (insideQuotesMatch && textAfterSelection.match(/^[^"']*["']/)) {
        // We're replacing text inside quotes
        newQuery = textBeforeSelection + suggestionText + textAfterSelection;
        newCursorPos = textBeforeSelection.length + suggestionText.length;
      } else {
        // Just replace the selected text
        newQuery = textBeforeSelection + suggestionText + textAfterSelection;
        newCursorPos = textBeforeSelection.length + suggestionText.length;
      }
    } else {
      // No selection - insert at cursor position
      const textBeforeCursor = query.substring(0, selectionStart);
      const textAfterCursor = query.substring(selectionStart);

      // Check if we're inside quotes (for value suggestions)
      const insideQuotesMatch = textBeforeCursor.match(/@\.((?:[\w]+\.)*[\w]+)\s*[=!<>]+\s*["']([^"]*)$/);
      if (insideQuotesMatch) {
        // Replace the partial value inside quotes
        const partialValue = insideQuotesMatch[2];
        const beforePartial = textBeforeCursor.substring(0, textBeforeCursor.length - partialValue.length);
        newQuery = beforePartial + suggestionText + textAfterCursor;
        newCursorPos = beforePartial.length + suggestionText.length;
      }
      // Check what we're replacing
      else if (textBeforeCursor.match(/\.([^.\[\]\(\)\s<>=!&|"']*?)$/)) {
        // Replace after dot
        const match = textBeforeCursor.match(/\.([^.\[\]\(\)\s<>=!&|"']*?)$/);
        if (match) {
          const partialProp = match[1];
          const beforePartial = textBeforeCursor.substring(0, textBeforeCursor.length - partialProp.length);
          newQuery = beforePartial + suggestionText + textAfterCursor;
          newCursorPos = beforePartial.length + suggestionText.length;
        }
      } else if (textBeforeCursor.match(/@\.([^.\[\]\(\)\s<>=!&|"']*?)$/)) {
        // Replace after @.
        const match = textBeforeCursor.match(/@\.([^.\[\]\(\)\s<>=!&|"']*?)$/);
        if (match) {
          const partialProp = match[1];
          const beforePartial = textBeforeCursor.substring(0, textBeforeCursor.length - partialProp.length);
          newQuery = beforePartial + suggestionText + textAfterCursor;
          newCursorPos = beforePartial.length + suggestionText.length;
        }
      } else {
        // Just insert at cursor
        newQuery = textBeforeCursor + suggestionText + textAfterCursor;
        newCursorPos = selectionStart + suggestionText.length;
      }
    }

    setQuery(newQuery);
    setShowSuggestions(false);
    
    // Set cursor position after insertion
    setTimeout(() => {
      if (queryInputRef.current) {
        queryInputRef.current.focus();
        queryInputRef.current.setSelectionRange(newCursorPos, newCursorPos);
      }
    }, 0);
  };

  const exportResults = (format: 'json' | 'csv' | 'xml' | 'yaml' | 'toml') => {
    if (!result?.data) return;

    let content = '';
    let filename = `query-results.${format}`;
    let mimeType = 'text/plain';

    try {
      switch (format) {
        case 'json':
          content = JSON.stringify(result.data, null, 2);
          mimeType = 'application/json';
          break;

        case 'csv':
          let dataForCsv: any[] = [];
          if (Array.isArray(result.data)) {
            dataForCsv = result.data.map(item => 
              typeof item === 'object' && item !== null ? flattenObject(item) : { value: item }
            );
          } else if (typeof result.data === 'object' && result.data !== null) {
            dataForCsv = [flattenObject(result.data)];
          } else {
            throw new Error('CSV export requires array or object data');
          }
          content = Papa.unparse(dataForCsv, { header: true, skipEmptyLines: true });
          mimeType = 'text/csv';
          break;

        case 'xml':
          const wrappedData = { results: result.data };
          content = js2xml(wrappedData, { compact: true, spaces: 2 });
          mimeType = 'application/xml';
          break;

        case 'yaml':
          content = yaml.dump(result.data, { indent: 2, lineWidth: -1, noRefs: true });
          mimeType = 'application/x-yaml';
          break;

        case 'toml':
          const dataForToml = Array.isArray(result.data) 
            ? { results: result.data }
            : result.data;
          content = tomlStringify(dataForToml);
          mimeType = 'application/toml';
          break;
      }

      const blob = new Blob([content], { type: mimeType });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = filename;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
      setShowExportMenu(false);
    } catch (err) {
      console.error('Export failed:', err);
      alert(`Export failed: ${err instanceof Error ? err.message : 'Unknown error'}`);
    }
  };

  return (
    <div className="query-tool">
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

      {/* Examples Panel - only in text mode */}
      {mode === 'text' && (
        <div className="examples-panel show">
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
      )}

      {/* Text Mode */}
      {mode === 'text' && (
        <div className="query-input-section">
          <div className="query-input-wrapper">
            <div className="input-with-validation">
              <input
                ref={queryInputRef}
                type="text"
                className={`query-input ${validationError ? 'has-error' : ''}`}
                value={query}
                onChange={(e) => handleQueryChange(e.target.value)}
                onKeyPress={handleKeyPress}
                onFocus={(e) => {
                  if (query.length > 0 && suggestions.length > 0) {
                    setShowSuggestions(true);
                    // Update position on focus
                    const rect = e.currentTarget.getBoundingClientRect();
                    setSuggestionsPosition({
                      top: rect.bottom + 4,
                      left: rect.left,
                      width: rect.width
                    });
                  }
                }}
                onBlur={() => {
                  // Delay to allow clicking on suggestions
                  setTimeout(() => setShowSuggestions(false), 200);
                }}
                onClick={(e) => {
                  const input = e.target as HTMLInputElement;
                  const cursorPos = input.selectionStart || 0;
                  setCursorPosition(cursorPos);
                  const newSuggestions = generateSuggestions(query, cursorPos);
                  setSuggestions(newSuggestions);
                  setShowSuggestions(newSuggestions.length > 0 && query.length > 0);
                  
                  // Calculate position for fixed dropdown
                  if (newSuggestions.length > 0 && query.length > 0) {
                    const rect = input.getBoundingClientRect();
                    setSuggestionsPosition({
                      top: rect.bottom + 4,
                      left: rect.left,
                      width: rect.width
                    });
                  }
                }}
                placeholder="Enter JSONPath query (e.g., $[?(@.price > 100)])"
              />
              {validationError && (
                <div className="validation-error">
                  <span className="material-symbols-outlined">error</span>
                  {validationError}
                </div>
              )}
              {showSuggestions && suggestions.length > 0 && (
                <div 
                  className="autocomplete-suggestions"
                  style={{
                    top: `${suggestionsPosition.top}px`,
                    left: `${suggestionsPosition.left}px`,
                    width: `${suggestionsPosition.width}px`
                  }}
                >
                  {suggestions.map((suggestion, index) => (
                    <button
                      key={index}
                      className="suggestion-item"
                      onMouseDown={(e) => {
                        e.preventDefault();
                        applySuggestion(suggestion.text);
                      }}
                    >
                      <span className="suggestion-text">{suggestion.text}</span>
                      <span className="suggestion-description">{suggestion.description}</span>
                    </button>
                  ))}
                </div>
              )}
            </div>
            <button className="btn-execute" onClick={executeQuery} disabled={!!validationError}>
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
                    <div className="visual-value-wrapper" style={{ position: 'relative' }}>
                      <input 
                        ref={(el) => {
                          if (el) visualInputRefs.current[condition.id] = el;
                        }}
                        type="text"
                        className="condition-value"
                        value={condition.value}
                        onChange={(e) => handleVisualValueChange(condition.id, condition.property, e.target.value, e.target)}
                        onFocus={(e) => {
                          const suggestions = generateVisualValueSuggestions(condition.id, condition.property, condition.value);
                          setVisualSuggestions(prev => ({ ...prev, [condition.id]: suggestions }));
                          if (suggestions.length > 0) {
                            setActiveVisualInput(condition.id);
                            const rect = e.target.getBoundingClientRect();
                            setSuggestionsPosition({
                              top: rect.bottom + 4,
                              left: rect.left,
                              width: rect.width
                            });
                          }
                        }}
                        onBlur={() => {
                          setTimeout(() => {
                            setActiveVisualInput(null);
                            setVisualSuggestions(prev => ({ ...prev, [condition.id]: [] }));
                          }, 200);
                        }}
                        placeholder="Enter value..."
                      />
                      {activeVisualInput === condition.id && visualSuggestions[condition.id]?.length > 0 && (
                        <div 
                          className="autocomplete-suggestions"
                          style={{
                            top: `${suggestionsPosition.top}px`,
                            left: `${suggestionsPosition.left}px`,
                            width: `${suggestionsPosition.width}px`
                          }}
                        >
                          {visualSuggestions[condition.id].map((suggestion, idx) => (
                            <button
                              key={idx}
                              className="suggestion-item"
                              onMouseDown={(e) => {
                                e.preventDefault();
                                applyVisualSuggestion(condition.id, suggestion.text);
                              }}
                            >
                              <span className="suggestion-text">{suggestion.text}</span>
                              <span className="suggestion-description">{suggestion.description}</span>
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
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
                    <div className="results-actions">
                      <button 
                        className="btn-copy-all" 
                        onClick={() => copyResult(result.data)} 
                        title="Copy all results to clipboard"
                      >
                        <span className="material-symbols-outlined">content_copy</span>
                        Copy
                      </button>
                      <div className="export-dropdown">
                        <button 
                          className="btn-export" 
                          onClick={() => setShowExportMenu(!showExportMenu)}
                          title="Export results"
                        >
                          <span className="material-symbols-outlined">download</span>
                          Export
                          <span className="material-symbols-outlined">{showExportMenu ? 'expand_less' : 'expand_more'}</span>
                        </button>
                        {showExportMenu && (
                          <div className="export-menu">
                            <button onClick={() => exportResults('json')} className="export-option">
                              <span className="material-symbols-outlined">data_object</span>
                              Export as JSON
                            </button>
                            <button onClick={() => exportResults('csv')} className="export-option">
                              <span className="material-symbols-outlined">table_chart</span>
                              Export as CSV
                            </button>
                            <button onClick={() => exportResults('xml')} className="export-option">
                              <span className="material-symbols-outlined">code</span>
                              Export as XML
                            </button>
                            <button onClick={() => exportResults('yaml')} className="export-option">
                              <span className="material-symbols-outlined">description</span>
                              Export as YAML
                            </button>
                            <button onClick={() => exportResults('toml')} className="export-option">
                              <span className="material-symbols-outlined">settings</span>
                              Export as TOML
                            </button>
                          </div>
                        )}
                      </div>
                    </div>
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
