import React, { useState, useEffect } from 'react';
import { Editor } from '@monaco-editor/react';
import { useTheme } from '../contexts/ThemeContext';
import SwaggerParser from '@apidevtools/swagger-parser';
import type { OpenAPI } from 'openapi-types';
import './ApiImportView.css';

interface ApiImportViewProps {
  onImport: (data: any, metadata?: { url: string; method: string; timestamp: number }) => void;
  onClose: () => void;
  isStandalone?: boolean; // When shown on home page vs in-app
}

interface HeaderRow {
  id: string;
  key: string;
  value: string;
  enabled: boolean;
}

interface SavedRequest {
  id: string;
  name: string;
  url: string;
  method: string;
  headers: HeaderRow[];
  body: string;
  authType: string;
  authToken: string;
  timestamp: number;
}

type HttpMethod = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE' | 'HEAD' | 'OPTIONS';
type AuthType = 'none' | 'bearer' | 'basic' | 'api-key';
type BodyType = 'none' | 'json' | 'text' | 'form';

interface OpenApiEndpoint {
  path: string;
  method: string;
  summary?: string;
  description?: string;
  operationId?: string;
  tags?: string[];
  parameters?: any[];
  requestBody?: any;
  security?: any[];
}

export const ApiImportView: React.FC<ApiImportViewProps> = ({ onImport, onClose, isStandalone = false }) => {
  const { theme } = useTheme();
  
  // Request configuration
  const [url, setUrl] = useState('');
  const [method, setMethod] = useState<HttpMethod>('GET');
  const [authType, setAuthType] = useState<AuthType>('none');
  const [authToken, setAuthToken] = useState('');
  const [authUsername, setAuthUsername] = useState('');
  const [authPassword, setAuthPassword] = useState('');
  const [apiKeyHeader, setApiKeyHeader] = useState('X-API-Key');
  const [apiKeyValue, setApiKeyValue] = useState('');
  
  // Headers
  const [headers, setHeaders] = useState<HeaderRow[]>([
    { id: '1', key: '', value: '', enabled: true }
  ]);
  
  // Body
  const [bodyType, setBodyType] = useState<BodyType>('none');
  const [requestBody, setRequestBody] = useState('');
  
  // Response
  const [response, setResponse] = useState<any>(null);
  const [responseText, setResponseText] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [responseStatus, setResponseStatus] = useState<number | null>(null);
  const [responseTime, setResponseTime] = useState<number | null>(null);
  
  // Auto-refresh
  const [autoRefresh, setAutoRefresh] = useState(false);
  const [refreshInterval, setRefreshInterval] = useState(5);
  const [refreshTimer, setRefreshTimer] = useState<NodeJS.Timeout | null>(null);
  
  // History & Saved Requests
  const [urlHistory, setUrlHistory] = useState<string[]>([]);
  const [savedRequests, setSavedRequests] = useState<SavedRequest[]>([]);
  const [showHistory, setShowHistory] = useState(false);
  const [showSaveDialog, setShowSaveDialog] = useState(false);
  const [saveName, setSaveName] = useState('');
  
  // Active tab
  const [activeTab, setActiveTab] = useState<'auth' | 'headers' | 'body' | 'options' | 'openapi'>('auth');
  
  // OpenAPI state
  const [openApiUrl, setOpenApiUrl] = useState('');
  const [openApiBaseUrl, setOpenApiBaseUrl] = useState('');
  const [openApiSpec, setOpenApiSpec] = useState<OpenAPI.Document | null>(null);
  const [openApiEndpoints, setOpenApiEndpoints] = useState<OpenApiEndpoint[]>([]);
  const [loadingSpec, setLoadingSpec] = useState(false);
  const [specError, setSpecError] = useState<string | null>(null);
  const [expandedTags, setExpandedTags] = useState<Set<string>>(new Set());
  const [endpointSearch, setEndpointSearch] = useState('');
  const [selectedEndpoint, setSelectedEndpoint] = useState<OpenApiEndpoint | null>(null);
  const [endpointParams, setEndpointParams] = useState<{[key: string]: string}>({});

  // Load saved data from localStorage
  useEffect(() => {
    const history = localStorage.getItem('api-url-history');
    if (history) {
      setUrlHistory(JSON.parse(history));
    }
    
    const saved = localStorage.getItem('api-saved-requests');
    if (saved) {
      setSavedRequests(JSON.parse(saved));
    }

    // Restore API import state
    const savedState = localStorage.getItem('api-import-state');
    if (savedState) {
      try {
        const state = JSON.parse(savedState);
        
        // Restore request configuration
        if (state.url) setUrl(state.url);
        if (state.method) setMethod(state.method);
        if (state.authType) setAuthType(state.authType);
        if (state.authToken) setAuthToken(state.authToken);
        if (state.authUsername) setAuthUsername(state.authUsername);
        if (state.authPassword) setAuthPassword(state.authPassword);
        if (state.apiKeyHeader) setApiKeyHeader(state.apiKeyHeader);
        if (state.apiKeyValue) setApiKeyValue(state.apiKeyValue);
        if (state.headers) setHeaders(state.headers);
        if (state.bodyType) setBodyType(state.bodyType);
        if (state.requestBody) setRequestBody(state.requestBody);
        
        // Restore OpenAPI state
        if (state.openApiUrl) setOpenApiUrl(state.openApiUrl);
        if (state.openApiBaseUrl) setOpenApiBaseUrl(state.openApiBaseUrl);
        if (state.endpointSearch) setEndpointSearch(state.endpointSearch);
        // Note: openApiSpec not restored due to circular references
        // User can click "Load Spec" again if needed
        if (state.openApiEndpoints && state.openApiEndpoints.length > 0) {
          setOpenApiEndpoints(state.openApiEndpoints);
        }
        if (state.expandedTags) setExpandedTags(new Set(state.expandedTags));
      } catch (e) {
        console.error('Failed to restore API import state:', e);
      }
    }
  }, []);

  // Auto-refresh effect
  useEffect(() => {
    if (autoRefresh && url && !isLoading) {
      const timer = setInterval(() => {
        sendRequest();
      }, refreshInterval * 1000);
      setRefreshTimer(timer);
      
      return () => {
        clearInterval(timer);
      };
    } else if (refreshTimer) {
      clearInterval(refreshTimer);
      setRefreshTimer(null);
    }
  }, [autoRefresh, refreshInterval, url]);

  // Save state to localStorage whenever it changes
  useEffect(() => {
    try {
      const state = {
        url,
        method,
        authType,
        authToken,
        authUsername,
        authPassword,
        apiKeyHeader,
        apiKeyValue,
        headers,
        bodyType,
        requestBody,
        openApiUrl,
        openApiBaseUrl,
        endpointSearch,
        // Don't save openApiSpec - has circular references
        // Save only the endpoint data we need (including parameters, requestBody, security)
        openApiEndpoints: openApiEndpoints.map(e => ({
          path: e.path,
          method: e.method,
          summary: e.summary,
          description: e.description,
          operationId: e.operationId,
          tags: e.tags,
          parameters: e.parameters,
          requestBody: e.requestBody,
          security: e.security,
        })),
        expandedTags: Array.from(expandedTags),
      };
      
      localStorage.setItem('api-import-state', JSON.stringify(state));
    } catch (e) {
      // Ignore JSON serialization errors
      console.warn('Failed to save API import state:', e);
    }
  }, [
    url,
    method,
    authType,
    authToken,
    authUsername,
    authPassword,
    apiKeyHeader,
    apiKeyValue,
    headers,
    bodyType,
    requestBody,
    openApiUrl,
    openApiBaseUrl,
    endpointSearch,
    openApiEndpoints,
    expandedTags,
  ]);

  // Add header row
  const addHeader = () => {
    setHeaders([...headers, { 
      id: Date.now().toString(), 
      key: '', 
      value: '', 
      enabled: true 
    }]);
  };

  // Remove header row
  const removeHeader = (id: string) => {
    setHeaders(headers.filter(h => h.id !== id));
  };

  // Update header
  const updateHeader = (id: string, field: 'key' | 'value' | 'enabled', value: string | boolean) => {
    setHeaders(headers.map(h => 
      h.id === id ? { ...h, [field]: value } : h
    ));
  };

  // Build request headers
  const buildHeaders = (): Record<string, string> => {
    const headerObj: Record<string, string> = {};
    
    // Add custom headers
    headers.forEach(h => {
      if (h.enabled && h.key.trim() && h.value.trim()) {
        headerObj[h.key.trim()] = h.value.trim();
      }
    });
    
    // Add auth headers
    if (authType === 'bearer' && authToken) {
      headerObj['Authorization'] = `Bearer ${authToken}`;
    } else if (authType === 'basic' && authUsername && authPassword) {
      const encoded = btoa(`${authUsername}:${authPassword}`);
      headerObj['Authorization'] = `Basic ${encoded}`;
    } else if (authType === 'api-key' && apiKeyHeader && apiKeyValue) {
      headerObj[apiKeyHeader] = apiKeyValue;
    }
    
    // Add content-type for body
    if (bodyType === 'json' && !headerObj['Content-Type']) {
      headerObj['Content-Type'] = 'application/json';
    } else if (bodyType === 'form' && !headerObj['Content-Type']) {
      headerObj['Content-Type'] = 'application/x-www-form-urlencoded';
    }
    
    return headerObj;
  };

  // Send API request
  const sendRequest = async () => {
    if (!url.trim()) {
      setError('Please enter a URL');
      return;
    }

    setIsLoading(true);
    setError(null);
    setResponse(null);
    setResponseText('');
    setResponseStatus(null);
    const startTime = Date.now();

    try {
      const requestHeaders = buildHeaders();
      
      // Check if running in Electron for CORS-free requests
      const isElectron = typeof window !== 'undefined' && window.electron;
      
      if (isElectron) {
        // Use Electron's HTTP request (no CORS!)
        const body = ['POST', 'PUT', 'PATCH'].includes(method) && bodyType !== 'none' 
          ? requestBody 
          : undefined;
          
        const electronResponse = await window.electron!.httpRequest({
          url,
          method,
          headers: requestHeaders,
          body,
          timeout: 30000,
        });
        
        // Check for error response
        if ((electronResponse as any).error) {
          throw new Error((electronResponse as any).message || 'Request failed');
        }
        
        const endTime = Date.now();
        setResponseStatus(electronResponse.status);
        setResponseTime(endTime - startTime);
        setResponseText(electronResponse.data);

        try {
          const json = JSON.parse(electronResponse.data);
          setResponse(json);
          
          // Save to history
          const newHistory = [url, ...urlHistory.filter(u => u !== url)].slice(0, 10);
          setUrlHistory(newHistory);
          localStorage.setItem('api-url-history', JSON.stringify(newHistory));
          
        } catch (e) {
          setError('Response is not valid JSON. Check the Response tab.');
        }
      } else {
        // Use regular fetch (browser - CORS applies)
        const options: RequestInit = {
          method,
          headers: requestHeaders,
        };

        // Add body for methods that support it
        if (['POST', 'PUT', 'PATCH'].includes(method) && bodyType !== 'none') {
          options.body = requestBody;
        }

        const response = await fetch(url, options);
        const endTime = Date.now();
        
        setResponseStatus(response.status);
        setResponseTime(endTime - startTime);

        // Try to parse as JSON
        const text = await response.text();
        setResponseText(text);

        try {
          const json = JSON.parse(text);
          setResponse(json);
          
          // Save to history
          const newHistory = [url, ...urlHistory.filter(u => u !== url)].slice(0, 10);
          setUrlHistory(newHistory);
          localStorage.setItem('api-url-history', JSON.stringify(newHistory));
          
        } catch (e) {
          setError('Response is not valid JSON. Check the Response tab.');
        }
      }

    } catch (err: any) {
      const errorMsg = err.message || 'Failed to fetch data';
      const corsHint = typeof window !== 'undefined' && !window.electron 
        ? ' Use the desktop app for CORS-free requests.' 
        : '';
      setError(errorMsg + corsHint);
      setIsLoading(false);
      setResponseTime(Date.now() - startTime);
    } finally {
      setIsLoading(false);
    }
  };

  // Load OpenAPI spec
  const loadOpenApiSpec = async () => {
    if (!openApiUrl.trim()) {
      setSpecError('Please enter an OpenAPI spec URL');
      return;
    }

    // Clear previous state
    setLoadingSpec(true);
    setSpecError(null);
    setOpenApiSpec(null);
    setOpenApiEndpoints([]);
    setSelectedEndpoint(null);
    setEndpointParams({});
    setExpandedTags(new Set());

    try {
      // Fetch the spec using CORS-free method in Electron
      let specText: string;
      const isElectron = typeof window !== 'undefined' && window.electron;
      
      if (isElectron) {
        // Use Electron's CORS-free HTTP
        const response = await window.electron!.httpRequest({
          url: openApiUrl,
          method: 'GET',
          headers: { 
            'Accept': 'application/json, application/yaml, text/yaml',
            'Cache-Control': 'no-cache'
          },
          timeout: 30000,
        });
        
        if ((response as any).error) {
          throw new Error((response as any).message || 'Failed to fetch spec');
        }
        
        specText = response.data;
      } else {
        // Browser - use fetch (CORS applies) with cache busting
        const cacheBuster = `${openApiUrl.includes('?') ? '&' : '?'}_t=${Date.now()}`;
        const response = await fetch(openApiUrl + cacheBuster, {
          cache: 'no-store',
          headers: {
            'Accept': 'application/json, application/yaml, text/yaml',
          }
        });
        if (!response.ok) {
          throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        }
        specText = await response.text();
      }

      // Parse the spec (supports both JSON and YAML)
      let specJson: any;
      try {
        specJson = JSON.parse(specText);
      } catch (e) {
        // If not JSON, try parsing as YAML using swagger-parser
        specJson = await SwaggerParser.parse(specText);
      }

      // Validate the parsed spec
      const api = await SwaggerParser.validate(specJson) as OpenAPI.Document;
      setOpenApiSpec(api);

      // Extract endpoints
      const endpoints: OpenApiEndpoint[] = [];
      const paths = (api as any).paths || {};

      Object.keys(paths).forEach(path => {
        const pathItem = paths[path];
        // Path-level parameters apply to all operations
        const pathLevelParams = pathItem.parameters || [];
        
        ['get', 'post', 'put', 'patch', 'delete', 'head', 'options'].forEach(method => {
          if (pathItem[method]) {
            const operation = pathItem[method];
            // Merge path-level and operation-level parameters
            const operationParams = operation.parameters || [];
            const allParams = [...pathLevelParams, ...operationParams];
            
            endpoints.push({
              path,
              method: method.toUpperCase(),
              summary: operation.summary,
              description: operation.description,
              operationId: operation.operationId,
              tags: operation.tags || ['default'],
              parameters: allParams.length > 0 ? allParams : undefined,
              requestBody: operation.requestBody,
              security: operation.security,
            });
          }
        });
      });

      setOpenApiEndpoints(endpoints);
      
      // Expand all tags by default
      const allTags = new Set(endpoints.flatMap(e => e.tags || ['default']));
      setExpandedTags(allTags);
      
      // Auto-populate base URL if not already set
      if (!openApiBaseUrl) {
        try {
          const specUrlObj = new URL(openApiUrl);
          const baseUrl = `${specUrlObj.protocol}//${specUrlObj.host}`;
          setOpenApiBaseUrl(baseUrl);
        } catch (e) {
          // Invalid URL, ignore
        }
      }
      
      setLoadingSpec(false);
    } catch (err: any) {
      setSpecError(err.message || 'Failed to load OpenAPI spec');
      setLoadingSpec(false);
    }
  };

  // Use selected endpoint - show parameter form
  const useEndpoint = (endpoint: OpenApiEndpoint) => {
    setSelectedEndpoint(endpoint);
    
    // Initialize parameters with default/example values
    const initialParams: {[key: string]: string} = {};
    if (endpoint.parameters) {
      endpoint.parameters.forEach((param: any) => {
        const schema = param.schema || {};
        const example = param.example || schema.example || schema.default;
        let defaultValue = example !== undefined ? String(example) : '';
        
        if (!defaultValue) {
          if (schema.type === 'string') defaultValue = schema.enum?.[0] || '';
          else if (schema.type === 'number' || schema.type === 'integer') defaultValue = String(schema.enum?.[0] || 0);
          else if (schema.type === 'boolean') defaultValue = 'false';
        }
        
        initialParams[param.name] = defaultValue;
      });
    }
    setEndpointParams(initialParams);
  };

  // Apply endpoint with user-provided parameter values
  const applyEndpointParams = () => {
    if (!selectedEndpoint) return;
    
    const endpoint = selectedEndpoint;
    const spec = openApiSpec as any;
    
    // Get base URL - prefer user-specified base URL, then spec servers, then spec host
    let baseUrl = openApiBaseUrl;
    
    if (!baseUrl) {
      if (spec?.servers && spec.servers.length > 0) {
        baseUrl = spec.servers[0].url;
      } else if (spec?.host) {
        // OpenAPI v2
        const scheme = spec.schemes?.[0] || 'https';
        const basePath = spec.basePath || '';
        baseUrl = `${scheme}://${spec.host}${basePath}`;
      }
    }

    // Set method
    setMethod(endpoint.method as HttpMethod);

    // Process parameters with user-provided values
    let urlPath = endpoint.path;
    const queryParams: string[] = [];
    const newHeaders: Array<{ id: string; key: string; value: string; enabled: boolean }> = [];
    
    if (endpoint.parameters && endpoint.parameters.length > 0) {
      endpoint.parameters.forEach((param: any) => {
        const paramName = param.name;
        const required = param.required || false;
        const userValue = endpointParams[paramName] || '';

        // Apply parameter based on location
        if (param.in === 'path') {
          // Replace path parameter placeholder
          urlPath = urlPath.replace(`{${paramName}}`, encodeURIComponent(userValue));
        } else if (param.in === 'query') {
          // Add query parameter if has value or is required
          if (userValue || required) {
            queryParams.push(`${paramName}=${encodeURIComponent(userValue)}`);
          }
        } else if (param.in === 'header') {
          // Add header (skip auth headers as they're handled separately)
          if (paramName.toLowerCase() !== 'authorization' && userValue) {
            newHeaders.push({
              id: Date.now().toString() + Math.random(),
              key: paramName,
              value: userValue,
              enabled: true
            });
          }
        }
      });
    }

    // Build final URL with query parameters
    let finalUrl = `${baseUrl}${urlPath}`;
    if (queryParams.length > 0) {
      finalUrl += (finalUrl.includes('?') ? '&' : '?') + queryParams.join('&');
    }
    setUrl(finalUrl);

    // Merge with existing headers
    if (newHeaders.length > 0) {
      const existingHeaders = headers.filter(h => h.key && h.value);
      setHeaders([...existingHeaders, ...newHeaders]);
    }

    // Extract and set auth
    if (endpoint.security && endpoint.security.length > 0) {
      const securityScheme = Object.keys(endpoint.security[0])[0];
      const securityDef = (spec?.components?.securitySchemes || spec?.securityDefinitions)?.[securityScheme];
      
      if (securityDef) {
        if (securityDef.type === 'http' && securityDef.scheme === 'bearer') {
          setAuthType('bearer');
        } else if (securityDef.type === 'http' && securityDef.scheme === 'basic') {
          setAuthType('basic');
        } else if (securityDef.type === 'apiKey') {
          setAuthType('api-key');
          setApiKeyHeader(securityDef.name || 'X-API-Key');
        }
      }
    }

    // Set request body if present
    if (endpoint.requestBody) {
      const content = endpoint.requestBody.content;
      if (content?.['application/json']?.schema) {
        setBodyType('json');
        // Resolve schema references and generate example
        const schema = resolveSchemaRefs(content['application/json'].schema, spec);
        const example = generateExampleFromSchema(schema);
        setRequestBody(JSON.stringify(example, null, 2));
      }
    } else if (['POST', 'PUT', 'PATCH'].includes(endpoint.method)) {
      setBodyType('json');
      setRequestBody('{}');
    } else {
      setBodyType('none');
    }

    // Clear parameter form
    setSelectedEndpoint(null);
    setEndpointParams({});
    
    // Switch to body tab if there's a request body, otherwise auth
    setActiveTab(endpoint.requestBody ? 'body' : 'auth');
  };

  // Resolve $ref references in schemas
  const resolveSchemaRefs = (schema: any, spec: any): any => {
    if (!schema) return schema;
    
    if (schema.$ref) {
      // Parse reference like "#/components/schemas/Pet"
      const refPath = schema.$ref.replace(/^#\//, '').split('/');
      let resolved = spec;
      for (const part of refPath) {
        resolved = resolved?.[part];
      }
      return resolveSchemaRefs(resolved, spec);
    }
    
    if (schema.allOf) {
      // Merge all schemas in allOf
      const merged: any = { type: 'object', properties: {} };
      schema.allOf.forEach((subSchema: any) => {
        const resolved = resolveSchemaRefs(subSchema, spec);
        if (resolved.properties) {
          merged.properties = { ...merged.properties, ...resolved.properties };
        }
        if (resolved.required) {
          merged.required = [...(merged.required || []), ...resolved.required];
        }
      });
      return merged;
    }
    
    if (schema.properties) {
      const resolved = { ...schema, properties: {} };
      for (const key in schema.properties) {
        resolved.properties[key] = resolveSchemaRefs(schema.properties[key], spec);
      }
      return resolved;
    }
    
    if (schema.items) {
      return { ...schema, items: resolveSchemaRefs(schema.items, spec) };
    }
    
    return schema;
  };

  // Generate example data from JSON schema
  const generateExampleFromSchema = (schema: any): any => {
    if (!schema) return null;
    
    if (schema.example !== undefined) return schema.example;
    if (schema.default !== undefined) return schema.default;

    // Handle specific formats for strings
    if (schema.type === 'string') {
      if (schema.enum) return schema.enum[0];
      if (schema.format === 'date') return '2024-01-01';
      if (schema.format === 'date-time') return '2024-01-01T00:00:00Z';
      if (schema.format === 'email') return 'user@example.com';
      if (schema.format === 'uri' || schema.format === 'url') return 'https://example.com';
      if (schema.format === 'uuid') return '00000000-0000-0000-0000-000000000000';
      if (schema.pattern) return schema.pattern; // Show pattern as hint
      if (schema.minLength) return 'x'.repeat(schema.minLength);
      return 'string';
    }

    switch (schema.type) {
      case 'object':
        const obj: any = {};
        if (schema.properties) {
          // Only include required properties by default, or all if none specified
          const propsToInclude = schema.required && schema.required.length > 0 
            ? schema.required 
            : Object.keys(schema.properties);
            
          propsToInclude.forEach((key: string) => {
            if (schema.properties[key]) {
              obj[key] = generateExampleFromSchema(schema.properties[key]);
            }
          });
        }
        return obj;
        
      case 'array':
        if (!schema.items) return [];
        const minItems = schema.minItems || 1;
        return Array(minItems).fill(null).map(() => generateExampleFromSchema(schema.items));
        
      case 'number':
      case 'integer':
        if (schema.enum) return schema.enum[0];
        if (schema.minimum !== undefined) return schema.minimum;
        return schema.type === 'integer' ? 0 : 0.0;
        
      case 'boolean':
        return false;
        
      default:
        return null;
    }
  };

  // Toggle tag expansion
  const toggleTag = (tag: string) => {
    const newExpanded = new Set(expandedTags);
    if (newExpanded.has(tag)) {
      newExpanded.delete(tag);
    } else {
      newExpanded.add(tag);
    }
    setExpandedTags(newExpanded);
  };

  // Import the response JSON
  const handleImport = () => {
    if (response) {
      onImport(response, {
        url,
        method,
        timestamp: Date.now()
      });
      if (!isStandalone) {
        onClose();
      }
    }
  };

  // Save current request
  const saveRequest = () => {
    if (!saveName.trim()) {
      alert('Please enter a name for this request');
      return;
    }

    const saved: SavedRequest = {
      id: Date.now().toString(),
      name: saveName,
      url,
      method,
      headers,
      body: requestBody,
      authType,
      authToken,
      timestamp: Date.now()
    };

    const updated = [...savedRequests, saved];
    setSavedRequests(updated);
    localStorage.setItem('api-saved-requests', JSON.stringify(updated));
    
    setShowSaveDialog(false);
    setSaveName('');
  };

  // Load saved request
  const loadRequest = (saved: SavedRequest) => {
    setUrl(saved.url);
    setMethod(saved.method as HttpMethod);
    setHeaders(saved.headers);
    setRequestBody(saved.body);
    setAuthType(saved.authType as AuthType);
    setAuthToken(saved.authToken);
    setShowHistory(false);
  };

  // Delete saved request
  const deleteRequest = (id: string) => {
    const updated = savedRequests.filter(r => r.id !== id);
    setSavedRequests(updated);
    localStorage.setItem('api-saved-requests', JSON.stringify(updated));
  };

  return (
    <div className={`api-import-overlay ${isStandalone ? 'standalone' : ''}`} onClick={isStandalone ? undefined : onClose}>
      <div className="api-import-dialog" onClick={(e) => e.stopPropagation()}>
        {/* Header with title and close button */}
        <div className="api-import-header">
          <div className="header-title">
            <span className="material-symbols-outlined">cloud_download</span>
            <h2>Import from API</h2>
          </div>
          <div className="header-actions">
            {!isStandalone && (
              <button onClick={onClose} className="btn-close-api">
                <span className="material-symbols-outlined">close</span>
              </button>
            )}
          </div>
        </div>

        {/* Fixed Request Bar */}
        <div className="fixed-request-bar">
          <select 
            className="method-select"
            value={method}
            onChange={(e) => setMethod(e.target.value as HttpMethod)}
          >
            <option value="GET">GET</option>
            <option value="POST">POST</option>
            <option value="PUT">PUT</option>
            <option value="PATCH">PATCH</option>
            <option value="DELETE">DELETE</option>
            <option value="HEAD">HEAD</option>
            <option value="OPTIONS">OPTIONS</option>
          </select>
          
          <div className="url-input-wrapper">
            <input
              type="text"
              className="url-input"
              placeholder="https://api.example.com/data"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              onKeyPress={(e) => e.key === 'Enter' && sendRequest()}
            />
            {urlHistory.length > 0 && (
              <button 
                className="btn-history"
                onClick={() => setShowHistory(!showHistory)}
                title="URL History"
              >
                <span className="material-symbols-outlined">history</span>
              </button>
            )}
          </div>

          <button 
            className="btn-send"
            onClick={sendRequest}
            disabled={isLoading}
          >
            {isLoading ? (
              <>
                <span className="material-symbols-outlined spinning">progress_activity</span>
                Sending...
              </>
            ) : (
              <>
                <span className="material-symbols-outlined">send</span>
                Send
              </>
            )}
          </button>

          <button 
            className="btn-save-request"
            onClick={() => setShowSaveDialog(true)}
            title="Save Request"
          >
            <span className="material-symbols-outlined">bookmark</span>
          </button>
        </div>

        {/* Split Layout Container */}
        <div className="api-split-container">
          {/* Left Sidebar: OpenAPI Browser */}
          <div className="api-sidebar">
            <div className="sidebar-header">
              <h3>
                <span className="material-symbols-outlined">api</span>
                OpenAPI Browser
              </h3>
              <button 
                className="btn-collapse-sidebar"
                onClick={() => {
                  const sidebar = document.querySelector('.api-sidebar') as HTMLElement;
                  sidebar?.classList.toggle('collapsed');
                }}
                title="Toggle OpenAPI Browser"
              >
                <span className="material-symbols-outlined collapse-icon">chevron_left</span>
                <span className="material-symbols-outlined expand-icon">chevron_right</span>
              </button>
            </div>

            <div className="sidebar-content">
              <div className="spec-url-input">
                <label>OpenAPI Spec URL</label>
                <div className="url-input-group">
                  <input
                    type="text"
                    value={openApiUrl}
                    onChange={(e) => setOpenApiUrl(e.target.value)}
                    placeholder="https://api.example.com/openapi.json"
                  />
                  <button 
                    onClick={loadOpenApiSpec}
                    disabled={loadingSpec}
                    className="btn-load-spec"
                  >
                    {loadingSpec ? 'Loading...' : 'Load'}
                  </button>
                </div>
              </div>

              <div className="spec-url-input">
                <label>Base URL (optional)</label>
                <input
                  type="text"
                  value={openApiBaseUrl}
                  onChange={(e) => setOpenApiBaseUrl(e.target.value)}
                  placeholder="https://api.example.com"
                />
                <small className="input-hint">Override base URL from spec</small>
              </div>

              {specError && (
                <div className="spec-error">
                  <span className="material-symbols-outlined">error</span>
                  {specError}
                </div>
              )}

              {openApiEndpoints.length > 0 && (
                <div className="endpoints-list">
                  <div className="endpoints-header">
                    <h4>Endpoints ({openApiEndpoints.length})</h4>
                    <div className="endpoint-search">
                      <span className="material-symbols-outlined">search</span>
                      <input
                        type="text"
                        placeholder="Search..."
                        value={endpointSearch}
                        onChange={(e) => setEndpointSearch(e.target.value)}
                      />
                      {endpointSearch && (
                        <button 
                          className="btn-clear-search"
                          onClick={() => setEndpointSearch('')}
                        >
                          <span className="material-symbols-outlined">close</span>
                        </button>
                      )}
                    </div>
                  </div>
                  <div className="endpoints-tree">
                    {Array.from(new Set(openApiEndpoints.flatMap(e => e.tags || ['default']))).map(tag => {
                      const tagEndpoints = openApiEndpoints.filter(e => {
                        const matchesTag = e.tags?.includes(tag);
                        if (!endpointSearch) return matchesTag;
                        
                        const searchLower = endpointSearch.toLowerCase();
                        const matchesSearch = 
                          e.path.toLowerCase().includes(searchLower) ||
                          e.method.toLowerCase().includes(searchLower) ||
                          e.summary?.toLowerCase().includes(searchLower) ||
                          e.description?.toLowerCase().includes(searchLower) ||
                          e.tags?.some(t => t.toLowerCase().includes(searchLower));
                        
                        return matchesTag && matchesSearch;
                      });
                      const isExpanded = expandedTags.has(tag);
                      
                      if (tagEndpoints.length === 0) return null;
                      
                      return (
                        <div key={tag} className="tag-group">
                          <div 
                            className="tag-header"
                            onClick={() => toggleTag(tag)}
                          >
                            <span className="material-symbols-outlined">
                              {isExpanded ? 'expand_more' : 'chevron_right'}
                            </span>
                            <span className="tag-name">{tag}</span>
                            <span className="tag-count">({tagEndpoints.length})</span>
                          </div>
                          
                          {isExpanded && (
                            <div className="tag-endpoints">
                              {tagEndpoints.map((endpoint, idx) => (
                                <div key={`${endpoint.path}-${endpoint.method}-${idx}`} className="endpoint-item">
                                  <div className="endpoint-info">
                                    <span className={`method-badge method-${endpoint.method.toLowerCase()}`}>
                                      {endpoint.method}
                                    </span>
                                    <div className="endpoint-details">
                                      <div className="endpoint-path">{endpoint.path}</div>
                                      {endpoint.summary && (
                                        <div className="endpoint-summary">{endpoint.summary}</div>
                                      )}
                                    </div>
                                  </div>
                                  <button 
                                    className="btn-use-endpoint"
                                    onClick={() => useEndpoint(endpoint)}
                                  >
                                    Use
                                  </button>
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Right Panel: Request Config & Response */}
          <div className="api-main-panel">
            {/* Request Configuration */}
            <div className="request-config-section">

            {/* URL History Dropdown */}
            {showHistory && (
              <div className="history-dropdown">
                <div className="history-header">
                  <h4>Recent URLs</h4>
                  <button onClick={() => setShowHistory(false)}>
                    <span className="material-symbols-outlined">close</span>
                  </button>
                </div>
                <div className="history-list">
                  {urlHistory.map((historyUrl, index) => (
                    <div 
                      key={index} 
                      className="history-item"
                      onClick={() => {
                        setUrl(historyUrl);
                        setShowHistory(false);
                      }}
                    >
                      <span className="material-symbols-outlined">link</span>
                      <span className="history-url">{historyUrl}</span>
                    </div>
                  ))}
                </div>
                
                {savedRequests.length > 0 && (
                  <>
                    <div className="history-divider"></div>
                    <div className="history-header">
                      <h4>Saved Requests</h4>
                    </div>
                    <div className="history-list">
                      {savedRequests.map((saved) => (
                        <div key={saved.id} className="history-item saved">
                          <span className="material-symbols-outlined">bookmark</span>
                          <div className="saved-info">
                            <strong>{saved.name}</strong>
                            <small>{saved.method} • {saved.url}</small>
                          </div>
                          <button 
                            className="btn-load-saved"
                            onClick={() => loadRequest(saved)}
                          >
                            Load
                          </button>
                          <button 
                            className="btn-delete-saved"
                            onClick={(e) => {
                              e.stopPropagation();
                              deleteRequest(saved.id);
                            }}
                          >
                            <span className="material-symbols-outlined">delete</span>
                          </button>
                        </div>
                      ))}
                    </div>
                  </>
                )}
              </div>
            )}

            {/* Save Dialog */}
            {showSaveDialog && (
              <div className="save-dialog">
                <h4>Save Request</h4>
                <input
                  type="text"
                  placeholder="Request name..."
                  value={saveName}
                  onChange={(e) => setSaveName(e.target.value)}
                  onKeyPress={(e) => e.key === 'Enter' && saveRequest()}
                  autoFocus
                />
                <div className="save-dialog-actions">
                  <button onClick={() => setShowSaveDialog(false)}>Cancel</button>
                  <button onClick={saveRequest} className="btn-primary">Save</button>
                </div>
              </div>
            )}

            {/* Request Configuration Tabs */}
            <div className="request-tabs">
              <div className="tab-headers">
                <button 
                  className={`tab-header ${activeTab === 'auth' ? 'active' : ''}`}
                  onClick={() => setActiveTab('auth')}
                >
                  <span className="material-symbols-outlined">lock</span>
                  Authorization
                </button>
                <button 
                  className={`tab-header ${activeTab === 'headers' ? 'active' : ''}`}
                  onClick={() => setActiveTab('headers')}
                >
                  <span className="material-symbols-outlined">list</span>
                  Headers
                </button>
                {['POST', 'PUT', 'PATCH'].includes(method) && (
                  <button 
                    className={`tab-header ${activeTab === 'body' ? 'active' : ''}`}
                    onClick={() => setActiveTab('body')}
                  >
                    <span className="material-symbols-outlined">description</span>
                    Body
                  </button>
                )}
                <button 
                  className={`tab-header ${activeTab === 'options' ? 'active' : ''}`}
                  onClick={() => setActiveTab('options')}
                >
                  <span className="material-symbols-outlined">settings</span>
                  Options
                </button>
              </div>

              <div className="tab-content">
                {/* Authorization Tab */}
                {activeTab === 'auth' && (
                <div className="tab-panel">
                  <div className="auth-type-selector">
                    <label>
                      <input
                        type="radio"
                        name="authType"
                        value="none"
                        checked={authType === 'none'}
                        onChange={(e) => setAuthType(e.target.value as AuthType)}
                      />
                      <span>No Auth</span>
                    </label>
                    <label>
                      <input
                        type="radio"
                        name="authType"
                        value="bearer"
                        checked={authType === 'bearer'}
                        onChange={(e) => setAuthType(e.target.value as AuthType)}
                      />
                      <span>Bearer Token</span>
                    </label>
                    <label>
                      <input
                        type="radio"
                        name="authType"
                        value="basic"
                        checked={authType === 'basic'}
                        onChange={(e) => setAuthType(e.target.value as AuthType)}
                      />
                      <span>Basic Auth</span>
                    </label>
                    <label>
                      <input
                        type="radio"
                        name="authType"
                        value="api-key"
                        checked={authType === 'api-key'}
                        onChange={(e) => setAuthType(e.target.value as AuthType)}
                      />
                      <span>API Key</span>
                    </label>
                  </div>

                  {authType === 'bearer' && (
                    <div className="auth-fields">
                      <label>Token</label>
                      <input
                        type="password"
                        placeholder="Enter bearer token"
                        value={authToken}
                        onChange={(e) => setAuthToken(e.target.value)}
                      />
                    </div>
                  )}

                  {authType === 'basic' && (
                    <div className="auth-fields">
                      <label>Username</label>
                      <input
                        type="text"
                        placeholder="Username"
                        value={authUsername}
                        onChange={(e) => setAuthUsername(e.target.value)}
                      />
                      <label>Password</label>
                      <input
                        type="password"
                        placeholder="Password"
                        value={authPassword}
                        onChange={(e) => setAuthPassword(e.target.value)}
                      />
                    </div>
                  )}

                  {authType === 'api-key' && (
                    <div className="auth-fields">
                      <label>Header Name</label>
                      <input
                        type="text"
                        placeholder="X-API-Key"
                        value={apiKeyHeader}
                        onChange={(e) => setApiKeyHeader(e.target.value)}
                      />
                      <label>Value</label>
                      <input
                        type="password"
                        placeholder="API key value"
                        value={apiKeyValue}
                        onChange={(e) => setApiKeyValue(e.target.value)}
                      />
                    </div>
                  )}
                </div>
                )}

                {/* Headers Tab */}
                {activeTab === 'headers' && (
                <div className="tab-panel">
                  <div className="headers-list">
                    {headers.map((header) => (
                      <div key={header.id} className="header-row">
                        <input
                          type="checkbox"
                          checked={header.enabled}
                          onChange={(e) => updateHeader(header.id, 'enabled', e.target.checked)}
                        />
                        <input
                          type="text"
                          placeholder="Header name"
                          value={header.key}
                          onChange={(e) => updateHeader(header.id, 'key', e.target.value)}
                        />
                        <input
                          type="text"
                          placeholder="Value"
                          value={header.value}
                          onChange={(e) => updateHeader(header.id, 'value', e.target.value)}
                        />
                        <button 
                          className="btn-remove-header"
                          onClick={() => removeHeader(header.id)}
                          disabled={headers.length === 1}
                        >
                          <span className="material-symbols-outlined">close</span>
                        </button>
                      </div>
                    ))}
                  </div>
                  <button className="btn-add-header" onClick={addHeader}>
                    <span className="material-symbols-outlined">add</span>
                    Add Header
                  </button>
                </div>
                )}

                {/* Body Tab */}
                {activeTab === 'body' && ['POST', 'PUT', 'PATCH'].includes(method) && (
                  <div className="tab-panel">
                    <div className="body-type-selector">
                      <label>
                        <input
                          type="radio"
                          name="bodyType"
                          value="none"
                          checked={bodyType === 'none'}
                          onChange={(e) => setBodyType(e.target.value as BodyType)}
                        />
                        <span>None</span>
                      </label>
                      <label>
                        <input
                          type="radio"
                          name="bodyType"
                          value="json"
                          checked={bodyType === 'json'}
                          onChange={(e) => setBodyType(e.target.value as BodyType)}
                        />
                        <span>JSON</span>
                      </label>
                      <label>
                        <input
                          type="radio"
                          name="bodyType"
                          value="text"
                          checked={bodyType === 'text'}
                          onChange={(e) => setBodyType(e.target.value as BodyType)}
                        />
                        <span>Text</span>
                      </label>
                    </div>

                    {bodyType !== 'none' && (
                      <div className="body-editor">
                        <Editor
                          height="200px"
                          language={bodyType === 'json' ? 'json' : 'text'}
                          value={requestBody}
                          onChange={(value) => setRequestBody(value || '')}
                          theme={theme === 'dark' ? 'vs-dark' : 'vs-light'}
                          options={{
                            minimap: { enabled: false },
                            lineNumbers: 'on',
                            scrollBeyondLastLine: false,
                          }}
                        />
                      </div>
                    )}
                  </div>
                )}

                {/* OpenAPI Tab - Moved to Sidebar */}

                
                {/* Options Tab */}
                {activeTab === 'options' && (
                <div className="tab-panel">
                  <div className="options-section">
                    <label className="checkbox-label">
                      <input
                        type="checkbox"
                        checked={autoRefresh}
                        onChange={(e) => setAutoRefresh(e.target.checked)}
                      />
                      <span>Auto-refresh</span>
                    </label>
                    
                    {autoRefresh && (
                      <div className="refresh-interval">
                        <label>Interval (seconds)</label>
                        <input
                          type="number"
                          min="1"
                          max="300"
                          value={refreshInterval}
                          onChange={(e) => setRefreshInterval(parseInt(e.target.value))}
                        />
                      </div>
                    )}
                  </div>
                </div>
                )}

              </div>
            </div>
          </div>

          {/* Response Section */}
          {(response || error || responseText) && (
            <div className="response-section">
              <div className="response-header">
                <h3>Response</h3>
                <div className="response-meta">
                  {responseStatus && (
                    <span className={`status-badge status-${Math.floor(responseStatus / 100)}xx`}>
                      {responseStatus}
                    </span>
                  )}
                  {responseTime !== null && (
                    <span className="response-time">{responseTime}ms</span>
                  )}
                </div>
              </div>

              {error && (
                <div className="response-error">
                  <span className="material-symbols-outlined">error</span>
                  <div>
                    <strong>Error</strong>
                    <p>{error}</p>
                    {error.includes('CORS') && (
                      <small>
                        CORS errors occur when the API doesn't allow browser requests. 
                        Consider using a CORS proxy or browser extension.
                      </small>
                    )}
                  </div>
                </div>
              )}

              {response && (
                <>
                  <div className="response-viewer">
                    <Editor
                      height="100%"
                      language="json"
                      value={JSON.stringify(response, null, 2)}
                      theme={theme === 'dark' ? 'vs-dark' : 'vs-light'}
                      options={{
                        readOnly: true,
                        minimap: { enabled: false },
                        lineNumbers: 'on',
                        scrollBeyondLastLine: false,
                      }}
                    />
                  </div>
                  <div className="response-actions">
                    <button className="btn-import-response" onClick={handleImport}>
                      <span className="material-symbols-outlined">download</span>
                      Import JSON
                    </button>
                    <button 
                      className="btn-copy-response"
                      onClick={() => {
                        navigator.clipboard.writeText(JSON.stringify(response, null, 2));
                      }}
                    >
                      <span className="material-symbols-outlined">content_copy</span>
                      Copy
                    </button>
                  </div>
                </>
              )}

              {responseText && !response && (
                <div className="response-text">
                  <pre>{responseText}</pre>
                </div>
              )}
            </div>
          )}
          </div>
        </div>

        {/* Parameter Configuration Modal */}
        {selectedEndpoint && (
          <div className="parameter-modal-overlay" onClick={() => setSelectedEndpoint(null)}>
            <div className="parameter-modal" onClick={(e) => e.stopPropagation()}>
              <div className="parameter-form-header">
                <h4>Configure Parameters</h4>
                <button 
                  className="btn-close-params"
                  onClick={() => setSelectedEndpoint(null)}
                >
                  <span className="material-symbols-outlined">close</span>
                </button>
              </div>
              
              <div className="endpoint-info-banner">
                <span className={`method-badge method-${selectedEndpoint.method.toLowerCase()}`}>
                  {selectedEndpoint.method}
                </span>
                <span className="endpoint-path">{selectedEndpoint.path}</span>
                {selectedEndpoint.summary && (
                  <span className="endpoint-summary">{selectedEndpoint.summary}</span>
                )}
              </div>

              {selectedEndpoint.parameters && selectedEndpoint.parameters.length > 0 ? (
                <div className="parameters-list">
                  {selectedEndpoint.parameters.map((param: any) => {
                    const schema = param.schema || {};
                    const isRequired = param.required || false;
                    
                    return (
                      <div key={param.name} className="parameter-item">
                        <div className="parameter-header">
                          <label>
                            {param.name}
                            {isRequired && <span className="required-indicator">*</span>}
                          </label>
                          <span className="parameter-location">{param.in}</span>
                        </div>
                        
                        {param.description && (
                          <p className="parameter-description">{param.description}</p>
                        )}
                        
                        <input
                          type="text"
                          value={endpointParams[param.name] || ''}
                          onChange={(e) => setEndpointParams({
                            ...endpointParams,
                            [param.name]: e.target.value
                          })}
                          placeholder={
                            schema.example || schema.default || 
                            (schema.enum ? schema.enum.join(' | ') : `Enter ${param.name}`)
                          }
                          required={isRequired}
                        />
                        
                        {schema.type && (
                          <small className="parameter-type">
                            Type: {schema.type}
                            {schema.format && ` (${schema.format})`}
                            {schema.enum && ` • Options: ${schema.enum.join(', ')}`}
                          </small>
                        )}
                      </div>
                    );
                  })}
                  
                  <button 
                    className="btn-apply-params"
                    onClick={applyEndpointParams}
                  >
                    Apply Parameters
                  </button>
                </div>
              ) : (
                <div className="no-parameters">
                  <p>This endpoint has no parameters.</p>
                  <button 
                    className="btn-apply-params"
                    onClick={applyEndpointParams}
                  >
                    Continue
                  </button>
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
