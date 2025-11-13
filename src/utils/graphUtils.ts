import { Node, Edge } from 'reactflow';

interface GraphNode extends Node {
  id: string;
  type?: string;
  position: { x: number; y: number };
  data: {
    label: string;
    value?: any;
    type: string;
  };
}

interface GraphResult {
  nodes: GraphNode[];
  edges: Edge[];
}

let nodeIdCounter = 0;

/**
 * Convert JSON data to ReactFlow nodes and edges
 */
export function jsonToGraph(data: any, maxDepth: number = 10): GraphResult {
  nodeIdCounter = 0;
  const nodes: GraphNode[] = [];
  const edges: Edge[] = [];
  const ySpacing = 120;
  const xSpacing = 280;

  function getNodeId(): string {
    return `node-${nodeIdCounter++}`;
  }

  function getTypeColor(type: string): string {
    switch (type) {
      case 'object':
        return '#3b82f6'; // Blue
      case 'array':
        return '#8b5cf6'; // Purple
      case 'string':
        return '#10b981'; // Green
      case 'number':
        return '#f59e0b'; // Orange
      case 'boolean':
        return '#ef4444'; // Red
      case 'null':
        return '#6b7280'; // Gray
      default:
        return '#3b82f6';
    }
  }

  function formatValue(value: any, type: string): string {
    if (type === 'string') {
      return value.length > 50 ? `"${value.substring(0, 47)}..."` : `"${value}"`;
    }
    if (type === 'array') {
      return `Array[${value.length}]`;
    }
    if (type === 'object' && value !== null) {
      const keys = Object.keys(value);
      return `Object{${keys.length}}`;
    }
    return String(value);
  }

  function processValue(
    value: any,
    key: string | number,
    parentId: string | null,
    depth: number,
    xOffset: number,
    yOffset: number
  ): { lastY: number; width: number } {
    if (depth > maxDepth) {
      return { lastY: yOffset, width: 0 };
    }

    const nodeId = getNodeId();
    const type = Array.isArray(value)
      ? 'array'
      : value === null
      ? 'null'
      : typeof value;

    const label = key !== '' ? `${key}: ${formatValue(value, type)}` : formatValue(value, type);

    nodes.push({
      id: nodeId,
      type: 'default',
      position: { x: xOffset, y: yOffset },
      data: {
        label,
        value,
        type,
      },
      style: {
        background: getTypeColor(type),
        color: 'white',
        border: '2px solid #1e40af',
        borderRadius: '8px',
        padding: '10px 15px',
        fontSize: '13px',
        fontFamily: "'Courier New', Courier, monospace",
        minWidth: '150px',
      },
    });

    if (parentId) {
      edges.push({
        id: `${parentId}-${nodeId}`,
        source: parentId,
        target: nodeId,
        type: 'smoothstep',
        animated: false,
        style: { stroke: '#93c5fd', strokeWidth: 2 },
      });
    }

    let currentY = yOffset;
    let maxWidth = 1;

    if (type === 'object' && value !== null) {
      const entries = Object.entries(value);
      let childY = currentY + ySpacing;

      entries.forEach(([childKey, childValue]) => {
        const result = processValue(
          childValue,
          childKey,
          nodeId,
          depth + 1,
          xOffset + xSpacing,
          childY
        );
        childY = result.lastY + ySpacing;
        maxWidth = Math.max(maxWidth, result.width + 1);
      });

      currentY = childY - ySpacing;
    } else if (type === 'array') {
      let childY = currentY + ySpacing;

      (value as any[]).forEach((item, index) => {
        const result = processValue(
          item,
          index,
          nodeId,
          depth + 1,
          xOffset + xSpacing,
          childY
        );
        childY = result.lastY + ySpacing;
        maxWidth = Math.max(maxWidth, result.width + 1);
      });

      currentY = childY - ySpacing;
    }

    return { lastY: currentY, width: maxWidth };
  }

  // Start processing from the root
  const rootType = Array.isArray(data) ? 'array' : typeof data;
  if (rootType === 'object' || rootType === 'array') {
    processValue(data, 'root', null, 0, 0, 0);
  } else {
    // Handle primitive root values
    const nodeId = getNodeId();
    nodes.push({
      id: nodeId,
      type: 'default',
      position: { x: 0, y: 0 },
      data: {
        label: formatValue(data, rootType),
        value: data,
        type: rootType,
      },
      style: {
        background: getTypeColor(rootType),
        color: 'white',
        border: '2px solid #1e40af',
        borderRadius: '8px',
        padding: '10px 15px',
        fontSize: '13px',
        fontFamily: "'Courier New', Courier, monospace",
      },
    });
  }

  return { nodes, edges };
}
