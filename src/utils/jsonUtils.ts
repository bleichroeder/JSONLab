import { JsonValue, PropertyType, PropertySchema, ObjectSchema, JsonObject } from '../types';

/**
 * Infers the type of a JSON value
 */
export function inferType(value: JsonValue): PropertyType {
  if (value === null) return 'null';
  if (Array.isArray(value)) return 'array';
  if (typeof value === 'object') return 'object';
  return typeof value as PropertyType;
}

/**
 * Infers the schema of an object
 */
export function inferObjectSchema(obj: JsonObject): ObjectSchema {
  const properties: PropertySchema[] = [];

  for (const [key, value] of Object.entries(obj)) {
    const type = inferType(value);
    const schema: PropertySchema = {
      name: key,
      type,
      required: true,
    };

    // If it's an array, infer the item type
    if (type === 'array' && Array.isArray(value) && value.length > 0) {
      schema.arrayItemType = inferType(value[0]);
      
      // If array of objects, infer the object schema
      if (schema.arrayItemType === 'object' && typeof value[0] === 'object' && value[0] !== null) {
        schema.objectSchema = inferObjectSchema(value[0] as JsonObject).properties;
      }
    }

    // If it's an object, infer nested schema
    if (type === 'object' && typeof value === 'object' && value !== null) {
      schema.objectSchema = inferObjectSchema(value as JsonObject).properties;
    }

    properties.push(schema);
  }

  return { properties };
}

/**
 * Validates if a value matches the expected type
 */
export function validateType(value: JsonValue, expectedType: PropertyType): boolean {
  const actualType = inferType(value);
  return actualType === expectedType;
}

/**
 * Creates a default value for a given property type
 */
export function getDefaultValue(type: PropertyType): JsonValue {
  switch (type) {
    case 'string':
      return '';
    case 'number':
      return 0;
    case 'boolean':
      return false;
    case 'null':
      return null;
    case 'array':
      return [];
    case 'object':
      return {};
    default:
      return null;
  }
}

/**
 * Creates a default object based on a schema
 */
export function createDefaultObject(schema: ObjectSchema): JsonObject {
  const obj: JsonObject = {};

  for (const prop of schema.properties) {
    obj[prop.name] = getDefaultValue(prop.type);
  }

  return obj;
}

/**
 * Creates a default object with proper nested structure from schema
 */
export function createDefaultObjectWithNesting(schema: ObjectSchema): JsonObject {
  const obj: JsonObject = {};

  for (const prop of schema.properties) {
    if (prop.type === 'object' && prop.objectSchema) {
      // Recursively create nested objects
      obj[prop.name] = createDefaultObjectWithNesting({ properties: prop.objectSchema });
    } else if (prop.type === 'array') {
      obj[prop.name] = [];
    } else {
      obj[prop.name] = getDefaultValue(prop.type);
    }
  }

  return obj;
}

/**
 * Pretty prints JSON with indentation
 */
export function formatJson(value: JsonValue): string {
  return JSON.stringify(value, null, 2);
}

/**
 * Safely parses JSON string
 */
export function parseJson(jsonString: string): { success: boolean; data?: JsonValue; error?: string } {
  try {
    const data = JSON.parse(jsonString);
    return { success: true, data };
  } catch (error) {
    return { 
      success: false, 
      error: error instanceof Error ? error.message : 'Invalid JSON' 
    };
  }
}

/**
 * Extracts an identifying label from an object by looking for common identifier properties
 * Priority order: id, name, title, label, code, key, sku, productId, userId, etc.
 */
export function getObjectIdentifier(obj: JsonObject): string | null {
  // Common identifier property names in priority order
  const identifierKeys = [
    'id', 'ID', 'Id',
    'name', 'Name', 'NAME',
    'SKU', 'sku',
    'title', 'Title',
    'label', 'Label',
    'code', 'Code',
    'key', 'Key',
    'sku', 'SKU',
    'productId', 'ProductId', 'product_id',
    'userId', 'UserId', 'user_id',
    'itemId', 'ItemId', 'item_id',
    'identifier', 'Identifier'
  ];

  for (const key of identifierKeys) {
    if (key in obj) {
      const value = obj[key];
      // Only return if it's a simple primitive value
      if (typeof value === 'string' || typeof value === 'number') {
        return String(value);
      }
    }
  }

  // Fallback: look for the first string or number property
  for (const value of Object.values(obj)) {
    if (typeof value === 'string' || typeof value === 'number') {
      return String(value);
    }
  }

  return null;
}

/**
 * Gets the property name that was used as identifier (for display purposes)
 */
function getIdentifierKeyName(obj: JsonObject): string | null {
  const identifierKeys = [
    'id', 'ID', 'Id',
    'name', 'Name', 'NAME',
    'SKU', 'sku',
    'title', 'Title',
    'label', 'Label',
    'code', 'Code',
    'key', 'Key',
    'productId', 'ProductId', 'product_id',
    'userId', 'UserId', 'user_id',
    'itemId', 'ItemId', 'item_id',
    'identifier', 'Identifier'
  ];

  for (const key of identifierKeys) {
    if (key in obj) {
      const value = obj[key];
      if (typeof value === 'string' || typeof value === 'number') {
        return key;
      }
    }
  }

  // Return first string/number property name
  for (const [key, value] of Object.entries(obj)) {
    if (typeof value === 'string' || typeof value === 'number') {
      return key;
    }
  }

  return null;
}

/**
 * Creates a descriptive label for copying an object, with fallback to parent context
 * @param obj The object to copy
 * @param index The index of the object in the list (for "Item X" or "Object X")
 * @param isArrayItem Whether this is an array item (true) or nested object property (false)
 * @param parentObject Optional parent object to extract context from if obj has no identifier
 */
export function getObjectCopyLabel(
  obj: JsonObject, 
  index: number, 
  isArrayItem: boolean = true,
  parentObject?: JsonObject
): string {
  const baseLabel = isArrayItem ? `Item ${index + 1}` : `Object ${index + 1}`;
  const identifier = getObjectIdentifier(obj);
  
  if (identifier) {
    // Object has its own identifier
    return `Copy from ${baseLabel} (${identifier})`;
  }
  
  // No identifier in object, try parent
  if (parentObject) {
    const parentIdentifier = getObjectIdentifier(parentObject);
    const parentKeyName = getIdentifierKeyName(parentObject);
    
    if (parentIdentifier && parentKeyName) {
      // Parent has identifier, show nested context
      return `Copy from ${baseLabel} (in ${parentKeyName}: ${parentIdentifier})`;
    }
  }
  
  // No identifier in object or parent
  return `Copy from ${baseLabel}`;
}
