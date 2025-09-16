import { MaterialCommunityIcons, MaterialIcons } from '@expo/vector-icons';
import { useFocusEffect } from '@react-navigation/native';
import { Audio } from 'expo-av';
import * as Clipboard from 'expo-clipboard';
import { LinearGradient } from 'expo-linear-gradient';
import { useRouter } from 'expo-router';
import { onAuthStateChanged, signOut } from 'firebase/auth';
import { get, onValue, ref, remove, set } from 'firebase/database';
import React, { useEffect, useState } from 'react';
import { ActivityIndicator, Alert, Dimensions, FlatList, ImageBackground, KeyboardAvoidingView, Modal, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { Circle, G, Path, Svg } from 'react-native-svg';
import { auth, db } from '../constants/firebaseConfig';

const bgImage = require('../assets/images/bg.jpg');

interface Student {
  id: string;
  studentNumber: string;
  nickname: string;
  category?: string; // Optional, only used in frontend
  preScore?: { pattern: number; numbers: number };
  postScore?: { pattern: number; numbers: number };
  classId: string;
  parentId?: string;
}

interface ClassData {
  id: string;
  school: string;
  section: string;
  teacherId: string;
  studentIds: string[];
  students?: Student[]; // Optional for runtime compatibility
  tasks: { title: string; details: string; status: string; preRating?: number; postRating?: number }[];
  learnersPerformance: { label: string; color: string; percent: number }[];
}

type ModalType = 'addClass' | 'addStudent' | 'announce' | 'category' | 'taskInfo' | 'classList' | 'parentList' | 'startTest' | 'editStudent' | 'showImprovement' | 'evaluateStudent' | 'studentInfo' | null;

// Helper: Compute performance distribution for pre/post test
function getPerformanceDistribution(students: Student[] = [], type: 'pre' | 'post') {
  const categories = [
    { label: 'Not yet taken', color: '#c0c0c0' },
    { label: '7', color: '#e6f4ea' },      // red
    { label: 'Consolidation', color: '#c2e8cd' },    // peach/orange
    { label: 'Enhancement', color: '#a0d9b5' },      // yellow
    { label: 'Proficient', color: '#7ccc98' },       // light green
    { label: 'Highly Proficient', color: '#5bbd7d' },// main green
  ];
  // Count students in each category
  const counts = [0, 0, 0, 0, 0, 0];
  students.forEach(student => {
    const scoreObj = type === 'pre' ? student.preScore : student.postScore;
    if (!scoreObj || (typeof scoreObj.pattern !== 'number' && typeof scoreObj.numbers !== 'number')) {
      counts[0]++;
      return;
    }
    const score = (scoreObj.pattern ?? 0) + (scoreObj.numbers ?? 0);
    if (typeof score !== 'number' || score <= 0) {
      counts[0]++;
      return;
    }
    const percent = (score / 20) * 100;
    if (percent < 25) counts[1]++;
    else if (percent < 50) counts[2]++;
    else if (percent < 75) counts[3]++;
    else if (percent < 85) counts[4]++;
    else counts[5]++;
  });
  const sum = counts.reduce((a, b) => a + b, 0);
  if (sum < 2) {
    // Not enough valid scores
    return categories.map(cat => ({ ...cat, color: '#bbb', percent: 0 }));
  }
  return categories.map((cat, i) => ({
    ...cat,
    percent: Math.round((counts[i] / sum) * 100),
  }));
}

// Calls your GPT endpoint at https://mathtatag-api.onrender.com/gpt
const askGpt = async (prompt: string): Promise<string> => {
  const response = await fetch('https://mathtatag-api.onrender.com/gpt', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ prompt }),
  });

  if (!response.ok) {
    let error, text;
    try {
      error = await response.json();
    } catch {
      error = {};
    }
    try {
      text = await response.text();
    } catch {
      text = '';
    }
    throw new Error((error.error || text || 'Unknown error') + (error.details ? ('\nDetails: ' + error.details) : ''));
  }

  const result = await response.json();
  return result.response;
};

interface TaskSummary {
  title: string;
  details: string;
  preScore: number | string;
  postScore: number | string;
}

interface FeedbackPromptParams {
  studentName: string;
  patternScore: number;
  subtractionScore: number;
  percentImprovement: number;
  taskSummaries: TaskSummary[];
}

// 📄 Generates the teacher-style feedback prompt
const generateFeedbackPrompt = ({
  studentName,
  patternScore,
  subtractionScore,
  percentImprovement,
  taskSummaries
}: FeedbackPromptParams): string => {
  const tasksFormatted = taskSummaries.map((task: TaskSummary) =>
    `- ${task.title} – ${task.details} (Score: ${task.preScore}⭐ ➝ ${task.postScore}⭐)`
  ).join('\n');

  return `Ako ay isang guro ng Grade 1. Tulungan mo akong gumawa ng malinaw, makabuluhan, at suportadong payo para sa magulang ng batang si ${studentName}. Narito ang impormasyon tungkol sa kanya:
 - Score sa pattern recognition: ${patternScore}/10
 - Score sa subtraction: ${subtractionScore}/10
 - Pagbuti mula pretest: ${percentImprovement}%\n\nNarito rin ang mga home-based tasks na ibinigay ng magulang para suportahan ang kanyang pagkatuto at ang assessment scores sa bawat isa:\n${tasksFormatted}\n\nBilang guro, nais kong bigyang-pugay ang pagsusumikap ng magulang, magbigay ng positibong feedback, at magrekomenda ng mga dagdag na hakbang upang lalo pang mapaunlad ang kakayahan ni ${studentName}. Mangyaring isulat ang iyong mensahe bilang isang guro na nagbibigay-gabay, nagpapakita ng suporta, at kinikilala ang aktibong partisipasyon ng magulang sa pagkatuto ng anak. Isulat ito sa isang tuwirang talata lamang.`;
};

