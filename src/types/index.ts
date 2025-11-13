// Core types for JSON document handling

export type JsonValue = 
  | string 
  | number 
  | boolean 
  | null 
  | JsonArray 
  | JsonObject;

export interface JsonObject {
  [key: string]: JsonValue;
}

export interface JsonArray extends Array<JsonValue> {}

// Property types for schema inference
export type PropertyType = 
  | 'string' 
  | 'number' 
  | 'boolean' 
  | 'null' 
  | 'array' 
  | 'object';

export interface PropertySchema {
  name: string;
  type: PropertyType;
  required: boolean;
  arrayItemType?: PropertyType;
  objectSchema?: PropertySchema[];
}

export interface ObjectSchema {
  properties: PropertySchema[];
}

// Document state management
export interface DocumentState {
  raw: string;
  parsed: JsonValue | null;
  isValid: boolean;
  error: string | null;
}

// Version history
export interface VersionHistoryItem {
  content: string;
  timestamp: number;
  label: string;
}

// View modes
export type ViewMode = 'raw' | 'tree' | 'table';
