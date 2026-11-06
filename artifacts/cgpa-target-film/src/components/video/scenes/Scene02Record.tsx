import { motion } from 'framer-motion';
import { useState } from 'react';
import { useSceneTimer } from '@/lib/video';

const ROWS = [
  { term: 'SEM 01', course: 'BIOLOGY', grade: 'A', pts: '4.0' },
  { term: 'SEM 01', course: 'WRITING', grade: 'A', pts: '4.0' },
  { term: 'SEM 02', course: 'STATISTICS', grade: 'B+', pts: '3.5' },
  { term: 'SEM 02', course: 'HISTORY', grade: 'B+', pts: '3.5' },
];
const EASE = [0.2, 0.75, 0.25, 1] as const;

export function Scene02Record() {
  const [complete, setComplete] = useState(false);
  useSceneTimer([{ time: 2460, callback: () => setComplete(true) }]);

  return (
    <motion.section
      className="film-scene scene-record"
      initial={{ opacity: 0, scale: 1.045 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 1.09 }}
      transition={{ duration: 0.42, ease: EASE }}
    >
      <div className="record-wash" />
      <div className="record-header">
        <span className="micro-label">YOUR ACADEMIC RECORD</span>
        <span className="record-count">02 TERMS <i>•</i> 24 CREDITS</span>
      </div>
      <motion.div className="record-title" initial={{ y: 28, opacity: 0 }} animate={{ y: 0, opacity: 1 }} transition={{ delay: 0.12, duration: 0.44, ease: EASE }}>
        <h2>Completed<br /><em>semesters.</em></h2>
        <p>Real coursework. A reliable starting point.</p>
      </motion.div>
      <div className="ledger">
        <div className="ledger-top">
          <span>COURSE</span><span>GRADE</span><span>POINTS</span>
        </div>
        {ROWS.map((row, index) => (
          <motion.div className="ledger-row" key={row.course} initial={{ opacity: 0, x: index % 2 ? 30 : -30 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: 0.36 + index * 0.13, duration: 0.38, ease: EASE }}>
            <span className="ledger-course"><small>{row.term}</small>{row.course}</span>
            <b className={row.grade === 'A' ? 'grade-a' : 'grade-b'}>{row.grade}</b>
            <span className="ledger-points">{row.pts}</span>
          </motion.div>
        ))}
        <div className="ledger-footer"><span>QUALITY POINTS</span><strong>{complete ? '87.0' : '—'}</strong></div>
      </div>
      <div className="record-trajectory">
        <div className="trajectory-label">SEMESTER GPA</div>
        <svg viewBox="0 0 360 200" role="presentation">
          <path className="trajectory-gridline" d="M0 48H360M0 100H360M0 152H360" />
          <motion.path className="trajectory-path" d="M20 145 C75 142 91 91 145 103 S220 135 268 75 S321 64 344 34" initial={{ pathLength: 0 }} animate={{ pathLength: 1 }} transition={{ delay: 0.72, duration: 1.15, ease: EASE }} />
          <motion.circle cx="344" cy="34" r="7" className="trajectory-endpoint" initial={{ scale: 0 }} animate={{ scale: 1 }} transition={{ delay: 1.72, type: 'spring', stiffness: 280, damping: 18 }} />
        </svg>
        <div className="trajectory-terms"><span>SEM 01 <b>3.83</b></span><span>SEM 02 <b>3.42</b></span></div>
      </div>
      <motion.div className="record-handoff-node" layoutId="studyline-node" />
      <motion.div className="current-tag" initial={{ opacity: 0, scale: 0.84 }} animate={{ opacity: 1, scale: 1 }} transition={{ delay: 2.52, duration: 0.32 }}>
        <span>CURRENT CGPA</span><strong>3.63</strong>
      </motion.div>
      <div className="scene-index"><span>02</span><i />05</div>
    </motion.section>
  );
}
