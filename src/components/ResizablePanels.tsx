import React from 'react';
import './ResizablePanels.css';

interface ResizablePanelsProps {
  leftPanel: React.ReactNode;
  rightPanel: React.ReactNode;
  minWidth?: number;
}

export const ResizablePanels: React.FC<ResizablePanelsProps> = ({ 
  leftPanel, 
  rightPanel,
  minWidth = 300 
}) => {
  const [leftWidth, setLeftWidth] = React.useState(50); // percentage
  const [isDragging, setIsDragging] = React.useState(false);
  const containerRef = React.useRef<HTMLDivElement>(null);

  const handleMouseDown = (e: React.MouseEvent) => {
    e.preventDefault();
    setIsDragging(true);
  };

  React.useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (!isDragging || !containerRef.current) return;

      const containerRect = containerRef.current.getBoundingClientRect();
      const containerWidth = containerRect.width;
      const mouseX = e.clientX - containerRect.left;
      
      // Calculate percentage
      let newLeftWidth = (mouseX / containerWidth) * 100;
      
      // Enforce minimum widths (convert minWidth to percentage)
      const minWidthPercent = (minWidth / containerWidth) * 100;
      newLeftWidth = Math.max(minWidthPercent, Math.min(100 - minWidthPercent, newLeftWidth));
      
      setLeftWidth(newLeftWidth);
    };

    const handleMouseUp = () => {
      setIsDragging(false);
    };

    if (isDragging) {
      document.addEventListener('mousemove', handleMouseMove);
      document.addEventListener('mouseup', handleMouseUp);
      document.body.style.cursor = 'col-resize';
      document.body.style.userSelect = 'none';
    }

    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
    };
  }, [isDragging, minWidth]);

  return (
    <div className="resizable-panels" ref={containerRef}>
      <div 
        className="resizable-panel left-panel" 
        style={{ width: `${leftWidth}%` }}
      >
        {leftPanel}
      </div>
      
      <div 
        className={`resizable-divider ${isDragging ? 'dragging' : ''}`}
        onMouseDown={handleMouseDown}
      >
        <div className="divider-handle"></div>
      </div>
      
      <div 
        className="resizable-panel right-panel" 
        style={{ width: `${100 - leftWidth}%` }}
      >
        {rightPanel}
      </div>
    </div>
  );
};
