import React from 'react';
import { Editor } from '@monaco-editor/react';
import { useTheme } from '../contexts/ThemeContext';
import { js2xml } from 'xml-js';
import Papa from 'papaparse';
import yaml from 'js-yaml';
import { stringify as tomlStringify } from 'smol-toml';
import './ConvertView.css';

interface ConvertViewProps {
  jsonContent: string;
  onClose: () => void;
}

type ConvertFormat = 'xml' | 'csv' | 'yaml' | 'toml';

export const ConvertView: React.FC<ConvertViewProps> = ({ 
  jsonContent, 
  onClose 
}) => {
  const { theme } = useTheme();
  const [selectedFormat, setSelectedFormat] = React.useState<ConvertFormat>('xml');
  const [convertedContent, setConvertedContent] = React.useState<string>('');
  const [error, setError] = React.useState<string | null>(null);
  const [copySuccess, setCopySuccess] = React.useState(false);
  const [rootElementName, setRootElementName] = React.useState<string>('root');

  React.useEffect(() => {
    convertContent();
  }, [selectedFormat, jsonContent, rootElementName]);

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
          // Recursively flatten nested objects
          Object.assign(flattened, flattenObject(value, newKey));
        } else {
          flattened[newKey] = value;
        }
      }
    }
    
    return flattened;
  };

  const convertContent = () => {
    try {
      setError(null);
      const parsed = JSON.parse(jsonContent);
      
      if (selectedFormat === 'xml') {
        // Wrap the JSON in a root element for valid XML
        const wrappedData = { [rootElementName]: parsed };
        const options = {
          compact: true,
          ignoreComment: true,
          spaces: 2,
          indentAttributes: false,
        };
        const xmlResult = js2xml(wrappedData, options);
        setConvertedContent(xmlResult);
      } else if (selectedFormat === 'csv') {
        // Handle different JSON structures for CSV conversion
        let dataForCsv: any[] = [];
        
        if (Array.isArray(parsed)) {
          // Flatten each object in the array
          dataForCsv = parsed.map(item => 
            typeof item === 'object' && item !== null ? flattenObject(item) : { value: item }
          );
        } else if (typeof parsed === 'object' && parsed !== null) {
          // If it's a single object, flatten and wrap it in an array
          dataForCsv = [flattenObject(parsed)];
        } else {
          throw new Error('CSV conversion requires an array or object structure');
        }
        
        const csv = Papa.unparse(dataForCsv, {
          header: true,
          skipEmptyLines: true,
        });
        setConvertedContent(csv);
      } else if (selectedFormat === 'yaml') {
        const yamlResult = yaml.dump(parsed, {
          indent: 2,
          lineWidth: -1,
          noRefs: true,
          sortKeys: false
        });
        setConvertedContent(yamlResult);
      } else if (selectedFormat === 'toml') {
        // TOML has stricter requirements - root must be a table (object)
        if (Array.isArray(parsed)) {
          // Wrap array in a root object
          const wrappedData = { [rootElementName]: parsed };
          const tomlResult = tomlStringify(wrappedData);
          setConvertedContent(tomlResult);
        } else if (typeof parsed === 'object' && parsed !== null) {
          const tomlResult = tomlStringify(parsed);
          setConvertedContent(tomlResult);
        } else {
          throw new Error('TOML requires an object or array at the root level');
        }
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Conversion failed');
      setConvertedContent('');
    }
  };

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(convertedContent);
      setCopySuccess(true);
      setTimeout(() => setCopySuccess(false), 2000);
    } catch (err) {
      console.error('Failed to copy:', err);
    }
  };

  const handleDownload = () => {
    const blob = new Blob([convertedContent], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    
    // Determine file extension based on format
    const extensions: Record<ConvertFormat, string> = {
      xml: 'xml',
      yaml: 'yaml',
      toml: 'toml',
      csv: 'csv'
    };
    
    link.download = `converted.${extensions[selectedFormat]}`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  const getLanguage = (): string => {
    switch (selectedFormat) {
      case 'xml':
        return 'xml';
      case 'csv':
        return 'plaintext';
      case 'yaml':
        return 'yaml';
      case 'toml':
        return 'ini'; // Monaco doesn't have native TOML, INI is close enough
      default:
        return 'plaintext';
    }
  };

  return (
    <div className="chart-modal-overlay" onClick={onClose}>
      <div className="convert-modal-content" onClick={(e) => e.stopPropagation()}>
        <div className="chart-modal-header">
          <h2>Convert JSON</h2>
          <button 
            className="btn-close-modal" 
            onClick={onClose}
            aria-label="Close"
          >
            <span className="material-symbols-outlined">close</span>
          </button>
        </div>

        <div className="convert-controls">
          <div className="format-tabs">
            <button
              className={`format-tab ${selectedFormat === 'xml' ? 'active' : ''}`}
              onClick={() => setSelectedFormat('xml')}
            >
              <span className="material-symbols-outlined">code</span>
              XML
            </button>
            <button
              className={`format-tab ${selectedFormat === 'yaml' ? 'active' : ''}`}
              onClick={() => setSelectedFormat('yaml')}
            >
              <span className="material-symbols-outlined">data_object</span>
              YAML
            </button>
            <button
              className={`format-tab ${selectedFormat === 'toml' ? 'active' : ''}`}
              onClick={() => setSelectedFormat('toml')}
            >
              <span className="material-symbols-outlined">settings</span>
              TOML
            </button>
            <button
              className={`format-tab ${selectedFormat === 'csv' ? 'active' : ''}`}
              onClick={() => setSelectedFormat('csv')}
            >
              <span className="material-symbols-outlined">table_chart</span>
              CSV
            </button>
          </div>

          <div className="convert-options">
            {(selectedFormat === 'xml' || selectedFormat === 'toml') && (
              <div className="root-name-input">
                <label htmlFor="root-element">
                  {selectedFormat === 'xml' ? 'Root Element:' : 'Root Table:'}
                </label>
                <input
                  id="root-element"
                  type="text"
                  value={rootElementName}
                  onChange={(e) => setRootElementName(e.target.value)}
                  placeholder="root"
                  className="input-root-name"
                />
              </div>
            )}
          </div>

          <div className="action-buttons">
            <button 
              className="btn-copy"
              onClick={handleCopy}
              disabled={!convertedContent || !!error}
              title="Copy to clipboard"
            >
              <span className="material-symbols-outlined">
                {copySuccess ? 'check' : 'content_copy'}
              </span>
              {copySuccess ? 'Copied!' : 'Copy'}
            </button>
            
            <button 
              className="btn-download"
              onClick={handleDownload}
              disabled={!convertedContent || !!error}
              title="Download file"
            >
              <span className="material-symbols-outlined">download</span>
              Download
            </button>
          </div>
        </div>

        {error && (
          <div className="convert-error">
            <span className="material-symbols-outlined">error</span>
            <span>{error}</span>
          </div>
        )}

        <div className="convert-editor-container">
          <Editor
            height="100%"
            language={getLanguage()}
            value={convertedContent}
            theme={theme === 'dark' ? 'vs-dark' : 'light'}
            options={{
              readOnly: true,
              minimap: { enabled: false },
              scrollBeyondLastLine: false,
              fontSize: 13,
              lineNumbers: 'on',
              folding: true,
              wordWrap: 'on',
              automaticLayout: true,
            }}
          />
        </div>
      </div>
    </div>
  );
};
