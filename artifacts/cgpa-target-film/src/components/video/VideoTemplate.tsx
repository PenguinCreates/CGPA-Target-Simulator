import { useEffect, useRef } from 'react';
import {
  VideoCanvas,
  VideoPausedContext,
  type VideoAspectRatio,
  useVideoPlayer,
} from '@/lib/video';
import { AnimatePresence, LayoutGroup } from 'framer-motion';
import { Scene01Question } from './scenes/Scene01Question';
import { Scene02Record } from './scenes/Scene02Record';
import { Scene03Target } from './scenes/Scene03Target';
import { Scene04Scenario } from './scenes/Scene04Scenario';
import { Scene05Path } from './scenes/Scene05Path';

export const SCENE_DURATIONS = {
  question: 4667,
  record: 4666,
  target: 4667,
  scenario: 5333,
  path: 4667,
};

const VIDEO_ASPECT_RATIO: VideoAspectRatio = '16:9';
const SCENE_COMPONENTS = {
  question: Scene01Question,
  record: Scene02Record,
  target: Scene03Target,
  scenario: Scene04Scenario,
  path: Scene05Path,
};
const SCENE_START_SEC: Record<string, number> = (() => {
  const offsets: Record<string, number> = {};
  let elapsed = 0;
  for (const [key, duration] of Object.entries(SCENE_DURATIONS)) {
    offsets[key] = elapsed / 1000;
    elapsed += duration;
  }
  return offsets;
})();
const AUDIO_SEEK_EPSILON_SEC = 0.18;

export default function VideoTemplate({
  durations = SCENE_DURATIONS,
  loop = true,
  paused = false,
  muted = false,
  onSceneChange,
}: {
  durations?: Record<string, number>;
  loop?: boolean;
  paused?: boolean;
  muted?: boolean;
  onSceneChange?: (sceneKey: string) => void;
} = {}) {
  const { currentScene, currentSceneKey } = useVideoPlayer({ durations, loop, paused });
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const lastSceneKeyRef = useRef<string | null>(null);
  const baseSceneKey = currentSceneKey.replace(/_r[12]$/, '');
  const SceneComponent = SCENE_COMPONENTS[baseSceneKey as keyof typeof SCENE_COMPONENTS];

  useEffect(() => {
    onSceneChange?.(currentSceneKey);
  }, [currentSceneKey, onSceneChange]);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;
    audio.volume = 0.42;
    if (paused) {
      audio.pause();
      return;
    }
    if (lastSceneKeyRef.current !== currentSceneKey) {
      lastSceneKeyRef.current = currentSceneKey;
      const targetTime = SCENE_START_SEC[baseSceneKey] ?? 0;
      if (Math.abs(audio.currentTime - targetTime) > AUDIO_SEEK_EPSILON_SEC) {
        try {
          audio.currentTime = targetTime;
        } catch {
          // If metadata is not ready yet, the next scene transition will seek.
        }
      }
    }
    audio.play().catch(() => {});
  }, [currentSceneKey, baseSceneKey, muted, paused]);

  return (
    <VideoCanvas aspectRatio={VIDEO_ASPECT_RATIO} className="studyline-canvas" style={{ backgroundColor: 'var(--color-bg-light)' }}>
      <VideoPausedContext.Provider value={paused}>
        <div className="film-field" data-scene-index={currentScene}>
          <LayoutGroup id="studyline-film">
            <AnimatePresence mode="sync" initial={false}>
              {SceneComponent && <SceneComponent key={currentSceneKey} />}
            </AnimatePresence>
          </LayoutGroup>
        </div>
        <audio
          ref={audioRef}
          src={`${import.meta.env.BASE_URL}audio/bg_music.mp3`}
          preload="auto"
          autoPlay
          muted={muted}
        />
      </VideoPausedContext.Provider>
    </VideoCanvas>
  );
}
