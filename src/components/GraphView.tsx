import React, { useEffect, useState, useCallback } from 'react';
import ReactFlow, {
  MiniMap,
  Controls,
  Background,
  useNodesState,
  useEdgesState,
  Panel,
  BackgroundVariant,
  Node,
  Edge,
  useReactFlow,
  getRectOfNodes,
  getTransformForBounds,
  ReactFlowProvider,
} from 'reactflow';
import 'reactflow/dist/style.css';
import { toPng } from 'html-to-image';
import dagre from 'dagre';
import { jsonToGraph } from '../utils/graphUtils';
import './GraphView.css';

// Layout helper function using Dagre
const getLayoutedElements = (nodes: Node[], edges: Edge[], direction: 'TB' | 'LR' = 'TB') => {
  const dagreGraph = new dagre.graphlib.Graph();
  dagreGraph.setDefaultEdgeLabel(() => ({}));
  
  const nodeWidth = 200;
  const nodeHeight = 80;
  
  dagreGraph.setGraph({ 
    rankdir: direction,
    nodesep: 80,
    ranksep: 120,
    marginx: 50,
    marginy: 50,
  });

  nodes.forEach((node) => {
    dagreGraph.setNode(node.id, { width: nodeWidth, height: nodeHeight });
  });

  edges.forEach((edge) => {
    dagreGraph.setEdge(edge.source, edge.target);
  });

  dagre.layout(dagreGraph);

  const layoutedNodes = nodes.map((node) => {
    const nodeWithPosition = dagreGraph.node(node.id);
    return {
      ...node,
      position: {
        x: nodeWithPosition.x - nodeWidth / 2,
        y: nodeWithPosition.y - nodeHeight / 2,
      },
    };
  });

  return { nodes: layoutedNodes, edges };
};

interface GraphViewProps {
  data: any;
}

