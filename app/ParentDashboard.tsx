import { MaterialIcons } from '@expo/vector-icons';
import { BlurView } from 'expo-blur';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { get, onValue, ref, set } from 'firebase/database';
import React, { useEffect, useState } from 'react';
import { ActivityIndicator, Alert, Animated, Dimensions, ImageBackground, Modal, Pressable, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { db } from '../constants/firebaseConfig';
const bgImage = require('../assets/images/bg.jpg');

const { width } = Dimensions.get('window');



// Helper to get status from score (copied from TeacherDashboard)
function getStatusFromScore(score: number, total: number, pattern: number, numbers: number) {
  if ((pattern ?? 0) === 0 && (numbers ?? 0) === 0) return 'Not yet taken';
  if (typeof score !== 'number' || typeof total !== 'number' || total === 0 || score === -1) return 'Not yet taken';
  const percent = (score / total) * 100;
  if (percent < 25) return 'Intervention';
  if (percent < 50) return 'For Consolidation';
  if (percent < 75) return 'For Enhancement';
  if (percent < 85) return 'Proficient';
  return 'Highly Proficient';
}

// --- Add fetchWithRetry helper ---
async function fetchWithRetry(url: string, options: any, retries = 3, delay = 1500): Promise<Response> {
  for (let i = 0; i < retries; i++) {
    try {
      const response = await fetch(url, options);
      if (!response.ok) throw new Error('API error');
      return response;
    } catch (err) {
      if (i === retries - 1) throw err;
      await new Promise(res => setTimeout(res, delay));
    }
  }
  throw new Error('Failed after retries');
}
const statusColors: any = {
  'Intervention': '#ff5a5a',
  'For Consolidation': '#ffb37b',
  'For Enhancement': '#ffe066',
  'Proficient': '#7ed957',
  'Highly Proficient': '#27ae60',
  'Not yet taken': '#888',
};

const incomeBrackets = [
  '₱10,000 and below',
  '₱10,001–15,000',
  '₱15,001–20,000',
  '₱20,001–25,000',
  '₱25,001 and above',
];

// Task recommendation logic based on scores and income
const generateTaskRecommendations = (patternScore: number, numbersScore: number, incomeBracket: string) => {
  const totalScore = patternScore + numbersScore;
  const averageScore = totalScore / 2;
  
  // Map income bracket to numeric value for calculations
  const incomeMap: { [key: string]: number } = {
    '₱10,000 and below': 1,
    '₱10,001–15,000': 2,
    '₱15,001–20,000': 3,
    '₱20,001–25,000': 4,
    '₱25,001 and above': 5,
  };
  
  const incomeLevel = incomeMap[incomeBracket] || 1;
  
  const tasks = [];
  
  // Pattern-focused tasks
  if (patternScore < 5) {
    tasks.push({
      title: 'Basic Pattern Recognition',
      status: 'notdone',
      details: 'Practice identifying simple patterns in sequences. Start with basic shapes and colors.',
      priority: 'high',
      category: 'pattern'
    });
  } else if (patternScore < 8) {
    tasks.push({
      title: 'Intermediate Pattern Practice',
      status: 'notdone',
      details: 'Work on more complex patterns and sequences. Include number patterns.',
      priority: 'medium',
      category: 'pattern'
    });
  } else {
    tasks.push({
      title: 'Advanced Pattern Challenges',
      status: 'notdone',
      details: 'Tackle complex pattern recognition and prediction exercises.',
      priority: 'low',
      category: 'pattern'
    });
  }
  
  // Numbers-focused tasks
  if (numbersScore < 5) {
    tasks.push({
      title: 'Basic Number Operations',
      status: 'notdone',
      details: 'Practice basic addition and subtraction with visual aids.',
      priority: 'high',
      category: 'numbers'
    });
  } else if (numbersScore < 8) {
    tasks.push({
      title: 'Intermediate Number Work',
      status: 'notdone',
      details: 'Practice mental math and quick calculations.',
      priority: 'medium',
      category: 'numbers'
    });
  } else {
    tasks.push({
      title: 'Advanced Number Challenges',
      status: 'notdone',
      details: 'Complex problem-solving with numbers and word problems.',
      priority: 'low',
      category: 'numbers'
    });
  }
  
  // Income-based tasks (more resources for higher income)
  if (incomeLevel >= 4) {
    tasks.push({
      title: 'Technology-Enhanced Learning',
      status: 'notdone',
      details: 'Use educational apps and online resources for interactive learning.',
      priority: 'medium',
      category: 'technology'
    });
  } else {
    tasks.push({
      title: 'Low-Cost Learning Activities',
      status: 'notdone',
      details: 'Use household items and free resources for hands-on learning.',
      priority: 'high',
      category: 'practical'
    });
  }
  
  // Mixed practice for balanced improvement
  if (Math.abs(patternScore - numbersScore) > 3) {
    tasks.push({
      title: 'Balanced Skill Development',
      status: 'notdone',
      details: 'Focus on the weaker area while maintaining strength in the stronger area.',
      priority: 'high',
      category: 'mixed'
    });
  }
  
  // Remedial work for very low scores
  if (totalScore < 8) {
    tasks.push({
      title: 'Foundation Building',
      status: 'notdone',
      details: 'Build basic mathematical concepts and confidence through simple activities.',
      priority: 'high',
      category: 'remedial'
    });
  }
  
  // Sort by priority (high first)
  const priorityOrder = { high: 3, medium: 2, low: 1 };
  tasks.sort((a, b) => priorityOrder[b.priority as keyof typeof priorityOrder] - priorityOrder[a.priority as keyof typeof priorityOrder]);
  
  return tasks;
};

// Add GPT API function after the fetchWithRetry helper
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

const generateRevisedTaskPrompt = ({
  taskTitle,
  taskDetails,
  taskObjective,
  reasonForChange
}: {
  taskTitle: string;
  taskDetails: string;
  taskObjective: string;
  reasonForChange: string;
}) => {
  return `Ikaw ay isang guro na nagbibigay ng home-based learning task para sa isang batang nasa Grade 1. Narito ang orihinal na task na ibinigay:

• Pamagat: ${taskTitle}  
• Detalye: ${taskDetails}  
• Layunin: ${taskObjective}  

Gayunpaman, nais ng magulang na baguhin ang task na ito dahil: "${reasonForChange}"

Mangyaring magmungkahi ng alternatibong gawain na katulad pa rin sa layunin at konsepto ng orihinal na task, ngunit naka-adjust base sa ibinigay na dahilan.  

Sagutin sa ganitong format:
Pamagat: [bagong pamagat]
Detalye: [bagong detalye ng gawain]
Layunin: [bagong layunin]

Gamitin ang wika ng isang gurong malinaw at gabay ang tono. huwag mag bold o kahit anong design sa text. hindi na kailangang bumati`;
};

export default function ParentDashboard() {
  const router = useRouter();
  const { parentId, needsSetup } = useLocalSearchParams();
  const [parentData, setParentData] = useState<any>(null);
  const [showSetupModal, setShowSetupModal] = useState(false);
  const [setupName, setSetupName] = useState('');
  const [setupContact, setSetupContact] = useState('');
  const [setupLoading, setSetupLoading] = useState(false);
  const [announcements, setAnnouncements] = useState<any[]>([]);
  const [modalVisible, setModalVisible] = useState(false);
  const [focusedAnnouncement, setFocusedAnnouncement] = useState<any | null>(null);
  const [changeModalVisible, setChangeModalVisible] = useState(false);
  const [changeTaskIdx, setChangeTaskIdx] = useState<number | null>(null);
  const [changeReason, setChangeReason] = useState<string>('');
  const [changeReasonOther, setChangeReasonOther] = useState<string>('');
  const [teachers, setTeachers] = useState<any>({});
  const [teachersById, setTeachersById] = useState<any>({});
  const [studentData, setStudentData] = useState<any>(null);
  const [setupIncome, setSetupIncome] = useState('');
  const [incomeDropdownVisible, setIncomeDropdownVisible] = useState(false);
  const [tasks, setTasks] = useState<any[]>([]);
  const [ratingModalVisible, setRatingModalVisible] = useState(false);
  const [ratingType, setRatingType] = useState<'pre' | 'post' | null>(null);
  const [ratingTaskIdx, setRatingTaskIdx] = useState<number | null>(null);
  const [selectedRating, setSelectedRating] = useState<number>(0);
  const [pretestNotDone, setPretestNotDone] = useState(false);
  const [tasksLoading, setTasksLoading] = useState(false);
  // Add state for evaluation modal
  const [showEvaluationModal, setShowEvaluationModal] = useState(false);
  const [lastSeenEvaluationTimestamp, setLastSeenEvaluationTimestamp] = useState<string | null>(null);
  // Add state for GPT task change
  const [gptLoading, setGptLoading] = useState(false);
  const [revisedTask, setRevisedTask] = useState<any>(null);
  // Quarter/Weeks UI state
  const [selectedQuarter, setSelectedQuarter] = useState<number>(1);
  const [quarterDropdownVisible, setQuarterDropdownVisible] = useState(false);

  React.useEffect(() => {
    if (!parentId) return;
    const fetchParentAndAnnouncements = async () => {
      const parentRef = ref(db, `Parents/${parentId}`);
      const snap = await get(parentRef);
      if (snap.exists()) {
        const data = snap.val();
        setParentData(data);
        if (!data.name || !data.contact || needsSetup === '1') {
          setShowSetupModal(true);
          setSetupName(data.name || '');
          setSetupContact(data.contact || '');
          setSetupIncome(data.householdIncome || incomeBrackets[0]);
        }
        // Use studentId to get classid
        if (data.studentId) {
          const studentRef = ref(db, `Students/${data.studentId}`);
          const studentSnap = await get(studentRef);
          if (studentSnap.exists()) {
            const studentData = studentSnap.val();
            const classid = studentData.classId;
            if (classid) {
              const annRef = ref(db, 'Announcements');
              onValue(annRef, (snapshot) => {
                const all = snapshot.val() || {};
                const filtered = Object.values(all).filter((a: any) => a.classid === classid);
                filtered.sort((a: any, b: any) => (b.date || '').localeCompare(a.date || ''));
                setAnnouncements(filtered);
              });
            }
          }
        }
      }
    };
    fetchParentAndAnnouncements();
  }, [parentId, needsSetup]);

  // Fetch teachers on mount
  useEffect(() => {
    const teachersRef = ref(db, 'Teachers');
    get(teachersRef).then(snap => {
      if (snap.exists()) {
        const all = snap.val();
        setTeachers(all);
        // Build a mapping from teacherId to teacher object
        const byId: any = {};
        Object.values(all).forEach((t: any) => {
          if (t.teacherId) byId[t.teacherId] = t;
        });
        setTeachersById(byId);
      }
    });
  }, []);

  // Fetch student data when parentData.studentId is available
  useEffect(() => {
    if (parentData?.studentId && parentData?.parentId) {
      const fetchStudentAndTasks = async () => {
        const snap = await get(ref(db, `Students/${parentData.studentId}`));
        if (snap.exists()) {
          const student = snap.val();
          setStudentData(student);

          const patternScore = student?.preScore?.pattern ?? 0;
          const numbersScore = student?.preScore?.numbers ?? 0;
          const incomeBracket = parentData?.householdIncome || incomeBrackets[0];

          // Map income bracket string to number for API
          const incomeMap: { [key: string]: number } = {
            '₱10,000 and below': 1,
            '₱10,001–15,000': 2,
            '₱15,001–20,000': 3,
            '₱20,001–25,000': 4,
            '₱25,001 and above': 5,
          };
          const incomeBracketValue = incomeMap[incomeBracket] || 1;

          if (patternScore === 0 && numbersScore === 0) {
            setPretestNotDone(true);
            setTasks([]);
            return;
          } else {
            setPretestNotDone(false);
          }

          // Check if tasks exist in DB under the parent
          const parentTasksRef = ref(db, `Parents/${parentData.parentId}/tasks`);
          const tasksSnap = await get(parentTasksRef);
          if (tasksSnap.exists()) {
            let loadedTasks = tasksSnap.val();
            // If loadedTasks is an object (from Firebase), convert to array
            if (!Array.isArray(loadedTasks)) {
              loadedTasks = Object.values(loadedTasks);
            }
            // Map fields for UI
            loadedTasks = loadedTasks.map((t: any, idx: number) => ({
              title: t.title || t.task_title || '',
              details: t.details || t.task_details || '',
              objective: t.objective || t.task_objective || '',
              preRating: t.preRating ?? null,
              postRating: t.postRating ?? null,
              status: t.status ||
                (t.preRating == null ? 'notdone' : (t.postRating == null ? 'ongoing' : 'done')),
              assessmentScore: t.assessmentScore || { Preassessment: null, Postassessment: null },
              // Graceful defaults for new structure
              week: typeof t.week === 'number' ? t.week : ((idx % 8) + 1),
              quarter: typeof t.quarter === 'number' ? t.quarter : 1,
            }));
            setTasks(loadedTasks);
          } else {
            // No tasks, generate via API
            setTasksLoading(true);
            try {
              const response = await fetchWithRetry('https://mathtatag-api.onrender.com/predict', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                  pattern_score: patternScore,
                  subtraction_score: numbersScore,
                  income_bracket: incomeBracketValue
                }),
              }, 3, 1500); // 3 retries, 1.5s delay between

              const rawText = await response.text();
              let result: any = null;
              try {
                result = JSON.parse(rawText);
              } catch (jsonErr) {
                console.error('API did not return JSON:', rawText);
                throw new Error('API did not return valid JSON. Response: ' + rawText);
              }

              if (!response.ok) {
                console.error('API error response:', result);
                throw new Error(result?.error || 'Unknown error');
              }

              console.log('API result:', result);
              let tasksToSave = Array.isArray(result.tasks) ? result.tasks : Array.isArray(result) ? result : [];
              tasksToSave = tasksToSave.map((t: any, idx: number) => ({
                title: t.task_title || t.title || '',
                details: t.task_details || t.details || '',
                objective: t.task_objective || t.objective || '',
                preRating: null,
                postRating: null,
                status: 'notdone',
                assessmentScore: {
                  Preassessment: null,
                  Postassessment: null,
                },
                week: typeof t.week === 'number' ? t.week : ((idx % 8) + 1),
                quarter: typeof t.quarter === 'number' ? t.quarter : 1,
              }));
              await set(parentTasksRef, tasksToSave);
              setTasks(tasksToSave);
            } catch (err: any) {
              console.error('Failed to assign tasks:', err);
              Alert.alert('Error', err.message || 'Failed to assign tasks. Please try again.');
              setTasks([]);
            }
            setTasksLoading(false);
          }
        }
      };
      fetchStudentAndTasks();
    }
  }, [parentData?.studentId, parentData?.householdIncome, parentData?.parentId]);

  // Show evaluation modal if a new evaluation is present
  useEffect(() => {
    if (parentData?.latestEvaluation && parentData.latestEvaluation.timestamp) {
      if (parentData.latestEvaluation.timestamp !== lastSeenEvaluationTimestamp) {
        setShowEvaluationModal(true);
        setLastSeenEvaluationTimestamp(parentData.latestEvaluation.timestamp);
      }
    }
  }, [parentData?.latestEvaluation]);

  const handleSetupSubmit = async () => {
    if (!setupName.trim() || !setupContact.trim()) {
      Alert.alert('Please enter your name and contact number.');
      return;
    }
    setSetupLoading(true);
    try {
      const parentRef = ref(db, `Parents/${parentId}`);
      await set(parentRef, {
        ...parentData,
        name: setupName.trim(),
        contact: setupContact.trim(),
        householdIncome: setupIncome,
      });
      setParentData((prev: any) => ({ ...prev, name: setupName.trim(), contact: setupContact.trim(), householdIncome: setupIncome }));
      setShowSetupModal(false);
      Alert.alert('Profile updated!');
    } catch (err) {
      Alert.alert('Failed to update profile.');
    }
    setSetupLoading(false);
  };

  // Placeholder data
  const parentLRN = 'PARENT108756090030';
  const teacher = {
    name: 'Mrs. Loteriña',
    grade: 'Grade 1 Teacher',
    avatar: 'https://randomuser.me/api/portraits/women/44.jpg',
    announcement: 'Lorem ipsum dolor sit amet, consectetur adipiscing elit. Nam fermentum vestibulum lectus, eget eleifend tellus dignissim non. Praesent ultrices faucibus condimentum.'
  };
  const pretest = { percent: 35, score: 3, total: 10 };
  const posttest = { percent: 0, score: 0, total: 10 };

  // Calculate overall progress
  const doneCount = tasks.filter(t => t.status === 'done').length;
  const progressPercent = tasks.length > 0 ? Math.round((doneCount / tasks.length) * 100) : 0;

  // Task status label
  const statusLabel = (status: string) => {
    if (status === 'done') return 'Done';
    if (status === 'ongoing') return 'Ongoing';
    return 'Not Done';
  };

  // Star rating component
  const StarRating = ({ rating, onSelect }: { rating: number, onSelect: (n: number) => void }) => (
    <View style={{ flexDirection: 'row', justifyContent: 'center', marginVertical: 8 }}>
      {[1, 2, 3, 4, 5].map((n) => (
        <TouchableOpacity key={n} onPress={() => onSelect(n)}>
          <MaterialIcons
            name={n <= rating ? 'star' : 'star-border'}
            size={32}
            color={n <= rating ? '#FFD600' : '#bbb'}
            style={{ marginHorizontal: 2 }}
          />
        </TouchableOpacity>
      ))}
    </View>
  );

  // Handle task click
  const handleTaskPress = (idx: number) => {
    const task = tasks[idx];
    if (task.status === 'done') return;
    if (task.status === 'notdone') {
      // Show pre-rating modal
      setRatingType('pre');
      setRatingTaskIdx(idx);
      setSelectedRating(task.preRating || 0);
      setRatingModalVisible(true);
    } else if (task.status === 'ongoing') {
      // Show post-rating modal
      setRatingType('post');
      setRatingTaskIdx(idx);
      setSelectedRating(task.postRating || 0);
      setRatingModalVisible(true);
    }
  };

  // Handle post-test click
  const handlePostTest = () => {
    if (doneCount !== tasks.length) {
      Alert.alert('Cannot Start Post-Test', 'You must finish all tasks before starting the post-test.');
      return;
    }
    // Proceed to post-test
  };

  // Add a placeholder user profile image
  const userProfile = {
    name: 'Parent User',
    avatar: 'https://randomuser.me/api/portraits/men/99.jpg',
  };

  // Handler for announcement click
  const handleAnnouncementPress = (announcement: any) => {
    setFocusedAnnouncement(announcement);
    setModalVisible(true);
  };

  // Handle change button click
  const handleChangePress = (idx: number) => {
    Alert.alert(
      'Request Change',
      `Are you sure you want to request a change for "${tasks[idx].title}"?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Yes',
          onPress: () => {
            setChangeTaskIdx(idx);
            setChangeModalVisible(true);
          },
        },
      ]
    );
  };

  // Handle submit reason - Updated to use GPT API
  const handleSubmitChangeReason = async () => {
    let reason = changeReason;
    if (changeReason === 'Other') {
      reason = changeReasonOther;
    }
    
    if (!reason || (changeReason === 'Other' && !changeReasonOther)) {
      Alert.alert('Error', 'Please provide a reason for the change.');
      return;
    }

    if (changeTaskIdx === null) {
      Alert.alert('Error', 'No task selected for change.');
      return;
    }

    const task = tasks[changeTaskIdx];
    setGptLoading(true);

    try {
      const prompt = generateRevisedTaskPrompt({
        taskTitle: task.title,
        taskDetails: task.details || '',
        taskObjective: task.objective || '',
        reasonForChange: reason,
      });

      const response = await askGpt(prompt);
      console.log('GPT Response:', response);
      
      // Parse the response to extract title, details, and objective
      const lines = response.split('\n').filter(line => line.trim());
      let newTitle = '';
      let newDetails = '';
      let newObjective = '';

      for (let i = 0; i < lines.length; i++) {
        const line = lines[i].trim();
        if (line.includes('Pamagat:') || line.includes('Title:')) {
          newTitle = line.split(':')[1]?.trim() || '';
        } else if (line.includes('Detalye:') || line.includes('Details:')) {
          newDetails = line.split(':')[1]?.trim() || '';
        } else if (line.includes('Layunin:') || line.includes('Objective:')) {
          newObjective = line.split(':')[1]?.trim() || '';
        }
      }

      // If we couldn't parse structured response, try to extract from the response
      if (!newTitle && !newDetails && !newObjective) {
        // Try to find the first line as title and rest as details
        const responseLines = response.split('\n').filter(line => line.trim());
        if (responseLines.length > 0) {
          newTitle = responseLines[0].trim();
          newDetails = responseLines.slice(1).join('\n').trim();
          newObjective = task.objective || '';
        } else {
          // Fallback: use the whole response as details
          newDetails = response;
          newTitle = task.title + ' (Revised)';
          newObjective = task.objective || '';
        }
      }

      console.log('Parsed values:', { newTitle, newDetails, newObjective });
      
      setRevisedTask({
        title: newTitle || task.title + ' (Revised)',
        details: newDetails || task.details || '',
        objective: newObjective || task.objective || '',
        originalTask: task,
        reason: reason,
      });

    } catch (err: any) {
      console.error('GPT API Error:', err);
      Alert.alert('Error', 'Failed to generate revised task. Please try again.');
    } finally {
      setGptLoading(false);
    }
  };

  // Handle applying the revised task
  const handleApplyRevisedTask = async () => {
    if (!revisedTask || changeTaskIdx === null) return;

    try {
      const newTasks = [...tasks];
      newTasks[changeTaskIdx] = {
        ...newTasks[changeTaskIdx],
        title: revisedTask.title,
        details: revisedTask.details,
        objective: revisedTask.objective,
        // Reset ratings since it's a new task
        preRating: null,
        postRating: null,
        status: 'notdone',
        assessmentScore: {
          Preassessment: null,
          Postassessment: null,
        },
      };

      setTasks(newTasks);

      // Save to Firebase
      if (parentData?.parentId) {
        const parentTasksRef = ref(db, `Parents/${parentData.parentId}/tasks`);
        await set(parentTasksRef, newTasks);
      }

      Alert.alert('Success', 'Task has been updated successfully!');
    setChangeModalVisible(false);
    setChangeReason('');
    setChangeReasonOther('');
    setChangeTaskIdx(null);
      setRevisedTask(null);

    } catch (err) {
      console.error('Failed to update task:', err);
      Alert.alert('Error', 'Failed to update task in database.');
    }
  };

  // Handle rating modal submit
  const handleSubmitRating = async () => {
    if (ratingTaskIdx === null || !ratingType) return;
    const newTasks = [...tasks];
    if (ratingType === 'pre') {
      newTasks[ratingTaskIdx] = {
        ...newTasks[ratingTaskIdx],
        status: 'ongoing',
        preRating: selectedRating,
        assessmentScore: {
          ...(newTasks[ratingTaskIdx].assessmentScore || {}),
          Preassessment: selectedRating,
          Postassessment: newTasks[ratingTaskIdx].assessmentScore?.Postassessment ?? null,
        },
      };
    } else if (ratingType === 'post') {
      newTasks[ratingTaskIdx] = {
        ...newTasks[ratingTaskIdx],
        status: 'done',
        postRating: selectedRating,
        assessmentScore: {
          ...(newTasks[ratingTaskIdx].assessmentScore || {}),
          Preassessment: newTasks[ratingTaskIdx].assessmentScore?.Preassessment ?? null,
          Postassessment: selectedRating,
        },
      };
    }
    setTasks(newTasks);
    // Save to Firebase
    if (parentData?.parentId) {
      const parentTasksRef = ref(db, `Parents/${parentData.parentId}/tasks`);
      await set(parentTasksRef, newTasks);
    }
    setRatingModalVisible(false);
    setRatingTaskIdx(null);
    setRatingType(null);
    setSelectedRating(0);
  };

  // In the announcement modal and list, format date and time
  function formatDateTime(iso: string) {
    if (!iso) return '';
    const d = new Date(iso);
    return d.toLocaleDateString() + ' ' + d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  }

  // In the render, extract last name from parentData.name
  const parentLastName = parentData?.name ? parentData.name.trim().split(' ').slice(-1)[0] : '';

  // Prefill setup fields every time the modal opens (for edit)
  useEffect(() => {
    if (showSetupModal && parentData) {
      setSetupName(parentData.name || '');
      setSetupContact(parentData.contact || '');
      setSetupIncome(parentData.householdIncome || incomeBrackets[0]);
    }
  }, [showSetupModal, parentData]);

  // In Pretest and Post-test status badge:
  const prePattern = studentData?.preScore?.pattern ?? 0;
  const preNumbers = studentData?.preScore?.numbers ?? 0;
  const preScore = prePattern + preNumbers;
  const preStatus = getStatusFromScore(preScore, 20, prePattern, preNumbers);
  const postPattern = studentData?.postScore?.pattern ?? 0;
  const postNumbers = studentData?.postScore?.numbers ?? 0;
  const postScore = postPattern + postNumbers;
  const postStatus = getStatusFromScore(postScore, 20, postPattern, postNumbers);

  // Quarter-specific derived scores (fallback to overall if quarter data not present)
  const quarterKey = `Q${selectedQuarter}` as const;
  const quarterSource: any = (studentData?.quarterScores && studentData.quarterScores[quarterKey])
    || (studentData?.quarters && studentData.quarters[quarterKey])
    || null;
  const selPrePattern = quarterSource?.preScore?.pattern ?? prePattern;
  const selPreNumbers = quarterSource?.preScore?.numbers ?? preNumbers;
  const selPostPattern = quarterSource?.postScore?.pattern ?? postPattern;
  const selPostNumbers = quarterSource?.postScore?.numbers ?? postNumbers;
  const selPreScore = selPrePattern + selPreNumbers;
  const selPostScore = selPostPattern + selPostNumbers;
  const selPrePercent = Math.round((selPreScore / 20) * 100);
  const selPostPercent = Math.round((selPostScore / 20) * 100);
  const selPreOutOf10 = Math.round(selPreScore / 2);
  const selPostOutOf10 = Math.round(selPostScore / 2);

  // Weekly progress for the selected quarter (weeks 1-8)
  const tasksForSelectedQuarter = tasks.filter(t => (t.quarter ?? 1) === selectedQuarter);
  const weekPercents = Array.from({ length: 8 }, (_, i) => {
    const weekNum = i + 1;
    const weekTasks = tasksForSelectedQuarter.filter(t => (t.week ?? 1) === weekNum);
    if (weekTasks.length === 0) return 0;
    const done = weekTasks.filter(t => t.status === 'done').length;
    return Math.round((done / weekTasks.length) * 100);
  });

  // Helper to render stars
  const renderStars = (count: number) => {
    return Array.from({ length: 5 }, (_, i) =>
      <Text key={i} style={{ color: '#FFD600', fontSize: 15, marginRight: 1 }}>{i < count ? '★' : '☆'}</Text>
    );
  };

  // Move _styles into StyleSheet.create for type safety
  const _modalStyles = StyleSheet.create({
    buttonRow: {
      flexDirection: 'row',
      justifyContent: 'center',
      alignItems: 'center',
      width: '100%',
      marginTop: 18,
      marginBottom: 2,
      gap: 0,
    },
    modalActionBtn: {
      flex: 1,
      borderRadius: 8,
      paddingVertical: 6,
      marginHorizontal: 2,
      alignItems: 'center',
      justifyContent: 'center',
      minWidth: 0,
      flexShrink: 1,
      maxWidth: 120,
    },
    modalActionBtnApply: {
      backgroundColor: '#27ae60',
    },
    modalActionBtnTryAgain: {
      backgroundColor: '#bbb',
    },
    modalActionBtnCancel: {
      backgroundColor: '#ff5a5a',
    },
    modalActionBtnText: {
      color: '#fff',
      fontWeight: 'bold',
      fontSize: 12,
      letterSpacing: 0.1,
    },
  });

  // Tagalog labels for reasons
  const reasonLabels = {
    Time: 'Oras',
    Resources: 'Kakulangan sa Gamit',
    Other: 'Iba Pa',
  };

  // Add new styles for the horizontal button row and improved buttons
  const modalActionStyles = StyleSheet.create({
    actionRow: {
      flexDirection: 'row',
      justifyContent: 'center',
      alignItems: 'center',
      width: '100%',
      marginTop: 28,
      marginBottom: 4,
    },
    actionBtn: {
      flex: 1,
      borderRadius: 22,
      paddingVertical: 13,
      marginHorizontal: 6,
      alignItems: 'center',
      justifyContent: 'center',
      minWidth: 0,
      flexShrink: 1,
      shadowColor: '#000',
      shadowOpacity: 0.07,
      shadowRadius: 6,
      shadowOffset: { width: 0, height: 2 },
      elevation: 2,
    },
    actionBtnGreen: {
      backgroundColor: '#27ae60',
    },
    actionBtnGray: {
      backgroundColor: '#bbb',
    },
    actionBtnText: {
      color: '#fff',
      fontWeight: 'bold' as const,
      fontSize: 16,
      letterSpacing: 0.1,
    },
  });

  return (
    <ImageBackground source={bgImage} style={styles.bg} imageStyle={{ opacity: 0.13, resizeMode: 'cover' }}>
      {/* Evaluation Modal */}
      <Modal
        visible={showEvaluationModal && !!parentData?.latestEvaluation}
        transparent
        animationType="fade"
        onRequestClose={() => setShowEvaluationModal(false)}
      >
        <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: 'rgba(0,0,0,0.18)' }}>
          <View style={{ width: '85%', maxWidth: 420, minWidth: 300, maxHeight: 520, minHeight: 320, backgroundColor: 'rgba(255,255,255,0.97)', borderRadius: 22, padding: 22, alignItems: 'center', shadowColor: '#000', shadowOpacity: 0.10, shadowRadius: 12, shadowOffset: { width: 0, height: 4 } }}>
            <Text style={{ fontSize: 20, fontWeight: 'bold', color: '#27ae60', marginBottom: 10, textAlign: 'center' }}>Message from Teacher</Text>
            <ScrollView style={{ maxHeight: 320, minHeight: 120, width: '100%' }} contentContainerStyle={{ flexGrow: 1 }}>
              <Text style={{ fontSize: 15, color: '#222', marginBottom: 8, textAlign: 'justify', lineHeight: 22 }}>{parentData?.latestEvaluation?.message}</Text>
            </ScrollView>
            <Text style={{ fontSize: 13, color: '#888', marginBottom: 8, textAlign: 'center' }}>— {parentData?.latestEvaluation?.teacher} ({parentData?.latestEvaluation?.student})</Text>
            <Text style={{ fontSize: 12, color: '#aaa', marginBottom: 8, textAlign: 'center' }}>{parentData?.latestEvaluation?.timestamp ? new Date(parentData.latestEvaluation.timestamp).toLocaleString() : ''}</Text>
            <TouchableOpacity style={{ marginTop: 10, backgroundColor: '#27ae60', borderRadius: 16, paddingVertical: 8, paddingHorizontal: 24 }} onPress={() => setShowEvaluationModal(false)}>
              <Text style={{ color: '#fff', fontWeight: 'bold', fontSize: 16 }}>Close</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
      <ScrollView contentContainerStyle={{ alignItems: 'center', paddingBottom: 32 }}>
        <View style={styles.headerWrap}>
          <View style={styles.headerRow}>
            <View>
              <Text style={styles.welcome}>Mabuhay!</Text>
              <Text style={styles.lrn}>Mr/Mrs. {parentLastName || parentData?.name || ''}</Text>
            </View>
            <TouchableOpacity style={styles.profileBtn} onPress={() => setShowSetupModal(true)}>
              <MaterialIcons name="account-circle" size={48} color="#2ecc40" />
            </TouchableOpacity>
          </View>
        </View>

        <View style={styles.sectionRow}>
          <Text style={styles.sectionTitle}>Announcements</Text>
          <View style={styles.greenDot} />
        </View>
        {/* Horizontal scrollable announcements */}
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          style={styles.announcementScroll}
          contentContainerStyle={{ paddingLeft: 8, paddingRight: 8 }}
        >
          {announcements.length === 0 ? (
            <View style={[styles.announcementBox, { justifyContent: 'center', alignItems: 'center' }]}> 
              <Text style={{ color: '#888', fontSize: 15 }}>No announcements yet.</Text>
            </View>
          ) : (
            announcements.map((a, idx) => (
              <TouchableOpacity
                key={a.announcementid}
                style={[styles.announcementBox, { marginRight: idx === announcements.length - 1 ? 0 : 16 }]}
                activeOpacity={0.85}
                onPress={() => handleAnnouncementPress(a)}
              >
                <Text style={{ fontWeight: 'bold', fontSize: 16, color: '#27ae60', marginBottom: 4 }}>{a.title}</Text>
                <Text style={{ fontSize: 13, color: '#444', marginBottom: 2 }}>Mula kay Teacher {teachersById[a.teacherid]?.name || a.teacherid}</Text>
                <View style={styles.announcementTextScrollWrap}>
                  <ScrollView style={styles.announcementTextScroll} showsVerticalScrollIndicator={false}>
                    <Text style={styles.announcementText} numberOfLines={3} ellipsizeMode="tail">{a.message}</Text>
                  </ScrollView>
                </View>
                <Text style={styles.announcementDate}>{formatDateTime(a.date)}</Text>
              </TouchableOpacity>
            ))
          )}
        </ScrollView>

        {/* Modal for focused announcement */}
        <Modal
          visible={modalVisible}
          transparent
          animationType="fade"
          onRequestClose={() => setModalVisible(false)}
        >
          <BlurView intensity={60} tint="light" style={styles.modalBlur}>
            <View style={styles.modalCenterWrap}>
              <View style={styles.modalAnnouncementBox}>
                <Text style={{ fontWeight: 'bold', fontSize: 18, color: '#27ae60', marginBottom: 8 }}>{focusedAnnouncement?.title}</Text>
                <Text style={{ fontSize: 15, color: '#444', marginBottom: 2 }}>Teacher {teachersById[focusedAnnouncement?.teacherid]?.name || focusedAnnouncement?.teacherid}</Text>
                <Text style={styles.modalAnnouncementText}>{focusedAnnouncement?.message}</Text>
                <Text style={styles.announcementDate}>{formatDateTime(focusedAnnouncement?.date)}</Text>
                <Pressable style={styles.modalCloseBtn} onPress={() => setModalVisible(false)}>
                  <Text style={styles.modalCloseBtnText}>Close</Text>
                </Pressable>
              </View>
            </View>
          </BlurView>
        </Modal>

        {/* Home Exercise CTA */}
        <TouchableOpacity
          style={styles.homeExerciseBtn}
          onPress={() => router.push('/WelcomePage')}
        >
          <Text style={styles.homeExerciseText}>Home Exercise</Text>
        </TouchableOpacity>

        {/* Combined Quarter Panel: Pre/Post test + Weekly progress */}
        <View style={styles.quarterPanel}>
          <View style={styles.quarterHeaderRow}>
            <Text style={styles.sectionTitle}>Quarter</Text>
            <TouchableOpacity style={styles.quarterDropdown} onPress={() => setQuarterDropdownVisible(true)}>
              <Text style={{ fontWeight: '600', color: '#222', marginRight: 4 }}>Quarter {selectedQuarter}</Text>
              <MaterialIcons name="arrow-drop-down" size={22} color="#222" />
            </TouchableOpacity>
          </View>
          <Modal
            visible={quarterDropdownVisible}
            transparent
            animationType="fade"
            onRequestClose={() => setQuarterDropdownVisible(false)}
          >
            <Pressable style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.2)', justifyContent: 'center', alignItems: 'center' }} onPress={() => setQuarterDropdownVisible(false)}>
              <View style={{ backgroundColor: '#fff', borderRadius: 12, padding: 12, minWidth: 220 }}>
                {[1,2,3,4].map(q => (
                  <TouchableOpacity key={q} style={{ paddingVertical: 10, borderBottomWidth: q===4?0:1, borderBottomColor: '#eee' }} onPress={() => { setSelectedQuarter(q); setQuarterDropdownVisible(false); }}>
                    <Text style={{ fontSize: 16, color: '#222' }}>Quarter {q}</Text>
                  </TouchableOpacity>
                ))}
              </View>
            </Pressable>
          </Modal>

          <View style={styles.scoreCirclesRow}>
            <View style={styles.scoreItemHalf}>
              <View style={styles.scoreItemRow}>
                <View style={styles.circleWrap}>
                  <View style={[styles.circle, { borderColor: '#2ecc40' }] }>
                    <Text style={[styles.circleText, { color: '#2ecc40', fontSize: 22, fontWeight: 'bold' }]}>{studentData ? selPrePercent : 0}%</Text>
                  </View>
                </View>
                <View style={styles.scoreTextCol}>
                  <Text style={styles.progressLabelLarge}>Pretest</Text>
                  <Text style={styles.scoreOutOfTen}>{studentData ? `${selPreOutOf10}/10` : '0/10'}</Text>
                </View>
              </View>
            </View>
            <View style={styles.scoreItemHalf}>
              <View style={styles.scoreItemRow}>
                <View style={styles.circleWrap}>
                  <View style={[styles.circle, { borderColor: '#ff5a5a' }]}>
                    <Text style={[styles.circleText, { color: '#ff5a5a', fontSize: 22, fontWeight: 'bold' }]}>{studentData ? selPostPercent : 0}%</Text>
                  </View>
                </View>
                <View style={styles.scoreTextCol}>
                  <Text style={styles.progressLabelLarge}>Post-test</Text>
                  <Text style={styles.scoreOutOfTen}>{studentData ? `${selPostOutOf10}/10` : '0/10'}</Text>
                </View>
              </View>
            </View>
          </View>

          <View style={{ marginTop: 10, width: '100%' }}>
            {Array.from({ length: 8 }, (_, i) => (
              <View key={i} style={styles.weekRow}>
                <Text style={styles.weekLabel}>Week {i + 1}</Text>
                <View style={styles.weekBarBg}>
                  <View style={[styles.weekBarFill, { width: `${weekPercents[i]}%` }]} />
                </View>
              </View>
            ))}
          </View>
        </View>
        {/* Tasks panel removed per new design */}

        {/* Change Reason Modal */}
        <Modal
          visible={changeModalVisible}
          transparent
          animationType="fade"
          onRequestClose={() => setChangeModalVisible(false)}
        >
          <BlurView intensity={60} tint="light" style={styles.modalBlur}>
            <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', width: '100%' }}>
              <View style={[styles.modalAnnouncementBox, {
                width: 350,
                maxWidth: '90%',
                paddingVertical: 32,
                paddingHorizontal: 20,
                alignItems: 'center',
                justifyContent: 'flex-start',
                shadowColor: '#000',
                shadowOpacity: 0.13,
                shadowRadius: 18,
                shadowOffset: { width: 0, height: 8 },
                elevation: 8,
                backgroundColor: 'rgba(255,255,255,0.98)',
                borderRadius: 26,
              }]}
              >
                {gptLoading ? (
                  <View style={{ width: 260, maxWidth: '90%', paddingVertical: 36, paddingHorizontal: 18, backgroundColor: '#fff', borderRadius: 22, alignItems: 'center', justifyContent: 'center', shadowColor: '#000', shadowOpacity: 0.10, shadowRadius: 12, shadowOffset: { width: 0, height: 4 }, elevation: 8 }}>
                    <ActivityIndicator size="large" color="#27ae60" style={{ marginBottom: 22 }} />
                    <Text style={{ color: '#2ecc40', fontWeight: 'bold', fontSize: 18, textAlign: 'center', marginTop: 0 }}>Gumagawa ng bagong gawain...</Text>
                  </View>
                ) : revisedTask ? (
                  <Animated.View style={{ width: '100%', alignItems: 'center', opacity: 1 }}>
                    <Text style={{ fontWeight: 'bold', fontSize: 22, marginBottom: 12, color: '#27ae60', textAlign: 'center' }}>Bagong Gawain</Text>
                    <View style={{ backgroundColor: '#f8f9fa', borderRadius: 14, padding: 18, marginBottom: 22, maxHeight: 260, minHeight: 120, width: '100%' }}>
                      <ScrollView showsVerticalScrollIndicator={true} style={{ marginBottom: 12 }}>
                        <Text style={{ fontWeight: 'bold', fontSize: 16, color: '#222', marginBottom: 8 }}>Original Task:</Text>
                        <Text style={{ fontSize: 15, color: '#666', marginBottom: 4 }}><Text style={{ fontWeight: 'bold' }}>Title:</Text> {revisedTask.originalTask.title}</Text>
                        <Text style={{ fontSize: 15, color: '#666', marginBottom: 4 }}><Text style={{ fontWeight: 'bold' }}>Details:</Text> {revisedTask.originalTask.details}</Text>
                        <Text style={{ fontSize: 15, color: '#666', marginBottom: 8 }}><Text style={{ fontWeight: 'bold' }}>Objective:</Text> {revisedTask.originalTask.objective}</Text>
                        <Text style={{ fontWeight: 'bold', fontSize: 16, color: '#222', marginTop: 12, marginBottom: 8 }}>Dahilan:</Text>
                        <Text style={{ fontSize: 15, color: '#666', marginBottom: 12 }}>{revisedTask.reason}</Text>
                        <Text style={{ fontWeight: 'bold', fontSize: 16, color: '#27ae60', marginBottom: 8 }}>Bagong Task:</Text>
                        <Text style={{ fontSize: 15, color: '#222', marginBottom: 4 }}><Text style={{ fontWeight: 'bold' }}>Title:</Text> {revisedTask.title}</Text>
                        <Text style={{ fontSize: 15, color: '#222', marginBottom: 4 }}><Text style={{ fontWeight: 'bold' }}>Details:</Text> {revisedTask.details}</Text>
                        <Text style={{ fontSize: 15, color: '#222', marginBottom: 4 }}><Text style={{ fontWeight: 'bold' }}>Objective:</Text> {revisedTask.objective}</Text>
                      </ScrollView>
                    </View>
                    <View style={[_modalStyles.buttonRow, { marginTop: 10 }]}> 
                      <Pressable
                        style={[_modalStyles.modalActionBtn, _modalStyles.modalActionBtnApply]}
                        onPress={handleApplyRevisedTask}
                      >
                        <Text style={_modalStyles.modalActionBtnText}>Gamitin</Text>
                      </Pressable>
                      <Pressable
                        style={[_modalStyles.modalActionBtn, _modalStyles.modalActionBtnTryAgain]}
                        onPress={() => {
                          setRevisedTask(null);
                          setChangeReason('');
                          setChangeReasonOther('');
                        }}
                      >
                        <Text style={_modalStyles.modalActionBtnText}>Subukan Muli</Text>
                      </Pressable>
                      <Pressable
                        style={[_modalStyles.modalActionBtn, _modalStyles.modalActionBtnCancel]}
                        onPress={() => {
                          setChangeModalVisible(false);
                          setRevisedTask(null);
                          setChangeReason('');
                          setChangeReasonOther('');
                          setChangeTaskIdx(null);
                        }}
                      >
                        <Text style={_modalStyles.modalActionBtnText}>Kanselahin</Text>
                      </Pressable>
                    </View>
                  </Animated.View>
                ) : (
                  // Reason selection UI
                  <>
                    <Text style={{ fontWeight: 'bold', fontSize: 20, marginBottom: 10, color: '#222', textAlign: 'center', alignSelf: 'center' }}>Dahilan ng Pagbabago</Text>
                <TouchableOpacity
                      style={[styles.reasonOption, changeReason === 'Time' && styles.reasonOptionSelected, { alignSelf: 'center' }]}
                  onPress={() => setChangeReason('Time')}
                >
                      <Text style={[styles.reasonOptionText, { textAlign: 'center' }]}>{reasonLabels.Time}</Text>
                </TouchableOpacity>
                <TouchableOpacity
                      style={[styles.reasonOption, changeReason === 'Resources' && styles.reasonOptionSelected, { alignSelf: 'center' }]}
                  onPress={() => setChangeReason('Resources')}
                >
                      <Text style={[styles.reasonOptionText, { textAlign: 'center' }]}>{reasonLabels.Resources}</Text>
                </TouchableOpacity>
                <TouchableOpacity
                      style={[styles.reasonOption, changeReason === 'Other' && styles.reasonOptionSelected, { alignSelf: 'center' }]}
                  onPress={() => setChangeReason('Other')}
                >
                      <Text style={[styles.reasonOptionText, { textAlign: 'center' }]}>{reasonLabels.Other}</Text>
                </TouchableOpacity>
                {changeReason === 'Other' && (
                      <View style={{ marginTop: 10, width: '100%', alignItems: 'center' }}>
                        <Text style={{ fontSize: 15, color: '#222', marginBottom: 4, textAlign: 'center', alignSelf: 'center' }}>Ilagay ang iyong dahilan:</Text>
                        <View style={{ backgroundColor: '#f3f3f3', borderRadius: 8, padding: 6, width: '100%' }}>
                          <TextInput
                            style={{ minHeight: 32, fontSize: 15, color: '#222', padding: 4, textAlign: 'center' }}
                            placeholder="I-type ang iyong dahilan dito..."
                            value={changeReasonOther}
                            onChangeText={setChangeReasonOther}
                            multiline
                          />
                    </View>
                    {changeReasonOther ? (
                          <Text style={{ color: '#888', marginTop: 2, textAlign: 'center', alignSelf: 'center' }}>Nailagay: {changeReasonOther}</Text>
                    ) : null}
                  </View>
                )}
                    <View style={modalActionStyles.actionRow}>
                <Pressable
                        style={[modalActionStyles.actionBtn, modalActionStyles.actionBtnGreen]}
                  onPress={handleSubmitChangeReason}
                        disabled={!changeReason || (changeReason === 'Other' && !changeReasonOther) || gptLoading}
                >
                        <Text style={modalActionStyles.actionBtnText}>Palitan</Text>
                </Pressable>
                      <Pressable
                        style={[modalActionStyles.actionBtn, modalActionStyles.actionBtnGray]}
                        onPress={() => setChangeModalVisible(false)}
                      >
                        <Text style={modalActionStyles.actionBtnText}>Kanselahin</Text>
                </Pressable>
                    </View>
                  </>
                )}
              </View>
            </View>
          </BlurView>
        </Modal>

        {/* Rating Modal */}
        <Modal
          visible={ratingModalVisible}
          transparent
          animationType="fade"
          onRequestClose={() => setRatingModalVisible(false)}
        >
          <BlurView intensity={60} tint="light" style={styles.modalBlur}>
            <View style={styles.modalCenterWrap}>
              <View style={[
                styles.modalAnnouncementBox,
                {
                  alignItems: 'center',
                  justifyContent: 'center',
                  position: 'relative',
                  paddingVertical: 32,
                  paddingHorizontal: 24,
                  minWidth: 280,
                },
              ]}>
                {/* X icon at top right */}
                <TouchableOpacity
                  style={{ position: 'absolute', top: 14, right: 14, zIndex: 10 }}
                  onPress={() => setRatingModalVisible(false)}
                >
                  <MaterialIcons name="close" size={35} color="#888" />
                </TouchableOpacity>
                {/* Modal Title for Pre/Post */}
                <Text style={{ fontWeight: 'bold', fontSize: 20, marginTop: 18, marginBottom: 8, textAlign: 'center', lineHeight: 24 }}>
                  {ratingType === 'pre' ? 'Panimulang Pagsusuri' : ratingType === 'post' ? 'Pangwakas na Pagsusuri' : ''}
                </Text>
                <Text style={{ fontWeight: 'bold', fontSize: 16, marginBottom: 8, textAlign: 'center', lineHeight: 22 }}>
                  I-rate ang kasalukuyang kaalaman ng iyong anak sa gawaing ito
                </Text>
                {/* Star rating selection */}
                <View style={{ flexDirection: 'row', justifyContent: 'center', marginVertical: 8, marginBottom: 12 }}>
                  {[1, 2, 3, 4, 5].map((n) => (
                    <TouchableOpacity key={n} onPress={() => setSelectedRating(n)}>
                      <MaterialIcons
                        name={n <= selectedRating ? 'star' : 'star-border'}
                        size={38}
                        color={n <= selectedRating ? '#FFD600' : '#bbb'}
                        style={{ marginHorizontal: 6 }}
                      />
                    </TouchableOpacity>
                  ))}
                </View>

                {ratingType === 'post' ? (
                  <Pressable
                    style={[styles.modalCloseBtn, { marginTop: 8, backgroundColor: '#27ae60', width: 180, alignSelf: 'center', borderRadius: 20 }]}
                    onPress={handleSubmitRating}
                    disabled={!selectedRating}
                  >
                    <Text style={styles.modalCloseBtnText}>Submit</Text>
                  </Pressable>
                ) : (
                  <Pressable
                    style={[styles.modalCloseBtn, { marginTop: 8, backgroundColor: '#2ecc40', width: 140, alignSelf: 'center', borderRadius: 20 }]}
                    onPress={handleSubmitRating}
                    disabled={!selectedRating}
                  >
                    <Text style={styles.modalCloseBtnText}>Submit</Text>
                  </Pressable>
                )}
              </View>
            </View>
          </BlurView>
        </Modal>
      </ScrollView>
      <Modal
        visible={showSetupModal}
        transparent
        animationType="fade"
        onRequestClose={() => {}}
      >
        <BlurView intensity={60} tint="light" style={{ flex: 1, justifyContent: 'center', alignItems: 'center', position: 'relative' }}>
          <View style={{ backgroundColor: '#fff', borderRadius: 18, padding: 24, width: 320, alignItems: 'center' }}>
            {/* X icon for closing if not first setup */}
            {(!!parentData?.name && !!parentData?.contact) && (
              <TouchableOpacity
                style={{ position: 'absolute', top: 12, right: 12, zIndex: 10 }}
                onPress={() => setShowSetupModal(false)}
              >
                <MaterialIcons name="close" size={28} color="#888" />
              </TouchableOpacity>
            )}
            <Text style={{ fontWeight: 'bold', fontSize: 20, color: '#27ae60', marginBottom: 12 }}>Set Up Your Profile</Text>
            <View style={{ width: '100%', marginBottom: 8 }}>
              <Text style={{ fontSize: 15, color: '#222', marginBottom: 4, fontWeight: '600' }}>Full Name</Text>
              <TextInput
                style={{ width: '100%', borderRadius: 10, borderWidth: 1, borderColor: '#e0f7e2', padding: 10, marginBottom: 8, fontSize: 16 }}
                placeholder="Your Name"
                value={setupName}
                onChangeText={setSetupName}
              />
            </View>
            <View style={{ width: '100%', marginBottom: 8 }}>
              <Text style={{ fontSize: 15, color: '#222', marginBottom: 4, fontWeight: '600' }}>Contact Number</Text>
              <TextInput
                style={{ width: '100%', borderRadius: 10, borderWidth: 1, borderColor: '#e0f7e2', padding: 10, marginBottom: 8, fontSize: 16 }}
                placeholder="Contact Number"
                value={setupContact}
                onChangeText={setSetupContact}
                keyboardType="phone-pad"
              />
            </View>
            <View style={{ width: '100%', marginBottom: 8 }}>
              <Text style={{ fontSize: 15, color: '#222', marginBottom: 4, fontWeight: '600' }}>Household Monthly Income</Text>
              <TouchableOpacity
                style={{ borderWidth: 1, borderColor: '#e0f7e2', borderRadius: 10, backgroundColor: '#f9f9f9', padding: 12, minHeight: 44, justifyContent: 'center' }}
                onPress={() => setIncomeDropdownVisible(true)}
                activeOpacity={0.8}
              >
                <Text style={{ fontSize: 15, color: setupIncome ? '#222' : '#aaa' }}>{setupIncome || 'Select income bracket'}</Text>
              </TouchableOpacity>
              <Modal
                visible={incomeDropdownVisible}
                transparent
                animationType="fade"
                onRequestClose={() => setIncomeDropdownVisible(false)}
              >
                <Pressable style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.2)', justifyContent: 'center', alignItems: 'center' }} onPress={() => setIncomeDropdownVisible(false)}>
                  <View style={{ backgroundColor: '#fff', borderRadius: 12, padding: 16, minWidth: 260 }}>
                    {incomeBrackets.map((bracket) => (
                      <TouchableOpacity
                        key={bracket}
                        style={{ paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: '#eee' }}
                        onPress={() => { setSetupIncome(bracket); setIncomeDropdownVisible(false); }}
                      >
                        <Text style={{ fontSize: 16, color: '#222' }}>{bracket}</Text>
                      </TouchableOpacity>
                    ))}
                  </View>
                </Pressable>
              </Modal>
            </View>
            <View style={{ flexDirection: 'row', width: '100%', marginTop: 6 }}>
              <TouchableOpacity
                style={{ backgroundColor: '#27ae60', borderRadius: 10, paddingVertical: 10, flex: 1, alignItems: 'center', justifyContent: 'center' }}
                onPress={handleSetupSubmit}
                disabled={setupLoading}
              >
                <Text style={{ color: '#fff', fontWeight: 'bold', fontSize: 16 }}>{setupLoading ? 'Saving...' : 'Save'}</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={{ backgroundColor: '#ff5a5a', borderRadius: 10, paddingVertical: 10, flex: 1, alignItems: 'center', justifyContent: 'center', marginLeft: 10, flexDirection: 'row' }}
                onPress={() => router.replace('/RoleSelection')}
              >
                <MaterialIcons name="logout" size={22} color="#fff" style={{ marginRight: 8 }} />
                <Text style={{ color: '#fff', fontWeight: 'bold', fontSize: 16 }}>Logout</Text>
              </TouchableOpacity>
            </View>
          </View>
        </BlurView>
      </Modal>
    </ImageBackground>
  );
}

const CIRCLE_SIZE = Math.max(64, Math.min(96, Math.round(width * 0.22)));
const styles = StyleSheet.create({
  bg: {
    flex: 1,
    backgroundColor: '#f7fafd',
  },
  headerWrap: {
    width: '100%',
    paddingTop: 24,
    paddingBottom: 12,
    backgroundColor: 'rgba(255,255,255,0.93)',
    borderBottomLeftRadius: 20,
    borderBottomRightRadius: 20,
    marginBottom: 14,
    shadowColor: '#000',
    shadowOpacity: 0.04,
    shadowRadius: 4,
    shadowOffset: { width: 0, height: 1 },
    borderBottomWidth: 0.5,
    borderColor: '#e6e6e6',
  },
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    width: '100%',
    paddingHorizontal: 20,
    marginTop: 0,
    marginBottom: 0,
  },
  welcome: {
    fontSize: 22,
    fontWeight: '700',
    color: '#222',
    letterSpacing: 0.5,
  },
  lrn: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#2ecc40',
    marginTop: 0,
    letterSpacing: 0.5,
  },
  profileBtn: {
    backgroundColor: '#fff',
    borderRadius: 24,
    padding: 8,
    elevation: 4,
    shadowColor: '#000',
    shadowOpacity: 0.08,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 2 },
  },
  profileIcon: {
    width: 36,
    height: 36,
    borderRadius: 18,
    borderWidth: 2,
    borderColor: '#2ecc40',
  },
  sectionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    width: '92%',
    marginTop: 8,
    marginBottom: 8,
  },
  sectionTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: '#222',
    marginRight: 8,
    letterSpacing: 0.2,
  },
  greenDot: {
    width: 12,
    height: 12,
    borderRadius: 6,
    backgroundColor: '#2ecc40',
  },
  announcementScroll: {
    width: '100%',
    marginBottom: 18,
    minHeight: 120,
  },
  announcementBox: {
    width: width * 0.9,
    backgroundColor: 'rgba(255,255,255,0.82)',
    borderRadius: 20,
    padding: 18,
    marginBottom: 0,
    elevation: 4,
    shadowColor: '#000',
    shadowOpacity: 0.07,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 2 },
  },
  teacherAvatar: {
    width: 54,
    height: 54,
    borderRadius: 27,
    backgroundColor: '#fff',
    borderWidth: 2,
    borderColor: '#2ecc40',
  },
  teacherName: {
    fontWeight: 'bold',
    fontSize: 17,
    color: '#222',
  },
  teacherGrade: {
    fontSize: 14,
    color: '#666',
    marginTop: 1,
  },
  announcementTextScrollWrap: {
    maxHeight: 70,
    marginBottom: 2,
  },
  announcementTextScroll: {
    maxHeight: 70,
  },
  announcementText: {
    fontSize: 14,
    color: '#333',
    marginTop: 8,
    lineHeight: 20,
    paddingRight: 2,
  },
  announcementDate: {
    fontSize: 12,
    color: '#aaa',
    marginTop: 8,
    alignSelf: 'flex-end',
  },
  announcementTime: {
    fontSize: 12,
    color: '#aaa',
    marginLeft: 8,
    alignSelf: 'flex-end',
  },
  progressRowCardWrap: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    width: '92%',
    marginBottom: 16,
    gap: 12,
    marginLeft: 'auto',
    marginRight: 'auto',
  },
  homeExerciseBtn: {
    width: '92%',
    backgroundColor: '#27ae60',
    borderRadius: 16,
    paddingVertical: 14,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 12,
    shadowColor: '#000',
    shadowOpacity: 0.07,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 2 },
  },
  homeExerciseText: {
    color: '#fff',
    fontWeight: 'bold',
    fontSize: 18,
  },
  quarterPanel: {
    width: '92%',
    backgroundColor: 'rgba(255,255,255,0.9)',
    borderRadius: 18,
    padding: 16,
    marginBottom: 16,
    elevation: 3,
    shadowColor: '#000',
    shadowOpacity: 0.06,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 2 },
  },
  quarterHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  quarterDropdown: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#f3f3f3',
    borderRadius: 14,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  scoreCirclesRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: 12,
    marginTop: 8,
    marginBottom: 12,
  },
  scoreItemHalf: {
    flex: 1,
    minWidth: 0,
  },
  scoreItemRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 4,
    paddingHorizontal: 6,
  },
  scoreTextCol: {
    flexDirection: 'column',
  },
  progressLabelLarge: {
    fontSize: 16,
    fontWeight: '700',
    color: '#222',
  },
  scoreOutOfTen: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#0097a7',
  },
  weekRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginVertical: 6,
  },
  weekLabel: {
    width: 70,
    fontSize: 14,
    color: '#222',
    fontWeight: '700',
  },
  weekBarBg: {
    flex: 1,
    height: 12,
    backgroundColor: '#e6e6e6',
    borderRadius: 8,
    overflow: 'hidden',
  },
  weekBarFill: {
    height: 12,
    backgroundColor: '#2ecc40',
    borderRadius: 8,
  },
  progressCardSingle: {
    flex: 1,
    minWidth: 0,
    maxWidth: '48%',
    backgroundColor: 'rgba(255,255,255,0.85)',
    borderRadius: 20,
    paddingVertical: 16,
    paddingHorizontal: 10,
    marginHorizontal: 0,
    marginBottom: 0,
    elevation: 3,
    shadowColor: '#000',
    shadowOpacity: 0.06,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 2 },
    alignItems: 'center',
  },
  progressCol: {
    alignItems: 'center',
    flex: 1,
  },
  circleWrap: {
    alignItems: 'center',
    marginBottom: 2,
    shadowColor: '#2ecc40',
    shadowOpacity: 0.08,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 2 },
  },
  circle: {
    width: CIRCLE_SIZE,
    height: CIRCLE_SIZE,
    borderRadius: CIRCLE_SIZE / 2,
    borderWidth: 8,
    borderColor: '#2ecc40',
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#f7fafd',
    marginBottom: 2,
    shadowColor: '#2ecc40',
    shadowOpacity: 0.10,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 2 },
  },
  circleText: {
    fontSize: 22,
    fontWeight: 'bold',
  },
  progressLabel: {
    fontSize: 15,
    fontWeight: '600',
    color: '#222',
    marginTop: 2,
  },
  progressScore: {
    fontSize: 13,
    color: '#888',
    marginTop: 1,
    marginBottom: 4,
  },
  tasksBox: {
    width: '92%',
    backgroundColor: 'rgba(255,255,255,0.82)',
    borderRadius: 20,
    paddingVertical: 16,
    paddingHorizontal: 14,
    marginTop: 14,
    marginBottom: 18,
    elevation: 4,
    shadowColor: '#000',
    shadowOpacity: 0.07,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 2 },
  },
  tasksTitle: {
    fontSize: 25,
    fontWeight: '700',
    color: '#222',
    marginLeft: 4,
    marginBottom: 4,
    letterSpacing: 0.2,
  },
  taskRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 14,
    backgroundColor: 'rgba(247,250,253,0.82)',
    borderRadius: 12,
    paddingVertical: 10,
    paddingHorizontal: 10,
    elevation: 2,
    shadowColor: '#000',
    shadowOpacity: 0.06,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 2 },
  },
  taskNum: {
    width: 32,
    height: 32,
    borderRadius: 16,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 10,
    borderWidth: 2,
  },
  taskNumGray: {
    backgroundColor: '#e6e6e6',
    borderColor: '#bbb',
  },
  taskNumDone: {
    backgroundColor: '#e6ffe6',
    borderColor: '#2ecc40',
  },
  taskNumText: {
    fontWeight: 'bold',
    fontSize: 16,
  },
  taskNumTextGray: {
    color: '#bbb',
  },
  taskNumTextDone: {
    color: '#2ecc40',
  },
  taskStatus: {
    fontWeight: 'bold',
    fontSize: 13,
    marginLeft: 10,
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderRadius: 12,
    overflow: 'hidden',
    flexDirection: 'row',
    alignItems: 'center',
  },
  statusDone: {
    color: '#2ecc40',
    backgroundColor: '#e6ffe6',
  },
  statusOngoing: {
    color: '#f1c40f',
    backgroundColor: '#fffbe6',
  },
  statusNotDone: {
    color: '#bbb',
    backgroundColor: '#f3f3f3',
  },
  taskTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 10,
    width: '100%',
    paddingRight: 0,
    paddingLeft: 0,
  },
  taskTitleSmall: {
    fontWeight: '600',
    color: '#222',
    fontSize: 14,
    flexShrink: 1,
    marginRight: 8,
  },
  taskDetails: {
    fontSize: 13,
    color: '#888',
    marginTop: 4,
    lineHeight: 18,
    marginBottom: 2,
  },
  tasksTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 10,
    width: '100%',
    paddingRight: 0,
    paddingLeft: 0,
  },
  generalProgressWrap: {
    height: 8,
    flex: 1,
    backgroundColor: '#e6e6e6',
    borderRadius: 4,
    marginLeft: 12,
    marginRight: 8,
    justifyContent: 'center',
    alignItems: 'flex-start',
    flexShrink: 1,
  },
  generalProgressBar: {
    height: 8,
    borderRadius: 4,
    backgroundColor: '#2ecc40',
  },
  generalProgressText: {
    fontSize: 13,
    color: '#888',
    minWidth: 40,
    textAlign: 'right',
    marginLeft: 0,
  },
  modalBlur: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  modalCenterWrap: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    width: '100%',
  },
  modalAnnouncementBox: {
    width: '85%',
    backgroundColor: 'rgba(255,255,255,0.97)',
    borderRadius: 22,
    padding: 22,
    shadowColor: '#000',
    shadowOpacity: 0.10,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 4 },
    alignItems: 'flex-start',
    paddingHorizontal: 16,
  },
  modalAnnouncementText: {
    fontSize: 16,
    color: '#222',
    marginTop: 10,
    lineHeight: 22,
    marginBottom: 8,
  },
  modalCloseBtn: {
    alignSelf: 'center',
    marginTop: 16,
    backgroundColor: '#2ecc40',
    borderRadius: 16,
    paddingVertical: 8,
    paddingHorizontal: 24,
  },
  modalCloseBtnText: {
    color: '#fff',
    alignSelf: 'center',
    fontWeight: 'bold',
    fontSize: 18,
    
  },
  changeBtn: {
    marginLeft: 10,
    padding: 6,
    borderRadius: 16,
    backgroundColor: 'rgba(46,204,64,0.08)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  reasonOption: {
    width: '100%',
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 10,
    backgroundColor: '#f3f3f3',
    marginBottom: 8,
  },
  reasonOptionSelected: {
    backgroundColor: '#e6ffe6',
    borderColor: '#2ecc40',
    borderWidth: 1.5,
  },
  reasonOptionText: {
    fontSize: 16,
    color: '#222',
  },
  taskCard: {
    backgroundColor: 'rgba(255,255,255,0.96)',
    borderRadius: 14,
    paddingVertical: 12,
    paddingHorizontal: 14,
    marginBottom: 12,
    shadowColor: '#000',
    shadowOpacity: 0.07,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 2 },
    elevation: 2,
  },
  taskCardDone: {
    borderLeftWidth: 5,
    borderLeftColor: '#2ecc40',
  },
  taskCardOngoing: {
    borderLeftWidth: 5,
    borderLeftColor: '#f1c40f',
  },
  taskCardNotDone: {
    borderLeftWidth: 5,
    borderLeftColor: '#bbb',
  },
  simulanBtn: {
    backgroundColor: '#2ecc40',
    borderRadius: 12,
    paddingVertical: 6,
    paddingHorizontal: 18,
    marginLeft: 8,
  },
  markTaposBtn: {
    backgroundColor: '#D4FFB2',
    borderRadius: 12,
    paddingVertical: 6,
    paddingHorizontal: 18,
    marginLeft: 8,
  },
}); 
