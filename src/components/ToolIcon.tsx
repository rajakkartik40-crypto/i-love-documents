import React from 'react';
import {
  Archive,
  BrainCircuit,
  ClipboardList,
  Code2,
  Columns2,
  Combine,
  Crop,
  Eraser,
  EyeOff,
  FileArchive,
  FileCode,
  FileImage,
  FileText,
  FileType,
  Grid2X2,
  Hash,
  IdCard,
  Image,
  Images,
  Languages,
  LayoutGrid,
  Lock,
  Minimize2,
  MonitorPlay,
  PenTool,
  Presentation,
  RefreshCw,
  RotateCw,
  Scaling,
  ScanLine,
  ScanText,
  Scissors,
  Sheet,
  Signature,
  SlidersHorizontal,
  Stamp,
  Table2,
  Unlock,
  UserSquare2,
  Workflow,
  Wrench,
} from 'lucide-react';

const ICON_MAP: Record<string, React.ComponentType<{ className?: string }>> = {
  Combine,
  Scissors,
  Minimize2,
  FileText,
  Presentation,
  Table2,
  FileType,
  MonitorPlay,
  Sheet,
  PenTool,
  Image,
  FileImage,
  Signature,
  Stamp,
  RotateCw,
  Code2,
  Unlock,
  Lock,
  LayoutGrid,
  Archive,
  Wrench,
  Hash,
  ScanLine,
  ScanText,
  Columns2,
  EyeOff,
  Crop,
  ClipboardList,
  BrainCircuit,
  Languages,
  FileCode,
  Workflow,
  UserSquare2,
  Images,
  Scaling,
  SlidersHorizontal,
  RefreshCw,
  FileArchive,
  Eraser,
  Grid2X2,
  IdCard,
};

interface ToolIconProps {
  iconName: string;
  bg: string;
  color: string;
  size?: 'sm' | 'md';
}

export const ToolIcon: React.FC<ToolIconProps> = ({ iconName, bg, color, size = 'md' }) => {
  const Icon = ICON_MAP[iconName] || FileText;
  const boxCls = size === 'sm' ? 'w-9 h-9 rounded-lg' : 'w-11 h-11 rounded-lg';
  const iconCls = size === 'sm' ? 'w-4 h-4' : 'w-5 h-5';

  return (
    <div
      className={`${boxCls} inline-flex items-center justify-center shrink-0`}
      style={{ backgroundColor: bg, color }}
    >
      <Icon className={iconCls} />
    </div>
  );
};
