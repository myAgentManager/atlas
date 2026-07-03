// Minimal toast bus — replaces native alert()/confirm() white popups with
// in-app notices styled to match the deck.
import React, { useEffect, useState } from 'react';

let seq = 0;
export function toast(message, kind = 'info') {
  window.dispatchEvent(new CustomEvent('atlas-toast', { detail: { id: ++seq, message, kind } }));
}

export function Toaster() {
  const [items, setItems] = useState([]);
  useEffect(() => {
    const on = (e) => {
      const t = e.detail;
      setItems((prev) => [...prev, t]);
      setTimeout(() => setItems((prev) => prev.filter((x) => x.id !== t.id)), 4200);
    };
    window.addEventListener('atlas-toast', on);
    return () => window.removeEventListener('atlas-toast', on);
  }, []);
  return (
    <div className="toaster">
      {items.map((t) => (
        <div key={t.id} className={`toast ${t.kind}`}>
          <span className="toast-dot" />
          {t.message}
        </div>
      ))}
    </div>
  );
}