export default function TeacherDashboard() {
  const [currentTeacher, setCurrentTeacher] = useState<any>(null);
  const [teacherName, setTeacherName] = useState('');
  const [modalType, setModalType] = useState<ModalType>(null);
  const [modalVisible, setModalVisible] = useState(false);
  const [classSection, setClassSection] = useState('');
  const [studentNickname, setStudentNickname] = useState('');
  const [announceText, setAnnounceText] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
  const [selectedStudent, setSelectedStudent] = useState<Student | null>(null);
  const [testType, setTestType] = useState<'pre' | 'post' | null>(null);
  const [selectedClassId, setSelectedClassId] = useState<string | null>(null);
  const [sortColumn, setSortColumn] = useState<'name' | 'status' | 'pre' | 'post'>('name');
  const [sortAsc, setSortAsc] = useState(true);
  const [editingStudent, setEditingStudent] = useState<Student | null>(null);
  const [editingStudentName, setEditingStudentName] = useState('');
  const [improvementData, setImprovementData] = useState<{ student: Student, pre: number, post: number, preStatus: string, postStatus: string } | null>(null);
  const [evaluationData, setEvaluationData] = useState<{ student: Student, classId: string } | null>(null);
  const [evaluationText, setEvaluationText] = useState('');
  const [loading, setLoading] = useState(true);
  const [classes, setClasses] = useState<ClassData[]>([]);
  const [prePattern, setPrePattern] = useState('0');
  const [preNumbers, setPreNumbers] = useState('0');
  const [postPattern, setPostPattern] = useState('0');
  const [postNumbers, setPostNumbers] = useState('0');
  const [announceTitle, setAnnounceTitle] = useState('');
  const [parentAuthCode, setParentAuthCode] = useState<string | null>(null);
  const [copiedAuthCode, setCopiedAuthCode] = useState(false);
  // Add state for parent list modal
  const [parentListData, setParentListData] = useState<any[]>([]);
  const [parentListLoading, setParentListLoading] = useState(false);
  // Add state for parent tasks modal
  const [parentTasksModalVisible, setParentTasksModalVisible] = useState(false);
  const [selectedParentForTasks, setSelectedParentForTasks] = useState<any>(null);
  const [parentTasksLoading, setParentTasksLoading] = useState(false);
  const [parentTasks, setParentTasks] = useState<any[]>([]);
  // Add state for parent tasks in evaluation modal
  const [evaluationParentTasks, setEvaluationParentTasks] = useState<any[]>([]);
  const [evaluationParentTasksLoading, setEvaluationParentTasksLoading] = useState(false);
  // Add state for ghostwriter loading
  const [ghostLoading, setGhostLoading] = useState(false);
  // Add this to the top-level state declarations
  const [evaluationShowAllTasks, setEvaluationShowAllTasks] = useState(false);
  // Add state for ghostwriter text visibility
  const [showGhostwriterText, setShowGhostwriterText] = useState(true);
  // Quarter selection state
  const [selectedQuarter, setSelectedQuarter] = useState<number>(1);
  const [quarterMenuOpen, setQuarterMenuOpen] = useState<boolean>(false);
  // Add state for ghostwriter loading statements
  const ghostLoadingStatements = [
    'Analyzing tasks and progress...',
    'Classifying strengths and areas for growth...',
    'Composing feedback for the parent...',
    'Summarizing student performance...'
  ];
  const [ghostLoadingStatementIdx, setGhostLoadingStatementIdx] = useState(0);
  // Add state for hamburger menu
  const [openMenuClassId, setOpenMenuClassId] = useState<string | null>(null);
  // Add state for profile menu
  const [showProfileMenu, setShowProfileMenu] = useState(false);
  const router = useRouter();
  // Add state for AI Profiler
  const [aiProfile, setAiProfile] = useState<string | null>(null);
  const [aiProfileLoading, setAiProfileLoading] = useState(false);
  const [aiProfileError, setAiProfileError] = useState<string | null>(null);

  // Place all useEffect hooks here, after all useState hooks
  useEffect(() => {
    let interval: any;
    if (ghostLoading) {
      setGhostLoadingStatementIdx(0);
      interval = setInterval(() => {
        setGhostLoadingStatementIdx(idx => (idx + 1) % ghostLoadingStatements.length);
      }, 1200);
    } else {
      setGhostLoadingStatementIdx(0);
      if (interval) clearInterval(interval);
    }
    return () => { if (interval) clearInterval(interval); };
  }, [ghostLoading]);

  // Add useEffect to handle auto-selecting class for announcements
  useEffect(() => {
    if (modalType === 'announce' && classes.length === 1 && !selectedClassId) {
      setSelectedClassId(classes[0].id);
    }
  }, [modalType, classes, selectedClassId]);

  // Safety net: Stop any background music when this screen gains focus
  useFocusEffect(
    React.useCallback(() => {
      (async () => {
        try {
          // Globally disable audio as a safety net
          await Audio.setIsEnabledAsync(false);
          await Audio.setIsEnabledAsync(true);
        } catch {}
      })();
      return () => {};
    }, [])
  );

  // Use theme-matching harmonious colors for the chart
  const defaultCategories = [
    { label: 'Not yet taken', color: '#c0c0c0' },
    { label: 'Intervention', color: '#e6f4ea' },      // red
    { label: 'Consolidation', color: '#c2e8cd' },    // peach/orange
    { label: 'Enhancement', color: '#a0d9b5' },      // yellow
    { label: 'Proficient', color: '#7ccc98' },       // light green
    { label: 'Highly Proficient', color: '#5bbd7d' },// main green
  ];

  // Load current teacher and their data
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      if (user) {
        try {
          // Get teacher info from database
          const teacherRef = ref(db, `Teachers/${user.uid}`);
          const teacherSnapshot = await get(teacherRef);
          
          if (teacherSnapshot.exists()) {
            const teacherData = teacherSnapshot.val();
            setCurrentTeacher(teacherData);
            setTeacherName(teacherData.name.split(' ')[0]); // Get first name
          }
        } catch (error) {
          console.error('Error loading teacher data:', error);
        }
      }
      setLoading(false);
    });

    return () => unsubscribe();
  }, []);

  // Load classes for current teacher
  useEffect(() => {
    if (!currentTeacher) return;

    const classesRef = ref(db, `Classes`);
    const unsubscribe = onValue(classesRef, async (snapshot) => {
      const data = snapshot.val();
      if (data) {
        const teacherClasses = Object.values(data)
          .filter((cls: any) => cls.teacherId === currentTeacher.teacherId);

        // For each class, fetch up-to-date students from Students node
        const updatedClasses = await Promise.all(teacherClasses.map(async (cls: any) => {
          // If students is an array of student objects, get their IDs
          const studentIds = Array.isArray(cls.studentIds) ? cls.studentIds : [];
          // Fetch each student from Students node
          const students = await Promise.all(studentIds.map(async (id: string) => {
            const snap = await get(ref(db, `Students/${id}`));
            return snap.exists() ? snap.val() : null;
          }));
          // Filter for unique students by id
          const uniqueStudents = students.filter((s, idx, arr) => s && arr.findIndex(stu => stu.id === s.id) === idx);
          return {
            ...cls,
            students: uniqueStudents, // Only unique students
            school: cls.school || cls.className || 'Unknown School',
            section: cls.section || cls.className || 'Unknown Section'
          };
        }));

        setClasses(updatedClasses);
      } else {
        setClasses([]);
      }
    });

    return () => unsubscribe();
  }, [currentTeacher]);

  // Helper to get a class by id
  const getClassById = (id: string | null) => classes.find(cls => cls.id === id) || null;

  // Analytics calculations
  const totalClasses = classes?.length || 0;
  const totalStudents = classes?.reduce((sum, c) => sum + (c.students?.length || 0), 0) || 0;
  const allPerformance = classes?.flatMap(c => c.learnersPerformance?.map(lp => lp.percent) || []) || [];
  // For dashboard avgImprovement, only include students with both pre and post and pre > 0
  const allStudentsWithBoth = classes.flatMap(cls => (cls.students ?? []).filter(s => {
    const hasPre = s.preScore && typeof s.preScore.pattern === 'number' && typeof s.preScore.numbers === 'number';
    const hasPost = s.postScore && typeof s.postScore.pattern === 'number' && typeof s.postScore.numbers === 'number';
    const pre = (s.preScore?.pattern ?? 0) + (s.preScore?.numbers ?? 0);
    const post = (s.postScore?.pattern ?? 0) + (s.postScore?.numbers ?? 0);
    // Only include if both pre and post exist and pre > 0 and post > 0
    return hasPre && hasPost && pre > 0 && post > 0;
  }));
  const avgPerformance = allPerformance.length ? Math.round(allPerformance.reduce((a, b) => a + b, 0) / allPerformance.length) : 0;
  let dashboardAvgImprovement = 0;
  if (allStudentsWithBoth.length > 0) {
    const improvements = allStudentsWithBoth.map(s => {
      const pre = (s.preScore?.pattern ?? 0) + (s.preScore?.numbers ?? 0);
      const post = (s.postScore?.pattern ?? 0) + (s.postScore?.numbers ?? 0);
      return pre > 0 ? ((post - pre) / pre) * 100 : 0;
    });
    dashboardAvgImprovement = Math.round(improvements.reduce((a, b) => a + b, 0) / improvements.length);
  }

  // Modal open/close helpers
  const openModal = (type: ModalType, extra: any = null) => {
    setModalType(type);
    if (type === 'category') {
      setSelectedCategory(extra?.category);
      setSelectedClassId(extra?.classId);
    }
    if (type === 'addStudent') {
      setSelectedClassId(extra?.classId);
    }
    if (type === 'classList') {
      setSelectedClassId(extra?.classId);
    }
    if (type === 'startTest') {
      if (extra?.student) {
        setSelectedStudent(extra.student);
        setTestType(extra.testType);
        setSelectedClassId(extra.classId);
      }
    }
    if (type === 'editStudent') {
      if (extra?.student) {
        setEditingStudent(extra.student);
        setEditingStudentName(extra.student.nickname);
        setSelectedClassId(extra.classId);
        setPrePattern(extra.student?.preScore?.pattern?.toString() ?? '0');
        setPreNumbers(extra.student?.preScore?.numbers?.toString() ?? '0');
        setPostPattern(extra.student?.postScore?.pattern?.toString() ?? '0');
        setPostNumbers(extra.student?.postScore?.numbers?.toString() ?? '0');
      }
    }
    if (type === 'showImprovement') {
      setImprovementData(extra);
    }
    if (type === 'evaluateStudent') {
      setEvaluationShowAllTasks(false);
      setEvaluationData(extra);
      setEvaluationText('');
      setEvaluationParentTasks([]);
      setEvaluationParentTasksLoading(true);
      setShowGhostwriterText(true); // Show text initially
      setTimeout(() => setShowGhostwriterText(false), 5000); // Hide after 5 seconds
      // Fetch parent tasks for this student
      if (extra?.student?.parentId) {
        get(ref(db, `Parents/${extra.student.parentId}/tasks`)).then(tasksSnap => {
          let loadedTasks = [];
          if (tasksSnap.exists()) {
            loadedTasks = tasksSnap.val();
            if (!Array.isArray(loadedTasks)) loadedTasks = Object.values(loadedTasks);
          }
          setEvaluationParentTasks(loadedTasks);
          setEvaluationParentTasksLoading(false);
        }).catch(() => {
          setEvaluationParentTasks([]);
          setEvaluationParentTasksLoading(false);
        });
      } else {
        setEvaluationParentTasks([]);
        setEvaluationParentTasksLoading(false);
      }
    }
    if (type === 'studentInfo') {
      if (extra?.student) {
        setSelectedStudent(extra.student);
        setParentAuthCode(null); // reset first
        setAiProfile(null);
        setAiProfileError(null);
        setAiProfileLoading(true);
        if (extra.student.parentId) {
          const parentRef = ref(db, `Parents/${extra.student.parentId}`);
          get(parentRef).then(async snap => {
            if (snap.exists()) {
              const parentData = snap.val();
              setParentAuthCode(parentData.authCode || null);
              // Fetch parent tasks
              let parentTasks = [];
              try {
                const tasksSnap = await get(ref(db, `Parents/${extra.student.parentId}/tasks`));
                if (tasksSnap.exists()) {
                  parentTasks = tasksSnap.val();
                  if (!Array.isArray(parentTasks)) parentTasks = Object.values(parentTasks);
                }
              } catch {}
              // Build prompt for GPT
              const prompt = `You are an educational AI profiler. In responding dont use design in text like bold or italic, just plain. Give a very brief student profile here, just need to know what type of student and household he/she is living. Must be very brief one paragraph limit and dont add :. Here is all the information about a student and their parent:

Student:
- Name: ${extra.student.nickname}
- Student Number: ${extra.student.studentNumber}
- Class: ${extra.student.classId}
- Pre-test: Pattern: ${extra.student.preScore?.pattern ?? 0}, Numbers: ${extra.student.preScore?.numbers ?? 0}, Total: ${(extra.student.preScore?.pattern ?? 0) + (extra.student.preScore?.numbers ?? 0)}/20
- Post-test: Pattern: ${extra.student.postScore?.pattern ?? 0}, Numbers: ${extra.student.postScore?.numbers ?? 0}, Total: ${(extra.student.postScore?.pattern ?? 0) + (extra.student.postScore?.numbers ?? 0)}/20

Parent:
- Name: ${parentData.name}
- Auth Code: ${parentData.authCode}
- Contact: ${parentData.contact}
- Household Income: ${parentData.householdIncome}
- Tasks: ${parentTasks.length}
${parentTasks.map((t: any, i: number) => `  ${i+1}. ${t.title} (Status: ${t.status}, Pre: ${t.preRating ?? '-'}, Post: ${t.postRating ?? '-'})`).join('\n')}

Generate a concise, insightful AI profile for the teacher. Highlight the student's learning strengths, areas for growth, parent engagement, and any recommendations for next steps. Use a supportive, professional tone.`;
              setAiProfileLoading(true);
              setAiProfileError(null);
              try {
                const response = await askGpt(prompt);
                setAiProfile(response);
              } catch (err) {
                setAiProfileError('Failed to generate AI profile.');
                setAiProfile(null);
              }
              setAiProfileLoading(false);
            } else {
              setParentAuthCode(null);
              setAiProfileError('No parent data found.');
              setAiProfile(null);
              setAiProfileLoading(false);
            }
          }).catch(() => {
            setParentAuthCode(null);
            setAiProfileError('No parent data found.');
            setAiProfile(null);
            setAiProfileLoading(false);
          });
        } else {
          setAiProfileError('No parent linked.');
          setAiProfile(null);
          setAiProfileLoading(false);
        }
      }
    }
    // Parent List Modal: fetch all parents for the class
    if (type === 'parentList') {
      setSelectedClassId(extra?.classId);
      setParentListLoading(true);
      setParentListData([]);
      const cls = getClassById(extra?.classId);
      if (cls && Array.isArray(cls.students)) {
        // For each student, fetch parent
        Promise.all(
          cls.students.map(async (student) => {
            if (!student.parentId) return null;
            const parentSnap = await get(ref(db, `Parents/${student.parentId}`));
            if (!parentSnap.exists()) return null;
            const parent = parentSnap.val();
            // Fetch tasks for this parent
            let tasks = [];
            try {
              const tasksSnap = await get(ref(db, `Parents/${parent.parentId}/tasks`));
              if (tasksSnap.exists()) {
                let loadedTasks = tasksSnap.val();
                if (!Array.isArray(loadedTasks)) loadedTasks = Object.values(loadedTasks);
                tasks = loadedTasks;
              }
            } catch {}
            // Calculate progress
            const doneCount = tasks.filter((t:any) => t.status === 'done').length;
            const progressPercent = tasks.length > 0 ? Math.round((doneCount / tasks.length) * 100) : 0;
            // Calculate pre/post average (stars out of 5)
            // Use student's preScore/postScore
            const preTotal = (student.preScore?.pattern ?? 0) + (student.preScore?.numbers ?? 0);
            const postTotal = (student.postScore?.pattern ?? 0) + (student.postScore?.numbers ?? 0);
            // Map 0-20 to 0-5 stars
            const preStars = Math.round((preTotal / 20) * 5);
            const postStars = Math.round((postTotal / 20) * 5);
            return {
              parentName: parent.name,
              studentName: student.nickname,
              householdIncome: parent.householdIncome,
              preStars,
              postStars,
              progressPercent,
              student,
              parent,
            };
          })
        ).then((results) => {
          setParentListData(results.filter(Boolean));
          setParentListLoading(false);
        });
      } else {
        setParentListLoading(false);
      }
    }
    setModalVisible(true);
  };

  const closeModal = () => {
    setModalVisible(false);
    setModalType(null);
    setClassSection('');
    setStudentNickname('');
    setAnnounceText('');
    setAnnounceTitle('');
    setSelectedCategory(null);
    setSelectedStudent(null);
    setTestType(null);
    setSelectedClassId(null);
    setEditingStudent(null);
    setEditingStudentName('');
    setImprovementData(null);
    setEvaluationData(null);
    setEvaluationText('');
    setEvaluationShowAllTasks(false);
  };

  // Add new class to database
  const addClass = async () => {
    if (!classSection.trim() || !currentTeacher) {
      Alert.alert('Error', 'Please enter a section name.');
      return;
    }

    try {
      // Use the teacher's school from the Teachers table
      const schoolName = currentTeacher.school || 'Unknown School';
      const schoolAbbreviation = schoolName.split(' ').map((word: string) => word.charAt(0)).join('') + 'ES';
      const currentYear = new Date().getFullYear();
      // Generate readable class ID: SCHOOLABBR-SECTION-YEAR
      const readableClassId = `${schoolAbbreviation.toUpperCase()}-${classSection.trim().toUpperCase()}-${currentYear}`;
      const newClass: ClassData = {
        id: readableClassId,
        school: schoolName,
        section: classSection.trim(),
        teacherId: currentTeacher.teacherId,
        studentIds: [],
        tasks: [],
        learnersPerformance: [],
      };
      await set(ref(db, `Classes/${readableClassId}`), newClass);
      Alert.alert('Success', `Class created successfully!\n\nClass ID: ${readableClassId}`);
      closeModal();
    } catch (error) {
      Alert.alert('Error', 'Failed to create class. Please try again.');
    }
  };

  // Add new student to a class
  const addStudent = async () => {
    if (!selectedClassId || !studentNickname.trim()) {
      Alert.alert('Error', 'Please enter a student nickname.');
      return;
    }

    try {
      // Get the class information
      const classRef = ref(db, `Classes/${selectedClassId}`);
      const classSnapshot = await get(classRef);
      if (!classSnapshot.exists()) {
        Alert.alert('Error', 'Class not found.');
        return;
      }
      const classData = classSnapshot.val();
      
      // Get current year
      const currentYear = new Date().getFullYear();
      
      // Get the next student number for this class and year
      const studentsRef = ref(db, 'Students');
      const studentsSnapshot = await get(studentsRef);
      let nextStudentNumber = 1;
      
      if (studentsSnapshot.exists()) {
        const students = studentsSnapshot.val();
        // Generate school abbreviation for filtering
        const schoolAbbreviation = classData.school.split(' ').map((word: string) => word.charAt(0)).join('') + 'ES';
        const classStudents = Object.values(students).filter((student: any) => 
          student.classId === selectedClassId
        );
        nextStudentNumber = classStudents.length + 1;
      }
      
      // Generate school abbreviation (first letter + ES)
      const schoolAbbreviation = classData.school.split(' ').map((word: string) => word.charAt(0)).join('') + 'ES';
      
      // Generate student ID in format: SCHOOLABBR-SECTION-YEAR-XXX
      const studentId = `${schoolAbbreviation.toUpperCase()}-${classData.section.toUpperCase()}-${currentYear}-${String(nextStudentNumber).padStart(3, '0')}`;
      
      // Generate a unique short auth code for the parent in the format AAA#### (3 uppercase letters + 4 digits)
      let authCode = '';
      let isUnique = false;
      const randomLetters = () => Array.from({length: 3}, () => String.fromCharCode(65 + Math.floor(Math.random() * 26))).join('');
      while (!isUnique) {
        const letters = randomLetters();
        const digits = Math.floor(1000 + Math.random() * 9000); // 4 digit random number
        authCode = `${letters}${digits}`;
        // Check uniqueness in Parents node
        const parentsRef = ref(db, 'Parents');
        const parentsSnapshot = await get(parentsRef);
        let exists = false;
        if (parentsSnapshot.exists()) {
          const parents = parentsSnapshot.val();
          exists = Object.values(parents).some((parent: any) => parent.authCode === authCode);
        }
        if (!exists) isUnique = true;
      }
      const parentId = `parent-${studentId}`;
      
      // Create parent data in database
      const parentData = {
        parentId,
        authCode,
        studentId: studentId,
        name: `${studentNickname.trim()}'s Parent`,
        contact: '',
        createdAt: new Date().toISOString(),
        householdIncome: '', // or default to first bracket if you prefer
      };
      await set(ref(db, `Parents/${parentId}`), parentData);
      
      // Create student data
      const newStudent: Student = {
        id: studentId,
        studentNumber: studentId,
        nickname: studentNickname.trim(),
        preScore: { pattern: 0, numbers: 0 },
        postScore: { pattern: 0, numbers: 0 },
        classId: selectedClassId,
        parentId: parentId, // Link to parent record
      };

      // Add student to Students node
      await set(ref(db, `Students/${studentId}`), newStudent);
      
      // Update the class's studentIds array, ensuring no duplicates
      const currentIds = Array.isArray(classData.studentIds) ? classData.studentIds : [];
      const updatedIds = currentIds.includes(studentId) ? currentIds : [...currentIds, studentId];
      const updatedClassData = {
        ...classData,
        studentIds: updatedIds
      };
      await set(ref(db, `Classes/${selectedClassId}`), updatedClassData);
      
      Alert.alert(
        'Success', 
        `Student added successfully!\n\nStudent ID: ${studentId}\nParent Auth Code: ${authCode}`
      );
      closeModal();
    } catch (error: any) {
      let errorMessage = 'Failed to add student. Please try again.';
      if (error.message) {
        errorMessage = error.message;
      }
      Alert.alert('Error', errorMessage);
    }
  };

  // Delete class
  const deleteClass = async (classId: string) => {
    Alert.alert(
      'Delete Class',
      'Are you sure you want to delete this class? This will also delete all students in this class.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            try {
              // Delete class
              await remove(ref(db, `Classes/${classId}`));
              
              // Delete all students in this class
              const studentsRef = ref(db, 'Students');
              const studentsSnapshot = await get(studentsRef);
              if (studentsSnapshot.exists()) {
                const students = studentsSnapshot.val();
                const deletePromises = Object.keys(students)
                  .filter(studentId => students[studentId].classId === classId)
                  .map(studentId => remove(ref(db, `Students/${studentId}`)));
                
                await Promise.all(deletePromises);
              }
              
              Alert.alert('Success', 'Class deleted successfully!');
            } catch (error) {
              Alert.alert('Error', 'Failed to delete class.');
            }
          }
        }
      ]
    );
  };

  // Delete student
  const deleteStudent = async (studentId: string) => {
    Alert.alert(
      'Delete Student',
      'Are you sure you want to delete this student?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            try {
              // Remove student from Students node
              await remove(ref(db, `Students/${studentId}`));
              
              // Find and remove student from all classes
              const classesRef = ref(db, 'Classes');
              const classesSnapshot = await get(classesRef);
              if (classesSnapshot.exists()) {
                const classes = classesSnapshot.val();
                const updatePromises = Object.keys(classes).map(async (classId) => {
                  const classData = classes[classId];
                  if (classData.students && classData.students.some((s: any) => s.id === studentId)) {
                    const updatedStudents = classData.students.filter((s: any) => s.id !== studentId);
                    await set(ref(db, `Classes/${classId}`), {
                      ...classData,
                      students: updatedStudents
                    });
                  }
                });
                await Promise.all(updatePromises);
              }
              
              Alert.alert('Success', 'Student deleted successfully!');
            } catch (error) {
              Alert.alert('Error', 'Failed to delete student.');
            }
          }
        }
      ]
    );
  };

  const startTest = () => {
    // Navigate to loading screen with student and classId as params
    if (selectedStudent && selectedClassId && testType === 'pre') {
      router.push({ pathname: '/LoadingScreen', params: { studentId: selectedStudent.id, classId: selectedClassId } });
      closeModal();
    } else {
      Alert.alert('Error', 'Missing student or class information.');
    }
  };

  const editStudent = () => {
    // TODO: Implement edit student functionality
    Alert.alert('Edit Student', 'Edit functionality will be implemented soon.');
      closeModal();
  };



  // Responsive pie chart with legend always side by side
  function AnalyticsPieChartWithLegend({ data, reverse = false, title = 'Pretest Performance' }: { data: { label: string; color: string; percent: number }[], reverse?: boolean, title?: string }) {
    const windowWidth = Dimensions.get('window').width;
    // Container width: full width minus 32px margin
    const containerWidth = Math.max(240, windowWidth - 60);
    // Pie chart size: 48% of container, min 100, max 180
    const size = Math.max(100, Math.min(containerWidth * 0.44, 180));
    const radius = size / 2 - 8;
    const center = size / 2;
    // Font and dot sizes
    const fontSizeTitle = windowWidth < 500 ? 18 : 22;
    const fontSizeLabel = windowWidth < 500 ? 13 : 15;
    const fontSizePercent = windowWidth < 500 ? 12 : 14;
    const dotSize = windowWidth < 500 ? 14 : 18;
    // Pie data
    const categories = defaultCategories.map(cat => {
      const found = data.find(d => d.label === cat.label);
      return found ? found : { ...cat, percent: 0 };
    });
    const total = categories.reduce((sum, d) => sum + d.percent, 0) || 1;
    let startAngle = 0;
    const arcs = categories.map((d, idx) => {
      const angle = (d.percent / total) * 2 * Math.PI;
      const endAngle = startAngle + angle;
      const largeArc = angle > Math.PI ? 1 : 0;
      const x1 = center + radius * Math.cos(startAngle);
      const y1 = center + radius * Math.sin(startAngle);
      const x2 = center + radius * Math.cos(endAngle);
      const y2 = center + radius * Math.sin(endAngle);
      const path = [
        `M ${center} ${center}`,
        `L ${x1} ${y1}`,
        `A ${radius} ${radius} 0 ${largeArc} 1 ${x2} ${y2}`,
        'Z',
      ].join(' ');
      startAngle = endAngle;
      return { path, color: d.color, label: d.label, percent: d.percent, idx };
    });
    // Responsive layout: chart and legend in 2-column row
    return (
      <View style={{
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        width: containerWidth,
        marginBottom: 3,
        paddingHorizontal: 0,
        paddingVertical: 12,
        alignSelf: 'center',
        backgroundColor: 'rgba(255,255,255,0.92)',
        borderRadius: 18,
        gap: 0,
      }}>
        {reverse ? (
          <>
            <View style={{ flex: 1, minWidth: 120, alignItems: 'flex-end', justifyContent: 'center', marginRight: 0, paddingRight: 0, gap: 8 }}>
              {arcs.map((arc) => (
                <View key={arc.label + '-' + arc.percent + '-' + arc.idx} style={{ flexDirection: 'row-reverse', alignItems: 'center', marginBottom: 10, marginTop: 2 }}>
                  <View style={{ width: dotSize, height: dotSize, borderRadius: dotSize / 2, backgroundColor: arc.color, marginLeft: 8, borderWidth: 1, borderColor: '#eee' }} />
                  <Text style={{ fontSize: fontSizeLabel, color: '#222', fontWeight: '600', marginLeft: 4 }}>{arc.label}</Text>
                  <Text style={{ fontSize: fontSizePercent, color: '#888', fontWeight: '500' }}>({arc.percent}%)</Text> 
                </View>
              ))}
            </View>
            <View style={{ alignItems: 'center', justifyContent: 'center', minWidth: size, maxWidth: size, marginLeft: 4 }}>
              <Text style={{ fontSize: fontSizeTitle, fontWeight: 'bold', color: '#222', marginBottom: 0, textAlign: 'center' }}>{title}</Text>
              <Svg width={size} height={size} style={{ marginBottom: -6 }}>
                <G>
                  {arcs.map((arc) => (
                    <Path key={arc.label + '-' + arc.percent + '-' + arc.idx} d={arc.path} fill={arc.color} />
                  ))}
                </G>
              </Svg>
            </View>
          </>
        ) : (
          <>
            <View style={{ alignItems: 'center', justifyContent: 'center', minWidth: size, maxWidth: size, marginRight: 4 }}>
              <Text style={{ fontSize: fontSizeTitle, fontWeight: 'bold', color: '#222', marginBottom: 0, textAlign: 'center' }}>{title}</Text>
              <Svg width={size} height={size} style={{ marginBottom: -6 }}>
                <G>
                  {arcs.map((arc) => (
                    <Path key={arc.label + '-' + arc.percent + '-' + arc.idx} d={arc.path} fill={arc.color} />
                  ))}
                </G>
              </Svg>
            </View>
            <View style={{ flex: 1, minWidth: 120, alignItems: 'flex-start', justifyContent: 'center', marginLeft: 0, paddingLeft: 0, gap: 8 }}>
              {arcs.map((arc) => (
                <View key={arc.label + '-' + arc.percent + '-' + arc.idx} style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 10, marginTop: 2 }}>
                  <View style={{ width: dotSize, height: dotSize, borderRadius: dotSize / 2, backgroundColor: arc.color, marginRight: 8, borderWidth: 1, borderColor: '#eee' }} />
                  <Text style={{ fontSize: fontSizeLabel, color: '#222', fontWeight: '600', marginRight: 4 }}>{arc.label}</Text>
                  <Text style={{ fontSize: fontSizePercent, color: '#888', fontWeight: '500' }}>({arc.percent}%)</Text> 
                </View>
              ))}
            </View>
          </>
        )}
      </View>
    );
  }



  if (loading) {
    return (
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#fff' }}>
        <Text style={{ fontSize: 18, color: '#27ae60' }}>Loading...</Text>
      </View>
    );
  }

  if (!currentTeacher) {
    return (
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#fff' }}>
        <Text style={{ fontSize: 18, color: '#ff5a5a' }}>Teacher not found. Please log in again.</Text>
      </View>
    );
  }

  // Add a style for the main dashboard card
  const dashboardCardStyle = {
    width: Dimensions.get('window').width,
    maxWidth: 600,
    backgroundColor: 'rgba(255,255,255,0.92)',
    borderRadius: 22,
    paddingVertical: 18,
    paddingHorizontal: 12,
    marginBottom: 24,
    elevation: 4,
    shadowColor: '#27ae60',
    shadowOpacity: 0.10,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 2 },
  };

  // Render each class panel
  const renderClassPanel = (cls: ClassData) => {
    // Delete class handler
    const handleDeleteClass = () => {
      Alert.alert('Delete Class', `Are you sure you want to delete class ${cls.section}?`, [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Delete', style: 'destructive', onPress: () => {
          deleteClass(cls.id);
        } },
      ]);
    };
    const windowWidth = Dimensions.get('window').width;
    const isSmall = windowWidth < 400;
    // Compute class average improvement and post-test average for this class
    const studentsWithBoth = (cls.students ?? []).filter(s => {
      const hasPre = s.preScore && typeof s.preScore.pattern === 'number' && typeof s.preScore.numbers === 'number';
      const hasPost = s.postScore && typeof s.postScore.pattern === 'number' && typeof s.postScore.numbers === 'number';
      const pre = (s.preScore?.pattern ?? 0) + (s.preScore?.numbers ?? 0);
      const post = (s.postScore?.pattern ?? 0) + (s.postScore?.numbers ?? 0);
      // Only include if both pre and post exist and pre > 0 and post > 0
      return hasPre && hasPost && pre > 0 && post > 0;
    });
    let avgImprovement = 0;
    let avgPost = 0;
    if (studentsWithBoth.length > 0) {
      const improvements = studentsWithBoth.map(s => {
        const pre = (s.preScore?.pattern ?? 0) + (s.preScore?.numbers ?? 0);
        const post = (s.postScore?.pattern ?? 0) + (s.postScore?.numbers ?? 0);
        return pre > 0 ? ((post - pre) / pre) * 100 : 0;
      });
      avgImprovement = Math.round(improvements.reduce((a, b) => a + b, 0) / improvements.length);
      avgPost = Math.round(studentsWithBoth.map(s => (s.postScore?.pattern ?? 0) + (s.postScore?.numbers ?? 0)).reduce((a, b) => a + b, 0) / studentsWithBoth.length);
    }
    let avgImprovementColor = '#ffe066';
    if (avgImprovement > 0) avgImprovementColor = '#27ae60';
    else if (avgImprovement < 0) avgImprovementColor = '#ff5a5a';
    // Header click handler
    const handleSort = (col: 'name' | 'status' | 'pre' | 'post') => {
      if (sortColumn === col) {
        setSortAsc(!sortAsc);
      } else {
        setSortColumn(col);
        setSortAsc(true);
      }
    };
    // Compute averages and helper lists for the compact dashboard card
    const preScores = (cls.students || [])
      .map(s => (s.preScore?.pattern ?? 0) + (s.preScore?.numbers ?? 0))
      .filter(v => typeof v === 'number' && v > 0);
    const postScores = (cls.students || [])
      .map(s => (s.postScore?.pattern ?? 0) + (s.postScore?.numbers ?? 0))
      .filter(v => typeof v === 'number' && v > 0);
    const avgPre = preScores.length ? Math.round(preScores.reduce((a, b) => a + b, 0) / preScores.length) : 0;
    const avgPostClass = postScores.length ? Math.round(postScores.reduce((a, b) => a + b, 0) / postScores.length) : 0;
    const prePercent = Math.max(0, Math.min(100, Math.round((avgPre / 20) * 100)));
    const postPercent = Math.max(0, Math.min(100, Math.round((avgPostClass / 20) * 100)));
    const avgPreOutOf10 = Math.round(avgPre / 2);
    const avgPostOutOf10 = Math.round(avgPostClass / 2);
    const studentsSortedByPost = [...(cls.students || [])].sort((a, b) => {
      const aScore = (a.postScore?.pattern ?? 0) + (a.postScore?.numbers ?? 0);
      const bScore = (b.postScore?.pattern ?? 0) + (b.postScore?.numbers ?? 0);
      return bScore - aScore;
    });
    const topStudents = studentsSortedByPost.filter(s => ((s.postScore?.pattern ?? 0) + (s.postScore?.numbers ?? 0)) > 0).slice(0, 7);
    const forMonitoring = [...(cls.students || [])]
      .sort((a, b) => {
        const aScore = (a.postScore?.pattern ?? 0) + (a.postScore?.numbers ?? 0);
        const bScore = (b.postScore?.pattern ?? 0) + (b.postScore?.numbers ?? 0);
        return aScore - bScore;
      })
      .slice(0, 7);
    const weekProgress = [60, 78, 82, 90, 68, 88, 93, 75];

    const Donut = ({ percent, color }: { percent: number; color: string }) => {
      const size = 68;
      const stroke = 8;
      const radius = (size - stroke) / 2;
      const circumference = 2 * Math.PI * radius;
      const dashOffset = circumference * (1 - Math.max(0, Math.min(1, percent / 100)));
      return (
        <View style={styles.donutWrap}>
          <Svg width={size} height={size}>
            <G rotation={-90} originX={size / 2} originY={size / 2}>
              <Circle cx={size / 2} cy={size / 2} r={radius} stroke="#eee" strokeWidth={stroke} fill="transparent" />
              <Circle
                cx={size / 2}
                cy={size / 2}
                r={radius}
                stroke={color}
                strokeWidth={stroke}
                strokeDasharray={`${circumference} ${circumference}`}
                strokeDashoffset={dashOffset}
                strokeLinecap="round"
                fill="transparent"
              />
            </G>
          </Svg>
          <Text style={styles.donutCenterText}>{percent}%</Text>
        </View>
      );
    };

    return (
      <LinearGradient colors={['#f7fafc', '#e0f7fa']} style={[styles.classCard, { marginBottom: 15, padding: 2, borderRadius: 32, shadowColor: '#27ae60', shadowOpacity: 0.13, shadowRadius: 18, shadowOffset: { width: 0, height: 8 }, elevation: 10, width: '100%', maxWidth: 540, alignSelf: 'center' }]}> 
        <View style={{ padding: isSmall ? 16 : 24, paddingBottom: isSmall ? 0 : 8 }}>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: isSmall ? 9 : 8 }}>
            <View>
              <Text style={{ fontSize: 12, color: '#888', fontWeight: '700', marginBottom: -3 }}>Section</Text>
              <Text style={{ fontSize: 35, color: '#27ae60', fontWeight: 'bold', letterSpacing: 1 }}>{cls.section}</Text>
            </View>
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'flex-end', marginBottom: isSmall ? 10 : 18, gap: 6, flexWrap: 'wrap', alignSelf: 'flex-end' }}>
              <TouchableOpacity onPress={() => openModal('classList', { classId: cls.id })} activeOpacity={0.8} style={{ borderRadius: 20, overflow: 'hidden', maxWidth: 48, minWidth: 0, marginHorizontal: 1 }}>
                <View style={{
                  flexDirection: 'row',
                  alignItems: 'center',
                  backgroundColor: '#e0f7fa',
                  borderRadius: 12,
                  paddingVertical: 4,
                  paddingHorizontal: 8,
                  marginTop: 2,
                  marginRight: 0,
                  marginBottom: 4,
                  minWidth: 40,
                  justifyContent: 'center',
                }}>
                  <MaterialCommunityIcons name="account-group" size={22} color="#0097a7" style={{ marginRight: 4 }} />
                  <Text style={{ fontSize: 16, fontWeight: 'bold', color: '#0097a7' }}>{cls.students?.length || 0}</Text>
                </View>
              </TouchableOpacity>
              {/* Hamburger Menu Button */}
              <TouchableOpacity onPress={() => setOpenMenuClassId(openMenuClassId === cls.id ? null : cls.id)} style={{ backgroundColor: '#eee', borderRadius: 20, padding: 6, alignItems: 'center', justifyContent: 'center', elevation: 2, maxWidth: 48, minWidth: 0, marginHorizontal: 1 }}>
                <MaterialCommunityIcons name="dots-vertical" size={22} color="#888" />
              </TouchableOpacity>
              {/* Dropdown Menu */}
              {openMenuClassId === cls.id && (
                <View style={{ position: 'absolute', top: 44, right: 0, backgroundColor: '#fff', borderRadius: 12, elevation: 6, shadowColor: '#000', shadowOpacity: 0.13, shadowRadius: 8, shadowOffset: { width: 0, height: 2 }, minWidth: 160, zIndex: 100 }}>
                  <TouchableOpacity onPress={() => { setOpenMenuClassId(null); openModal('parentList', { classId: cls.id }); }} style={{ flexDirection: 'row', alignItems: 'center', padding: 14, borderBottomWidth: 1, borderColor: '#f0f0f0' }}>
                    <MaterialIcons name="family-restroom" size={22} color="#b8860b" style={{ marginRight: 10 }} />
                    <Text style={{ color: '#b8860b', fontWeight: 'bold', fontSize: 15 }}>Parent List</Text>
                  </TouchableOpacity>
                  <TouchableOpacity onPress={() => { setOpenMenuClassId(null); openModal('announce', { classId: cls.id }); }} style={{ flexDirection: 'row', alignItems: 'center', padding: 14, borderBottomWidth: 1, borderColor: '#f0f0f0' }}>
                    <MaterialIcons name="campaign" size={22} color="#0097a7" style={{ marginRight: 10 }} />
                    <Text style={{ color: '#0097a7', fontWeight: 'bold', fontSize: 15 }}>Announce</Text>
                  </TouchableOpacity>
                  <TouchableOpacity onPress={() => { setOpenMenuClassId(null); handleDeleteClass(); }} style={{ flexDirection: 'row', alignItems: 'center', padding: 14 }}>
                    <MaterialIcons name="delete" size={22} color="#ff5a5a" style={{ marginRight: 10 }} />
                    <Text style={{ color: '#ff5a5a', fontWeight: 'bold', fontSize: 15 }}>Delete</Text>
                  </TouchableOpacity>
                </View>
              )}
            </View>
          </View>
          <View style={{ marginTop: isSmall ? 8 : 16 }}>
            <View style={styles.quarterCard}>
              <View style={styles.quarterHeaderRow}>
                <Pressable style={styles.quarterSelectBtn} onPress={() => setQuarterMenuOpen(!quarterMenuOpen)}>
                  <Text style={styles.quarterTitle}>{`Quarter ${selectedQuarter}`}</Text>
                  <MaterialIcons name={quarterMenuOpen ? 'expand-less' : 'expand-more'} size={20} color="#222" />
                </Pressable>
              </View>
              {quarterMenuOpen && (
                <View style={styles.quarterDropdownMenu}>
                  {[1, 2, 3, 4].map(q => (
                    <TouchableOpacity key={`q-${q}`} style={styles.quarterDropdownItem} onPress={() => { setSelectedQuarter(q); setQuarterMenuOpen(false); }}>
                      <Text style={[styles.quarterDropdownText, selectedQuarter === q ? styles.quarterDropdownTextActive : undefined]}>{`Quarter ${q}`}</Text>
                    </TouchableOpacity>
                  ))}
                </View>
              )}
              <View style={styles.quarterBodyRow}>
                <View style={styles.ringsRow}>
                  <View style={styles.ringCol}>
                    <Donut percent={prePercent} color="#27ae60" />
                    <Text style={styles.ringLabel}>Avg. Pretest</Text>
                    <Text style={styles.ringSubLabel}>{avgPreOutOf10}/10</Text>
                  </View>
                  <View style={styles.ringCol}>
                    <Donut percent={postPercent} color="#ff5a5a" />
                    <Text style={styles.ringLabel}>Avg. Post-test</Text>
                    <Text style={styles.ringSubLabel}>{avgPostOutOf10}/10</Text>
                  </View>
                </View>
                <View style={styles.weeksCol}>
                  {weekProgress.map((p, idx) => (
                    <View key={`week-${idx}`} style={styles.weekRow}>
                      <Text style={styles.weekLabel}>Week {idx + 1}</Text>
                      <View style={styles.weekBarBg}>
                        <View style={[styles.weekBarFill, { width: `${p}%` }]} />
                      </View>
                    </View>
                  ))}
                </View>
              </View>
            </View>
            <View style={{ flexDirection: 'row', gap: 12, justifyContent: 'space-between', marginTop: 12 }}>
              <View style={[styles.listCard, { flex: 1 }]}>
                <Text style={styles.listTitle}>Top Students</Text>
                {topStudents.map((s, idx) => {
                  const post = (s.postScore?.pattern ?? 0) + (s.postScore?.numbers ?? 0);
                  const score10 = Math.round(post / 2);
                  return (
                    <View key={`top-${s.id}`} style={styles.rankRow}>
                      <View style={[styles.rankBadge, styles.rankBadgeTop]}>
                        <Text style={styles.rankBadgeText}>{idx + 1}</Text>
                      </View>
                      <Text style={styles.rankName}>{s.nickname}</Text>
                      <Text style={[styles.rankScore, styles.rankScoreTop]}>{score10}/10</Text>
                    </View>
                  );
                })}
              </View>
              <View style={[styles.listCard, { flex: 1 }]}>
                <Text style={[styles.listTitle, { color: '#ff5a5a' }]}>For Monitoring</Text>
                {forMonitoring.map((s, idx) => {
                  const post = (s.postScore?.pattern ?? 0) + (s.postScore?.numbers ?? 0);
                  const score10 = Math.round(post / 2);
                  return (
                    <View key={`watch-${s.id}`} style={styles.rankRow}>
                      <View style={[styles.rankBadge, styles.rankBadgeWatch]}>
                        <Text style={styles.rankBadgeText}>{idx + 1}</Text>
                      </View>
                      <Text style={styles.rankName}>{s.nickname}</Text>
                      <Text style={[styles.rankScore, styles.rankScoreWatch]}>{score10}/10</Text>
                    </View>
                  );
                })}
              </View>
            </View>
          </View>
        </View>
      </LinearGradient>
    );
  };

  // Modal content renderers (update to use selectedClassId)
  const renderModalContent = (): React.JSX.Element | null => {
    const cls = getClassById(selectedClassId);
    switch (modalType) {
      case 'addClass':
        return (
          <View style={styles.modalBox}>
            <Text style={styles.modalTitle}>Add Classroom</Text>
            <TextInput
              style={styles.modalInput}
              placeholder="Section (e.g. JDC)"
              value={classSection}
              onChangeText={setClassSection}
            />
            <View style={styles.modalBtnRow}>
              <Pressable style={styles.modalBtn} onPress={closeModal}><Text style={styles.modalBtnText}>Cancel</Text></Pressable>
              <Pressable style={[styles.modalBtn, styles.modalBtnPrimary]} onPress={addClass}><Text style={[styles.modalBtnText, styles.modalBtnTextPrimary]}>Add</Text></Pressable>
            </View>
          </View>
        );
      case 'addStudent':
        if (!cls) return null;
        // Generate school abbreviation for display
        const schoolAbbreviation = cls.school.split(' ').map((word: string) => word.charAt(0)).join('') + 'ES';
        const nextStudentNumber = `${schoolAbbreviation.toUpperCase()}-${cls.section.toUpperCase()}-2025-${String((cls.students?.length || 0) + 1).padStart(3, '0')}`;
        return (
          <View style={styles.modalBox}>
            <Text style={styles.modalTitle}>Add Student</Text>
            <TextInput
              style={[styles.modalInput, { color: '#888' }]}
              value={nextStudentNumber}
              editable={false}
              selectTextOnFocus={false}
            />
            <Text style={styles.modalNote}>
              Student number is generated automatically. This is NOT the official DepEd LRN.
            </Text>
            <TextInput
              style={styles.modalInput}
              placeholder="Student Nickname"
              value={studentNickname}
              onChangeText={setStudentNickname}
            />
            <Text style={styles.modalNote}>
              Nickname can be the student&apos;s full name or any identifier you prefer.
            </Text>
            <View style={styles.modalBtnRow}>
              <Pressable style={styles.modalBtn} onPress={closeModal}><Text style={styles.modalBtnText}>Cancel</Text></Pressable>
              <Pressable style={[styles.modalBtn, styles.modalBtnPrimary]} onPress={addStudent}><Text style={[styles.modalBtnText, styles.modalBtnTextPrimary]}>Add</Text></Pressable>
            </View>
          </View>
        );
      case 'classList':
        if (!cls) return null;
        // Updated status order and color mapping
        const statusOrder = {
          'Not yet taken': 0,
          'Intervention': 1,
          'For Consolidation': 2,
          'For Enhancement': 3,
          'Proficient': 4,
          'Highly Proficient': 5
        };
        const statusColors: Record<string, string> = {
          'Not yet taken': '#888',
          'Intervention': '#ff5a5a',
          'For Consolidation': '#ffb37b',
          'For Enhancement': '#ffe066',
          'Proficient': '#7ed957',
          'Highly Proficient': '#27ae60',
        };
        // Helper to get status from score
        function getStatusFromScore(score: number, total: number) {
          if (typeof score !== 'number' || typeof total !== 'number' || total === 0 || score === -1) return 'Not yet taken';
          const percent = (score / total) * 100;
          if (percent < 25) return 'Intervention';
          if (percent < 50) return 'For Consolidation';
          if (percent < 75) return 'For Enhancement';
          if (percent < 85) return 'Proficient';
          return 'Highly Proficient';
        }
        // Realistic demo: some students have only pre, some both, none post without pre
        const getStudentTestStatus = (student: Student, type: 'pre' | 'post') => {
          if (type === 'pre') {
            const pre = (student.preScore?.pattern ?? 0) + (student.preScore?.numbers ?? 0);
            if (pre > 0) {
              return {
                taken: true,
                score: pre,
                total: 20,
                category: getStatusFromScore(pre, 20),
              };
            } else {
              return { taken: false, category: 'Not yet taken' };
            }
          } else {
            const pre = (student.preScore?.pattern ?? 0) + (student.preScore?.numbers ?? 0);
            const post = (student.postScore?.pattern ?? 0) + (student.postScore?.numbers ?? 0);
            if (pre > 0 && post > 0) {
              return {
                taken: true,
                score: post,
                total: 20,
                category: getStatusFromScore(post, 20),
              };
            } else {
              return { taken: false, category: 'Not yet taken' };
            }
          }
        };
        function getStudentStatusForSort(student: Student): string {
          const postStatus = getStudentTestStatus(student, 'post');
          if (!postStatus.taken || !postStatus.category || !(postStatus.category in statusOrder)) return 'Not yet taken';
          return postStatus.category;
        }
        let sortedStudents = [...(cls.students || [])];
        if (sortColumn === 'name') {
          sortedStudents.sort((a, b) => sortAsc ? a.nickname.localeCompare(b.nickname) : b.nickname.localeCompare(a.nickname));
        } else if (sortColumn === 'status') {
          sortedStudents.sort((a, b) => {
            const aOrder = statusOrder[getStudentStatusForSort(a) as keyof typeof statusOrder] ?? 0;
            const bOrder = statusOrder[getStudentStatusForSort(b) as keyof typeof statusOrder] ?? 0;
            return sortAsc ? aOrder - bOrder : bOrder - aOrder;
          });
        } else if (sortColumn === 'pre') {
          sortedStudents.sort((a, b) => {
            const aStatus = getStudentTestStatus(a, 'pre');
            const bStatus = getStudentTestStatus(b, 'pre');
            const aScore = aStatus.taken ? (aStatus.score || 0) : -1;
            const bScore = bStatus.taken ? (bStatus.score || 0) : -1;
            return sortAsc ? aScore - bScore : bScore - aScore;
          });
        } else if (sortColumn === 'post') {
          sortedStudents.sort((a, b) => {
            const aStatus = getStudentTestStatus(a, 'post');
            const bStatus = getStudentTestStatus(b, 'post');
            const aScore = aStatus.taken ? (aStatus.score || 0) : -1;
            const bScore = bStatus.taken ? (bStatus.score || 0) : -1;
            return sortAsc ? aScore - bScore : bScore - aScore;
          });
        }
        // Header click handler
        const handleSort = (col: 'name' | 'status' | 'pre' | 'post') => {
          if (sortColumn === col) {
            setSortAsc(!sortAsc);
          } else {
            setSortColumn(col);
            setSortAsc(true);
          }
        };
        // Compute class average improvement and post-test average
        const studentsWithBoth = (cls.students ?? []).filter(s => {
          const hasPre = s.preScore && typeof s.preScore.pattern === 'number' && typeof s.preScore.numbers === 'number';
          const hasPost = s.postScore && typeof s.postScore.pattern === 'number' && typeof s.postScore.numbers === 'number';
          const pre = (s.preScore?.pattern ?? 0) + (s.preScore?.numbers ?? 0);
          const post = (s.postScore?.pattern ?? 0) + (s.postScore?.numbers ?? 0);
          // Only include if both pre and post exist and pre > 0 and post > 0
          return hasPre && hasPost && pre > 0 && post > 0;
        });
        let avgImprovement = 0;
        let avgPost = 0;
        if (studentsWithBoth.length > 0) {
          const improvements = studentsWithBoth.map(s => {
            const pre = (s.preScore?.pattern ?? 0) + (s.preScore?.numbers ?? 0);
            const post = (s.postScore?.pattern ?? 0) + (s.postScore?.numbers ?? 0);
            return pre > 0 ? ((post - pre) / pre) * 100 : 0;
          });
          avgImprovement = Math.round(improvements.reduce((a, b) => a + b, 0) / improvements.length);
          avgPost = Math.round(studentsWithBoth.map(s => (s.postScore?.pattern ?? 0) + (s.postScore?.numbers ?? 0)).reduce((a, b) => a + b, 0) / studentsWithBoth.length);
        }
        let avgImprovementColor = '#ffe066';
        if (avgImprovement > 0) avgImprovementColor = '#27ae60';
        else if (avgImprovement < 0) avgImprovementColor = '#ff5a5a';
        return (
          <View style={[styles.modalBox, { paddingBottom: 80, alignItems: 'stretch', minHeight: 520 }]}> 
            {/* Title */}
            <View style={{ alignItems: 'center', marginTop: 18, marginBottom: 10 }}>
              <Text style={{ fontSize: 26, fontWeight: 'bold', color: '#27ae60', textAlign: 'center', marginBottom: 6, letterSpacing: 1 }}>Class List</Text>
            </View>
            {/* Class averages row */}
            <View style={{ flexDirection: 'row', justifyContent: 'center', alignItems: 'center', gap: 32, marginBottom: 18, backgroundColor: '#f3f6f8', borderRadius: 16, padding: 14, shadowColor: '#27ae60', shadowOpacity: 0.07, shadowRadius: 6, shadowOffset: { width: 0, height: 2 } }}>
              <View style={{ alignItems: 'center', flex: 1 }}>
                <MaterialIcons name="trending-up" size={22} color={avgImprovementColor} style={{ marginBottom: 2 }} />
                <Text style={{ fontWeight: 'bold', fontSize: 14, color: '#222' }}>Avg. Improvement</Text>
                <Text style={{ fontWeight: 'bold', fontSize: 18, color: avgImprovementColor }}>{avgImprovement > 0 ? '+' : ''}{avgImprovement}%</Text>
              </View>
              <View style={{ width: 1, backgroundColor: '#e0e6ea', height: 38, alignSelf: 'center', marginHorizontal: 8 }} />
              <View style={{ alignItems: 'center', flex: 1 }}>
                <MaterialIcons name="bar-chart" size={22} color="#0097a7" style={{ marginBottom: 2 }} />
                <Text style={{ fontWeight: 'bold', fontSize: 14, color: '#222' }}>Avg. Post-test</Text>
                <Text style={{ fontWeight: 'bold', fontSize: 18, color: '#0097a7' }}>{avgPost}/20</Text>
              </View>
            </View>
            {/* Table header */}
            <View style={{ flexDirection: 'row', alignItems: 'center', backgroundColor: '#e0f7fa', borderRadius: 10, paddingVertical: 8, paddingHorizontal: 10, marginBottom: 6, minWidth: 340 }}>
              <TouchableOpacity style={{ flex: 1, minWidth: 90 }} onPress={() => handleSort('name')}>
                <Text style={{ fontWeight: 'bold', color: '#222', fontSize: 13, textAlign: 'left' }}>Name{sortColumn === 'name' ? (sortAsc ? ' ▲' : ' ▼') : ''}</Text>
              </TouchableOpacity>
              <View style={{ width: 1, backgroundColor: '#e0e6ea', height: 18, marginHorizontal: 4 }} />
              <TouchableOpacity style={{ minWidth: 90, alignItems: 'center' }} onPress={() => handleSort('pre')}>
                <Text style={{ fontWeight: 'bold', color: '#222', fontSize: 13, textAlign: 'center' }}>Pre-test{sortColumn === 'pre' ? (sortAsc ? ' ▲' : ' ▼') : ''}</Text>
              </TouchableOpacity>
              <View style={{ width: 1, backgroundColor: '#e0e6ea', height: 18, marginHorizontal: 4 }} />
              <TouchableOpacity style={{ minWidth: 90, alignItems: 'center' }} onPress={() => handleSort('post')}>
                <Text style={{ fontWeight: 'bold', color: '#222', fontSize: 13, textAlign: 'center' }}>Post-test{sortColumn === 'post' ? (sortAsc ? ' ▲' : ' ▼') : ''}</Text>
              </TouchableOpacity>
              <View style={{ width: 80 }} />
            </View>
            {/* Student list */}
            <ScrollView horizontal style={{ maxWidth: '100%' }} contentContainerStyle={{ minWidth: 340 }}>
              <FlatList
                data={sortedStudents}
                keyExtractor={item => item.id}
                style={{ marginVertical: 10, maxHeight: 340, minWidth: 340 }}
                renderItem={({ item }) => {
                  const preStatus = getStudentTestStatus(item, 'pre');
                  const postStatus = getStudentTestStatus(item, 'post');
                  const bothTaken = preStatus.taken && postStatus.taken;
                  return (
                    <View style={{ flexDirection: 'row', alignItems: 'center', backgroundColor: '#fff', borderRadius: 18, marginBottom: 14, padding: 16, minWidth: 340, gap: 10, elevation: 2, shadowColor: '#27ae60', shadowOpacity: 0.08, shadowRadius: 6, shadowOffset: { width: 0, height: 2 }, justifyContent: 'space-between' }}>
                      <View style={{ flex: 1, minWidth: 90 }}>
                        <TouchableOpacity onPress={() => openModal('studentInfo', { student: item, classId: cls.id })}>
                          <Text style={{ fontWeight: 'bold', fontSize: 15, marginBottom: 2 }}>
                            <Text style={{ color: '#222', fontWeight: 'bold' }}>{item.nickname} </Text>
                            <Text style={{ color: '#0097a7', fontWeight: 'bold' }}>{postStatus.score || 0}/20</Text>
                          </Text>
                          <Text style={{ fontSize: 12, color: '#444' }}>
                            Pattern: {typeof item.postScore?.pattern === 'number' ? item.postScore.pattern : 0}, Numbers: {typeof item.postScore?.numbers === 'number' ? item.postScore.numbers : 0}
                          </Text>
                          <View style={{ backgroundColor: statusColors[postStatus.category ?? ''] || '#888', borderRadius: 8, paddingHorizontal: 8, paddingVertical: 2, marginTop: 2, alignSelf: 'flex-start' }}>
                            <Text style={{ color: '#fff', fontSize: 11, fontWeight: 'bold' }}>{postStatus.category}</Text>
                          </View>
                        </TouchableOpacity>
                      </View>
                      {/* Pre-test button/status or improvement */}
                      {bothTaken ? (
                        (() => {
                          let btnColor = '#ffe066'; // yellow for 0
                          let percent = 0;
                          if (typeof preStatus.score === 'number' && typeof postStatus.score === 'number') {
                            percent = preStatus.score === 0 ? 100 : Math.round(((postStatus.score - preStatus.score) / preStatus.score) * 100);
                            if (percent > 0) btnColor = '#27ae60'; // green
                            else if (percent < 0) btnColor = '#ff5a5a'; // red
                          }
                          return (
                            <TouchableOpacity
                              style={{ backgroundColor: btnColor, borderRadius: 8, paddingVertical: 6, paddingHorizontal: 12, minWidth: 90, alignItems: 'center', marginRight: 4 }}
                              onPress={() => {
                                setImprovementData({
                                  student: item,
                                  pre: typeof preStatus.score === 'number' ? preStatus.score : 0,
                                  post: typeof postStatus.score === 'number' ? postStatus.score : 0,
                                  preStatus: preStatus.category,
                                  postStatus: postStatus.category,
                                });
                                openModal('showImprovement', {
                                  student: item,
                                  pre: preStatus.score || 0,
                                  post: postStatus.score || 0,
                                  preStatus: preStatus.category,
                                  postStatus: postStatus.category,
                                });
                              }}
                            >
                              <Text style={{ color: btnColor === '#ffe066' ? '#222' : '#fff', fontWeight: 'bold', fontSize: 12 }}>{percent > 0 ? '+' : ''}{percent}%</Text>
                            </TouchableOpacity>
                          );
                        })()
                      ) : preStatus.taken ? (
                        <View style={{ alignItems: 'center', marginRight: 4, minWidth: 90 }}>
                          <TouchableOpacity
                            style={{ backgroundColor: '#e0f7fa', borderRadius: 8, paddingVertical: 6, paddingHorizontal: 12, minWidth: 90, alignItems: 'center' }}
                          >
                            <Text style={{ color: '#0097a7', fontWeight: 'bold', fontSize: 12 }}>
                              Pre: {item.preScore ? ((item.preScore.pattern ?? 0) + (item.preScore.numbers ?? 0)).toString() : 'N/A'}/20
                            </Text>
                          </TouchableOpacity>
                          <Text style={{ fontSize: 10, color: statusColors[preStatus.category ?? ''] || '#888', marginTop: 2, fontWeight: '600' }}>{preStatus.category}</Text>
                        </View>
                      ) : (
                        <TouchableOpacity
                          style={{ backgroundColor: '#ff5a5a', borderRadius: 8, paddingVertical: 6, paddingHorizontal: 12, minWidth: 90, alignItems: 'center', marginRight: 4 }}
                          onPress={() => openModal('startTest', { student: item, testType: 'pre', classId: cls.id })}
                        >
                          <Text style={{ color: '#fff', fontWeight: 'bold', fontSize: 12 }}>Pre-test</Text>
                        </TouchableOpacity>
                      )}
                      {/* Post-test button/status or evaluate */}
                      {bothTaken ? (
                        <TouchableOpacity
                          style={{ backgroundColor: '#6c63ff', borderRadius: 8, paddingVertical: 6, paddingHorizontal: 12, minWidth: 90, alignItems: 'center', marginRight: 4 }}
                          onPress={() => {
                            openModal('evaluateStudent', { student: item, classId: cls.id });
                          }}
                        >
                          <Text style={{ color: '#fff', fontWeight: 'bold', fontSize: 12 }}>Evaluate</Text>
                        </TouchableOpacity>
                      ) : postStatus.taken ? (
                        <View style={{ alignItems: 'center', marginRight: 4, minWidth: 90 }}>
                          <TouchableOpacity
                            style={{ backgroundColor: '#e0f7fa', borderRadius: 8, paddingVertical: 6, paddingHorizontal: 12, minWidth: 90, alignItems: 'center' }}
                          >
                            <Text style={{ color: '#0097a7', fontWeight: 'bold', fontSize: 12 }}>
                              Post: {item.postScore ? ((item.postScore.pattern ?? 0) + (item.postScore.numbers ?? 0)).toString() : 'N/A'}/20
                            </Text>
                          </TouchableOpacity>
                          <Text style={{ fontSize: 10, color: statusColors[postStatus.category ?? ''] || '#888', marginTop: 2, fontWeight: '600' }}>{postStatus.category}</Text>
                        </View>
                      ) : (
                        <TouchableOpacity
                          style={{ backgroundColor: '#ffb37b', borderRadius: 8, paddingVertical: 6, paddingHorizontal: 12, minWidth: 90, alignItems: 'center', marginRight: 4 }}
                          onPress={() => openModal('startTest', { student: item, testType: 'post', classId: cls.id })}
                        >
                          <Text style={{ color: '#fff', fontWeight: 'bold', fontSize: 12 }}>Post-test</Text>
                        </TouchableOpacity>
                      )}
                      {/* Edit and Delete buttons remain unchanged, grouped at end */}
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                        <TouchableOpacity style={{ backgroundColor: '#0a7ea4', borderRadius: 8, padding: 6, marginRight: 2 }} onPress={() => {
                          openModal('editStudent', { student: item, classId: cls.id });
                        }}>
                          <MaterialIcons name="edit" size={18} color="#fff" />
                        </TouchableOpacity>
                        <TouchableOpacity style={{ backgroundColor: '#ff5a5a', borderRadius: 8, padding: 6 }} onPress={() => {
                          Alert.alert('Delete Student', `Are you sure you want to delete ${item.nickname}?`, [
                            { text: 'Cancel', style: 'cancel' },
                            { text: 'Delete', style: 'destructive', onPress: () => {
                              deleteStudent(item.id);
                            } },
                          ]);
                        }}>
                          <MaterialIcons name="delete" size={18} color="#fff" />
                        </TouchableOpacity>
                      </View>
                    </View>
                  );
                }}
              />
            </ScrollView>
            {/* Floating Add Student Button (FAB) at bottom right */}
            <TouchableOpacity
              onPress={() => openModal('addStudent', { classId: cls.id })}
              style={{
                position: 'absolute',
                right: 24,
                bottom: 70,
                backgroundColor: '#27ae60',
                borderRadius: 32,
                width: 56,
                height: 56,
                alignItems: 'center',
                justifyContent: 'center',
                elevation: 6,
                shadowColor: '#27ae60',
                shadowOpacity: 0.18,
                shadowRadius: 10,
                shadowOffset: { width: 0, height: 2 },
                zIndex: 20,
              }}
              activeOpacity={0.85}
              onLongPress={() => Alert.alert('Add Student', 'Add a new student to this class.')}
            >
              <MaterialIcons name="person-add" size={32} color="#fff" />
            </TouchableOpacity>
            {/* Fixed Close button at bottom */}
            <View style={{ position: 'absolute', bottom: 10, left: 0, right: 0, alignItems: 'center', zIndex: 10, marginBottom: 8 }}>
              <Pressable style={{ backgroundColor: '#27ae60', borderRadius: 18, minWidth: 160, paddingVertical: 9, alignSelf: 'center', elevation: 2, shadowColor: '#27ae60', shadowOpacity: 0.10, shadowRadius: 6, shadowOffset: { width: 0, height: 2 } }} onPress={closeModal}>
                <Text style={{ color: '#fff', fontWeight: 'bold', fontSize: 14, textAlign: 'center' }}>Close</Text>
              </Pressable>
            </View>
          </View>
        );
      case 'parentList':
        if (!cls) return null;
        // Calculate average pre and post stars for all parents
        const avgPreStars = parentListData.length ? Math.round(parentListData.reduce((sum, p) => sum + (p.preStars || 0), 0) / parentListData.length) : 0;
        const avgPostStars = parentListData.length ? Math.round(parentListData.reduce((sum, p) => sum + (p.postStars || 0), 0) / parentListData.length) : 0;
        // Helper for large stars
        const renderLargeStars = (count: number) => (
          <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 2 }}>
            {Array.from({ length: 5 }, (_, i) => (
              <MaterialIcons key={i} name={i < count ? 'star' : 'star-border'} size={26} color={i < count ? '#FFD600' : '#bbb'} style={{ marginRight: 1 }} />
            ))}
          </View>
        );
        return (
          <View style={styles.modalBox}>
            <Text style={[styles.modalTitle, { marginBottom: 8 }]}>Parents List</Text>
            {/* Average Pre/Post Assessment Stars Row */}
            <View style={{ flexDirection: 'row', justifyContent: 'center', alignItems: 'flex-end', marginBottom: 10, gap: 24 }}>
              <View style={{ alignItems: 'center', flex: 1 }}>
                {renderLargeStars(avgPreStars)}
                <Text style={{ fontWeight: 'bold', fontSize: 16, color: '#222', marginTop: 0 }}>Average</Text>
                <Text style={{ fontSize: 13, color: '#888', marginTop: -2 }}>Pre-Assessment</Text>
              </View>
              <View style={{ alignItems: 'center', flex: 1 }}>
                {renderLargeStars(avgPostStars)}
                <Text style={{ fontWeight: 'bold', fontSize: 16, color: '#222', marginTop: 0 }}>Average</Text>
                <Text style={{ fontSize: 13, color: '#888', marginTop: -2 }}>Post-Assessment</Text>
              </View>
            </View>
            {parentListLoading ? (
              <Text style={{ color: '#27ae60', fontSize: 16, textAlign: 'center', marginVertical: 20 }}>Loading...</Text>
            ) : (
              <>
                {/* Header row */}
                <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 8, minWidth: 340 }}>
                  <Text style={{ flex: 2, fontWeight: 'bold', color: '#222', fontSize: 13 }}>Name</Text>
                  <Text style={{ flex: 2, fontWeight: 'bold', color: '#222', fontSize: 13 }}>Task Progress</Text>
                </View>
                <ScrollView style={{ maxHeight: 400 }}>
                  {parentListData.map((item, idx) => (
                    <TouchableOpacity
                      key={idx}
                      style={{ flexDirection: 'row', alignItems: 'center', backgroundColor: '#fff', borderRadius: 18, marginBottom: 14, padding: 14, minWidth: 340, gap: 10, elevation: 2, shadowColor: '#27ae60', shadowOpacity: 0.08, shadowRadius: 6, shadowOffset: { width: 0, height: 2 } }}
                      activeOpacity={0.85}
                      onPress={() => openParentTasksModal(item)}
                    >
                      <View style={{ flex: 2 }}>
                        <Text style={{ fontWeight: 'bold', fontSize: 15, color: '#222' }}>{item.parentName}</Text>
                        <Text style={{ fontSize: 13, color: '#444' }}>Student: {item.studentName}</Text>
                        <Text style={{ fontSize: 12, color: '#888' }}>SES: {item.householdIncome || '—'}</Text>
                        {/* Pre/Post stars */}
                        <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: 2 }}>
                          <Text style={{ fontSize: 11, color: '#888', marginRight: 2 }}>Pre-Assessment</Text>
                          {[1,2,3,4,5].map(n => (
                            <MaterialIcons key={n} name={n <= item.preStars ? 'star' : 'star-border'} size={15} color={n <= item.preStars ? '#FFD600' : '#bbb'} />
                          ))}
                          <Text style={{ fontSize: 11, color: '#888', marginLeft: 8 }}>Post-Assessment</Text>
                          {[1,2,3,4,5].map(n => (
                            <MaterialIcons key={n} name={n <= item.postStars ? 'star' : 'star-border'} size={15} color={n <= item.postStars ? '#FFD600' : '#bbb'} />
                          ))}
                        </View>
                      </View>
                      {/* Progress bar */}
                      <View style={{ flex: 2, alignItems: 'center' }}>
                        <View style={{ width: 120, height: 28, backgroundColor: '#e6e6e6', borderRadius: 14, justifyContent: 'center', marginBottom: 2 }}>
                          <View style={{ width: `${item.progressPercent}%`, height: 28, backgroundColor: '#27ae60', borderRadius: 14, position: 'absolute', left: 0, top: 0 }} />
                          <Text style={{ color: '#fff', fontWeight: 'bold', fontSize: 15, position: 'absolute', left: 0, right: 0, textAlign: 'center' }}>{item.progressPercent}%</Text>
                        </View>
                      </View>
                    </TouchableOpacity>
                  ))}
                </ScrollView>
              </>
            )}
            <Pressable style={[styles.modalBtn, { alignSelf: 'center', marginTop: 10 }]} onPress={closeModal}><Text style={styles.modalBtnText}>Close</Text></Pressable>
            {/* Parent Tasks Modal */}
            <Modal
              visible={parentTasksModalVisible}
              transparent
              animationType="fade"
              onRequestClose={() => setParentTasksModalVisible(false)}
            >
              <View style={styles.modalOverlay}>
                <View style={styles.modalBox}>
                  <Text style={styles.modalTitle}>Parent Tasks</Text>
                  {selectedParentForTasks && (
                    <>
                      <Text style={{ fontWeight: 'bold', fontSize: 16, color: '#27ae60', marginBottom: 2 }}>{selectedParentForTasks.parentName}</Text>
                      <Text style={{ fontSize: 14, color: '#444', marginBottom: 6 }}>Student: {selectedParentForTasks.studentName}</Text>
                    </>
                  )}
                  {parentTasksLoading ? (
                    <Text style={{ color: '#27ae60', fontSize: 16, textAlign: 'center', marginVertical: 20 }}>Loading tasks...</Text>
                  ) : parentTasks.length === 0 ? (
                    <Text style={{ color: '#888', fontSize: 15, textAlign: 'center', marginVertical: 20 }}>No tasks found for this parent.</Text>
                  ) : (
                    <ScrollView style={{ maxHeight: 320 }}>
                      {parentTasks.map((task, idx) => (
                        <View key={idx} style={{ backgroundColor: '#f9f9f9', borderRadius: 12, padding: 12, marginBottom: 10, elevation: 1 }}>
                          <Text style={{ fontWeight: 'bold', fontSize: 15, color: '#222', marginBottom: 2 }}>{task.title}</Text>
                          {task.details && <Text style={{ fontSize: 13, color: '#444', marginBottom: 2 }}>{task.details}</Text>}
                          {task.objective && <Text style={{ fontSize: 12, color: '#888', marginBottom: 2 }}>Objective: {task.objective}</Text>}
                          <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: 2 }}>
                            <Text style={{ fontSize: 12, color: '#888', marginRight: 6 }}>Status:</Text>
                            <Text style={{ fontSize: 12, color: task.status === 'done' ? '#27ae60' : task.status === 'ongoing' ? '#f1c40f' : '#ff5a5a', fontWeight: 'bold' }}>{task.status === 'done' ? 'Done' : task.status === 'ongoing' ? 'Ongoing' : 'Not Done'}</Text>
                          </View>
                          {(task.preRating || task.postRating) && (
                            <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: 2 }}>
                              {task.preRating && (
                                <>
                                  <Text style={{ fontSize: 12, color: '#888', marginRight: 2 }}>Simula:</Text>
                                  {renderStars(task.preRating)}
                                </>
                              )}
                              {task.postRating && (
                                <>
                                  <Text style={{ fontSize: 12, color: '#888', marginLeft: 12, marginRight: 2 }}>Matapos:</Text>
                                  {renderStars(task.postRating)}
                                </>
                              )}
                            </View>
                          )}
                        </View>
                      ))}
                    </ScrollView>
                  )}
                  <Pressable style={[styles.modalBtn, { alignSelf: 'center', marginTop: 10 }]} onPress={() => setParentTasksModalVisible(false)}><Text style={styles.modalBtnText}>Close</Text></Pressable>
                </View>
              </View>
            </Modal>
          </View>
        );
      case 'startTest':
        return (
          <View style={styles.modalBox}>
            <Text style={styles.modalTitle}>Start {testType === 'pre' ? 'Pre-test' : 'Post-test'}</Text>
            <Text style={styles.modalStat}>
              Student: <Text style={styles.modalStatNum}>{selectedStudent?.nickname}</Text>
                      </Text>
            <Text style={styles.modalStat}>
              Number: <Text style={styles.modalStatNum}>{selectedStudent?.studentNumber}</Text>
            </Text>
            <Text style={styles.modalNote}>
              This will start the {testType === 'pre' ? 'pre-test' : 'post-test'} for {selectedStudent?.nickname}. 
              The student can take this test without their parent present.
            </Text>
            <View style={styles.modalBtnRow}>
              <Pressable style={styles.modalBtn} onPress={closeModal}><Text style={styles.modalBtnText}>Cancel</Text></Pressable>
              <Pressable style={[styles.modalBtn, styles.modalBtnPrimary]} onPress={startTest}><Text style={[styles.modalBtnText, styles.modalBtnTextPrimary]}>Start Test</Text></Pressable>
            </View>
          </View>
        );
      case 'announce':
        // Debug log for canSend state
        console.log('ANNOUNCE DEBUG', { announceTitle, announceText, selectedClassId, teacherId: currentTeacher?.teacherId });
        // If no class is selected, show a dropdown to select class
        const canSend = !!announceTitle.trim() && !!announceText.trim() && !!selectedClassId && !!currentTeacher?.teacherId;
        const handleSendAnnouncement = async () => {
          if (!announceTitle.trim() || !announceText.trim() || !selectedClassId || !currentTeacher?.teacherId) {
            Alert.alert('Error', 'Please enter a title and message.');
            return;
          }
          try {
            const announcementId = `ANN-${Date.now()}`;
            const date = new Date().toISOString();
            const announcement = {
              announcementid: announcementId,
              classid: selectedClassId,
              title: announceTitle.trim(),
              message: announceText.trim(),
              date,
              teacherid: currentTeacher.teacherId,
            };
            await set(ref(db, `Announcements/${announcementId}`), announcement);
            Alert.alert('Success', 'Announcement sent!');
            setAnnounceTitle('');
            closeModal();
          } catch (err) {
            Alert.alert('Error', 'Failed to send announcement.');
          }
        };
        // Remove the auto-select logic from here - it's now in useEffect
        return (
          <View style={styles.modalBox}>
            <Text style={styles.modalTitle}>Send Announcement</Text>
            {!selectedClassId && (
              <View style={{ marginBottom: 12 }}>
                <Text style={{ fontWeight: 'bold', color: '#222', marginBottom: 4 }}>Select Class</Text>
                <View style={{ borderWidth: 1, borderColor: '#e0f7e2', borderRadius: 8, backgroundColor: '#f9f9f9' }}>
                  {classes.map(cls => (
                    <Pressable key={cls.id} style={{ padding: 10 }} onPress={() => setSelectedClassId(cls.id)}>
                      <Text style={{ color: '#27ae60', fontWeight: 'bold' }}>{cls.section} ({cls.school})</Text>
                    </Pressable>
                  ))}
                </View>
              </View>
            )}
            <View style={{ marginBottom: 10 }}>
              <Text style={{ fontWeight: 'bold', color: '#222', marginBottom: 4 }}>Title</Text>
              <TextInput
                style={[styles.modalInput, { marginBottom: 0 }]}
                placeholder="Announcement Title"
                value={announceTitle}
                onChangeText={setAnnounceTitle}
              />
            </View>
            <Text style={{ fontWeight: 'bold', color: '#222', marginBottom: 4 }}>Message</Text>
            <TextInput
              style={[styles.modalInput, { minHeight: 130, textAlignVertical: 'top' }]}
              placeholder="Type your announcement here..."
              value={announceText}
              onChangeText={setAnnounceText}
              multiline
              numberOfLines={4}
            />
            <View style={styles.modalBtnRow}>
              <Pressable style={styles.modalBtn} onPress={closeModal}><Text style={styles.modalBtnText}>Cancel</Text></Pressable>
              <Pressable style={[styles.modalBtn, styles.modalBtnPrimary, { opacity: canSend ? 1 : 0.5 }]} onPress={canSend ? handleSendAnnouncement : undefined} disabled={!canSend}>
                <Text style={[styles.modalBtnText, styles.modalBtnTextPrimary]}>Send</Text>
              </Pressable>
            </View>
          </View>
        );
      case 'editStudent':
        if (!editingStudent) return null;
        // Validation logic
        const editPreTotal = Number(prePattern) + Number(preNumbers);
        const editPostTotal = Number(postPattern) + Number(postNumbers);
        const preOver = editPreTotal > 20;
        const postOver = editPostTotal > 20;
        const handleSaveEditStudent = async () => {
          if (editingStudent && selectedClassId) {
            if (preOver || postOver) {
              Alert.alert('Invalid Score', 'Pre-test and Post-test totals must not exceed 20.');
              return;
            }
            // Build the updated student object first
            const updatedStudent: Student = {
              ...editingStudent,
              nickname: editingStudentName.trim(),
              preScore: { pattern: Number(prePattern), numbers: Number(preNumbers) },
              postScore: { pattern: Number(postPattern), numbers: Number(postNumbers) },
            };
            // Update local state
            setClasses(prev =>
              prev.map(cls =>
                cls.id !== selectedClassId
                  ? cls
                  : {
                      ...cls,
                      students: (cls.students ?? []).map(student =>
                        student.id === editingStudent.id ? updatedStudent : student
                      ),
                    }
              )
            );
            // Update in Firebase DB
            try {
              console.log("Attempting to update student in DB:", updatedStudent);
              await set(ref(db, `Students/${updatedStudent.id}`), updatedStudent);
              console.log("Student updated successfully in DB");
            } catch (err) {
              console.error("Failed to update student in DB:", err);
              Alert.alert("Error", "Failed to update student in the database.");
              return;
            }
            closeModal();
          }
        };
        return (
          <View style={[styles.modalBox, { paddingBottom: 18 }]}> 
            <Text style={[styles.modalTitle, { marginBottom: 8 }]}>Edit Student</Text>
            {/* Section: Student Info */}
            <Text style={{ fontWeight: 'bold', color: '#27ae60', fontSize: 15, marginBottom: 2 }}>Student Information</Text>
            <Text style={{ fontSize: 13, color: '#888', marginBottom: 2 }}>Student Number</Text>
            <View style={{ backgroundColor: '#f3f3f3', borderRadius: 8, padding: 8, marginBottom: 2 }}>
              <Text selectable style={{ color: '#27ae60', fontWeight: 'bold', fontSize: 15 }}>{editingStudent?.studentNumber}</Text>
            </View>
            <Text style={{ fontSize: 11, color: '#aaa', marginBottom: 8 }}>This is the system-generated student number.</Text>
            <Text style={{ fontSize: 13, color: '#888', marginBottom: 2 }}>Student Name</Text>
            <TextInput
              style={[styles.modalInput, { marginBottom: 10 }]}
              placeholder="Enter new student name"
              value={editingStudentName}
              onChangeText={setEditingStudentName}
            />
            {/* Section: Test Scores */}
            <Text style={{ fontWeight: 'bold', color: '#27ae60', fontSize: 15, marginBottom: 2 }}>Test Scores</Text>
            {/* Pre-test */}
            <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 2 }}>
              <Text style={{ fontSize: 14, color: '#222', fontWeight: 'bold', marginRight: 4 }}>📝 Pre-test (out of 20):</Text>
              {preOver && <Text style={{ color: '#ff5a5a', fontSize: 12, marginLeft: 4 }}>*Total exceeds 20!</Text>}
            </View>
            <View style={{ flexDirection: 'row', gap: 8, marginBottom: 2 }}>
              <View style={{ flex: 1 }}>
                <Text style={{ fontSize: 12, color: '#888', marginBottom: 2 }}>Pattern</Text>
                <TextInput
                  style={[styles.modalInput, { backgroundColor: '#f9f9f9' }]}
                  placeholder="Pattern"
                  keyboardType="numeric"
                  value={prePattern}
                  onChangeText={setPrePattern}
                  maxLength={2}
                />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={{ fontSize: 12, color: '#888', marginBottom: 2 }}>Numbers</Text>
                <TextInput
                  style={[styles.modalInput, { backgroundColor: '#f9f9f9' }]}
                  placeholder="Numbers"
                  keyboardType="numeric"
                  value={preNumbers}
                  onChangeText={setPreNumbers}
                  maxLength={2}
                />
              </View>
            </View>
            <Text style={{ fontSize: 11, color: '#aaa', marginBottom: 8, marginTop: 0 }}>Enter the number of correct answers for each part.</Text>
            {/* Post-test */}
            <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 2 }}>
              <Text style={{ fontSize: 14, color: '#222', fontWeight: 'bold', marginRight: 4 }}>✅ Post-test (out of 20):</Text>
              {postOver && <Text style={{ color: '#ff5a5a', fontSize: 12, marginLeft: 4 }}>*Total exceeds 20!</Text>}
            </View>
            <View style={{ flexDirection: 'row', gap: 8, marginBottom: 2 }}>
              <View style={{ flex: 1 }}>
                <Text style={{ fontSize: 12, color: '#888', marginBottom: 2 }}>Pattern</Text>
                <TextInput
                  style={[styles.modalInput, { backgroundColor: '#f9f9f9' }]}
                  placeholder="Pattern"
                  keyboardType="numeric"
                  value={postPattern}
                  onChangeText={setPostPattern}
                  maxLength={2}
                />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={{ fontSize: 12, color: '#888', marginBottom: 2 }}>Numbers</Text>
                <TextInput
                  style={[styles.modalInput, { backgroundColor: '#f9f9f9' }]}
                  placeholder="Numbers"
                  keyboardType="numeric"
                  value={postNumbers}
                  onChangeText={setPostNumbers}
                  maxLength={2}
                />
              </View>
            </View>
            <Text style={{ fontSize: 11, color: '#aaa', marginBottom: 12, marginTop: 0 }}>Enter the number of correct answers for each part.</Text>
            {/* Buttons */}
            <View style={[styles.modalBtnRow, { marginTop: 10 }]}> 
              <Pressable style={styles.modalBtn} onPress={closeModal}><Text style={styles.modalBtnText}>Cancel</Text></Pressable>
              <Pressable style={[styles.modalBtn, styles.modalBtnPrimary, { flexDirection: 'row', alignItems: 'center', gap: 4 }]} onPress={handleSaveEditStudent}>
                <MaterialIcons name="save" size={18} color="#fff" style={{ marginRight: 4 }} />
                <Text style={[styles.modalBtnText, styles.modalBtnTextPrimary]}>Save</Text>
              </Pressable>
            </View>
          </View>
        );
      case 'showImprovement':
        if (!improvementData) return null;
        const { student, pre, post, preStatus, postStatus } = improvementData;
        // Use the actual student object to get pattern/numbers breakdown
        const preScore = student.preScore || { pattern: 0, numbers: 0 };
        const postScore = student.postScore || { pattern: 0, numbers: 0 };
        const preTotal = (preScore.pattern ?? 0) + (preScore.numbers ?? 0);
        const postTotal = (postScore.pattern ?? 0) + (postScore.numbers ?? 0);
        const percent = preTotal === 0 ? 100 : Math.round(((postTotal - preTotal) / preTotal) * 100);
        let percentColor = '#ffe066'; // yellow by default
        if (percent > 0) percentColor = '#27ae60'; // green
        else if (percent < 0) percentColor = '#ff5a5a'; // red
        return (
          <View style={styles.modalBox}>
            <Text style={styles.modalTitle}>Improvement Details</Text>
            <Text style={styles.modalStat}>Student: <Text style={styles.modalStatNum}>{student.nickname}</Text></Text>
            <Text style={styles.modalStat}>Pre-test: <Text style={styles.modalStatNum}>{String(preTotal)}/20</Text> (Pattern: {String(preScore.pattern ?? 0)}, Numbers: {String(preScore.numbers ?? 0)})</Text>
            <Text style={styles.modalStat}>Post-test: <Text style={styles.modalStatNum}>{String(postTotal)}/20</Text> (Pattern: {String(postScore.pattern ?? 0)}, Numbers: {String(postScore.numbers ?? 0)})</Text>
            <Text style={styles.modalStat}>Improvement: <Text style={[styles.modalStatNum, { color: percentColor }]}>{percent > 0 ? '+' : ''}{percent}%</Text></Text>
            <Pressable style={[styles.modalBtn, { alignSelf: 'center', marginTop: 10 }]} onPress={closeModal}><Text style={styles.modalBtnText}>Close</Text></Pressable>
          </View>
        );
      case 'evaluateStudent':
        if (!evaluationData) return null;
        // Get the student object and breakdown
        const evalStudent = evaluationData.student;
        const evalPreScore = evalStudent.preScore || { pattern: 0, numbers: 0 };
        const evalPostScore = evalStudent.postScore || { pattern: 0, numbers: 0 };
        const evalPreTotal = (evalPreScore.pattern ?? 0) + (evalPreScore.numbers ?? 0);
        const evalPostTotal = (evalPostScore.pattern ?? 0) + (evalPostScore.numbers ?? 0);
        const evalPercent = evalPreTotal === 0 ? 100 : Math.round(((evalPostTotal - evalPreTotal) / evalPreTotal) * 100);
        let evalPercentColor = '#ffe066';
        if (evalPercent > 0) evalPercentColor = '#27ae60';
        else if (evalPercent < 0) evalPercentColor = '#ff5a5a';
        // Show only first 3 parent tasks, with option to show more
        const visibleTasks = evaluationShowAllTasks ? evaluationParentTasks : evaluationParentTasks.slice(0, 3);
        return (
          <KeyboardAvoidingView
            behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
            style={{ flex: 1 }}
            keyboardVerticalOffset={Platform.OS === 'ios' ? 80 : 0}
          >
            <ScrollView contentContainerStyle={{ flexGrow: 1, justifyContent: 'center' }} keyboardShouldPersistTaps="handled">
              <View style={[styles.modalBox, { backgroundColor: '#f8f9fa', paddingTop: 18, paddingBottom: 10, alignItems: 'stretch', minHeight: 520, justifyContent: 'flex-start', position: 'relative' }]}> 
                {/* Student Info Card */}
                <View style={{ backgroundColor: '#f3f6f8', borderRadius: 14, padding: 12, marginBottom: 12, borderWidth: 1, borderColor: '#e0e6ea', alignItems: 'flex-start' }}>
                  <Text style={{ fontWeight: '600', color: '#27ae60', fontSize: 15, marginBottom: 2 }}>Student: <Text style={{ color: '#222', fontWeight: 'bold' }}>{evalStudent.nickname}</Text></Text>
                  <Text style={{ fontSize: 13, color: '#444', marginBottom: 2 }}>
                    Pre-test: <Text style={{ color: '#0097a7', fontWeight: 'bold' }}>{evalPreTotal}/20</Text> <Text style={{ color: '#888' }}>(Pattern: <Text style={{ color: '#222', fontWeight: 'bold' }}>{evalPreScore.pattern}</Text>, Numbers: <Text style={{ color: '#222', fontWeight: 'bold' }}>{evalPreScore.numbers}</Text>)</Text>
                  </Text>
                  <Text style={{ fontSize: 13, color: '#444', marginBottom: 2 }}>
                    Post-test: <Text style={{ color: '#0097a7', fontWeight: 'bold' }}>{evalPostTotal}/20</Text> <Text style={{ color: '#888' }}>(Pattern: <Text style={{ color: '#222', fontWeight: 'bold' }}>{evalPostScore.pattern}</Text>, Numbers: <Text style={{ color: '#222', fontWeight: 'bold' }}>{evalPostScore.numbers}</Text>)</Text>
                  </Text>
                  <Text style={{ fontSize: 13, color: '#444', marginBottom: 0 }}>
                    Improvement: <Text style={{ color: evalPercentColor, fontWeight: 'bold' }}>{evalPercent > 0 ? '+' : ''}{evalPercent}%</Text>
                  </Text>
                </View>
                {/* Divider */}
                <View style={{ height: 1, backgroundColor: '#e0e6ea', marginVertical: 8, width: '110%', alignSelf: 'center' }} />
                {/* Parent Tasks Section */}
                <Text style={{ fontWeight: '500', color: '#27ae60', fontSize: 14, marginBottom: 4, marginLeft: 2 }}>Parent Tasks</Text>
                <View style={{ maxHeight: 140, borderWidth: 1, borderColor: '#e0f7e2', borderRadius: 10, overflow: 'hidden', backgroundColor: '#f9f9f9', marginBottom: 8 }}>
                  <ScrollView style={{ maxHeight: 140 }}>
                    <View style={{ flexDirection: 'row', paddingVertical: 6, borderBottomWidth: 1, borderColor: '#e0f7e2', backgroundColor: '#e0f7fa' }}>
                      <ScrollView horizontal showsHorizontalScrollIndicator style={{ flex: 2 }}>
                        <Text style={{ fontWeight: 'bold', color: '#0097a7', fontSize: 11, paddingLeft: 10, minWidth: 80 }}>Title</Text>
                      </ScrollView>
                      <Text style={{ flex: 1, fontWeight: 'bold', color: '#0097a7', fontSize: 13, textAlign: 'center' }}>Pre</Text>
                      <Text style={{ flex: 1, fontWeight: 'bold', color: '#0097a7', fontSize: 13, textAlign: 'center' }}>Post</Text>
                    </View>
                    {visibleTasks.map((task, idx) => (
                      <View key={idx} style={{ flexDirection: 'row', alignItems: 'center', paddingVertical: 7, borderBottomWidth: 1, borderColor: '#f0f0f0', paddingHorizontal: 6 }}>
                        <ScrollView horizontal showsHorizontalScrollIndicator style={{ flex: 2 }}>
                          <Text style={{ color: '#222', fontSize: 11, paddingLeft: 6, minWidth: 80 }} numberOfLines={1} ellipsizeMode="tail">{task.title}</Text>
                        </ScrollView>
                        <Text style={{ flex: 1, color: '#888', fontSize: 14, textAlign: 'center' }}>{typeof task.preRating === 'number' ? task.preRating : '-'}</Text>
                        <Text style={{ flex: 1, color: '#888', fontSize: 14, textAlign: 'center' }}>{typeof task.postRating === 'number' ? task.postRating : '-'}</Text>
                      </View>
                    ))}
                    {evaluationParentTasks.length > 3 && !evaluationShowAllTasks && (
                      <TouchableOpacity onPress={() => setEvaluationShowAllTasks(true)} style={{ padding: 8, alignItems: 'center' }}>
                        <Text style={{ color: '#27ae60', fontWeight: 'bold', fontSize: 13 }}>Show more...</Text>
                      </TouchableOpacity>
                    )}
                  </ScrollView>
                </View>
                {/* Divider */}
                <View style={{ height: 1, backgroundColor: '#e0e6ea', marginVertical: 8, width: '110%', alignSelf: 'center' }} />
                {/* Evaluation Textbox Section */}
                <Text style={{ fontWeight: '500', color: '#27ae60', fontSize: 14, marginBottom: 4, marginLeft: 2 }}>Message to Parent</Text>
                <View style={{ position: 'relative', marginBottom: 18, minHeight: 220, justifyContent: 'flex-start' }}>
                  <TextInput
                    style={[
                      styles.modalInput,
                      {
                        minHeight: 200, // Make textbox bigger
                        maxHeight: 320,
                        textAlignVertical: 'top',
                        paddingRight: 48,
                        fontSize: 16,
                        backgroundColor: '#f3f6f8',
                        borderColor: '#e0e6ea',
                        borderWidth: 1,
                        borderRadius: 12,
                      },
                    ]}
                    placeholder="Type your evaluation here..."
                    value={evaluationText}
                    onChangeText={setEvaluationText}
                    multiline
                    numberOfLines={10}
                  />
                  {/* Ghostwriter button (ghost icon + text, floating) */}
                  <TouchableOpacity
                    style={{
                      position: 'absolute',
                      top: 10,
                      right: 10,
                      backgroundColor: '#fff',
                      borderColor: '#27ae60',
                      borderWidth: 1,
                      borderRadius: 20,
                      padding: 7,
                      zIndex: 10,
                      opacity: 0.97,
                      shadowColor: '#27ae60',
                      shadowOpacity: 0.10,
                      shadowRadius: 6,
                      shadowOffset: { width: 0, height: 2 },
                      flexDirection: 'row',
                      alignItems: 'center',
                      minWidth: 44,
                      minHeight: 36,
                      justifyContent: 'center',
                    }}
                    onPress={async () => {
                      if (evaluationParentTasksLoading || !evaluationData) return;
                      // Prepare prompt data
                      const studentName = evaluationData.student.nickname;
                      const patternScore = evaluationData.student.postScore?.pattern ?? 0;
                      const subtractionScore = evaluationData.student.postScore?.numbers ?? 0;
                      const preTotal = (evaluationData.student.preScore?.pattern ?? 0) + (evaluationData.student.preScore?.numbers ?? 0);
                      const postTotal = (evaluationData.student.postScore?.pattern ?? 0) + (evaluationData.student.postScore?.numbers ?? 0);
                      const percentImprovement = preTotal > 0 ? Math.round(((postTotal - preTotal) / preTotal) * 100) : 0;
                      const taskSummaries = (evaluationParentTasks || []).map(task => ({
                        title: task.title,
                        details: task.details || '',
                        preScore: typeof task.preRating === 'number' ? task.preRating : '-',
                        postScore: typeof task.postRating === 'number' ? task.postRating : '-',
                      }));
                      // Generate prompt
                      const prompt = generateFeedbackPrompt({
                        studentName,
                        patternScore,
                        subtractionScore,
                        percentImprovement,
                        taskSummaries,
                      });
                      setEvaluationText('');
                      setGhostLoading(true);
                      try {
                        const response = await askGpt(prompt);
                        setEvaluationText(response);
                      } catch (err) {
                        setEvaluationText('');
                        Alert.alert('Error', 'Failed to generate evaluation.');
                      }
                      setGhostLoading(false);
                    }}
                    disabled={ghostLoading || evaluationParentTasksLoading}
                  >
                    <MaterialCommunityIcons name="ghost" size={22} color="#27ae60" />
                    {showGhostwriterText && (
                      <Text style={{ color: '#27ae60', fontWeight: 'bold', marginLeft: 6, fontSize: 13 }}>Ghostwriter</Text>
                    )}
                    {ghostLoading && (
                      <ActivityIndicator size="small" color="#27ae60" style={{ marginLeft: 6 }} />
                    )}
                  </TouchableOpacity>
                  {/* Loading overlay, centered and matching modal size */}
                  {ghostLoading && (
                    <View style={{
                      position: 'absolute',
                      left: 0,
                      right: 0,
                      top: 0,
                      bottom: 0,
                      justifyContent: 'center',
                      alignItems: 'center',
                      zIndex: 30,
                      borderRadius: 22,
                      width: '100%',
                      height: '100%',
                      backgroundColor: 'rgba(255,255,255,0.85)',
                      transitionProperty: 'opacity',
                      transitionDuration: '300ms',
                      opacity: ghostLoading ? 1 : 0,
                    }}>
                      <View style={{
                        backgroundColor: 'rgba(255,255,255,0.97)',
                        borderRadius: 22,
                        paddingVertical: 38,
                        paddingHorizontal: 38,
                        minWidth: 270,
                        maxWidth: 340,
                        alignItems: 'center',
                        justifyContent: 'center',
                        shadowColor: '#27ae60',
                        shadowOpacity: 0.13,
                        shadowRadius: 16,
                        shadowOffset: { width: 0, height: 4 },
                      }}>
                        <ActivityIndicator size="large" color="#27ae60" />
                        <Text style={{ color: '#27ae60', fontWeight: '600', fontSize: 18, marginTop: 22, textAlign: 'center', maxWidth: 300, lineHeight: 26 }}>
                          {ghostLoadingStatements[ghostLoadingStatementIdx]}
                        </Text>
                      </View>
                    </View>
                  )}
                </View>
                {/* Action Buttons */}
                <View style={[styles.modalBtnRow, { marginTop: 2 }]}> 
                  <Pressable style={[styles.modalBtn, { backgroundColor: 'transparent', elevation: 0 }]} onPress={closeModal}><Text style={{ color: '#888', fontWeight: 'bold', fontSize: 15 }}>Cancel</Text></Pressable>
                  <Pressable style={[styles.modalBtn, styles.modalBtnPrimary]} onPress={async () => {
                    if (!evaluationText.trim() || !evaluationData?.student?.parentId) {
                      Alert.alert('Error', 'No evaluation message or parent found.');
                      return;
                    }
                    const parentId = evaluationData.student.parentId;
                    // Debug log for parentId
                    console.log('Sending evaluation to parentId:', parentId);
                    // Check if parent exists
                    try {
                      const parentSnap = await get(ref(db, `Parents/${parentId}`));
                      if (!parentSnap.exists()) {
                        Alert.alert('Error', `Parent not found for ID: ${parentId}`);
                        return;
                      }
                      // Use teacherName from state, not redeclare
                      const evaluationPayload = {
                        message: evaluationText.trim(),
                        timestamp: new Date().toISOString(),
                        teacher: teacherName || 'Teacher',
                        student: evaluationData.student.nickname,
                      };
                      await set(ref(db, `Parents/${parentId}/latestEvaluation`), evaluationPayload);
                      Alert.alert('Success', 'Evaluation sent to parent!');
                      setEvaluationText('');
                      closeModal();
                    } catch (err) {
                      Alert.alert('Error', 'Failed to send evaluation.');
                    }
                  }}><Text style={[styles.modalBtnText, styles.modalBtnTextPrimary]}>Send Evaluation</Text></Pressable>
                </View>
              </View>
            </ScrollView>
          </KeyboardAvoidingView>
        );
      case 'studentInfo':
        return (
          <View style={styles.modalBox}>
            <Text style={styles.modalTitle}>Student Information</Text>
            <Text style={styles.modalStat}>Student: <Text style={styles.modalStatNum}>{selectedStudent?.nickname}</Text></Text>
            <Text style={styles.modalStat}>Number: <Text style={styles.modalStatNum}>{selectedStudent?.studentNumber}</Text></Text>
            <Text style={styles.modalStat}>
              Parent Auth Code: 
              <Text style={styles.modalStatNum}>
                <Text
                  selectable
                  style={{ textDecorationLine: 'underline', color: '#27ae60' }}
                  onPress={async () => {
                    if (parentAuthCode) {
                      await Clipboard.setStringAsync(parentAuthCode);
                      setCopiedAuthCode(true);
                      setTimeout(() => setCopiedAuthCode(false), 1200);
                    }
                  }}
                >
                  {parentAuthCode ?? 'Loading...'}
                </Text>
                {copiedAuthCode && (
                  <Text style={{ color: '#27ae60', marginLeft: 8, fontSize: 13 }}>Copied!</Text>
                )}
              </Text>
            </Text>
            <Text style={styles.modalStat}>Pre-test: <Text style={styles.modalStatNum}>{selectedStudent?.preScore ? String((selectedStudent.preScore.pattern ?? 0) + (selectedStudent.preScore.numbers ?? 0)) : 'N/A'}/20</Text> (Pattern: {String(selectedStudent?.preScore?.pattern ?? 0)}, Numbers: {String(selectedStudent?.preScore?.numbers ?? 0)})</Text>
            <Text style={styles.modalStat}>Post-test: <Text style={styles.modalStatNum}>{selectedStudent?.postScore ? String((selectedStudent.postScore.pattern ?? 0) + (selectedStudent.postScore.numbers ?? 0)) : 'N/A'}/20</Text> (Pattern: {String(selectedStudent?.postScore?.pattern ?? 0)}, Numbers: {String(selectedStudent?.postScore?.numbers ?? 0)})</Text>
            {/* AI Profiler Section */}
            <View style={{ marginTop: 16, padding: 12, backgroundColor: '#f3f6f8', borderRadius: 14, borderWidth: 1, borderColor: '#e0e6ea' }}>
              <Text style={{ fontWeight: 'bold', color: '#6c63ff', fontSize: 15, marginBottom: 6 }}>AI Profiler</Text>
              {aiProfileLoading && <Text style={{ color: '#888', fontStyle: 'italic' }}>Generating profile...</Text>}
              {aiProfileError && <Text style={{ color: '#ff5a5a' }}>{aiProfileError}</Text>}
              {aiProfile && <Text style={{ color: '#222', fontSize: 14 }}>{aiProfile}</Text>}
            </View>
            <Pressable style={[styles.modalBtn, { alignSelf: 'center', marginTop: 10 }]} onPress={closeModal}><Text style={styles.modalBtnText}>Close</Text></Pressable>
          </View>
        );
      default:
        return null;
    }
  };

  // Helper to open parent tasks modal and fetch tasks
  const openParentTasksModal = async (parentObj: any) => {
    setSelectedParentForTasks(parentObj);
    setParentTasks([]);
    setParentTasksLoading(true);
    setParentTasksModalVisible(true);
    try {
      const tasksSnap = await get(ref(db, `Parents/${parentObj.parent.parentId}/tasks`));
      let loadedTasks = [];
      if (tasksSnap.exists()) {
        loadedTasks = tasksSnap.val();
        if (!Array.isArray(loadedTasks)) loadedTasks = Object.values(loadedTasks);
      }
      setParentTasks(loadedTasks);
    } catch (err) {
      setParentTasks([]);
    }
    setParentTasksLoading(false);
  };

  // Helper to render stars
  const renderStars = (count: number) => {
    return Array.from({ length: 5 }, (_, i) =>
      <MaterialIcons key={i} name={i < count ? 'star' : 'star-border'} size={15} color={i < count ? '#FFD600' : '#bbb'} style={{ marginRight: 1 }} />
    );
  };

  return (
    <View style={{ flex: 1 }}>
      <ImageBackground source={bgImage} style={styles.bg} imageStyle={{ opacity: 0.13, resizeMode: 'cover' }}>
        {/* Overlay for better blending (non-blocking) */}
        <View style={styles.bgOverlay} />
        <ScrollView contentContainerStyle={styles.scrollContent}>
          <View style={styles.mainContainer}>
            <View style={styles.headerWrap}>
              <View style={styles.headerRow}>
                <View>
                  <Text style={styles.welcome}>Welcome,</Text>
                  <Text style={styles.teacherName}>Teacher {teacherName}</Text>
                </View>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                  <TouchableOpacity style={styles.profileBtn} onPress={() => setShowProfileMenu(!showProfileMenu)}>
                    <MaterialCommunityIcons name="account-circle" size={38} color="#27ae60" />
                  </TouchableOpacity>
                </View>
              </View>
            </View>
            <View style={dashboardCardStyle}>
              {/* Title and Add Class in a single row */}
              <View style={styles.dashboardHeaderRow}>
                <Text style={styles.dashboardTitle}>Classrooms</Text>
                <TouchableOpacity style={styles.addClassBtn} onPress={() => openModal('addClass')}>
                  <Text style={styles.addClassBtnText}>Add Class</Text>
                </TouchableOpacity>
            </View>
              <View style={{ height: 8 }} />
              {classes.map(cls => (
                <React.Fragment key={cls.id}>
                  {renderClassPanel(cls)}
                </React.Fragment>
              ))}
            </View>
          </View>
        </ScrollView>
        {/* Modal for all actions */}
        <Modal
          visible={modalVisible}
          transparent
          animationType="fade"
          onRequestClose={closeModal}
        >
          <View style={styles.modalOverlay}>
            {renderModalContent()}
          </View>
        </Modal>
      </ImageBackground>
      {showProfileMenu && (
        <>
          {/* Overlay to close menu when clicking outside */}
          <TouchableOpacity
            style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, zIndex: 9999 }}
            activeOpacity={1}
            onPress={() => setShowProfileMenu(false)}
          />
          <View style={{
            position: 'absolute',
            top: 56, // adjust as needed to match the icon position
            right: 24, // adjust as needed to match the icon position
            backgroundColor: '#fff',
            borderRadius: 12,
            elevation: 20,
            shadowColor: '#000',
            shadowOpacity: 0.18,
            shadowRadius: 16,
            shadowOffset: { width: 0, height: 4 },
            minWidth: 140,
            zIndex: 10000
          }}>
            <TouchableOpacity
              onPress={async () => {
                setShowProfileMenu(false);
                try {
                  await signOut(auth);
                  window.location.reload();
                } catch (err) {
                  Alert.alert('Error', 'Failed to log out.');
                }
              }}
              style={{ flexDirection: 'row', alignItems: 'center', padding: 16 }}
            >
              <MaterialIcons name="logout" size={22} color="#ff5a5a" style={{ marginRight: 10 }} />
              <Text style={{ color: '#ff5a5a', fontWeight: 'bold', fontSize: 17 }}>Logout</Text>
            </TouchableOpacity>
          </View>
        </>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  bg: {
    flex: 1,
    backgroundColor: '#f7fafc',
    position: 'relative',
  },
  bgOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(255,255,255,0.75)',
    zIndex: 0,
    pointerEvents: 'none',
  },
  scrollContent: {
    alignItems: 'center',
    paddingBottom: 0,
    paddingHorizontal: 0,
    width: '100%',
    minHeight: '100%',
    zIndex: 2,
  },
  mainContainer: {
    width: '100%',
    maxWidth: 600,
    marginTop: 0,
    zIndex: 2,
  },
  dashboardHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 10,
    marginTop: 0,
    width: '100%',
    paddingHorizontal: 8,
  },
  dashboardTitle: {
    fontSize: Dimensions.get('window').width < 400 ? 20 : 26,
    fontWeight: 'bold',
    color: '#222',
    marginLeft: 0,
    letterSpacing: 1,
    textShadowColor: '#e0ffe6',
    textShadowRadius: 6,
  },
  addClassBtn: {
    backgroundColor: '#27ae60',
    borderRadius: 18,
    paddingVertical: 8,
    paddingHorizontal: 18,
    shadowColor: '#27ae60',
    shadowOpacity: 0.18,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 2 },
    marginRight: 0,
  },
  addClassBtnText: {
    color: '#fff',
    fontWeight: 'bold',
    fontSize: 14,
  },
  headerWrap: {
    width: '100%',
    paddingTop: 0,
    paddingBottom: 16,
    backgroundColor: 'rgba(255,255,255,0.96)',
    borderBottomLeftRadius: 28,
    borderBottomRightRadius: 28,
    marginBottom: 18,
    shadowColor: '#27ae60',
    shadowOpacity: 0.10,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 2 },
    borderBottomWidth: 0.5,
    borderColor: '#e6e6e6',
  },
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    width: '100%',
    paddingHorizontal: 24,
    marginTop: 18,
    marginBottom: 0,
  },
  welcome: {
    fontSize: 23,
    fontWeight: '600',
    color: '#222',
    letterSpacing: 0.5,
  },
  teacherName: {
    fontSize: 22,
    fontWeight: '800',
    color: '#27ae60',
    marginTop: 2,
    letterSpacing: 0.5,
  },
  profileBtn: {
    backgroundColor: 'rgba(255,255,255,0.7)',
    borderRadius: 24,
    padding: 8,
    elevation: 6,
    shadowColor: '#27ae60',
    shadowOpacity: 0.12,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 2 },
  },
  classCard: {
    width: '92%',
    backgroundColor: 'rgba(243,243,243,0.92)',
    borderRadius: 22,
    padding: 22,
    marginBottom: 18,
    elevation: 3,
    shadowColor: '#27ae60',
    shadowOpacity: 0.10,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 2 },
  },
  classCardTitle: {
    fontSize: 19,
    fontWeight: '700',
    color: '#222',
    marginBottom: 8,
  },
  addBtn: {
    backgroundColor: '#27ae60',
    borderRadius: 18,
    padding: 6,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#27ae60',
    shadowOpacity: 0.18,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 2 },
  },
  classInfoRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 8,
  },
  classSchool: {
    fontSize: 15,
    color: '#888',
    fontWeight: '600',
  },
  classSection: {
    fontSize: 23,
    color: '#27ae60',
    fontWeight: 'bold',
    marginTop: 2,
  },
  classTotal: {
    fontSize: 15,
    color: '#222',
    fontWeight: '600',
    marginBottom: 4,
  },
  addStudentBtn: {
    backgroundColor: '#27ae60',
    borderRadius: 14,
    paddingVertical: 5,
    paddingHorizontal: 14,
    marginTop: 2,
    shadowColor: '#27ae60',
    shadowOpacity: 0.10,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 2 },
  },
  addStudentBtnText: {
    color: '#fff',
    fontWeight: 'bold',
    fontSize: 14,
    letterSpacing: 0.2,
  },
  performanceCard: {
    width: '92%',
    backgroundColor: '#e5e5e5', // light gray to match the image
    borderRadius: 22,
    padding: 22,
    marginBottom: 18,
    elevation: 3,
    shadowColor: '#27ae60',
    shadowOpacity: 0.10,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 2 },
  },
  performanceTitle: {
    fontSize: 21,
    fontWeight: '800',
    color: '#222',
  },
  announceBtn: {
    backgroundColor: '#27ae60',
    borderRadius: 18,
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 6,
    paddingHorizontal: 16,
    marginLeft: 8,
    shadowColor: '#27ae60',
    shadowOpacity: 0.15,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 2 },
  },
  announceBtnText: {
    color: '#fff',
    fontWeight: 'bold',
    fontSize: 16,
    marginLeft: 8,
    letterSpacing: 0.2,
  },
  performanceLabel: {
    fontSize: 16,
    color: '#222',
    fontWeight: '600',
    marginTop: 12,
    marginBottom: 10,
  },
  tasksBox: {
    width: '92%',
    backgroundColor: 'rgba(255,255,255,0.90)',
    borderRadius: 22,
    paddingVertical: 18,
    paddingHorizontal: 18,
    marginTop: 18,
    marginBottom: 22,
    elevation: 4,
    shadowColor: '#27ae60',
    shadowOpacity: 0.10,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 2 },
  },
  tasksTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
    width: '100%',
    paddingRight: 0,
    paddingLeft: 0,
  },
  tasksTitle: {
    fontSize: 21,
    fontWeight: '800',
    color: '#222',
    marginLeft: 4,
    marginBottom: 4,
    letterSpacing: 0.2,
  },
  generalProgressWrap: {
    height: 10,
    flex: 1,
    backgroundColor: '#e6e6e6',
    borderRadius: 5,
    marginLeft: 12,
    marginRight: 8,
    justifyContent: 'center',
    alignItems: 'flex-start',
    flexShrink: 1,
  },
  generalProgressBar: {
    height: 10,
    borderRadius: 5,
    backgroundColor: '#27ae60',
  },
  generalProgressText: {
    fontSize: 14,
    color: '#888',
    minWidth: 40,
    textAlign: 'right',
    marginLeft: 0,
    fontWeight: '600',
  },
  taskRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 16,
    backgroundColor: 'rgba(247,250,253,0.92)',
    borderRadius: 14,
    paddingVertical: 12,
    paddingHorizontal: 14,
    elevation: 2,
    shadowColor: '#27ae60',
    shadowOpacity: 0.08,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 2 },
  },
  taskTitleSmall: {
    fontWeight: '700',
    color: '#222',
    fontSize: 15,
    flexShrink: 1,
    marginRight: 8,
  },
  taskDetails: {
    fontSize: 13,
    color: '#888',
    marginTop: 4,
    lineHeight: 18,
    marginBottom: 2,
    fontWeight: '500',
  },
  taskArrowBtn: {
    backgroundColor: '#e6ffe6',
    borderRadius: 18,
    padding: 8,
    alignItems: 'center',
    justifyContent: 'center',
    marginLeft: 10,
    shadowColor: '#27ae60',
    shadowOpacity: 0.10,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 2 },
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.18)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  modalBox: {
    width: Dimensions.get('window').width < 400 ? '98%' : '96%',
    maxWidth: 500,
    marginHorizontal: '1%',
    backgroundColor: 'rgba(255,255,255,0.98)',
    borderRadius: 22,
    padding: Dimensions.get('window').width < 400 ? 12 : 24,
    shadowColor: '#27ae60',
    shadowOpacity: 0.13,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 4 },
    alignItems: 'stretch',
    alignSelf: 'center',
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: '800',
    color: '#27ae60',
    marginBottom: 16,
    textAlign: 'center',
  },
  modalInput: {
    backgroundColor: '#f3f3f3',
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 10,
    fontSize: 15,
    marginBottom: 14,
    color: '#222',
  },
  modalBtnRow: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: 12,
    marginTop: 6,
  },
  modalBtn: {
    backgroundColor: '#e6e6e6',
    borderRadius: 12,
    paddingVertical: 8,
    paddingHorizontal: 22,
    marginLeft: 8,
  },
  modalBtnPrimary: {
    backgroundColor: '#27ae60',
  },
  modalBtnText: {
    color: '#444',
    fontWeight: 'bold',
    fontSize: 15,
  },
  modalBtnTextPrimary: {
    color: '#fff',
  },
  modalListItem: {
    fontSize: 15,
    color: '#222',
    paddingVertical: 6,
    borderBottomWidth: 1,
    borderColor: '#f0f0f0',
  },
  modalStat: {
    fontSize: 16,
    color: '#444',
    marginBottom: 4,
    fontWeight: '600',
  },
  modalStatNum: {
    color: '#27ae60',
    fontWeight: 'bold',
  },
  modalNote: {
    fontSize: 12,
    color: '#888',
    marginBottom: 10,
    marginTop: -6,
    textAlign: 'left',
  },
  classListIconBtn: {
    marginLeft: 8,
    padding: 4,
    borderRadius: 16,
    backgroundColor: 'rgba(39,174,96,0.08)',
  },

  compactCardRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#fff',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#e0f7e2',
    paddingVertical: 10,
    paddingHorizontal: 16,
    marginTop: 12,
    marginBottom: 2,
    width: '99%',
    maxWidth: 370,
    alignSelf: 'center',
    shadowColor: 'transparent',
  },
  compactCardCol: {
    flex: 1,
    alignItems: 'flex-start',
    justifyContent: 'center',
    minWidth: 80,
  },
  compactCardLabel: {
    fontWeight: '600',
    color: '#222',
    fontSize: 13,
    marginRight: 2,
  },
  compactCardValue: {
    fontWeight: 'bold',
    fontSize: 22,
    marginTop: 0,
    letterSpacing: 0.2,
  },
  compactCardDivider: {
    width: 1,
    height: 38,
    backgroundColor: '#e0f7e2',
    marginHorizontal: 12,
    borderRadius: 1,
  },
  // New styles for the compact dashboard mock
  donutWrap: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  donutCenterText: {
    position: 'absolute',
    fontWeight: 'bold',
    color: '#222',
    fontSize: 14,
  },
  quarterCard: {
    backgroundColor: '#fff',
    borderRadius: 18,
    borderWidth: 1,
    borderColor: '#e6e6e6',
    padding: 12,
  },
  quarterHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  quarterTitle: {
    fontWeight: '800',
    color: '#222',
    fontSize: 18,
  },
  quarterBodyRow: {
    flexDirection: 'column',
    alignItems: 'stretch',
    justifyContent: 'flex-start',
    gap: 10,
  },
  ringsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    alignSelf: 'center',
    paddingHorizontal: 0,
    marginBottom: 12,
  },
  ringCol: {
    width: 118,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 4,
    marginHorizontal: 14,
  },
  ringLabel: {
    marginTop: 6,
    fontSize: 12,
    fontWeight: '700',
    color: '#222',
    textAlign: 'center',
  },
  ringSubLabel: {
    fontSize: 12,
    color: '#888',
    fontWeight: '600',
    textAlign: 'center',
  },
  weeksCol: {
    flex: 1,
    paddingHorizontal: 6,
  },
  weekRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
  },
  weekLabel: {
    width: 64,
    fontSize: 13,
    color: '#222',
    fontWeight: '700',
  },
  weekBarBg: {
    flex: 1,
    height: 10,
    backgroundColor: '#e6e6e6',
    borderRadius: 6,
    overflow: 'hidden',
  },
  weekBarFill: {
    height: 10,
    backgroundColor: '#27ae60',
    borderRadius: 6,
  },
  quarterSelectBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    width: '100%',
  },
  quarterDropdownMenu: {
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: '#e6e6e6',
    borderRadius: 12,
    marginBottom: 8,
    overflow: 'hidden',
  },
  quarterDropdownItem: {
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#f0f0f0',
  },
  quarterDropdownText: {
    fontSize: 14,
    color: '#222',
    fontWeight: '600',
  },
  quarterDropdownTextActive: {
    color: '#27ae60',
  },
  listCard: {
    backgroundColor: '#fff',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#e6e6e6',
    paddingVertical: 10,
    paddingHorizontal: 12,
  },
  listTitle: {
    fontWeight: '800',
    color: '#27ae60',
    fontSize: 14,
    marginBottom: 8,
  },
  listItem: {
    fontSize: 13,
    color: '#222',
    marginBottom: 6,
    fontWeight: '600',
  },
  rankRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 8,
    paddingHorizontal: 8,
    backgroundColor: '#fafafa',
    borderRadius: 10,
    marginBottom: 6,
  },
  rankBadge: {
    width: 26,
    height: 26,
    borderRadius: 13,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 10,
  },
  rankBadgeTop: {
    backgroundColor: 'rgba(39,174,96,0.12)',
  },
  rankBadgeWatch: {
    backgroundColor: 'rgba(255,90,90,0.12)',
  },
  rankBadgeText: {
    fontWeight: '800',
    color: '#222',
  },
  rankName: {
    flex: 1,
    fontSize: 14,
    color: '#222',
    fontWeight: '600',
  },
  rankScore: {
    fontSize: 13,
    fontWeight: '800',
  },
  rankScoreTop: {
    color: '#27ae60',
  },
  rankScoreWatch: {
    color: '#ff5a5a',
  },
  modalLabel: {
    fontSize: 15,
    color: '#27ae60',
    fontWeight: '600',
    marginBottom: 4,
    marginLeft: 2,
  },
}); 