import AsyncStorage from '@react-native-async-storage/async-storage';
import { Feather, Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import * as DocumentPicker from 'expo-document-picker';
import { File as ExpoFile } from 'expo-file-system';
import { useEffect, useMemo, useState } from 'react';
import {
  Alert,
  Appearance,
  Modal,
  Platform,
  Pressable,
  Share,
  StyleSheet,
  Text,
  TextInput,
  View,
  useColorScheme,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { Circle, Line, Polyline, Text as SvgText } from 'react-native-svg';
import { useColors } from '@/hooks/useColors';
import { KeyboardAwareScrollViewCompat } from '@/components/KeyboardAwareScrollViewCompat';
import { calculate, GRADES, POINTS } from '../lib/cgpa-calculations';
import type { Course, Grade, Plan, Semester } from '../lib/cgpa-calculations';
import { getBackupPreviewCounts, MAX_BACKUP_SIZE, parsePlanBackup } from '../lib/plan-backup';

const STORAGE_KEY = 'studyline.cgpa.mobile.v1';
const THEME_KEY = 'studyline.theme.v1';
const makeId = (prefix: string) => `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
const makeCourse = (name = 'New course'): Course => ({ id: makeId('course'), name, creditHours: 3, gradeEarned: 'B' });
const emptyPlan = (): Plan => ({ semesters: [], scenarioCourses: [], target: { targetCgpa: 3.6, graduationCredits: 120, remainingSemesters: 4 } });

function samplePlan(): Plan {
  const terms = [
    [['Foundations of Biology', 'A'], ['Academic Writing', 'A'], ['Intro to Statistics', 'B+'], ['World History', 'B+'], ['Research Methods', 'B'], ['Environmental Studies', 'C+']],
    [['Cell Biology', 'A'], ['Writing & Rhetoric', 'A'], ['Data Analysis', 'B+'], ['Modern History', 'B+'], ['Lab Practice', 'B'], ['Ethics in Science', 'C+']],
  ] as const;
  return {
    semesters: terms.map((courses, i) => ({
      id: makeId('semester'),
      name: `Semester ${i + 1}`,
      courses: courses.map(([name, grade]) => ({ id: makeId('course'), name, creditHours: 3, gradeEarned: grade })),
    })),
    scenarioCourses: [],
    target: { targetCgpa: 3.6, graduationCredits: 120, remainingSemesters: 4 },
  };
}

function safePlan(value: unknown): Plan {
  if (!value || typeof value !== 'object') return samplePlan();
  const input = value as Partial<Plan>;
  if (!Array.isArray(input.semesters) || !input.target) return samplePlan();
  const course = (item: Partial<Course>): Course => ({
    id: String(item.id || makeId('course')),
    name: String(item.name ?? ''),
    creditHours: item.creditHours === '' || item.creditHours == null ? '' : Math.max(0, Math.min(1000, Number(item.creditHours) || 0)),
    gradeEarned: GRADES.includes(item.gradeEarned as Grade) ? item.gradeEarned as Grade : 'B',
  });
  const numeric = (item: unknown, max: number): number | '' => item === '' || item == null ? '' : Math.max(0, Math.min(max, Number(item) || 0));
  return {
    semesters: input.semesters.map((term) => ({
      id: String(term?.id || makeId('semester')),
      name: String(term?.name ?? ''),
      courses: Array.isArray(term?.courses) ? term.courses.map(course) : [],
    })),
    scenarioCourses: Array.isArray(input.scenarioCourses) ? input.scenarioCourses.map(course) : [],
    target: {
      targetCgpa: numeric(input.target.targetCgpa, 4),
      graduationCredits: numeric(input.target.graduationCredits ?? 120, 1000),
      remainingSemesters: numeric(input.target.remainingSemesters ?? 4, 20),
    },
  };
}

type Editor = { name: string; credits: string; grade: Grade; semesterId: string | null; scenario: boolean; courseId: string | null };

export default function SimulatorScreen() {
  const colors = useColors();
  const scheme = useColorScheme();
  const insets = useSafeAreaInsets();
  const [plan, setPlan] = useState<Plan>(() => samplePlan());
  const [loaded, setLoaded] = useState(false);
  const [saveLabel, setSaveLabel] = useState('Loading plan');
  const [editor, setEditor] = useState<Editor | null>(null);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [issue, setIssue] = useState<string | null>(null);
  const [importOpen, setImportOpen] = useState(false);
  const [backupText, setBackupText] = useState('');
  const [backupSourceName, setBackupSourceName] = useState('');
  const [backupPreview, setBackupPreview] = useState<Plan | null>(null);
  const [importError, setImportError] = useState<string | null>(null);
  const [importBusy, setImportBusy] = useState(false);
  const metrics = useMemo(() => calculate(plan), [plan]);
  const backupPreviewCounts = backupPreview ? getBackupPreviewCounts(backupPreview) : null;

  useEffect(() => {
    let active = true;
    AsyncStorage.getItem(STORAGE_KEY)
      .then((raw) => {
        if (!active) return;
        if (raw) setPlan(safePlan(JSON.parse(raw)));
      })
      .catch(() => {
        if (active) setIssue('Saved data could not be read. Your current plan remains available.');
      })
      .finally(() => {
        if (active) setLoaded(true);
      });
    return () => { active = false; };
  }, []);

  useEffect(() => {
    AsyncStorage.getItem(THEME_KEY).then((theme) => {
      if (theme === 'light' || theme === 'dark') Appearance.setColorScheme(theme);
    }).catch(() => undefined);
  }, []);

  useEffect(() => {
    if (!loaded) return;
    setSaveLabel('Saving');
    const timer = setTimeout(() => {
      AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(plan))
        .then(() => setSaveLabel('Saved on this device'))
        .catch(() => {
          setSaveLabel('Could not save');
          setIssue('Device storage is unavailable. Export a backup before closing the app.');
        });
    }, 180);
    return () => clearTimeout(timer);
  }, [plan, loaded]);

  const saveEditedCourse = () => {
    if (!editor) return;
    const creditValue = editor.credits.trim() === '' ? '' : Math.max(0, Math.min(1000, Number(editor.credits) || 0));
    const nextCourse: Course = { id: editor.courseId || makeId('course'), name: editor.name.trim() || 'New course', creditHours: creditValue, gradeEarned: editor.grade };
    setPlan((current) => {
      if (editor.scenario) {
        const courses = editor.courseId
          ? current.scenarioCourses.map((item) => item.id === editor.courseId ? nextCourse : item)
          : [...current.scenarioCourses, nextCourse];
        return { ...current, scenarioCourses: courses };
      }
      return {
        ...current,
        semesters: current.semesters.map((term) => term.id !== editor.semesterId ? term : ({
          ...term,
          courses: editor.courseId
            ? term.courses.map((item) => item.id === editor.courseId ? nextCourse : item)
            : [...term.courses, nextCourse],
        })),
      };
    });
    void Haptics.selectionAsync();
    setEditor(null);
  };

  const removeCourse = () => {
    if (!editor?.courseId) return;
    setPlan((current) => editor.scenario
      ? { ...current, scenarioCourses: current.scenarioCourses.filter((item) => item.id !== editor.courseId) }
      : { ...current, semesters: current.semesters.map((term) => term.id === editor.semesterId ? { ...term, courses: term.courses.filter((item) => item.id !== editor.courseId) } : term) });
    setEditor(null);
  };

  const updateTarget = (key: keyof Plan['target'], raw: string) => {
    const value = raw === '' ? '' : Number(raw);
    setPlan((current) => ({ ...current, target: { ...current.target, [key]: value } }));
  };

  const openEditor = (course: Course | null, semesterId: string | null, scenario = false) => {
    setEditor({
      name: course?.name ?? '',
      credits: String(course?.creditHours ?? 3),
      grade: course?.gradeEarned ?? 'B',
      semesterId,
      scenario,
      courseId: course?.id ?? null,
    });
  };

  const addSemester = () => {
    const term: Semester = { id: makeId('semester'), name: `Semester ${plan.semesters.length + 1}`, courses: [] };
    setPlan((current) => ({ ...current, semesters: [...current.semesters, term] }));
    setExpanded(term.id);
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
  };

  const confirmClear = () => Alert.alert('Clear this plan?', 'This removes saved coursework from this device.', [
    { text: 'Cancel', style: 'cancel' },
    { text: 'Clear plan', style: 'destructive', onPress: () => setPlan(emptyPlan()) },
  ]);

  const confirmSample = () => Alert.alert('Load sample CS plan?', 'This replaces the current plan on this device.', [
    { text: 'Cancel', style: 'cancel' },
    { text: 'Load sample', onPress: () => setPlan(samplePlan()) },
  ]);

  const exportPlan = async () => {
    await Share.share({ title: 'Studyline CGPA plan', message: JSON.stringify(plan, null, 2) });
  };

  const previewBackup = (raw: string) => {
    setImportError(null);
    try {
      setBackupPreview(parsePlanBackup(raw));
    } catch (error) {
      setBackupPreview(null);
      setImportError(error instanceof Error ? error.message : 'The backup could not be read.');
    }
  };

  const openImport = () => {
    setBackupText('');
    setBackupSourceName('');
    setBackupPreview(null);
    setImportError(null);
    setImportOpen(true);
  };

  const chooseBackupFile = async () => {
    setImportBusy(true);
    setImportError(null);
    setBackupPreview(null);
    try {
      const result = await DocumentPicker.getDocumentAsync({ type: '*/*', copyToCacheDirectory: true, multiple: false });
      if (result.canceled) return;
      const asset = result.assets[0];
      if (!asset) throw new Error('No file was selected.');
      if (typeof asset.size === 'number' && asset.size > MAX_BACKUP_SIZE) {
        throw new Error('Backup is too large. Choose a JSON file under 1 MB.');
      }
      const raw = asset.file ? await asset.file.text() : await new ExpoFile(asset.uri).text();
      setBackupText('');
      setBackupSourceName(asset.name);
      previewBackup(raw);
    } catch (error) {
      setBackupSourceName('');
      setBackupPreview(null);
      setImportError(error instanceof Error ? error.message : 'The selected file could not be read.');
    } finally {
      setImportBusy(false);
    }
  };

  const confirmImport = () => {
    if (!backupPreview) return;
    const restoredPlan = backupPreview;
    Alert.alert('Replace this plan?', 'This will replace the plan currently saved on this device with the backup you previewed.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Replace plan',
        style: 'destructive',
        onPress: () => {
          setPlan(restoredPlan);
          setIssue(null);
          setImportOpen(false);
        },
      },
    ]);
  };

  const toggleTheme = () => {
    const next = scheme === 'dark' ? 'light' : 'dark';
    Appearance.setColorScheme(next);
    void AsyncStorage.setItem(THEME_KEY, next).catch(() => setIssue('Theme preference could not be saved.'));
  };

  const statusColors = metrics.status.tone === 'success'
    ? { text: colors.success, background: colors.successSurface }
    : metrics.status.tone === 'warning'
      ? { text: colors.warning, background: colors.warningSurface }
      : { text: colors.destructive, background: colors.dangerSurface };
  const webTop = Platform.OS === 'web' ? 67 : 0;
  const webBottom = Platform.OS === 'web' ? 34 : 0;

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: colors.background }]} edges={['top', 'left', 'right']}>
      <KeyboardAwareScrollViewCompat
        style={{ backgroundColor: colors.background }}
        contentContainerStyle={[styles.content, { paddingTop: webTop + 8, paddingBottom: Math.max(insets.bottom, webBottom) + 32 }]}
        keyboardShouldPersistTaps="handled"
        bottomOffset={20}
      >
        <View style={[styles.topbar, { borderColor: colors.border }]}>
          <View style={styles.brand}>
            <View style={[styles.brandIcon, { backgroundColor: colors.primary }]}><Text style={[styles.brandIconText, { color: colors.primaryForeground }]}>s.</Text></View>
            <View><Text style={[styles.brandName, { color: colors.foreground }]}>studyline</Text><Text style={[styles.brandSub, { color: colors.mutedForeground }]}>ACADEMIC PLANNER</Text></View>
          </View>
          <View style={styles.saveStatus}><View style={[styles.saveDot, { backgroundColor: loaded ? colors.success : colors.chartTarget }]} /><Text style={[styles.saveText, { color: colors.mutedForeground }]}>{saveLabel}</Text></View>
          <Pressable accessibilityRole="button" accessibilityLabel={`Switch to ${scheme === 'dark' ? 'light' : 'dark'} mode`} testID="button-toggle-theme" onPress={toggleTheme} style={[styles.themeButton, { backgroundColor: colors.secondary }]}>
            <Feather name={scheme === 'dark' ? 'sun' : 'moon'} size={16} color={colors.primary} />
          </Pressable>
        </View>

        <View style={styles.intro}>
          <Text style={[styles.eyebrow, { color: colors.primary }]}>YOUR DEGREE, IN FOCUS</Text>
          <Text style={[styles.title, { color: colors.foreground }]}>CGPA target</Text>
          <Text style={[styles.subtitle, { color: colors.mutedForeground }]}>Plan your next semester with a clear view of the grades you need.</Text>
        </View>

        <View style={styles.metricRow}>
          <MetricCard label="CURRENT CGPA" value={metrics.current === null ? '—' : metrics.current.toFixed(2)} foot={`${metrics.credits.toFixed(0)} credits`} colors={colors} />
          <MetricCard label="REQUIRED GPA" value={Number.isFinite(metrics.needed) ? metrics.needed.toFixed(2) : '∞'} foot="remaining credits" colors={colors} />
        </View>
        <View style={[styles.statusPill, { backgroundColor: statusColors.background }]}>
          <View style={[styles.statusDot, { backgroundColor: statusColors.text }]} />
          <Text style={[styles.statusText, { color: statusColors.text }]}>{metrics.status.label}</Text>
        </View>

        <Card colors={colors}>
          <View style={styles.sectionHeader}>
            <View><Text style={[styles.eyebrow, { color: colors.primary }]}>GRADUATION PLAN</Text><Text style={[styles.sectionTitle, { color: colors.foreground }]}>Your target</Text></View>
            <View style={styles.backupActions}>
              <Pressable accessibilityRole="button" accessibilityLabel="Import plan backup" testID="button-import-plan" onPress={openImport} style={styles.iconButton}>
                <Feather name="download" size={19} color={colors.primary} />
              </Pressable>
              <Pressable accessibilityRole="button" accessibilityLabel="Share plan backup" testID="button-export-plan" onPress={exportPlan} style={styles.iconButton}>
                <Feather name="share" size={19} color={colors.primary} />
              </Pressable>
            </View>
          </View>
          <View style={styles.inputGrid}>
            <NumberField label="Target CGPA" value={plan.target.targetCgpa} suffix="/ 4.0" onChangeText={(v) => updateTarget('targetCgpa', v)} colors={colors} />
            <NumberField label="Degree credits" value={plan.target.graduationCredits} suffix="cr" onChangeText={(v) => updateTarget('graduationCredits', v)} colors={colors} />
            <NumberField label="Semesters left" value={plan.target.remainingSemesters} suffix="terms" onChangeText={(v) => updateTarget('remainingSemesters', v)} colors={colors} />
          </View>
          <View style={[styles.projection, { backgroundColor: colors.primary }]}>
            <Text style={[styles.projectionLabel, { color: colors.primaryForeground }]}>Needed for remaining degree credits</Text>
            <Text style={[styles.projectionValue, { color: colors.primaryForeground }]}>{Number.isFinite(metrics.needed) ? metrics.needed.toFixed(2) : '∞'}</Text>
            <Text style={[styles.projectionFoot, { color: colors.primaryForeground }]}>{Math.max(0, metrics.remaining).toFixed(0)} credits remaining · target points {((Number(plan.target.targetCgpa) || 0) * (Number(plan.target.graduationCredits) || 0)).toFixed(0)}</Text>
          </View>
        </Card>

        <Card colors={colors}>
          <View style={styles.sectionHeader}>
            <View><Text style={[styles.eyebrow, { color: colors.primary }]}>ACADEMIC RECORD</Text><Text style={[styles.sectionTitle, { color: colors.foreground }]}>Semesters</Text></View>
            <Pressable accessibilityRole="button" accessibilityLabel="Add semester" testID="button-add-semester" onPress={addSemester} style={[styles.roundButton, { backgroundColor: colors.secondary }]}>
              <Ionicons name="add" size={21} color={colors.primary} />
            </Pressable>
          </View>
          {plan.semesters.length === 0 ? <EmptyNote title="No semesters yet" body="Add completed courses to calculate your current CGPA." colors={colors} /> : null}
          {plan.semesters.map((term, index) => {
            const termCredits = term.courses.reduce((sum, c) => sum + (Number(c.creditHours) || 0), 0);
            const termQuality = term.courses.reduce((sum, c) => sum + (Number(c.creditHours) || 0) * POINTS[c.gradeEarned], 0);
            const gpa = termCredits > 0 ? (termQuality / termCredits).toFixed(2) : '—';
            const isExpanded = expanded === term.id || expanded === null;
            return (
              <View key={term.id} style={[styles.semester, { borderColor: colors.border, backgroundColor: colors.background }]}>
                <Pressable accessibilityRole="button" onPress={() => setExpanded(isExpanded ? '' : term.id)} style={styles.semesterHeader}>
                  <View style={[styles.indexBadge, { backgroundColor: colors.secondary }]}><Text style={[styles.indexText, { color: colors.primary }]}>{String(index + 1).padStart(2, '0')}</Text></View>
                  <View style={styles.termTitles}><Text style={[styles.termName, { color: colors.foreground }]}>{term.name || `Semester ${index + 1}`}</Text><Text style={[styles.termMeta, { color: colors.mutedForeground }]}>{termCredits} credits · {gpa} GPA</Text></View>
                  <Feather name={isExpanded ? 'chevron-up' : 'chevron-down'} size={19} color={colors.mutedForeground} />
                </Pressable>
                {isExpanded ? (
                  <View>
                    {term.courses.map((course) => <CourseRow key={course.id} course={course} colors={colors} onPress={() => openEditor(course, term.id)} />)}
                    <View style={styles.semesterActions}>
                      <TextButton icon="plus" label="Add course" onPress={() => openEditor(null, term.id)} color={colors.primary} />
                      <Pressable accessibilityRole="button" accessibilityLabel={`Remove ${term.name}`} onPress={() => Alert.alert('Remove semester?', 'Its courses will be removed from this plan.', [{ text: 'Cancel', style: 'cancel' }, { text: 'Remove', style: 'destructive', onPress: () => setPlan((current) => ({ ...current, semesters: current.semesters.filter((item) => item.id !== term.id) })) }])}>
                        <Feather name="trash-2" size={17} color={colors.destructive} />
                      </Pressable>
                    </View>
                  </View>
                ) : null}
              </View>
            );
          })}
          <Pressable accessibilityRole="button" testID="button-add-semester-bottom" onPress={addSemester} style={[styles.primaryButton, { backgroundColor: colors.secondary }]}>
            <Ionicons name="add" size={18} color={colors.primary} /><Text style={[styles.primaryButtonText, { color: colors.primary }]}>Add semester</Text>
          </Pressable>
        </Card>

        <Card colors={colors}>
          <View style={styles.sectionHeader}>
            <View><Text style={[styles.eyebrow, { color: colors.primary }]}>WHAT-IF SIMULATION</Text><Text style={[styles.sectionTitle, { color: colors.foreground }]}>Upcoming courses</Text></View>
            <Text style={[styles.scenarioValue, { color: colors.primary }]}>{metrics.projected === null ? '—' : metrics.projected.toFixed(2)}</Text>
          </View>
          <Text style={[styles.helper, { color: colors.mutedForeground }]}>Try grades without changing your completed record.</Text>
          {plan.scenarioCourses.length === 0 ? <EmptyNote title="No planned courses" body="Add a course to see how it could change your predicted CGPA." colors={colors} /> : plan.scenarioCourses.map((course) => <CourseRow key={course.id} course={course} colors={colors} scenario onPress={() => openEditor(course, null, true)} />)}
          <Pressable accessibilityRole="button" testID="button-add-scenario-course" onPress={() => openEditor(null, null, true)} style={[styles.primaryButton, { backgroundColor: colors.secondary }]}>
            <Ionicons name="add" size={18} color={colors.primary} /><Text style={[styles.primaryButtonText, { color: colors.primary }]}>Add hypothetical course</Text>
          </Pressable>
        </Card>

        <Card colors={colors}>
          <View style={styles.sectionHeader}>
            <View><Text style={[styles.eyebrow, { color: colors.primary }]}>SEMESTER TREND</Text><Text style={[styles.sectionTitle, { color: colors.foreground }]}>GPA trajectory</Text></View>
            <Text style={[styles.smallLabel, { color: colors.mutedForeground }]}>Target {Number(plan.target.targetCgpa || 0).toFixed(2)}</Text>
          </View>
          <TrajectoryChart semesters={plan.semesters} target={Number(plan.target.targetCgpa) || 0} colors={colors} />
        </Card>

        <View style={styles.footerActions}>
          <Pressable accessibilityRole="button" testID="button-load-sample" onPress={confirmSample} style={[styles.secondaryButton, { borderColor: colors.border }]}>
            <Feather name="download" size={16} color={colors.primary} /><Text style={[styles.secondaryButtonText, { color: colors.primary }]}>Load CS sample</Text>
          </Pressable>
          <Pressable accessibilityRole="button" testID="button-clear-plan" onPress={confirmClear} style={[styles.secondaryButton, { borderColor: colors.border }]}>
            <Feather name="trash-2" size={16} color={colors.destructive} /><Text style={[styles.secondaryButtonText, { color: colors.destructive }]}>Clear plan</Text>
          </Pressable>
        </View>
        <Text style={[styles.privacyNote, { color: colors.mutedForeground }]}>Your plan stays on this device. Grade scale: A 4.0 · B+ 3.5 · B 3.0 · C+ 2.5 · C 2.0 · D+ 1.5 · D 1.0 · F 0.0</Text>
        {issue ? <Text accessibilityRole="alert" style={[styles.issue, { color: colors.destructive }]}>{issue}</Text> : null}
      </KeyboardAwareScrollViewCompat>

      <Modal transparent animationType="slide" visible={importOpen} onRequestClose={() => setImportOpen(false)}>
        <View style={styles.modalBackdrop}>
          <KeyboardAwareScrollViewCompat style={{ maxHeight: '90%' }} contentContainerStyle={[styles.modalCard, { backgroundColor: colors.card, borderColor: colors.border }]} bottomOffset={24}>
            <View style={styles.modalHeader}>
              <View><Text style={[styles.eyebrow, { color: colors.primary }]}>MOVE YOUR PLAN</Text><Text style={[styles.sectionTitle, { color: colors.foreground }]}>Import backup</Text></View>
              <Pressable accessibilityRole="button" accessibilityLabel="Close import" testID="button-close-import" onPress={() => setImportOpen(false)} style={styles.iconButton}><Feather name="x" size={20} color={colors.mutedForeground} /></Pressable>
            </View>
            <Text style={[styles.helper, { color: colors.mutedForeground }]}>Choose a JSON backup file, or paste the backup text below. Your current plan stays unchanged until you confirm replacement.</Text>
            <Pressable accessibilityRole="button" testID="button-choose-backup-file" disabled={importBusy} onPress={chooseBackupFile} style={[styles.fileButton, { borderColor: colors.border, backgroundColor: colors.secondary }]}>
              <Feather name={importBusy ? 'loader' : 'folder'} size={17} color={colors.primary} />
              <Text style={[styles.fileButtonText, { color: colors.primary }]}>{importBusy ? 'Reading backup…' : 'Choose JSON backup'}</Text>
            </Pressable>
            {backupSourceName ? <Text style={[styles.sourceName, { color: colors.mutedForeground }]}>Selected: {backupSourceName}</Text> : null}
            <Text style={[styles.fieldLabel, { color: colors.mutedForeground }]}>Or paste backup JSON</Text>
            <TextInput
              accessibilityLabel="Paste backup JSON"
              testID="input-backup-json"
              value={backupText}
              onChangeText={(text) => {
                setBackupText(text);
                setBackupSourceName('');
                setBackupPreview(null);
                setImportError(null);
              }}
              multiline
              autoCapitalize="none"
              autoCorrect={false}
              placeholder='{"semesters":[],"scenarioCourses":[],"target":{...}}'
              placeholderTextColor={colors.mutedForeground}
              style={[styles.backupInput, { backgroundColor: colors.background, color: colors.foreground, borderColor: colors.border }]}
            />
            {backupText.length > 0 ? (
              <Pressable accessibilityRole="button" testID="button-preview-backup" onPress={() => previewBackup(backupText)} style={[styles.secondaryButton, { borderColor: colors.border, alignSelf: 'flex-start' }]}>
                <Feather name="eye" size={15} color={colors.primary} /><Text style={[styles.secondaryButtonText, { color: colors.primary }]}>Preview backup</Text>
              </Pressable>
            ) : null}
            {importError ? <Text accessibilityRole="alert" testID="text-import-error" style={[styles.issue, { color: colors.destructive }]}>{importError}</Text> : null}
            {backupPreview ? (
              <View testID="backup-preview" style={[styles.backupPreview, { backgroundColor: colors.secondary, borderColor: colors.border }]}>
                <Text style={[styles.previewTitle, { color: colors.foreground }]}>Backup preview</Text>
                <Text style={[styles.helper, { color: colors.mutedForeground }]}>
                  {backupPreviewCounts?.semesters} {backupPreviewCounts?.semesters === 1 ? 'semester' : 'semesters'} · {backupPreviewCounts?.completedCourses} completed courses · {backupPreviewCounts?.plannedCourses} planned courses
                </Text>
                <Text style={[styles.helper, { color: colors.mutedForeground }]}>Target CGPA: {backupPreview.target.targetCgpa === '' ? 'Not set' : Number(backupPreview.target.targetCgpa).toFixed(2)}</Text>
              </View>
            ) : null}
            <View style={styles.modalActions}>
              <Pressable accessibilityRole="button" onPress={() => setImportOpen(false)} style={[styles.secondaryButton, { borderColor: colors.border }]}><Text style={[styles.secondaryButtonText, { color: colors.foreground }]}>Cancel</Text></Pressable>
              <Pressable accessibilityRole="button" testID="button-confirm-import" disabled={!backupPreview || importBusy} onPress={confirmImport} style={[styles.saveButton, { backgroundColor: backupPreview ? colors.destructive : colors.muted, opacity: backupPreview ? 1 : 0.55 }]}>
                <Text style={[styles.saveButtonText, { color: colors.destructiveForeground }]}>Replace current plan</Text>
              </Pressable>
            </View>
          </KeyboardAwareScrollViewCompat>
        </View>
      </Modal>

      <Modal transparent animationType="slide" visible={!!editor} onRequestClose={() => setEditor(null)}>
        <View style={styles.modalBackdrop}>
          <KeyboardAwareScrollViewCompat style={{ maxHeight: '90%' }} contentContainerStyle={[styles.modalCard, { backgroundColor: colors.card, borderColor: colors.border }]} bottomOffset={24}>
            <View style={styles.modalHeader}>
              <View><Text style={[styles.eyebrow, { color: colors.primary }]}>{editor?.scenario ? 'WHAT-IF COURSE' : 'COURSE DETAILS'}</Text><Text style={[styles.sectionTitle, { color: colors.foreground }]}>{editor?.courseId ? 'Edit course' : 'Add course'}</Text></View>
              <Pressable accessibilityRole="button" accessibilityLabel="Close editor" onPress={() => setEditor(null)} style={styles.iconButton}><Feather name="x" size={20} color={colors.mutedForeground} /></Pressable>
            </View>
            <Text style={[styles.fieldLabel, { color: colors.mutedForeground }]}>Course name</Text>
            <TextInput value={editor?.name ?? ''} onChangeText={(name) => setEditor((current) => current ? { ...current, name } : current)} placeholder="e.g. Data Structures" placeholderTextColor={colors.mutedForeground} style={[styles.textInput, { backgroundColor: colors.background, color: colors.foreground, borderColor: colors.border }]} returnKeyType="next" />
            <Text style={[styles.fieldLabel, { color: colors.mutedForeground }]}>Credit hours</Text>
            <TextInput value={editor?.credits ?? '3'} onChangeText={(credits) => setEditor((current) => current ? { ...current, credits } : current)} keyboardType="decimal-pad" style={[styles.textInput, { backgroundColor: colors.background, color: colors.foreground, borderColor: colors.border }]} />
            <Text style={[styles.fieldLabel, { color: colors.mutedForeground }]}>Grade</Text>
            <View style={styles.gradeGrid}>{GRADES.map((grade) => <Pressable key={grade} accessibilityRole="button" accessibilityState={{ selected: editor?.grade === grade }} onPress={() => setEditor((current) => current ? { ...current, grade } : current)} style={[styles.gradeChoice, { backgroundColor: editor?.grade === grade ? colors.primary : colors.secondary }]}><Text style={[styles.gradeChoiceText, { color: editor?.grade === grade ? colors.primaryForeground : colors.foreground }]}>{grade}<Text style={{ opacity: .72 }}> · {POINTS[grade].toFixed(1)}</Text></Text></Pressable>)}</View>
            <View style={styles.modalActions}>
              {editor?.courseId ? <Pressable accessibilityRole="button" accessibilityLabel="Delete course" onPress={removeCourse} style={styles.iconButton}><Feather name="trash-2" size={19} color={colors.destructive} /></Pressable> : <View />}
              <Pressable accessibilityRole="button" onPress={() => setEditor(null)} style={[styles.secondaryButton, { borderColor: colors.border }]}><Text style={[styles.secondaryButtonText, { color: colors.foreground }]}>Cancel</Text></Pressable>
              <Pressable accessibilityRole="button" testID="button-save-course" onPress={saveEditedCourse} style={[styles.saveButton, { backgroundColor: colors.primary }]}><Text style={[styles.saveButtonText, { color: colors.primaryForeground }]}>Save</Text></Pressable>
            </View>
          </KeyboardAwareScrollViewCompat>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

function Card({ children, colors }: { children: React.ReactNode; colors: ReturnType<typeof useColors> }) {
  return <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>{children}</View>;
}

function MetricCard({ label, value, foot, colors }: { label: string; value: string; foot: string; colors: ReturnType<typeof useColors> }) {
  return <View style={[styles.metricCard, { backgroundColor: colors.card, borderColor: colors.border }]}><Text style={[styles.smallLabel, { color: colors.mutedForeground }]}>{label}</Text><Text style={[styles.metricValue, { color: colors.foreground }]}>{value}</Text><Text style={[styles.metricFoot, { color: colors.mutedForeground }]}>{foot}</Text></View>;
}

function NumberField({ label, value, suffix, onChangeText, colors }: { label: string; value: number | ''; suffix: string; onChangeText: (value: string) => void; colors: ReturnType<typeof useColors> }) {
  return <View style={styles.numberField}><Text style={[styles.fieldLabel, { color: colors.mutedForeground }]}>{label}</Text><View style={[styles.numberInputWrap, { backgroundColor: colors.background, borderColor: colors.border }]}><TextInput value={String(value)} onChangeText={onChangeText} keyboardType="decimal-pad" selectTextOnFocus style={[styles.numberInput, { color: colors.foreground }]} /><Text style={[styles.suffix, { color: colors.mutedForeground }]}>{suffix}</Text></View></View>;
}

function CourseRow({ course, colors, onPress, scenario = false }: { course: Course; colors: ReturnType<typeof useColors>; onPress: () => void; scenario?: boolean }) {
  return <Pressable accessibilityRole="button" accessibilityLabel={`Edit ${course.name || 'course'}, ${course.creditHours} credits, grade ${course.gradeEarned}`} onPress={onPress} style={({ pressed }) => [styles.courseRow, { borderColor: colors.border, opacity: pressed ? .68 : 1 }]}><View style={styles.courseNameWrap}><Text numberOfLines={1} style={[styles.courseName, { color: colors.foreground }]}>{course.name || (scenario ? 'Planned course' : 'Course')}</Text><Text style={[styles.courseMeta, { color: colors.mutedForeground }]}>{course.creditHours || 0} credits · {POINTS[course.gradeEarned].toFixed(1)} points</Text></View><View style={[styles.gradeBadge, { backgroundColor: colors.secondary }]}><Text style={[styles.gradeBadgeText, { color: colors.primary }]}>{course.gradeEarned}</Text></View><Feather name="chevron-right" size={17} color={colors.mutedForeground} /></Pressable>;
}

function TextButton({ icon, label, onPress, color }: { icon: string; label: string; onPress: () => void; color: string }) {
  return <Pressable accessibilityRole="button" onPress={onPress} style={styles.textButton}><Feather name={icon as never} size={15} color={color} /><Text style={[styles.textButtonText, { color }]}>{label}</Text></Pressable>;
}

function EmptyNote({ title, body, colors }: { title: string; body: string; colors: ReturnType<typeof useColors> }) {
  return <View style={styles.emptyNote}><Text style={[styles.emptyTitle, { color: colors.foreground }]}>{title}</Text><Text style={[styles.helper, { color: colors.mutedForeground }]}>{body}</Text></View>;
}

function TrajectoryChart({ semesters, target, colors }: { semesters: Semester[]; target: number; colors: ReturnType<typeof useColors> }) {
  const width = 320, height = 136, padX = 14, padY = 16;
  const values = semesters.map((term) => {
    const credits = term.courses.reduce((sum, c) => sum + (Number(c.creditHours) || 0), 0);
    const points = term.courses.reduce((sum, c) => sum + (Number(c.creditHours) || 0) * POINTS[c.gradeEarned], 0);
    return credits ? points / credits : null;
  });
  const point = (value: number, index: number) => {
    const x = values.length < 2 ? width / 2 : padX + (index * (width - padX * 2)) / (values.length - 1);
    const y = height - padY - (Math.max(0, Math.min(4, value)) / 4) * (height - padY * 2);
    return `${x},${y}`;
  };
  const points = values.map((value, index) => value === null ? null : point(value, index)).filter(Boolean).join(' ');
  const targetY = height - padY - (Math.max(0, Math.min(4, target)) / 4) * (height - padY * 2);
  return <View style={styles.chartWrap}><Svg width="100%" height={height} viewBox={`0 0 ${width} ${height}`}><Line x1={padX} x2={width - padX} y1={targetY} y2={targetY} stroke={colors.chartTarget} strokeWidth="2" strokeDasharray="6 5" /><Line x1={padX} x2={width - padX} y1={height - padY} y2={height - padY} stroke={colors.border} strokeWidth="1" />{points ? <Polyline points={points} fill="none" stroke={colors.primary} strokeWidth="3" strokeLinejoin="round" strokeLinecap="round" /> : null}{values.map((value, index) => value === null ? null : <Circle key={`${index}`} cx={Number(point(value, index).split(',')[0])} cy={Number(point(value, index).split(',')[1])} r="4" fill={colors.primary} />)}{values.length > 0 ? <SvgText x={padX} y={height - 1} fill={colors.mutedForeground} fontSize="10">{semesters[0]?.name.slice(0, 14)}</SvgText> : null}{values.length > 1 ? <SvgText x={width - padX} y={height - 1} fill={colors.mutedForeground} fontSize="10" textAnchor="end">{semesters[semesters.length - 1]?.name.slice(0, 14)}</SvgText> : null}</Svg></View>;
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  content: { paddingHorizontal: 18, gap: 14, maxWidth: 640, width: '100%', alignSelf: 'center' },
  topbar: { minHeight: 50, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', borderBottomWidth: StyleSheet.hairlineWidth, paddingBottom: 10 },
  brand: { flexDirection: 'row', alignItems: 'center', gap: 9 },
  brandIcon: { width: 35, height: 35, borderRadius: 11, alignItems: 'center', justifyContent: 'center' },
  brandIconText: { fontFamily: 'serif', fontSize: 23, marginTop: -3 },
  brandName: { fontFamily: 'Inter_700Bold', fontSize: 14 },
  brandSub: { fontFamily: 'Inter_500Medium', fontSize: 8, letterSpacing: 1.2, marginTop: 2 },
  saveStatus: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  saveDot: { width: 7, height: 7, borderRadius: 4 },
  saveText: { fontFamily: 'Inter_400Regular', fontSize: 10 },
  themeButton: { width: 34, height: 34, borderRadius: 17, alignItems: 'center', justifyContent: 'center' },
  intro: { gap: 5, paddingTop: 4, paddingBottom: 2 },
  eyebrow: { fontFamily: 'Inter_600SemiBold', fontSize: 9, letterSpacing: 1.4 },
  title: { fontFamily: 'serif', fontSize: 38, lineHeight: 42 },
  subtitle: { fontFamily: 'Inter_400Regular', fontSize: 13, lineHeight: 19, maxWidth: 390 },
  metricRow: { flexDirection: 'row', gap: 10 },
  metricCard: { flex: 1, borderWidth: 1, borderRadius: 15, padding: 14, minHeight: 108 },
  smallLabel: { fontFamily: 'Inter_600SemiBold', fontSize: 9, letterSpacing: .7 },
  metricValue: { fontFamily: 'Inter_600SemiBold', fontSize: 29, marginTop: 9, letterSpacing: -1.2 },
  metricFoot: { fontFamily: 'Inter_400Regular', fontSize: 10, marginTop: 3 },
  statusPill: { flexDirection: 'row', alignSelf: 'flex-start', alignItems: 'center', gap: 7, borderRadius: 99, paddingVertical: 7, paddingHorizontal: 11, marginTop: -6 },
  statusDot: { width: 7, height: 7, borderRadius: 4 },
  statusText: { fontFamily: 'Inter_600SemiBold', fontSize: 10 },
  card: { borderWidth: 1, borderRadius: 17, padding: 16, gap: 13 },
  sectionHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 },
  backupActions: { flexDirection: 'row', alignItems: 'center', gap: 2 },
  sectionTitle: { fontFamily: 'serif', fontSize: 25, marginTop: 3 },
  iconButton: { minWidth: 40, minHeight: 40, alignItems: 'center', justifyContent: 'center' },
  inputGrid: { gap: 10 },
  numberField: { gap: 5 },
  fieldLabel: { fontFamily: 'Inter_600SemiBold', fontSize: 9, letterSpacing: .6, textTransform: 'uppercase' },
  numberInputWrap: { minHeight: 45, borderWidth: 1, borderRadius: 10, flexDirection: 'row', alignItems: 'center', paddingHorizontal: 12 },
  numberInput: { flex: 1, paddingVertical: 8, fontFamily: 'Inter_600SemiBold', fontSize: 16 },
  suffix: { fontFamily: 'Inter_400Regular', fontSize: 10 },
  projection: { borderRadius: 14, padding: 15 },
  projectionLabel: { fontFamily: 'Inter_500Medium', fontSize: 9, letterSpacing: .8, textTransform: 'uppercase' },
  projectionValue: { fontFamily: 'serif', fontSize: 48, lineHeight: 52, marginTop: 4 },
  projectionFoot: { fontFamily: 'Inter_400Regular', fontSize: 10 },
  roundButton: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center', borderRadius: 20 },
  semester: { borderWidth: 1, borderRadius: 13, paddingHorizontal: 11, paddingVertical: 10, gap: 5 },
  semesterHeader: { flexDirection: 'row', alignItems: 'center', gap: 9, minHeight: 42 },
  indexBadge: { width: 29, height: 29, borderRadius: 9, alignItems: 'center', justifyContent: 'center' },
  indexText: { fontFamily: 'Inter_600SemiBold', fontSize: 9 },
  termTitles: { flex: 1 },
  termName: { fontFamily: 'Inter_600SemiBold', fontSize: 12 },
  termMeta: { fontFamily: 'Inter_400Regular', fontSize: 9, marginTop: 3 },
  courseRow: { flexDirection: 'row', minHeight: 53, alignItems: 'center', borderTopWidth: StyleSheet.hairlineWidth, gap: 10, paddingHorizontal: 2 },
  courseNameWrap: { flex: 1 },
  courseName: { fontFamily: 'Inter_500Medium', fontSize: 12 },
  courseMeta: { fontFamily: 'Inter_400Regular', fontSize: 9, marginTop: 3 },
  gradeBadge: { borderRadius: 8, paddingVertical: 6, paddingHorizontal: 9 },
  gradeBadgeText: { fontFamily: 'Inter_600SemiBold', fontSize: 10 },
  semesterActions: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingTop: 8 },
  textButton: { minHeight: 38, flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 4 },
  textButtonText: { fontFamily: 'Inter_600SemiBold', fontSize: 11 },
  primaryButton: { minHeight: 46, borderRadius: 11, flexDirection: 'row', justifyContent: 'center', alignItems: 'center', gap: 7 },
  primaryButtonText: { fontFamily: 'Inter_600SemiBold', fontSize: 11 },
  helper: { fontFamily: 'Inter_400Regular', fontSize: 11, lineHeight: 17 },
  emptyNote: { paddingVertical: 9, gap: 4 },
  emptyTitle: { fontFamily: 'Inter_600SemiBold', fontSize: 12 },
  scenarioValue: { fontFamily: 'Inter_600SemiBold', fontSize: 20 },
  chartWrap: { height: 136, width: '100%' },
  footerActions: { flexDirection: 'row', gap: 9 },
  secondaryButton: { minHeight: 42, borderWidth: 1, borderRadius: 10, flexDirection: 'row', gap: 7, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 12 },
  secondaryButtonText: { fontFamily: 'Inter_600SemiBold', fontSize: 10 },
  privacyNote: { fontFamily: 'Inter_400Regular', fontSize: 9, lineHeight: 14, textAlign: 'center', paddingHorizontal: 8 },
  issue: { fontFamily: 'Inter_500Medium', fontSize: 11, textAlign: 'center' },
  modalBackdrop: { flex: 1, backgroundColor: 'rgba(10, 20, 35, .42)', justifyContent: 'flex-end' },
  modalCard: { borderTopLeftRadius: 22, borderTopRightRadius: 22, borderWidth: 1, padding: 20, paddingBottom: 32, gap: 10 },
  modalHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 },
  textInput: { minHeight: 46, borderWidth: 1, borderRadius: 10, paddingHorizontal: 12, fontFamily: 'Inter_500Medium', fontSize: 14 },
  fileButton: { minHeight: 44, borderWidth: 1, borderRadius: 10, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 },
  fileButtonText: { fontFamily: 'Inter_600SemiBold', fontSize: 11 },
  sourceName: { fontFamily: 'Inter_400Regular', fontSize: 10, marginTop: -4 },
  backupInput: { minHeight: 112, maxHeight: 180, borderWidth: 1, borderRadius: 10, padding: 12, fontFamily: 'Inter_400Regular', fontSize: 12, lineHeight: 18, textAlignVertical: 'top' },
  backupPreview: { borderWidth: 1, borderRadius: 12, padding: 13, gap: 5 },
  previewTitle: { fontFamily: 'Inter_600SemiBold', fontSize: 12 },
  gradeGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 7 },
  gradeChoice: { width: '23%', minHeight: 39, alignItems: 'center', justifyContent: 'center', borderRadius: 9 },
  gradeChoiceText: { fontFamily: 'Inter_600SemiBold', fontSize: 11 },
  modalActions: { flexDirection: 'row', alignItems: 'center', justifyContent: 'flex-end', gap: 8, marginTop: 12 },
  saveButton: { minHeight: 42, minWidth: 76, borderRadius: 10, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 18 },
  saveButtonText: { fontFamily: 'Inter_600SemiBold', fontSize: 11 },
});
