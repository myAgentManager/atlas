import React, { useEffect, useState } from 'react';
import { api } from '../api.js';
import { Icon, Mark } from '../icons.jsx';
import { toast } from '../toast.jsx';

// The Atlas Knowledge Database — the mind your agents share. It fills itself
// from your profile, FAQ, and (when you let it) your website; anything a
// customer asks that it can't answer becomes a "gap" for you to teach it.
export default function Knowledge() {
  const [k, setK] = useState(null);
  const [arch, setArch] = useState(null); // Atlas's read on what kind of business this is
  const [topic, setTopic] = useState('');
  const [fact, setFact] = useState('');
  const [studying, setStudying] = useState(false);
  const [answers, setAnswers] = useState({});
  const [bulk, setBulk] = useState('');
  const [importing, setImporting] = useState(false);

  const load = () => { api.knowledge().then(setK).catch(() => {}); };
  useEffect(() => {
    load();
    Promise.all([api.business(), api.archetypes()]).then(([b, list]) => {
      setArch(list.find((a) => a.id === (b.profile?.type || b.profile?.typeDetected)) || null);
    }).catch(() => {});
  }, []);

  const add = async () => {
    if (!fact.trim()) return;
    try { await api.addFact(topic.trim(), fact.trim()); setTopic(''); setFact(''); load(); toast('Learned it.', 'ok'); }
    catch (e) { toast(e.message, 'err'); }
  };
  const remove = async (id) => { await api.removeFact(id).catch(() => {}); load(); };
  const importText = async () => {
    if (!bulk.trim()) return;
    setImporting(true);
    try { const r = await api.importKnowledge(bulk); setBulk(''); load(); toast(`Learned ${r.added} new fact${r.added !== 1 ? 's' : ''}.`, 'ok'); }
    catch (e) { toast(e.message, 'err'); }
    finally { setImporting(false); }
  };
  const study = async () => {
    setStudying(true);
    try { const r = await api.studySite(); toast(`Studied your site — learned ${r.added} new fact${r.added !== 1 ? 's' : ''}.`, 'ok'); load(); }
    catch (e) { toast(e.message, 'err'); }
    finally { setStudying(false); }
  };
  const teach = async (gapId) => {
    const ans = (answers[gapId] || '').trim();
    if (!ans) return;
    try { await api.resolveGap(gapId, ans); setAnswers({ ...answers, [gapId]: '' }); load(); toast('Got it — I know that now.', 'ok'); }
    catch (e) { toast(e.message, 'err'); }
  };

  if (!k) return <div className="knowledge-page"><div className="empty">Loading…</div></div>;

  return (
    <div className="knowledge-page">
      <div className="page-head">
        <div>
          <h1>Atlas Knowledge</h1>
          <p>What your agents know. It grows from your business details, your FAQ, and your website — and from every question customers ask.</p>
          {arch && <p className="type-note"><Icon name="brain" size={13} /> Atlas understands: <b>{arch.name}</b> — {arch.bookable ? `runs on ${arch.bookNoun}s` : 'walk-in, nothing to book'}</p>}
        </div>
        <button className="gel-btn gel-primary" disabled={studying} onClick={study}>
          {studying ? <Mark size={16} spin /> : <Icon name="globe" size={15} />} {studying ? 'Studying your site…' : 'Study my website'}
        </button>
      </div>

      <div className="kb-tiles">
        <div className="kb-tile"><b>{k.facts}</b><span>Facts known</span></div>
        <div className="kb-tile"><b className={k.gaps ? 'amber' : ''}>{k.gaps}</b><span>Gaps to teach</span></div>
        <div className="kb-tile small"><span className="kb-sources">{(k.sources || []).join(' · ') || 'nothing yet'}</span><span>Sources</span></div>
      </div>

      <div className="kb-grid">
        <div className="panel">
          <div className="panel-title"><Icon name="chat" size={14} /> Gaps — questions I couldn't answer</div>
          {k.topGaps.length === 0 && <div className="empty">Nothing unanswered. Your agents are handling everything so far.</div>}
          {k.topGaps.map((g) => (
            <div key={g.id} className="gap-row">
              <div className="gap-q"><Icon name="chat" size={13} /> {g.q} {g.count > 1 && <span className="gap-count">asked {g.count}×</span>}</div>
              <div className="gap-answer">
                <input className="field" placeholder="Teach me the answer…" value={answers[g.id] || ''}
                  onChange={(e) => setAnswers({ ...answers, [g.id]: e.target.value })}
                  onKeyDown={(e) => e.key === 'Enter' && teach(g.id)} />
                <button className="gel-btn gel-primary" onClick={() => teach(g.id)}>Teach</button>
              </div>
            </div>
          ))}
        </div>

        <div className="panel">
          <div className="panel-title"><Icon name="spark" size={14} /> Teach a fact</div>
          <input className="field" placeholder="Topic (optional)" value={topic} onChange={(e) => setTopic(e.target.value)} />
          <textarea className="field textarea" rows={3} placeholder="e.g. We offer 10% off for first-time catering orders over $200." value={fact} onChange={(e) => setFact(e.target.value)} />
          <div className="set-actions"><button className="gel-btn gel-primary" onClick={add}>Add to knowledge</button></div>
        </div>
      </div>

      <div className="panel">
        <div className="panel-title"><Icon name="file" size={14} /> Paste in knowledge</div>
        <p className="dim-note">Drop in a whole document, notes, or a Q&amp;A list and Atlas learns all of it at once — no typing facts one by one. Write questions as <span className="mono tiny">Q: …</span> and answers as <span className="mono tiny">A: …</span>, or just paste plain paragraphs.</p>
        <textarea className="field textarea" rows={6} placeholder={'Paste anything about your business…\n\nOr a list:\nQ: Do you offer gift cards?\nA: Yes, in any amount — in store or over the phone.'} value={bulk} onChange={(e) => setBulk(e.target.value)} />
        <div className="set-actions">
          <button className="gel-btn gel-primary" disabled={importing || !bulk.trim()} onClick={importText}>
            {importing ? <><Mark size={15} spin /> Learning…</> : <>Teach Atlas all of this</>}
          </button>
        </div>
      </div>

      <div className="panel kb-facts-panel">
        <div className="panel-title"><Icon name="brain" size={14} /> Recently learned <span className="count-chip">{k.facts}</span></div>
        {k.recent.length === 0 && <div className="empty">Nothing yet — fill in your Business details or study your website to get started.</div>}
        {k.recent.map((f) => (
          <div key={f.id} className="fact-row">
            <div className="fact-main">
              <div className="fact-text">{f.fact}</div>
              <div className="fact-meta"><span className="fact-topic">{f.topic}</span> · from {f.source.startsWith('http') ? 'website' : f.source}{f.uses > 0 && ` · used ${f.uses}×`}</div>
            </div>
            <button className="mini-btn ghost" onClick={() => remove(f.id)}><Icon name="close" size={13} /></button>
          </div>
        ))}
      </div>
    </div>
  );
}
