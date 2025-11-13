import React, { useState, useEffect } from 'react';
import { JsonValue } from '../types';
import { 
  quicktype, 
  InputData, 
  jsonInputForTargetLanguage
} from 'quicktype-core';
import Editor from '@monaco-editor/react';
import { useTheme } from '../contexts/ThemeContext';
import './SchemaView.css';

interface SchemaViewProps {
  data: JsonValue;
}

type SchemaLanguage = 'typescript' | 'csharp' | 'json-schema' | 'python' | 'java' | 'go' | 'kotlin';

export const SchemaView: React.FC<SchemaViewProps> = ({ data }) => {
  const { theme } = useTheme();
  const [language, setLanguage] = useState<SchemaLanguage>('csharp');
  const [rootTypeName, setRootTypeName] = useState('Root');
  const [generatedSchema, setGeneratedSchema] = useState<string>('');
  const [isGenerating, setIsGenerating] = useState(true); // Start as true to show initial generation

  // Generate schema using quicktype
  useEffect(() => {
    console.log('SchemaView useEffect triggered', { hasData: !!data, language, rootTypeName });
    const generateSchema = async () => {
      if (!data) {
        console.log('No data, returning early');
        setGeneratedSchema('');
        setIsGenerating(false);
        return;
      }

      console.log('Starting schema generation...');
      setIsGenerating(true);
      try {
        // Map our language names to quicktype language names
        const languageMap: Record<SchemaLanguage, string> = {
          'typescript': 'typescript',
          'csharp': 'csharp',
          'python': 'python',
          'java': 'java',
          'json-schema': 'schema',
          'go': 'go',
          'kotlin': 'kotlin'
        };

        const targetLanguage = languageMap[language];

        // Convert data to JSON string
        const jsonString = JSON.stringify(data, null, 2);
        
        // Create JSON input for the target language
        const jsonInput = jsonInputForTargetLanguage(targetLanguage as any);
        
        // Add the JSON sample
        await jsonInput.addSource({
          name: rootTypeName,
          samples: [jsonString]
        });

        const inputData = new InputData();
        inputData.addInput(jsonInput);

        // Generate the code with appropriate options for each language
        const result = await quicktype({
          inputData,
          lang: targetLanguage as any,
          inferEnums: true,
          inferDateTimes: true,
          inferIntegerStrings: false,
          rendererOptions: {
            'just-types': language === 'typescript' ? 'true' : undefined,
            'nice-property-names': 'true',
            'explicit-unions': language === 'typescript' ? 'true' : undefined,
            'namespace': language === 'csharp' ? rootTypeName : undefined,
            'framework': language === 'csharp' ? 'SystemTextJson' : undefined,
            'array-type': language === 'csharp' ? 'list' : undefined,
            'density': language === 'csharp' ? 'normal' : undefined,
            'csharp-version': language === 'csharp' ? '6' : undefined,
            'features': language === 'csharp' ? 'attributes-only' : undefined
          }
        });

        const schemaText = result.lines.join('\n');
        console.log('Schema generated successfully, length:', schemaText.length);
        setGeneratedSchema(schemaText);
      } catch (error) {
        console.error('Schema generation error:', error);
        setGeneratedSchema(`Error generating schema: ${error instanceof Error ? error.message : String(error)}`);
      } finally {
        console.log('Setting isGenerating to false');
        setIsGenerating(false);
      }
    };

    generateSchema();
  }, [data, language, rootTypeName]);

  const handleCopy = () => {
    navigator.clipboard.writeText(generatedSchema);
  };

  // Map schema languages to Monaco Editor languages
  const getMonacoLanguage = (schemaLang: SchemaLanguage): string => {
    const languageMap: Record<SchemaLanguage, string> = {
      'typescript': 'typescript',
      'csharp': 'csharp',
      'python': 'python',
      'java': 'java',
      'go': 'go',
      'kotlin': 'kotlin',
      'json-schema': 'json'
    };
    return languageMap[schemaLang];
  };

  return (
    <div className="schema-view">
      <div className="schema-header">
        <div className="schema-controls">
          <label className="schema-label">Root Type Name:</label>
          <input
            type="text"
            value={rootTypeName}
            onChange={(e) => setRootTypeName(e.target.value)}
            className="schema-input"
            placeholder="Root"
          />
          <label className="schema-label">Language:</label>
          <select
            value={language}
            onChange={(e) => setLanguage(e.target.value as SchemaLanguage)}
            className="schema-select"
          >
            <option value="typescript">TypeScript</option>
            <option value="csharp">C#</option>
            <option value="python">Python</option>
            <option value="java">Java</option>
            <option value="go">Go</option>
            <option value="kotlin">Kotlin</option>
            <option value="json-schema">JSON Schema</option>
          </select>
          <button onClick={handleCopy} className="btn-copy-schema" disabled={isGenerating}>
            <span className="material-symbols-outlined">content_copy</span>
            {isGenerating ? 'Generating...' : 'Copy'}
          </button>
        </div>
      </div>
      <div className="schema-content">
        <Editor
          key={`${language}-${rootTypeName}-${generatedSchema.length}`}
          height="100%"
          language={getMonacoLanguage(language)}
          value={isGenerating ? 'Generating schema...' : generatedSchema}
          theme={theme === 'dark' ? 'vs-dark' : 'vs-light'}
          options={{
            readOnly: true,
            minimap: { enabled: false },
            scrollBeyondLastLine: false,
            fontSize: 14,
            lineNumbers: 'on',
            folding: true,
            automaticLayout: true
          }}
        />
      </div>
    </div>
  );
};
