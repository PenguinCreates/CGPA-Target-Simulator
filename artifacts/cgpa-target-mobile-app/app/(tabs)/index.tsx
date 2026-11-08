import AsyncStorage from '@react-native-async-storage/async-storage';
import { Feather } from '@expo/vector-icons';
import { useEffect, useMemo, useState } from 'react';
import { Platform, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { KeyboardAwareScrollViewCompat } from '@/components/KeyboardAwareScrollViewCompat';
import { useColors } from '@/hooks/useColors';
import { calculate, GRADES, POINTS } from '@/lib/cgpa-calculations';
import type { Course, Grade, Plan, Semester } from '@/lib/cgpa-calculations';

const STORAGE_KEY = 'studyline.cgpa.mobile.v1';
const id = (kind: string) => `${kind}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
const emptyPlan = (): Plan => ({
  semesters: [],
  scenarioCourses: [],
  target: { targetCgpa: 3.6, graduationCredits: 120, remainingSemesters: 4 },
});

function normalizePlan(value: unknown): Plan {
  if (!value || typeof value !== 'object') return emptyPlan();
  const input = value as Partial<Plan>;
  if (!Array.isArray(input.semesters) || !input.target) return emptyPlan();
  const normalizeCourse = (candidate: Partial<Course>): Course => ({
    id: String(candidate.id || id('course')),
    name: String(candidate.name ?? ''),
    creditHours: candidate.creditHours === '' || candidate.creditHours == null
      ? ''
      : Math.max(0, Math.min(1000, Number(candidate.creditHours) || 0)),
    gradeEarned: GRADES.includes(candidate.gradeEarned as Grade) ? candidate.gradeEarned as Grade : 'B',
  });
  const numberOrBlank = (candidate: unknown, maximum: number): number | '' =>
    candidate === '' || candidate == null ? '' : Math.max(0, Math.min(maximum, Number(candidate) || 0));
  return {
    semesters: input.semesters.map((term) => ({
      id: String(term?.id || id('semester')),
      name: String(term?.name ?? ''),
      courses: Array.isArray(term?.courses) ? term.courses.map(normalizeCourse) : [],
    })),
    scenarioCourses: Array.isArray(input.scenarioCourses) ? input.scenarioCourses.map(normalizeCourse) : [],
    target: {
      targetCgpa: numberOrBlank(input.target.targetCgpa, 4),
      graduationCredits: numberOrBlank(input.target.graduationCredits ?? 120, 1000),
      remainingSemesters: numberOrBlank(input.target.remainingSemesters ?? 4, 20),
    },
  };
}

export default function HomeScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const [plan, setPlan] = useState<Plan>(emptyPlan);
  const [loaded, setLoaded] = useState(false);
  const [issue, setIssue] = useState('');
  const [creditDrafts, setCreditDrafts] = useState<Record<string, string>>({});
  const [targetDrafts, setTargetDrafts] = useState<Partial<Record<keyof Plan['target'], string>>>({});
  const metrics = useMemo(() => calculate(plan), [plan]);
  const webTop = Platform.OS === 'web' ? 67 : 12;
  const webBottom = Platform.OS === 'web' ? 34 : Math.max(insets.bottom, 20);

  useEffect(() => {
    let active = true;
    AsyncStorage.getItem(STORAGE_KEY).then((raw) => {
      if (active && raw) setPlan(normalizePlan(JSON.parse(raw)));
    }).catch(() => {
      if (active) setIssue('Saved plan could not be read. Your current plan is still available.');
    }).finally(() => {
      if (active) setLoaded(true);
    });
    return () => { active = false; };
  }, []);

  useEffect(() => {
    if (!loaded) return;
    AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(plan)).then(() => setIssue('')).catch(() => {
      setIssue('This plan could not be saved on this device.');
    });
  }, [loaded, plan]);

  const addSemester = () => {
    const next: Semester = { id: id('semester'), name: `Semester ${plan.semesters.length + 1}`, courses: [] };
    setPlan((current) => ({ ...current, semesters: [...current.semesters, next] }));
  };

  const addCourse = (semesterId?: string) => {
    const next: Course = { id: id('course'), name: '', creditHours: 3, gradeEarned: 'B' };
    setPlan((current) => semesterId
      ? { ...current, semesters: current.semesters.map((semester) => semester.id === semesterId ? { ...semester, courses: [...semester.courses, next] } : semester) }
      : { ...current, scenarioCourses: [...current.scenarioCourses, next] });
  };

  const updateCourse = (courseId: string, semesterId: string | null, update: Partial<Course>) => {
    setPlan((current) => semesterId
      ? {
          ...current,
          semesters: current.semesters.map((semester) => semester.id === semesterId
            ? { ...semester, courses: semester.courses.map((course) => course.id === courseId ? { ...course, ...update } : course) }
            : semester),
        }
      : { ...current, scenarioCourses: current.scenarioCourses.map((course) => course.id === courseId ? { ...course, ...update } : course) });
  };

  const removeCourse = (courseId: string, semesterId: string | null) => {
    setCreditDrafts((current) => {
      const next = { ...current };
      delete next[courseId];
      return next;
    });
    setPlan((current) => semesterId
      ? {
          ...current,
          semesters: current.semesters.map((semester) => semester.id === semesterId
            ? { ...semester, courses: semester.courses.filter((course) => course.id !== courseId) }
            : semester),
        }
      : { ...current, scenarioCourses: current.scenarioCourses.filter((course) => course.id !== courseId) });
  };

  const updateCourseCredits = (courseId: string, semesterId: string | null, text: string) => {
    setCreditDrafts((current) => ({ ...current, [courseId]: text }));
    const credits = text.trim() === '' ? '' : Number(text);
    if (credits === '' || Number.isFinite(credits)) updateCourse(courseId, semesterId, { creditHours: credits });
  };

  const updateTarget = (key: keyof Plan['target'], text: string) => {
    setTargetDrafts((current) => ({ ...current, [key]: text }));
    const value = text.trim() === '' ? '' : Number(text);
    if (value === '' || Number.isFinite(value)) {
      setPlan((current) => ({ ...current, target: { ...current.target, [key]: value } }));
    }
  };

  const targetValue = (key: keyof Plan['target']) => targetDrafts[key] ?? String(plan.target[key]);
  const statusColor = metrics.status.tone === 'success'
    ? colors.success
    : metrics.status.tone === 'danger'
      ? colors.destructive
      : colors.warning;
  const statusSurface = metrics.status.tone === 'success'
    ? colors.successSurface
    : metrics.status.tone === 'danger'
      ? colors.dangerSurface
      : colors.warningSurface;
  const requiredGpa = metrics.needed === null ? '—' : Number.isFinite(metrics.needed) ? metrics.needed.toFixed(2) : '∞';

  return (
    <KeyboardAwareScrollViewCompat
      style={{ backgroundColor: colors.background }}
      contentContainerStyle={[styles.content, { paddingTop: webTop, paddingBottom: webBottom + 20 }]}
      keyboardShouldPersistTaps="handled"
      bottomOffset={24}
    >
      <View style={[styles.topbar, { borderColor: colors.border }]}>
        <View style={[styles.brandIcon, { backgroundColor: colors.primary }]}>
          <Text style={[styles.brandIconText, { color: colors.primaryForeground }]}>s.</Text>
        </View>
        <View style={styles.brandText}>
          <Text style={[styles.brandName, { color: colors.foreground }]}>studyline</Text>
          <Text style={[styles.brandSubtitle, { color: colors.mutedForeground }]}>ACADEMIC PLANNER</Text>
        </View>
        <Text style={[styles.saveState, { color: colors.mutedForeground }]}>{loaded ? 'Saved on this device' : 'Loading plan'}</Text>
      </View>

      <View style={styles.intro}>
        <Text style={[styles.eyebrow, { color: colors.primary }]}>YOUR DEGREE, IN FOCUS</Text>
        <Text style={[styles.title, { color: colors.foreground }]}>CGPA target</Text>
        <Text style={[styles.subtitle, { color: colors.mutedForeground }]}>Track your progress and adjust upcoming courses to see the grades you need.</Text>
      </View>

      <View style={styles.metrics}>
        <Metric label="CURRENT CGPA" value={metrics.current === null ? '—' : metrics.current.toFixed(2)} detail={`${metrics.credits.toFixed(1)} credits completed`} colors={colors} />
        <Metric label="REQUIRED GPA" value={requiredGpa} detail="remaining degree credits" colors={colors} />
      </View>
      <View style={[styles.status, { backgroundColor: statusSurface }]}>
        <View style={[styles.statusDot, { backgroundColor: statusColor }]} />
        <Text style={[styles.statusText, { color: statusColor }]}>{metrics.status.label}</Text>
      </View>

      <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
        <SectionTitle eyebrow="GRADUATION PLAN" title="Your target" colors={colors} />
        <View style={styles.targetGrid}>
          <TargetField label="Target CGPA" value={targetValue('targetCgpa')} suffix="/ 4.0" onChangeText={(text) => updateTarget('targetCgpa', text)} colors={colors} />
          <TargetField label="Degree credits" value={targetValue('graduationCredits')} suffix="cr" onChangeText={(text) => updateTarget('graduationCredits', text)} colors={colors} />
          <TargetField label="Semesters left" value={targetValue('remainingSemesters')} suffix="terms" onChangeText={(text) => updateTarget('remainingSemesters', text)} colors={colors} />
        </View>
        <View style={[styles.projection, { backgroundColor: colors.primary }]}>
          <Text style={[styles.projectionLabel, { color: colors.primaryForeground }]}>NEEDED FOR REMAINING CREDITS</Text>
          <Text style={[styles.projectionValue, { color: colors.primaryForeground }]}>{requiredGpa}</Text>
          <Text style={[styles.projectionDetail, { color: colors.primaryForeground }]}>
            {Math.max(0, metrics.remaining).toFixed(1)} credits remain after this scenario.
          </Text>
        </View>
      </View>

      <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
        <SectionTitle eyebrow="ACADEMIC RECORD" title="Completed semesters" colors={colors} />
        {plan.semesters.length === 0 ? (
          <Text style={[styles.helper, { color: colors.mutedForeground }]}>Add your completed coursework to calculate your current CGPA and remaining credits.</Text>
        ) : null}
        {plan.semesters.map((semester, index) => {
          const termCredits = semester.courses.reduce((sum, course) => sum + (Number(course.creditHours) || 0), 0);
          const termPoints = semester.courses.reduce((sum, course) => sum + (Number(course.creditHours) || 0) * POINTS[course.gradeEarned], 0);
          const termGpa = termCredits > 0 ? (termPoints / termCredits).toFixed(2) : '—';
          return (
            <View key={semester.id} style={[styles.semester, { borderColor: colors.border, backgroundColor: colors.background }]}>
              <TextInput
                accessibilityLabel={`Semester ${index + 1} name`}
                value={semester.name}
                onChangeText={(name) => setPlan((current) => ({ ...current, semesters: current.semesters.map((item) => item.id === semester.id ? { ...item, name } : item) }))}
                style={[styles.semesterName, { color: colors.foreground }]}
              />
              <Text style={[styles.helperSmall, { color: colors.mutedForeground }]}>{termCredits.toFixed(1)} credits · {termGpa} GPA</Text>
              {semester.courses.map((course) => (
                <CourseEditor
                  key={course.id}
                  course={course}
                  creditsText={creditDrafts[course.id] ?? String(course.creditHours)}
                  colors={colors}
                  onNameChange={(name) => updateCourse(course.id, semester.id, { name })}
                  onCreditsChange={(text) => updateCourseCredits(course.id, semester.id, text)}
                  onBlurCredits={() => setCreditDrafts((current) => ({ ...current, [course.id]: String(course.creditHours) }))}
                  onGradePress={() => cycleGrade(course, (grade) => updateCourse(course.id, semester.id, { gradeEarned: grade }))}
                  onRemove={() => removeCourse(course.id, semester.id)}
                />
              ))}
              <ActionButton label="Add completed course" icon="plus" onPress={() => addCourse(semester.id)} colors={colors} />
            </View>
          );
        })}
        <ActionButton label="Add semester" icon="plus" onPress={addSemester} colors={colors} testID="button-add-semester" />
      </View>

      <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
        <View style={styles.scenarioHeading}>
          <SectionTitle eyebrow="WHAT-IF SIMULATION" title="Upcoming courses" colors={colors} />
          <Text style={[styles.scenarioValue, { color: colors.primary }]}>{metrics.projected === null ? '—' : metrics.projected.toFixed(2)}</Text>
        </View>
        <Text style={[styles.helper, { color: colors.mutedForeground }]}>Planned grades affect your forecast, not your completed record.</Text>
        {metrics.scenarioExceedsRemainingCredits ? (
          <View
            testID="warning-scenario-credit-overage"
            accessibilityRole="alert"
            accessibilityLiveRegion="polite"
            style={[styles.warning, { backgroundColor: colors.warningSurface, borderColor: colors.warning }]}
          >
            <Feather name="alert-triangle" size={19} color={colors.warning} />
            <Text style={[styles.warningText, { color: colors.warning }]}>
              Planned courses exceed your remaining degree credits by {metrics.scenarioCreditOverage.toFixed(1)} credits. Reduce course credits or remove a what-if course.
            </Text>
          </View>
        ) : null}
        {plan.scenarioCourses.length === 0 ? (
          <Text style={[styles.helper, { color: colors.mutedForeground }]}>No planned courses yet. Add one to see how it could change your CGPA.</Text>
        ) : null}
        {plan.scenarioCourses.map((course) => (
          <CourseEditor
            key={course.id}
            course={course}
            creditsText={creditDrafts[course.id] ?? String(course.creditHours)}
            colors={colors}
            onNameChange={(name) => updateCourse(course.id, null, { name })}
            onCreditsChange={(text) => updateCourseCredits(course.id, null, text)}
            onBlurCredits={() => setCreditDrafts((current) => ({ ...current, [course.id]: String(course.creditHours) }))}
            onGradePress={() => cycleGrade(course, (grade) => updateCourse(course.id, null, { gradeEarned: grade }))}
            onRemove={() => removeCourse(course.id, null)}
          />
        ))}
        <ActionButton label="Add hypothetical course" icon="plus" onPress={() => addCourse()} colors={colors} testID="button-add-scenario-course" />
      </View>

      {issue ? <Text accessibilityRole="alert" style={[styles.issue, { color: colors.destructive }]}>{issue}</Text> : null}
      <Text style={[styles.footer, { color: colors.mutedForeground }]}>Your plan stays on this device. Confirm degree requirements with your university.</Text>
    </KeyboardAwareScrollViewCompat>
  );
}

function cycleGrade(course: Course, update: (grade: Grade) => void) {
  update(GRADES[(GRADES.indexOf(course.gradeEarned) + 1) % GRADES.length]);
}

type Palette = ReturnType<typeof useColors>;

function SectionTitle({ eyebrow, title, colors }: { eyebrow: string; title: string; colors: Palette }) {
  return (
    <View style={styles.sectionTitleWrap}>
      <Text style={[styles.eyebrow, { color: colors.primary }]}>{eyebrow}</Text>
      <Text style={[styles.sectionTitle, { color: colors.foreground }]}>{title}</Text>
    </View>
  );
}

function Metric({ label, value, detail, colors }: { label: string; value: string; detail: string; colors: Palette }) {
  return (
    <View style={[styles.metric, { backgroundColor: colors.card, borderColor: colors.border }]}>
      <Text style={[styles.eyebrow, { color: colors.mutedForeground }]}>{label}</Text>
      <Text style={[styles.metricValue, { color: colors.foreground }]}>{value}</Text>
      <Text style={[styles.helperSmall, { color: colors.mutedForeground }]}>{detail}</Text>
    </View>
  );
}

function TargetField({ label, value, suffix, onChangeText, colors }: {
  label: string; value: string; suffix: string; onChangeText: (text: string) => void; colors: Palette;
}) {
  return (
    <View style={styles.targetField}>
      <Text style={[styles.fieldLabel, { color: colors.mutedForeground }]}>{label}</Text>
      <View style={[styles.targetInputWrap, { borderColor: colors.border, backgroundColor: colors.background }]}>
        <TextInput
          accessibilityLabel={label}
          value={value}
          onChangeText={onChangeText}
          keyboardType="decimal-pad"
          style={[styles.targetInput, { color: colors.foreground }]}
        />
        <Text style={[styles.suffix, { color: colors.mutedForeground }]}>{suffix}</Text>
      </View>
    </View>
  );
}

function CourseEditor({ course, creditsText, colors, onNameChange, onCreditsChange, onBlurCredits, onGradePress, onRemove }: {
  course: Course;
  creditsText: string;
  colors: Palette;
  onNameChange: (name: string) => void;
  onCreditsChange: (text: string) => void;
  onBlurCredits: () => void;
  onGradePress: () => void;
  onRemove: () => void;
}) {
  return (
    <View style={[styles.course, { borderColor: colors.border }]}>
      <View style={styles.courseNameLine}>
        <TextInput
          accessibilityLabel="Course name"
          value={course.name}
          onChangeText={onNameChange}
          placeholder="Course name"
          placeholderTextColor={colors.mutedForeground}
          style={[styles.courseNameInput, { color: colors.foreground }]}
        />
        <Pressable accessibilityRole="button" accessibilityLabel={`Remove ${course.name || 'course'}`} onPress={onRemove} hitSlop={8} style={styles.removeButton}>
          <Feather name="x" size={18} color={colors.destructive} />
        </Pressable>
      </View>
      <View style={styles.courseDetails}>
        <View style={styles.creditField}>
          <Text style={[styles.fieldLabel, { color: colors.mutedForeground }]}>Credits</Text>
          <TextInput
            accessibilityLabel="Course credit hours"
            testID={`input-course-credits-${course.id}`}
            value={creditsText}
            onChangeText={onCreditsChange}
            onBlur={onBlurCredits}
            keyboardType="decimal-pad"
            style={[styles.creditInput, { color: colors.foreground, borderColor: colors.border, backgroundColor: colors.background }]}
          />
        </View>
        <Pressable accessibilityRole="button" accessibilityLabel={`Projected grade ${course.gradeEarned}. Tap to change.`} onPress={onGradePress} style={[styles.gradeButton, { backgroundColor: colors.secondary }]}>
          <Text style={[styles.gradeText, { color: colors.primary }]}>{course.gradeEarned} · {POINTS[course.gradeEarned].toFixed(1)}</Text>
          <Feather name="refresh-cw" size={13} color={colors.primary} />
        </Pressable>
      </View>
    </View>
  );
}

function ActionButton({ label, icon, onPress, colors, testID }: {
  label: string; icon: string; onPress: () => void; colors: Palette; testID?: string;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      testID={testID}
      onPress={onPress}
      style={({ pressed }) => [styles.actionButton, { backgroundColor: colors.secondary, opacity: pressed ? 0.72 : 1 }]}
    >
      <Feather name={icon as never} size={16} color={colors.primary} />
      <Text style={[styles.actionText, { color: colors.primary }]}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  content: { paddingHorizontal: 16, gap: 13, maxWidth: 640, width: '100%', alignSelf: 'center' },
  topbar: { minHeight: 48, flexDirection: 'row', alignItems: 'center', gap: 9, borderBottomWidth: StyleSheet.hairlineWidth, paddingBottom: 9 },
  brandIcon: { width: 34, height: 34, borderRadius: 11, alignItems: 'center', justifyContent: 'center' },
  brandIconText: { fontFamily: 'serif', fontSize: 22, marginTop: -3 },
  brandText: { flex: 1 },
  brandName: { fontFamily: 'Inter_700Bold', fontSize: 14 },
  brandSubtitle: { fontFamily: 'Inter_500Medium', fontSize: 8, letterSpacing: 1.1, marginTop: 2 },
  saveState: { fontFamily: 'Inter_400Regular', fontSize: 9 },
  intro: { gap: 4, paddingTop: 4 },
  eyebrow: { fontFamily: 'Inter_600SemiBold', fontSize: 9, letterSpacing: 1.2 },
  title: { fontFamily: 'serif', fontSize: 36, lineHeight: 41 },
  subtitle: { fontFamily: 'Inter_400Regular', fontSize: 12, lineHeight: 18 },
  metrics: { flexDirection: 'row', gap: 9 },
  metric: { flex: 1, minWidth: 0, minHeight: 100, borderWidth: 1, borderRadius: 14, padding: 12 },
  metricValue: { fontFamily: 'Inter_600SemiBold', fontSize: 26, marginTop: 8 },
  helperSmall: { fontFamily: 'Inter_400Regular', fontSize: 9, marginTop: 3 },
  status: { flexDirection: 'row', alignSelf: 'flex-start', alignItems: 'center', gap: 7, borderRadius: 20, paddingVertical: 7, paddingHorizontal: 11, marginTop: -5 },
  statusDot: { width: 7, height: 7, borderRadius: 4 },
  statusText: { fontFamily: 'Inter_600SemiBold', fontSize: 10 },
  card: { borderWidth: 1, borderRadius: 16, padding: 15, gap: 12 },
  sectionTitleWrap: { gap: 3 },
  sectionTitle: { fontFamily: 'serif', fontSize: 23 },
  targetGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 9 },
  targetField: { flex: 1, minWidth: 90, gap: 5 },
  fieldLabel: { fontFamily: 'Inter_600SemiBold', fontSize: 8, letterSpacing: .5, textTransform: 'uppercase' },
  targetInputWrap: { minHeight: 42, borderWidth: 1, borderRadius: 9, flexDirection: 'row', alignItems: 'center', paddingHorizontal: 9 },
  targetInput: { flex: 1, minWidth: 0, paddingVertical: 7, fontFamily: 'Inter_600SemiBold', fontSize: 14 },
  suffix: { fontFamily: 'Inter_400Regular', fontSize: 8 },
  projection: { borderRadius: 12, padding: 14, gap: 3 },
  projectionLabel: { fontFamily: 'Inter_500Medium', fontSize: 8, letterSpacing: .7 },
  projectionValue: { fontFamily: 'serif', fontSize: 42, lineHeight: 45 },
  projectionDetail: { fontFamily: 'Inter_400Regular', fontSize: 9, lineHeight: 14 },
  helper: { fontFamily: 'Inter_400Regular', fontSize: 10, lineHeight: 16 },
  semester: { borderWidth: 1, borderRadius: 12, padding: 10, gap: 4 },
  semesterName: { fontFamily: 'Inter_600SemiBold', fontSize: 12, paddingVertical: 4 },
  course: { borderTopWidth: StyleSheet.hairlineWidth, paddingTop: 7, marginTop: 4, gap: 6 },
  courseNameLine: { flexDirection: 'row', alignItems: 'center', gap: 7 },
  courseNameInput: { flex: 1, minHeight: 32, fontFamily: 'Inter_500Medium', fontSize: 11, paddingHorizontal: 4 },
  removeButton: { width: 32, height: 32, alignItems: 'center', justifyContent: 'center' },
  courseDetails: { flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between', gap: 8 },
  creditField: { width: 76, gap: 4 },
  creditInput: { height: 36, borderWidth: 1, borderRadius: 8, paddingHorizontal: 8, fontFamily: 'Inter_600SemiBold', fontSize: 12 },
  gradeButton: { minHeight: 36, flexDirection: 'row', alignItems: 'center', gap: 7, paddingHorizontal: 10, borderRadius: 8 },
  gradeText: { fontFamily: 'Inter_600SemiBold', fontSize: 9 },
  warning: { flexDirection: 'row', alignItems: 'flex-start', gap: 9, borderWidth: 1, borderRadius: 11, padding: 11 },
  warningText: { flex: 1, fontFamily: 'Inter_500Medium', fontSize: 10, lineHeight: 16 },
  scenarioHeading: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 8 },
  scenarioValue: { fontFamily: 'Inter_600SemiBold', fontSize: 18 },
  actionButton: { minHeight: 42, borderRadius: 10, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7 },
  actionText: { fontFamily: 'Inter_600SemiBold', fontSize: 10 },
  issue: { fontFamily: 'Inter_500Medium', fontSize: 10, textAlign: 'center' },
  footer: { fontFamily: 'Inter_400Regular', fontSize: 9, lineHeight: 14, textAlign: 'center', paddingHorizontal: 8 },
});