// Inner component that uses ReactFlow hooks
const GraphViewInner: React.FC<GraphViewProps> = ({ data }) => {
  const [nodes, setNodes, onNodesChange] = useNodesState([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState([]);
  const [error, setError] = useState<string | null>(null);
  const { getNodes } = useReactFlow();
  
  // Customization options
  const [edgeType, setEdgeType] = useState<'default' | 'smoothstep' | 'step' | 'straight'>('smoothstep');
  const [backgroundVariant, setBackgroundVariant] = useState<BackgroundVariant>(BackgroundVariant.Dots);
  const [animated, setAnimated] = useState(false);
  const [showMiniMap, setShowMiniMap] = useState(true);
  const [panOnScroll, setPanOnScroll] = useState(false);
  const [zoomOnScroll, setZoomOnScroll] = useState(true);
  const [maxDepth, setMaxDepth] = useState(10);
  const [layoutDirection, setLayoutDirection] = useState<'TB' | 'LR'>('TB');
  const [useAutoLayout, setUseAutoLayout] = useState(true);

  // Export graph as PNG
  const downloadImage = useCallback(() => {
    const currentNodes = getNodes();
    
    if (currentNodes.length === 0) {
      console.error('No nodes to export');
      return;
    }

    const nodesBounds = getRectOfNodes(currentNodes);
    const imageWidth = nodesBounds.width + 200; // Add padding
    const imageHeight = nodesBounds.height + 200;
    
    const transform = getTransformForBounds(
      nodesBounds,
      imageWidth,
      imageHeight,
      0.5, // min zoom
      2,   // max zoom
      0.1  // padding
    );

    const viewportElement = document.querySelector('.react-flow__viewport') as HTMLElement;
    
    if (!viewportElement) {
      console.error('Viewport not found');
      return;
    }

    // Store original transform
    const originalTransform = viewportElement.style.transform;
    
    // Temporarily apply the full-graph transform
    viewportElement.style.transform = `translate(${transform[0]}px, ${transform[1]}px) scale(${transform[2]})`;

    // Small delay to ensure the transform is applied
    setTimeout(() => {
      toPng(viewportElement, {
        backgroundColor: '#ffffff',
        width: imageWidth,
        height: imageHeight,
        pixelRatio: 2, // Higher quality
      }).then((dataUrl) => {
        // Restore original transform
        viewportElement.style.transform = originalTransform;
        
        const a = document.createElement('a');
        a.setAttribute('download', 'graph-export.png');
        a.setAttribute('href', dataUrl);
        a.click();
      }).catch((err) => {
        console.error('Error exporting image:', err);
        // Restore original transform on error
        viewportElement.style.transform = originalTransform;
      });
    }, 100);
  }, [getNodes]);

  useEffect(() => {
    try {
      const { nodes: graphNodes, edges: graphEdges } = jsonToGraph(data, maxDepth);
      
      // Apply edge type and animation to all edges
      const styledEdges = graphEdges.map(edge => ({
        ...edge,
        type: edgeType,
        animated: animated,
      }));
      
      // Apply layout if enabled
      if (useAutoLayout) {
        const { nodes: layoutedNodes, edges: layoutedEdges } = getLayoutedElements(
          graphNodes,
          styledEdges,
          layoutDirection
        );
        setNodes(layoutedNodes);
        setEdges(layoutedEdges);
      } else {
        setNodes(graphNodes);
        setEdges(styledEdges);
      }
      
      setError(null);
    } catch (err) {
      console.error('Error generating graph:', err);
      setError('Failed to generate graph visualization');
    }
  }, [data, setNodes, setEdges, edgeType, animated, maxDepth, layoutDirection, useAutoLayout]);

  if (error) {
    return (
      <div className="graph-error">
        <p>{error}</p>
      </div>
    );
  }

  return (
    <div className="graph-view-container">
      <ReactFlow
        nodes={nodes}
        edges={edges}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        fitView
        fitViewOptions={{
          padding: 0.2,
          minZoom: 0.1,
          maxZoom: 1.5,
        }}
        minZoom={0.05}
        maxZoom={4}
        panOnScroll={panOnScroll}
        zoomOnScroll={zoomOnScroll}
        zoomOnDoubleClick={true}
        selectNodesOnDrag={false}
        nodesDraggable={true}
      >
        <Background 
          variant={backgroundVariant} 
          gap={16} 
          size={1} 
          color="#e0e0e0"
        />
        <Controls 
          showZoom={true}
          showFitView={true}
          showInteractive={false}
        />
        {showMiniMap && (
          <MiniMap 
            nodeColor={(node) => {
              return node.style?.background as string || '#3b82f6';
            }}
            maskColor="rgba(0, 0, 0, 0.1)"
            style={{
              background: '#f8f9fa',
              border: '1px solid #ddd',
            }}
          />
        )}
        
        {/* Controls Panel */}
        <Panel position="top-left" className="graph-controls-panel">
          <div className="graph-controls">
            <h4>Graph Controls</h4>
            
            <div className="control-group">
              <label>Edge Style:</label>
              <select value={edgeType} onChange={(e) => setEdgeType(e.target.value as any)}>
                <option value="smoothstep">Smooth Step</option>
                <option value="default">Bezier</option>
                <option value="step">Step</option>
                <option value="straight">Straight</option>
              </select>
            </div>

            <div className="control-group">
              <label>Background:</label>
              <select value={backgroundVariant} onChange={(e) => setBackgroundVariant(e.target.value as any)}>
                <option value={BackgroundVariant.Dots}>Dots</option>
                <option value={BackgroundVariant.Lines}>Lines</option>
                <option value={BackgroundVariant.Cross}>Cross</option>
              </select>
            </div>

            <div className="control-group">
              <label>Layout Direction:</label>
              <select value={layoutDirection} onChange={(e) => setLayoutDirection(e.target.value as 'TB' | 'LR')}>
                <option value="TB">Vertical (Top-Bottom)</option>
                <option value="LR">Horizontal (Left-Right)</option>
              </select>
            </div>

            <div className="control-group">
              <label>Max Depth:</label>
              <input 
                type="range" 
                min="3" 
                max="15" 
                value={maxDepth} 
                onChange={(e) => setMaxDepth(Number(e.target.value))}
              />
              <span className="control-value">{maxDepth}</span>
            </div>

            <div className="control-group-checkbox">
              <label>
                <input 
                  type="checkbox" 
                  checked={useAutoLayout} 
                  onChange={(e) => setUseAutoLayout(e.target.checked)}
                />
                <span>Auto Layout</span>
              </label>
            </div>

            <div className="control-group-checkbox">
              <label>
                <input 
                  type="checkbox" 
                  checked={animated} 
                  onChange={(e) => setAnimated(e.target.checked)}
                />
                <span>Animated Edges</span>
              </label>
            </div>

            <div className="control-group-checkbox">
              <label>
                <input 
                  type="checkbox" 
                  checked={showMiniMap} 
                  onChange={(e) => setShowMiniMap(e.target.checked)}
                />
                <span>Show MiniMap</span>
              </label>
            </div>

            <div className="control-group-checkbox">
              <label>
                <input 
                  type="checkbox" 
                  checked={panOnScroll} 
                  onChange={(e) => setPanOnScroll(e.target.checked)}
                />
                <span>Pan on Scroll</span>
              </label>
            </div>

            <div className="control-group-checkbox">
              <label>
                <input 
                  type="checkbox" 
                  checked={zoomOnScroll} 
                  onChange={(e) => setZoomOnScroll(e.target.checked)}
                />
                <span>Zoom on Scroll</span>
              </label>
            </div>

            <div className="control-group">
              <button className="export-button" onClick={downloadImage}>
                📸 Export as PNG
              </button>
            </div>
          </div>
        </Panel>

        {/* Stats Panel */}
        <Panel position="top-right" className="graph-info-panel">
          <div className="graph-stats">
            <span className="stat-item">
              <strong>{nodes.length}</strong> nodes
            </span>
            <span className="stat-item">
              <strong>{edges.length}</strong> edges
            </span>
          </div>
        </Panel>
      </ReactFlow>
    </div>
  );
};

// Wrapper component with ReactFlowProvider
export const GraphView: React.FC<GraphViewProps> = ({ data }) => {
  return (
    <ReactFlowProvider>
      <GraphViewInner data={data} />
    </ReactFlowProvider>
  );
};
