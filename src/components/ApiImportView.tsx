import React, { useState, useEffect } from 'react';
import { Editor } from '@monaco-editor/react';
import { useTheme } from '../contexts/ThemeContext';
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
  const [activeTab, setActiveTab] = useState<'auth' | 'headers' | 'body' | 'options'>('auth');

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

        <div className="api-import-content">
          {/* Request Configuration */}
          <div className="request-section">
            <div className="request-url-bar">
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
                      height="300px"
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
    </div>
  );
};
