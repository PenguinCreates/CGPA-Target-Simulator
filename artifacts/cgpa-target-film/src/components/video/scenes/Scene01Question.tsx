import { motion } from 'framer-motion';
import { useState } from 'react';
import { useSceneTimer } from '@/lib/video';

const EASE = [0.2, 0.75, 0.25, 1] as const;

export function Scene01Question() {
  const [measure, setMeasure] = useState(false);
  useSceneTimer([{ time: 760, callback: () => setMeasure(true) }]);

  return (
    <motion.section
      className="film-scene scene-question"
      initial={{ opacity: 0, scale: 1.035 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 1.07 }}
      transition={{ duration: 0.4, ease: EASE }}
    >
      <div className="question-grid" />
      <motion.div className="question-rail" initial={{ scaleX: 0 }} animate={{ scaleX: 1 }} transition={{ duration: 0.48, ease: EASE }} />
      <div className="question-topline">
        <span className="film-brand"><b>s.</b> studyline</span>
        <span className="micro-label">ACADEMIC PLANNER / 01</span>
      </div>
      <div className="question-headline">
        <motion.p className="eyebrow" initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1, duration: 0.32 }}>
          YOUR DEGREE, IN FOCUS
        </motion.p>
        <motion.h1 initial={{ opacity: 0, x: -24 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: 0.16, duration: 0.48, ease: EASE }}>
          What will<br />it take?
        </motion.h1>
      </div>
      <div className="measure-end measure-start">
        <span>CURRENT</span><strong>3.18</strong>
      </div>
      <motion.div className="measure-line" layoutId="studyline-band">
        <motion.div className="measure-fill" initial={{ scaleX: 0, originX: 0 }} animate={{ scaleX: measure ? 1 : 0.28 }} transition={{ duration: 0.75, ease: EASE }} />
        <motion.i className="measure-tick" initial={{ x: '-35%' }} animate={{ x: measure ? '0%' : '-35%' }} transition={{ duration: 0.72, ease: EASE }} />
        <span className="measure-dot" />
      </motion.div>
      <div className="measure-end measure-target">
        <span>TARGET</span><strong>3.60</strong>
      </div>
      <motion.div className="gap-readout" initial={{ opacity: 0, scale: 0.72 }} animate={{ opacity: 1, scale: 1 }} transition={{ delay: 0.38, duration: 0.48, type: 'spring', stiffness: 270, damping: 23 }}>
        <strong>0.42</strong><span>THE GAP</span>
      </motion.div>
      <motion.div className="question-node" layoutId="studyline-node" initial={{ scale: 0 }} animate={{ scale: 1 }} transition={{ delay: 0.72, duration: 0.28, type: 'spring', stiffness: 300, damping: 18 }} />
      <div className="scene-index"><span>01</span><i />05</div>
    </motion.section>
  );
}
