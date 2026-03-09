import React, { useState } from 'react';
import { GitBranch, LayoutGrid, Package } from 'lucide-react';
import WorkflowTemplateManager from './WorkflowTemplateManager';
import FormTypeManager from './FormTypeManager';
import ResourceManager from './ResourceManager';

type AdminTab = 'templates' | 'formtypes' | 'resources';

const TABS: { key: AdminTab; label: string; icon: React.ElementType }[] = [
  { key: 'templates',  label: 'Workflow Templates', icon: GitBranch },
  { key: 'formtypes',  label: 'Loại biểu mẫu',      icon: LayoutGrid },
  { key: 'resources',  label: 'Tài nguyên',          icon: Package },
];

export default function AdminHub() {
  const [tab, setTab] = useState<AdminTab>('templates');

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      {/* Tab navigation */}
      <div style={{ display: 'flex', borderBottom: '2px solid #E2E8F4', marginBottom: 20, gap: 0 }}>
        {TABS.map(t => {
          const active = tab === t.key;
          return (
            <button
              key={t.key}
              onClick={() => setTab(t.key)}
              style={{
                display: 'flex', alignItems: 'center', gap: 7,
                padding: '10px 20px',
                border: 'none', background: 'none', cursor: 'pointer',
                fontFamily: 'inherit', fontSize: 13,
                fontWeight: active ? 700 : 500,
                color: active ? '#0E1F40' : '#8896B0',
                borderBottom: active ? '2px solid #0E1F40' : '2px solid transparent',
                marginBottom: -2,
                transition: 'color .15s, border-color .15s',
              }}
            >
              <t.icon size={14} />
              {t.label}
            </button>
          );
        })}
      </div>

      {/* Tab content */}
      <div style={{ flex: 1, overflow: 'auto' }}>
        {tab === 'templates' && <WorkflowTemplateManager />}
        {tab === 'formtypes' && <FormTypeManager />}
        {tab === 'resources' && <ResourceManager />}
      </div>
    </div>
  );
}
