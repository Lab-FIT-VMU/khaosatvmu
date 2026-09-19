import React, { useState, useEffect } from 'react';
import { agentMemoryService, type MemoryResult } from '../services/agentMemoryService';

export const AgentMemoryWidget: React.FC = () => {
  const [isOpen, setIsOpen] = useState(false);
  const [isOnline, setIsOnline] = useState<boolean | null>(null);
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<MemoryResult[]>([]);
  const [newMemory, setNewMemory] = useState('');
  const [tags, setTags] = useState('vmu,rules');
  const [message, setMessage] = useState('');

  useEffect(() => {
    checkStatus();
  }, []);

  const checkStatus = async () => {
    const online = await agentMemoryService.checkHealth();
    setIsOnline(online);
  };

  const handleSearch = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!query.trim()) return;
    const res = await agentMemoryService.recallMemory(query);
    setResults(res);
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newMemory.trim()) return;
    const tagArray = tags.split(',').map((t) => t.trim()).filter(Boolean);
    const success = await agentMemoryService.saveMemory({
      content: newMemory,
      tags: tagArray,
    });
    if (success) {
      setMessage('✅ Đã ghi nhớ thành công!');
      setNewMemory('');
      setTimeout(() => setMessage(''), 3000);
    } else {
      setMessage('❌ Thao tác thất bại. Kiểm tra kết nối AgentMemory (Port 3111)');
    }
  };

  return (
    <div style={{ position: 'relative', display: 'inline-block' }}>
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="btn btn-secondary btn-sm"
        title="Agent Memory Runtime Status & Recall"
        style={{ display: 'flex', alignItems: 'center', gap: '6px' }}
      >
        <span
          style={{
            width: '8px',
            height: '8px',
            borderRadius: '50%',
            backgroundColor: isOnline ? '#10b981' : '#f59e0b',
            display: 'inline-block',
          }}
        />
        🧠 Agent Memory
      </button>

      {isOpen && (
        <div
          style={{
            position: 'absolute',
            top: '110%',
            right: 0,
            width: '360px',
            backgroundColor: 'var(--color-bg-card, #1e293b)',
            border: '1px solid var(--color-border, #334155)',
            borderRadius: '8px',
            padding: '16px',
            zIndex: 1000,
            boxShadow: '0 10px 25px -5px rgba(0,0,0,0.5)',
            color: 'var(--color-text, #f8fafc)',
            fontSize: '13px',
          }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
            <strong style={{ fontSize: '14px' }}>🧠 AgentMemory Runtime</strong>
            <a
              href="http://localhost:3113"
              target="_blank"
              rel="noreferrer"
              style={{ color: '#38bdf8', textDecoration: 'underline', fontSize: '13px' }}
            >
              Mở Viewer (3113) ↗
            </a>
          </div>

          <div style={{ marginBottom: '12px', padding: '8px', background: '#0f172a', borderRadius: '4px' }}>
            Trạng thái: {isOnline ? <span style={{ color: '#10b981' }}>ONLINE (Port 3111)</span> : <span style={{ color: '#f59e0b' }}>OFFLINE / STANDBY</span>}
          </div>

          {/* Recall Form */}
          <form onSubmit={handleSearch} style={{ marginBottom: '12px' }}>
            <label style={{ display: 'block', fontWeight: 600, marginBottom: '4px' }}>Truy vấn Bộ nhớ (Recall):</label>
            <div style={{ display: 'flex', gap: '6px' }}>
              <input
                type="text"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="VD: quy chuẩn VMU, khảo sát..."
                style={{
                  flex: 1,
                  padding: '6px 8px',
                  borderRadius: '4px',
                  border: '1px solid #475569',
                  background: '#0f172a',
                  color: '#fff',
                }}
              />
              <button type="submit" className="btn btn-primary btn-sm">Tìm</button>
            </div>
          </form>

          {results.length > 0 && (
            <div style={{ maxHeight: '120px', overflowY: 'auto', marginBottom: '12px', background: '#0f172a', padding: '6px', borderRadius: '4px' }}>
              {results.map((r, i) => (
                <div key={r.id || i} style={{ marginBottom: '6px', borderBottom: '1px solid #334155', paddingBottom: '4px' }}>
                  <div style={{ fontSize: '13px', color: '#cbd5e1' }}>{r.content}</div>
                  <div style={{ fontSize: '13px', color: '#000000' }}>Score: {r.score?.toFixed(2) || 'N/A'}</div>
                </div>
              ))}
            </div>
          )}

          {/* Save Form */}
          <form onSubmit={handleSave}>
            <label style={{ display: 'block', fontWeight: 600, marginBottom: '4px' }}>Ghi nhớ mới (Save Memory):</label>
            <textarea
              value={newMemory}
              onChange={(e) => setNewMemory(e.target.value)}
              placeholder="Nhập ghi chú hoặc quy tắc..."
              rows={2}
              style={{
                width: '100%',
                padding: '6px 8px',
                borderRadius: '4px',
                border: '1px solid #475569',
                background: '#0f172a',
                color: '#fff',
                marginBottom: '6px',
              }}
            />
            <input
              type="text"
              value={tags}
              onChange={(e) => setTags(e.target.value)}
              placeholder="Tags (cách nhau bởi dấu phẩy)"
              style={{
                width: '100%',
                padding: '4px 8px',
                borderRadius: '4px',
                border: '1px solid #475569',
                background: '#0f172a',
                color: '#fff',
                marginBottom: '6px',
                fontSize: '13px',
              }}
            />
            <button type="submit" className="btn btn-secondary btn-sm" style={{ width: '100%' }}>
              💾 Lưu vào AgentMemory
            </button>
          </form>

          {message && <div style={{ marginTop: '8px', color: '#38bdf8', fontSize: '13px', textAlign: 'center' }}>{message}</div>}
        </div>
      )}
    </div>
  );
};
