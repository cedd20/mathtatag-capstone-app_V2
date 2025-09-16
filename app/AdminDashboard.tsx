import { AntDesign, MaterialCommunityIcons, MaterialIcons } from '@expo/vector-icons';
import { BlurView } from 'expo-blur';
import { LinearGradient } from 'expo-linear-gradient';
import { useRouter } from 'expo-router';
import * as Speech from 'expo-speech';
import { createUserWithEmailAndPassword } from 'firebase/auth';
import { get, onValue, ref, remove, set, update } from 'firebase/database';
import { useEffect, useState } from 'react';
import { Alert, Dimensions, FlatList, ImageBackground, Modal, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
 
import { auth, db } from '../constants/firebaseConfig';

// GPT API Health Test Function with timeout and restart timing
const testGptApiHealth = async (): Promise<{ 
  status: 'live' | 'down' | 'restarting'; 
  responseTime?: number; 
  error?: string;
  restartTime?: number;
}> => {
  const startTime = Date.now();
  try {
    const timeoutPromise = new Promise((_, reject) => {
      setTimeout(() => reject(new Error('Request timeout after 5 seconds')), 5000);
    });

    const fetchPromise = fetch('https://mathtatag-api.onrender.com/gpt', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ prompt: 'Hello, are you alive?' }),
    });
    
    const response = await Promise.race([fetchPromise, timeoutPromise]) as Response;
    const endTime = Date.now();
    const responseTime = endTime - startTime;
    
    if (response.ok) {
      return { status: 'live', responseTime };
    } else {
      // If server returns error, assume it's restarting
      return { 
        status: 'restarting', 
        error: 'Server is restarting...',
        responseTime,
        restartTime: startTime
      };
    }
  } catch (error: any) {
    const endTime = Date.now();
    const responseTime = endTime - startTime;
    
    if (error.message.includes('timeout')) {
      return { 
        status: 'down', 
        error: 'Server is down (timeout)',
        responseTime 
      };
    }
    
    // For other errors, assume server is restarting
    return { 
      status: 'restarting', 
      error: 'Server is restarting...',
      responseTime,
      restartTime: startTime
    };
  }
};

// General Health Endpoint Test Function
const testGeneralHealth = async (): Promise<{ 
  status: 'live' | 'down' | 'restarting'; 
  responseTime?: number; 
  error?: string;
  version?: string;
  gitVersion?: string;
  restartTime?: number;
}> => {
  const startTime = Date.now();
  try {
    const timeoutPromise = new Promise((_, reject) => {
      setTimeout(() => reject(new Error('Request timeout after 5 seconds')), 5000);
    });

    const fetchPromise = fetch('https://mathtatag-api.onrender.com/health');
    
    const response = await Promise.race([fetchPromise, timeoutPromise]) as Response;
    const endTime = Date.now();
    const responseTime = endTime - startTime;
    
    if (response.ok) {
      const data = await response.json();
      return { 
        status: 'live', 
        responseTime,
        version: data.version,
        gitVersion: data.git_version
      };
    } else {
      return { 
        status: 'restarting', 
        error: 'Server is restarting...',
        responseTime,
        restartTime: startTime
      };
    }
  } catch (error: any) {
    const endTime = Date.now();
    const responseTime = endTime - startTime;
    
    if (error.message.includes('timeout')) {
      return { 
        status: 'down', 
        error: 'Server is down (timeout)',
        responseTime 
      };
    }
    
    return { 
      status: 'restarting', 
      error: 'Server is restarting...',
      responseTime,
      restartTime: startTime
    };
  }
};

// Add types at the top:
type Teacher = {
  accountId: string;
  teacherId: string;
  name: string;
  email: string;
  school: string;
  contact: string;
  password?: string; // Only for registration, not stored in DB
  numClasses?: number;
  numStudents?: number;
  avgImprovement?: number;
};

 

const bgImage = require('../assets/images/bg.jpg');

function formatImprovement(value: number) {
  if (value > 0) return `+${value}%`;
  if (value < 0) return `-${Math.abs(value)}%`;
  return '0%';
}

export default function AdminDashboard() {
  const [modalVisible, setModalVisible] = useState(false);
  const [showProfileMenu, setShowProfileMenu] = useState(false);
  const router = useRouter();
  const [newTeacher, setNewTeacher] = useState<Teacher>({ name: '', email: '', contact: '', school: '', password: '', accountId: '', teacherId: '' });
  const [teachers, setTeachers] = useState<Teacher[]>([]);
  const [teacherIdCounter, setTeacherIdCounter] = useState(0);
  const [selectedTeacher, setSelectedTeacher] = useState<Teacher | null>(null);
  const [editMode, setEditMode] = useState(false);
  const [editTeacher, setEditTeacher] = useState<Teacher | null>(null);
  const [classes, setClasses] = useState<any[]>([]);
  const [students, setStudents] = useState<any[]>([]);
  const [gptApiHealth, setGptApiHealth] = useState<{ 
    status: 'live' | 'down' | 'restarting'; 
    responseTime?: number; 
    error?: string;
    restartTime?: number;
  } | null>(null);
  const [generalHealth, setGeneralHealth] = useState<{ 
    status: 'live' | 'down' | 'restarting'; 
    responseTime?: number; 
    error?: string;
    version?: string;
    gitVersion?: string;
    restartTime?: number;
  } | null>(null);
  const [isTestingGptApi, setIsTestingGptApi] = useState(false);
  const [isTestingGeneralHealth, setIsTestingGeneralHealth] = useState(false);
  
  // TTS State
  const [ttsText, setTtsText] = useState('');
  const [isSpeaking, setIsSpeaking] = useState(false);

  const windowWidth = Dimensions.get('window').width;
  const windowHeight = Dimensions.get('window').height;
  const isSmallScreen = windowWidth < 400;
  const isMediumScreen = windowWidth < 600;
  const isLargeScreen = windowWidth >= 600;
  const numColumns = isSmallScreen ? 1 : isMediumScreen ? 2 : 3;

  // TTS Function
  const speakText = async () => {
    if (!ttsText.trim()) {
      Alert.alert('Walang Text', 'Mag-type muna ng text na gusto mong pakinggan.');
      return;
    }

    try {
      setIsSpeaking(true);
      
      // Stop any current speech
      await Speech.stop();
      
      // Add friendly Filipino greeting if text doesn't start with one
      const friendlyText = ttsText.toLowerCase().includes('kamusta') || 
                          ttsText.toLowerCase().includes('magandang') ||
                          ttsText.toLowerCase().includes('hello') || 
                          ttsText.toLowerCase().includes('hi') ||
                          ttsText.toLowerCase().includes('kumusta')
        ? ttsText 
        : `Kumusta! ${ttsText}`;

      // Try multiple Filipino language variants for better accent
      const filipinoOptions = {
        language: 'fil-PH', // Filipino (Philippines) language
        pitch: 1.5 , // Higher pitch for girl voice - more Filipino-like
        rate: 0.6, // Much slower for Filipino children who don't speak English
        quality: Speech.VoiceQuality.Enhanced,
        voice: undefined,
      };

      // Alternative Filipino language codes to try
      const alternativeFilipinoOptions = {
        language: 'tl-PH', // Tagalog Philippines
        pitch: 1.5,
        rate: 0.6,
        quality: Speech.VoiceQuality.Enhanced,
        voice: undefined,
      };

      // Fallback to English with very Filipino-friendly settings
      const englishOptions = {
        language: 'en-US', // English fallback
        pitch: 1.3, // Higher pitch for girl voice
        rate: 0.8, // Very slow for non-English speaking Filipino children
        quality: Speech.VoiceQuality.Enhanced,
        voice: undefined,
      };

      const speechOptions = {
        ...filipinoOptions,
        onStart: () => {
          console.log('TTS started with Filipino language');
        },
        onDone: () => {
          console.log('TTS finished');
          setIsSpeaking(false);
        },
        onStopped: () => {
          console.log('TTS stopped');
          setIsSpeaking(false);
        },
        onError: (error: any) => {
          console.log('Primary Filipino TTS error, trying alternative Filipino:', error);
          // Try alternative Filipino language code
          Speech.speak(friendlyText, {
            ...alternativeFilipinoOptions,
            onStart: () => {
              console.log('TTS started with alternative Filipino language');
            },
            onDone: () => {
              console.log('TTS finished');
              setIsSpeaking(false);
            },
            onStopped: () => {
              console.log('TTS stopped');
              setIsSpeaking(false);
            },
            onError: (altError: any) => {
              console.log('Alternative Filipino TTS error, trying English fallback:', altError);
              // Try with English as final fallback
              Speech.speak(friendlyText, {
                ...englishOptions,
                onStart: () => {
                  console.log('TTS started with English fallback');
                },
                onDone: () => {
                  console.log('TTS finished');
                  setIsSpeaking(false);
                },
                onStopped: () => {
                  console.log('TTS stopped');
                  setIsSpeaking(false);
                },
                onError: (fallbackError: any) => {
                  console.log('English fallback TTS error:', fallbackError);
                  setIsSpeaking(false);
                  Alert.alert('Speech Error', 'Hindi ma-speak ang text. Subukan ulit.');
                }
              });
            }
          });
        }
      };

      await Speech.speak(friendlyText, speechOptions);
    } catch (error) {
      console.error('TTS Error:', error);
      setIsSpeaking(false);
      Alert.alert('Speech Error', 'Hindi ma-speak ang text. Subukan ulit.');
    }
  };

  const stopSpeaking = async () => {
    try {
      await Speech.stop();
      setIsSpeaking(false);
    } catch (error) {
      console.error('Stop speech error:', error);
    }
  };

  // GPT API Health Test Handler
  const handleGptApiHealthTest = async () => {
    setIsTestingGptApi(true);
    try {
      const result = await testGptApiHealth();
      setGptApiHealth(result);
    } catch (error) {
      setGptApiHealth({ status: 'down', error: 'Test failed' });
    } finally {
      setIsTestingGptApi(false);
    }
  };

  // General Health Endpoint Test Handler
  const handleGeneralHealthTest = async () => {
    setIsTestingGeneralHealth(true);
    try {
      const result = await testGeneralHealth();
      setGeneralHealth(result);
    } catch (error) {
      setGeneralHealth({ status: 'down', error: 'Test failed' });
    } finally {
      setIsTestingGeneralHealth(false);
    }
  };

  // Helper to generate next teacher ID
  async function generateNextTeacherId() {
    const snapshot = await get(ref(db, 'Teachers'));
    let maxNum = 0;
    if (snapshot.exists()) {
      Object.values(snapshot.val()).forEach((t: any) => {
        if (t.teacherId && /^MTTG25-\d{3}$/.test(t.teacherId)) {
          const num = parseInt(t.teacherId.split('-')[1], 10);
          if (num > maxNum) maxNum = num;
        }
      });
    }
    return `MTTG25-${String(maxNum + 1).padStart(3, '0')}`;
  }

  // Register teacher handler (mock)
  async function handleRegisterTeacher() {
    if (!newTeacher.name || !newTeacher.email || !newTeacher.contact || !newTeacher.school || !newTeacher.password) {
      Alert.alert('All fields are required');
      return;
    }
    setModalVisible(false);
    try {
      // 1. Create user in Firebase Auth
      const userCredential = await createUserWithEmailAndPassword(auth, newTeacher.email, newTeacher.password!);
      const teacherUid = userCredential.user.uid;
      // 2. Generate system teacher ID
      const teacherId = await generateNextTeacherId();
      // 3. Save teacher details in Realtime DB
      const teacherData = {
        accountId: teacherUid,
        teacherId,
        name: newTeacher.name,
        email: newTeacher.email,
        contact: newTeacher.contact,
        school: newTeacher.school,
        // avgImprovement, numClasses, and numStudents removed for normalization
      };
      await set(ref(db, `Teachers/${teacherUid}`), teacherData);
      // 4. Add UID to Roles/Teacher
      await update(ref(db, 'Roles'), { [`Teacher/${teacherUid}`]: true });
      // 5. DO NOT update local state here! (Removed setTeachers to prevent duplicates)
      Alert.alert('Success', `${newTeacher.name} has been registered as a teacher.`);
      setNewTeacher({ name: '', email: '', contact: '', school: '', password: '', accountId: '', teacherId: '' });
    } catch (error: any) {
      Alert.alert('Registration Failed', error.message || 'Could not register teacher.');
    }
  }

  // Delete teacher handler
  async function handleDeleteTeacher(teacher: Teacher) {
    Alert.alert(
      'Delete Teacher',
      `Are you sure you want to delete ${teacher.name}? This cannot be undone!`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete', style: 'destructive', onPress: async () => {
            try {
              // Remove only the selected teacher from DB
              await remove(ref(db, `Teachers/${teacher.accountId}`));
              await remove(ref(db, `Roles/Teacher/${teacher.accountId}`));
              // Remove only the selected teacher from local state
              setTeachers(prev => prev.filter(t => t.accountId !== teacher.accountId));
              setSelectedTeacher(null);
              setEditTeacher(null);
              setEditMode(false);
              Alert.alert('Deleted', `${teacher.name} has been deleted.`);
            } catch (error) {
              Alert.alert('Error', 'Failed to delete teacher.');
            }
          }
        }
      ]
    );
  }

  

  // Remove the static improvementDistribution and compute it from real data
  // Define green color palette for the bars
  
  

  // Compute improvement distribution from students
  

  // Load teachers from Realtime Database on mount
  useEffect(() => {
    const teachersRef = ref(db, 'Teachers');
    const unsubscribe = onValue(teachersRef, (snapshot) => {
      const data = snapshot.val();
      if (data) {
        setTeachers(Object.values(data));
      } else {
        setTeachers([]);
      }
    });
    return () => unsubscribe();
  }, []);

  // Test both APIs health on mount
  useEffect(() => {
    handleGptApiHealthTest();
    handleGeneralHealthTest();
  }, []);

  // Update restart timer every second
  useEffect(() => {
    let interval: ReturnType<typeof setInterval>;
    if ((gptApiHealth?.status === 'restarting' && gptApiHealth.restartTime) || 
        (generalHealth?.status === 'restarting' && generalHealth.restartTime)) {
      interval = setInterval(() => {
        // Force re-render to update timer
        setIsTestingGptApi(prev => prev);
      }, 1000);
    }
    return () => {
      if (interval) clearInterval(interval);
    };
  }, [gptApiHealth?.status, generalHealth?.status]);

  // Add useEffect to fetch classes
  useEffect(() => {
    const classesRef = ref(db, 'Classes');
    const unsubscribe = onValue(classesRef, (snapshot) => {
      const data = snapshot.val();
      if (data) {
        setClasses(Object.values(data));
      } else {
        setClasses([]);
      }
    });
    return () => unsubscribe();
  }, []);

  // Add useEffect to fetch students
  useEffect(() => {
    const studentsRef = ref(db, 'Students');
    const unsubscribe = onValue(studentsRef, (snapshot) => {
      const data = snapshot.val();
      if (data) {
        setStudents(Object.values(data));
      } else {
        setStudents([]);
      }
    });
    return () => unsubscribe();
  }, []);

  // Replace the stats calculation with real aggregation:
  const teacherStats = teachers.map(teacher => {
    const teacherClasses = classes.filter(cls => cls.teacherId === teacher.teacherId);
    const teacherClassIds = teacherClasses.map(cls => cls.id);
    // Only students with a valid post test
    const teacherStudents = students.filter(
      stu => teacherClassIds.includes(stu.classId) &&
        stu.postScore && (
          (typeof stu.postScore === 'number' && !isNaN(stu.postScore))
          || (typeof stu.postScore === 'object' && (typeof stu.postScore.pattern === 'number' || typeof stu.postScore.numbers === 'number'))
        )
    );
    // Calculate average improvement for this teacher
    let avgImprovement = 0;
    let improvements: number[] = [];
    if (teacherStudents.length > 0) {
      improvements = teacherStudents.map(stu => {
        const pre = typeof stu.preScore === 'number' ? stu.preScore : (stu.preScore?.pattern ?? 0) + (stu.preScore?.numbers ?? 0);
        const post = typeof stu.postScore === 'number' ? stu.postScore : (stu.postScore?.pattern ?? 0) + (stu.postScore?.numbers ?? 0);
        return pre > 0 ? ((post - pre) / pre) * 100 : 0;
      });
      avgImprovement = Math.round(improvements.reduce((a, b) => a + b, 0) / improvements.length);
    }
    // Log for each teacher
    console.log(`Teacher: ${teacher.name}, Students with post test: ${teacherStudents.length}, Improvements: ${JSON.stringify(improvements)}, Avg: ${avgImprovement}`);
    return {
      ...teacher,
      numClasses: teacherClasses.length,
      numStudents: teacherStudents.length,
      avgImprovement,
      hasActiveStudents: teacherStudents.length > 0,
    };
  });

  // For dashboard stats, only include teachers with at least one student with a valid post test
  const activeTeacherStats = teacherStats.filter(t => t.hasActiveStudents);

  // Deduplicate teacherStats by accountId for rendering
  const uniqueTeacherStats = teacherStats.filter(
    (teacher, index, self) =>
      index === self.findIndex(t => t.accountId === teacher.accountId)
  );

  const stats = {
    totalTeachers: teachers.length,
    totalClasses: classes.length,
    totalStudents: students.length,
    avgImprovement: (() => {
      if (activeTeacherStats.length === 0) return 0;
      const avg = Math.round(
        activeTeacherStats.reduce((a, b) => a + (b.avgImprovement ?? 0), 0) / activeTeacherStats.length
      );
      // Log for dashboard
      console.log(
        'Dashboard avgImprovement computation:',
        activeTeacherStats.map(t => ({
          name: t.name,
          avgImprovement: t.avgImprovement
        })),
        'Dashboard avg:', avg
      );
      return avg;
    })(),
    avgPreTest: (() => {
      const preScores = students.map(stu => typeof stu.preScore === 'number' ? stu.preScore : (stu.preScore?.pattern ?? 0) + (stu.preScore?.numbers ?? 0));
      return preScores.length > 0 ? (preScores.reduce((a, b) => a + b, 0) / preScores.length).toFixed(1) : 0;
    })(),
    avgPostTest: (() => {
      const postScores = students.map(stu => typeof stu.postScore === 'number' ? stu.postScore : (stu.postScore?.pattern ?? 0) + (stu.postScore?.numbers ?? 0));
      return postScores.length > 0 ? (postScores.reduce((a, b) => a + b, 0) / postScores.length).toFixed(1) : 0;
    })(),
    passRate: (() => {
      // Example: pass if postScore >= 7
      const passed = students.filter(stu => {
        const post = typeof stu.postScore === 'number' ? stu.postScore : (stu.postScore?.pattern ?? 0) + (stu.postScore?.numbers ?? 0);
        return post >= 7;
      });
      return students.length > 0 ? Math.round((passed.length / students.length) * 100) : 0;
    })(),
    mostImprovedTeacher: activeTeacherStats.reduce((a, b) => ((a.avgImprovement ?? 0) > (b.avgImprovement ?? 0) ? a : b), activeTeacherStats[0] || {}),
    activeTeachers: activeTeacherStats.length,
    inactiveTeachers: teacherStats.length - activeTeacherStats.length,
  };

  return (
    <ImageBackground source={bgImage} style={{ flex: 1, backgroundColor: '#fff' }} imageStyle={{ opacity: 0.7, resizeMode: 'cover' }}>
      <View style={{ ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(255,255,255,0.92)' }} pointerEvents="none" />
      <SafeAreaView style={{ flex: 1 }} edges={['left','right','bottom']}>
        <FlatList
          style={{ width: '100%' }}
          showsVerticalScrollIndicator={false}
          ListHeaderComponent={
                           <View style={{ width: '100%', paddingHorizontal: isSmallScreen ? 8 : 12 }}>
              {/* Enhanced Header */}
              <BlurView intensity={80} tint="light" style={{ borderRadius: 0, marginBottom: 16, overflow: 'hidden' }}>
                <View style={[styles.headerWrap, { backgroundColor: 'rgba(255,255,255,0.95)', borderRadius: 0, shadowColor: '#27ae60', shadowOpacity: 0.15, shadowRadius: 12, shadowOffset: { width: 0, height: 4 } }]}> 
                  <View style={styles.headerRow}>
                    <View>
                                           <Text style={{ fontSize: isSmallScreen ? 20 : 24, fontWeight: '600', color: '#1a1a1a', letterSpacing: 0.5, marginTop:16, marginBottom:-6 }}>Welcome back,</Text>
                       <Text style={{ fontSize: isSmallScreen ? 22 : 26, fontWeight: '800', color: '#27ae60', marginTop: 4, letterSpacing: 0.5 }}>Administrator</Text>
                       <Text style={{ fontSize: isSmallScreen ? 12 : 14, color: '#666', marginTop: 4, fontWeight: '500' }}>Manage your educational platform</Text>
                    </View>
                    <TouchableOpacity style={styles.profileBtn} onPress={() => setShowProfileMenu(true)}>
                      <MaterialCommunityIcons name="account-cog" size={32} color="#27ae60" />
                    </TouchableOpacity>
                  </View>
                </View>
              </BlurView>
              
              {/* Modern 2x2 Stats Grid - Green Theme, White Card */}
              <View style={styles.statsModernCard}>
                <View style={styles.statsModernRow}>
                  <View style={styles.statsModernItem}>
                                         <AntDesign name="user" size={isSmallScreen ? 28 : 32} color="#27ae60" style={styles.statsModernIcon} />
                     <Text style={[styles.statsModernValue, { fontSize: isSmallScreen ? 18 : 22 }]}>{stats.totalTeachers}</Text>
                     <Text style={[styles.statsModernLabel, { fontSize: isSmallScreen ? 11 : 13 }]}>Teachers</Text>
                   </View>
                   <View style={styles.statsModernItem}>
                     <MaterialCommunityIcons name="google-classroom" size={isSmallScreen ? 28 : 32} color="#27ae60" style={styles.statsModernIcon} />
                     <Text style={[styles.statsModernValue, { fontSize: isSmallScreen ? 18 : 22 }]}>{stats.totalClasses}</Text>
                     <Text style={[styles.statsModernLabel, { fontSize: isSmallScreen ? 11 : 13 }]}>Classes</Text>
                   </View>
                 </View>
                 <View style={styles.statsModernRow}>
                   <View style={styles.statsModernItem}>
                     <MaterialCommunityIcons name="account-group" size={isSmallScreen ? 28 : 32} color="#27ae60" style={styles.statsModernIcon} />
                     <Text style={[styles.statsModernValue, { fontSize: isSmallScreen ? 18 : 22 }]}>{stats.totalStudents}</Text>
                     <Text style={[styles.statsModernLabel, { fontSize: isSmallScreen ? 11 : 13 }]}>Students</Text>
                   </View>
                   <View style={styles.statsModernItem}>
                     <MaterialIcons name="trending-up" size={isSmallScreen ? 28 : 32} color="#27ae60" style={styles.statsModernIcon} />
                     <Text style={[styles.statsModernValue, { fontSize: isSmallScreen ? 18 : 22 }]}>{formatImprovement(stats.avgImprovement)}</Text>
                     <Text style={[styles.statsModernLabel, { fontSize: isSmallScreen ? 11 : 13 }]}>Avg. Impr.</Text>
                  </View>
                </View>
              </View>
              
              {/* Text-to-Speech Testing Section */}
              <View style={styles.ttsCard}>
                <View style={styles.ttsHeader}>
                  <MaterialCommunityIcons name="microphone-message" size={isSmallScreen ? 20 : 24} color="#27ae60" />
                  <Text style={[styles.ttsTitle, { fontSize: isSmallScreen ? 14 : 16 }]}>Text-to-Speech Testing</Text>
                </View>
                
                <View style={styles.ttsContent}>
                  <Text style={[styles.ttsSubtitle, { fontSize: isSmallScreen ? 12 : 14 }]}>
                    Test ang friendly Filipino girl voice para sa mga batang hindi marunong mag-English
                  </Text>
                  
                  <TextInput
                    style={[styles.ttsInput, { fontSize: isSmallScreen ? 14 : 16 }]}
                    placeholder="Mag-type ng Filipino text (hal. 'Kumusta mga bata! Mag-aral tayo ng math! Isa, dalawa, tatlo!')"
                    placeholderTextColor="#999"
                    value={ttsText}
                    onChangeText={setTtsText}
                    multiline
                    numberOfLines={3}
                    textAlignVertical="top"
                  />
                  
                  <View style={styles.ttsButtons}>
                    <TouchableOpacity
                      style={[styles.ttsButton, styles.ttsSpeakButton, isSpeaking && styles.ttsButtonDisabled]}
                      onPress={speakText}
                      disabled={isSpeaking}
                    >
                      <MaterialCommunityIcons 
                        name={isSpeaking ? "stop" : "play"} 
                        size={isSmallScreen ? 18 : 20} 
                        color="#fff" 
                      />
                      <Text style={[styles.ttsButtonText, { fontSize: isSmallScreen ? 12 : 14 }]}>
                        {isSpeaking ? 'Speaking...' : 'Speak'}
                      </Text>
                    </TouchableOpacity>
                    
                    {isSpeaking && (
                      <TouchableOpacity
                        style={[styles.ttsButton, styles.ttsStopButton]}
                        onPress={stopSpeaking}
                      >
                        <MaterialCommunityIcons name="stop" size={isSmallScreen ? 18 : 20} color="#fff" />
                        <Text style={[styles.ttsButtonText, { fontSize: isSmallScreen ? 12 : 14 }]}>Stop</Text>
                      </TouchableOpacity>
                    )}
                  </View>
                  
                  <Text style={[styles.ttsNote, { fontSize: isSmallScreen ? 10 : 12 }]}>
                    💡 Ang boses ay magdadagdag ng "Kumusta!" at gagamit ng tunay na Filipino accent na madaling maintindihan ng mga batang hindi marunong mag-English. Mabagal at malinaw ang pagbigkas.
                  </Text>
                </View>
              </View>
              
                                                           {/* Combined API Health Status Section */}
                <View style={styles.apiHealthCard}>
                  <View style={styles.apiHealthHeader}>
                                         <MaterialCommunityIcons name="server-network" size={isSmallScreen ? 20 : 24} color="#27ae60" />
                     <Text style={[styles.apiHealthTitle, { fontSize: isSmallScreen ? 14 : 16 }]}>API Health Status</Text>
                     <TouchableOpacity 
                       style={[styles.apiHealthTestBtn, (isTestingGptApi || isTestingGeneralHealth) && styles.apiHealthTestBtnDisabled]} 
                       onPress={() => {
                         handleGptApiHealthTest();
                         handleGeneralHealthTest();
                       }}
                       disabled={isTestingGptApi || isTestingGeneralHealth}
                     >
                       <MaterialIcons name="refresh" size={isSmallScreen ? 18 : 20} color="#fff" />
                       <Text style={[styles.apiHealthTestBtnText, { fontSize: isSmallScreen ? 10 : 12 }]}>
                         {(isTestingGptApi || isTestingGeneralHealth) ? 'Testing...' : 'Test All'}
                       </Text>
                     </TouchableOpacity>
                  </View>
                  
                  <View style={styles.apiHealthContent}>
                    {/* GPT Endpoint Row */}
                    <View style={styles.apiHealthRow}>
                                             <View style={styles.apiHealthEndpointHeader}>
                         <MaterialCommunityIcons name="robot" size={isSmallScreen ? 18 : 20} color="#27ae60" />
                         <Text style={[styles.apiHealthEndpointTitle, { fontSize: isSmallScreen ? 13 : 15 }]}>GPT Endpoint</Text>
                       </View>
                      
                      {gptApiHealth ? (
                        <View style={styles.apiHealthEndpointStatus}>
                                                     <View style={[styles.apiHealthIndicator, 
                             gptApiHealth.status === 'live' 
                               ? styles.apiHealthLive 
                               : gptApiHealth.status === 'restarting' 
                                 ? styles.apiHealthRestarting 
                                 : styles.apiHealthDown
                           ]}>
                             <MaterialIcons 
                               name={
                                 gptApiHealth.status === 'live' 
                                   ? 'check-circle' 
                                   : gptApiHealth.status === 'restarting'
                                     ? 'refresh'
                                     : 'error'
                               } 
                               size={16} 
                               color="#fff" 
                             />
                             <Text style={styles.apiHealthStatusText}>
                               {gptApiHealth.status === 'live' 
                                 ? 'LIVE' 
                                 : gptApiHealth.status === 'restarting'
                                   ? 'RESTARTING'
                                   : 'DOWN'
                               }
                             </Text>
                           </View>
                           {gptApiHealth.status === 'restarting' && gptApiHealth.restartTime && (
                             <Text style={styles.apiHealthRestartTime}>
                               Restarting... {Math.round((Date.now() - gptApiHealth.restartTime) / 1000)}s
                             </Text>
                           )}
                          
                          {gptApiHealth.status === 'live' && gptApiHealth.responseTime && (
                            <Text style={styles.apiHealthResponseTimeInline}>
                              {gptApiHealth.responseTime}ms
                            </Text>
                          )}
                        </View>
                      ) : (
                        <Text style={styles.apiHealthLoadingText}>Testing...</Text>
                      )}
                    </View>
                    
                    {/* General Health Endpoint Row */}
                    <View style={styles.apiHealthRow}>
                                             <View style={styles.apiHealthEndpointHeader}>
                         <MaterialCommunityIcons name="server" size={isSmallScreen ? 18 : 20} color="#27ae60" />
                         <Text style={[styles.apiHealthEndpointTitle, { fontSize: isSmallScreen ? 13 : 15 }]}>General Health</Text>
                       </View>
                      
                      {generalHealth ? (
                        <View style={styles.apiHealthEndpointStatus}>
                          <View style={styles.apiHealthInfoRow}>
                                                         <View style={[styles.apiHealthIndicator, 
                               generalHealth.status === 'live' 
                                 ? styles.apiHealthLive 
                                 : generalHealth.status === 'restarting' 
                                   ? styles.apiHealthRestarting 
                                   : styles.apiHealthDown
                             ]}>
                               <MaterialIcons 
                                 name={
                                   generalHealth.status === 'live' 
                                     ? 'check-circle' 
                                     : generalHealth.status === 'restarting'
                                       ? 'refresh'
                                       : 'error'
                                 } 
                                 size={16} 
                                 color="#fff" 
                               />
                               <Text style={styles.apiHealthStatusText}>
                                 {generalHealth.status === 'live' 
                                   ? 'LIVE' 
                                   : generalHealth.status === 'restarting'
                                     ? 'RESTARTING'
                                     : 'DOWN'
                                 }
                               </Text>
                             </View>
                             {generalHealth.status === 'restarting' && generalHealth.restartTime && (
                               <Text style={styles.apiHealthRestartTime}>
                                 Restarting... {Math.round((Date.now() - generalHealth.restartTime) / 1000)}s
                               </Text>
                             )}
                            
                                                         {generalHealth.status === 'live' && (
                               <View style={[styles.apiHealthDetails, {
                                 flexDirection: isSmallScreen ? 'column' : 'row',
                                 gap: isSmallScreen ? 8 : 16
                               }]}>
                                 {generalHealth.version && (
                                   <View style={styles.apiHealthDetailItem}>
                                     <Text style={[styles.apiHealthDetailLabel, { 
                                       fontSize: isSmallScreen ? 9 : 10 
                                     }]}>Version:</Text>
                                     <Text style={[styles.apiHealthDetailValue, { 
                                       fontSize: isSmallScreen ? 10 : 12 
                                     }]}>{generalHealth.version}</Text>
                                   </View>
                                 )}
                                 {generalHealth.gitVersion && (
                                   <View style={styles.apiHealthDetailItem}>
                                     <Text style={[styles.apiHealthDetailLabel, { 
                                       fontSize: isSmallScreen ? 9 : 10 
                                     }]}>Git:</Text>
                                     <Text style={[styles.apiHealthDetailValue, { 
                                       fontSize: isSmallScreen ? 10 : 12 
                                     }]}>{generalHealth.gitVersion}</Text>
                                   </View>
                                 )}
                                 {generalHealth.responseTime && (
                                   <View style={styles.apiHealthDetailItem}>
                                     <Text style={[styles.apiHealthDetailLabel, { 
                                       fontSize: isSmallScreen ? 9 : 10 
                                     }]}>Response:</Text>
                                     <Text style={[styles.apiHealthDetailValue, { 
                                       fontSize: isSmallScreen ? 10 : 12 
                                     }]}>{generalHealth.responseTime}ms</Text>
                                   </View>
                                 )}
                               </View>
                             )}
                          </View>
                          
                          {generalHealth.status === 'down' && generalHealth.error && (
                            <View style={styles.apiHealthError}>
                              <Text style={styles.apiHealthErrorLabel}>Error:</Text>
                              <Text style={styles.apiHealthErrorText}>{generalHealth.error}</Text>
                            </View>
                          )}
                        </View>
                      ) : (
                        <Text style={styles.apiHealthLoadingText}>Testing...</Text>
                      )}
                    </View>
                  </View>
                </View>
              
              {/* Enhanced Section Header */}
                             <View style={styles.sectionHeader}>
                 <View style={styles.sectionTitleContainer}>
                   <Text style={[styles.sectionTitle, { 
                     fontSize: isSmallScreen ? 18 : 20 
                   }]}>All Teachers</Text>
                 </View>
                 <TouchableOpacity onPress={() => setModalVisible(true)} style={[styles.addButton, {
                   paddingHorizontal: isSmallScreen ? 12 : 16,
                   paddingVertical: isSmallScreen ? 6 : 8
                 }]}>
                   <AntDesign name="user-add" size={isSmallScreen ? 18 : 20} color="#fff" />
                   <Text style={[styles.addButtonText, { 
                     fontSize: isSmallScreen ? 12 : 14 
                   }]}>Add Teacher</Text>
                 </TouchableOpacity>
               </View>
            </View>
          }
          data={uniqueTeacherStats}
          keyExtractor={(item, index) => item.accountId || item.teacherId || String(index)}
          numColumns={2}
          columnWrapperStyle={{ justifyContent: 'flex-start' }}
                     contentContainerStyle={{ paddingHorizontal: isSmallScreen ? 4 : 8, paddingBottom: 40 }}
          renderItem={({ item }) => (
                         <TouchableOpacity
               onPress={() => { setSelectedTeacher(item); setEditTeacher(item); setEditMode(false); }}
               activeOpacity={0.85}
               style={[styles.teacherGridCard, { 
                 width: isSmallScreen ? '48%' : '47.5%',
                 padding: isSmallScreen ? 12 : 16,
                 marginRight: isSmallScreen ? 4 : 8,
                 marginLeft: isSmallScreen ? 2 : 4
               }]}
             >
              <View style={styles.teacherCardHeader}>
                                 <View style={[styles.teacherAvatar, { 
                   width: isSmallScreen ? 32 : 40, 
                   height: isSmallScreen ? 32 : 40, 
                   borderRadius: isSmallScreen ? 16 : 20 
                 }]}>
                   <Text style={[styles.teacherAvatarText, { 
                     fontSize: isSmallScreen ? 14 : 18 
                   }]}>{item.name.charAt(0).toUpperCase()}</Text>
                 </View>
                                 <View style={styles.teacherCardInfo}>
                   <Text style={[styles.teacherGridName, { 
                     fontSize: isSmallScreen ? 13 : 15 
                   }]} numberOfLines={1}>{item.name}</Text>
                   <Text style={[styles.teacherGridSchool, { 
                     fontSize: isSmallScreen ? 10 : 12 
                   }]} numberOfLines={1}>{item.school}</Text>
                   <Text style={[styles.teacherGridId, { 
                     fontSize: isSmallScreen ? 8 : 10 
                   }]}>ID: {item.teacherId}</Text>
                 </View>
              </View>
                               <View style={styles.teacherCardStats}>
                   <View style={styles.teacherStatItem}>
                     <MaterialCommunityIcons name="account-group" size={isSmallScreen ? 14 : 16} color="#27ae60" />
                     <Text style={[styles.teacherStatValue, { 
                       fontSize: isSmallScreen ? 14 : 16 
                     }]}>{(item.numStudents).toString().padStart(1,'0')}</Text>
                     <Text
                       style={[styles.teacherStatLabel, { 
                         maxWidth: isSmallScreen ? 70 : 90, 
                         textAlign: 'center',
                         fontSize: isSmallScreen ? 8 : 10
                       }]}
                       numberOfLines={1}
                       ellipsizeMode="tail"
                     >
                       Students
                     </Text>
                   </View>
                   <View style={styles.teacherStatItem}>
                     <MaterialCommunityIcons name="google-classroom" size={isSmallScreen ? 14 : 16} color="#27ae60" />
                     <Text style={[styles.teacherStatValue, { 
                       fontSize: isSmallScreen ? 14 : 16 
                     }]}>{(item.numClasses).toString().padStart(1,'0')}</Text>
                     <Text
                       style={[styles.teacherStatLabel, { 
                         maxWidth: isSmallScreen ? 70 : 90, 
                         textAlign: 'center',
                         fontSize: isSmallScreen ? 8 : 10
                       }]}
                       numberOfLines={1}
                       ellipsizeMode="tail"
                     >
                       Classes
                     </Text>
                   </View>
                   <View style={styles.teacherStatItem}>
                     <MaterialIcons
                       name={item.avgImprovement > 0 ? 'trending-up' : item.avgImprovement < 0 ? 'trending-down' : 'trending-flat'}
                       size={isSmallScreen ? 14 : 16}
                       color={item.avgImprovement > 0 ? '#27ae60' : item.avgImprovement < 0 ? '#ff5a5a' : '#ffe066'}
                     />
                     <Text
                       style={[
                         styles.teacherStatValue,
                         { 
                           color: item.avgImprovement > 0 ? '#27ae60' : item.avgImprovement < 0 ? '#ff5a5a' : '#ffe066',
                           fontSize: isSmallScreen ? 14 : 16
                         },
                       ]}
                     >
                       {formatImprovement(item.avgImprovement)}
                     </Text>
                     <Text
                       style={[styles.teacherStatLabel, { 
                         maxWidth: isSmallScreen ? 70 : 90, 
                         textAlign: 'center',
                         fontSize: isSmallScreen ? 8 : 10
                       }]}
                       numberOfLines={1}
                       ellipsizeMode="tail"
                     >
                       Improvement
                     </Text>
                   </View>
                 </View>
            </TouchableOpacity>
          )}
        />
        {/* Register Teacher Modal */}
        <Modal visible={modalVisible} transparent animationType="fade" onRequestClose={() => setModalVisible(false)}>
          <View style={styles.modalOverlay}>
            <View style={styles.modalBox}>
              <View style={styles.modalHeader}>
                <MaterialCommunityIcons name="account-plus" size={28} color="#27ae60" style={{ marginRight: 12 }} />
                <Text style={styles.modalTitle}>Register New Teacher</Text>
              </View>
              <ScrollView style={styles.modalContent} contentContainerStyle={{ paddingBottom: 8 }} showsVerticalScrollIndicator={false}>
                <View style={styles.inputGroup}>
                  <Text style={styles.modalLabel}>Full Name</Text>
                  <TextInput style={styles.modalInput} placeholder="Enter full name" value={newTeacher.name} onChangeText={v => setNewTeacher(t => ({ ...t, name: v }))} />
                </View>
                <View style={styles.inputGroup}>
                  <Text style={styles.modalLabel}>Email</Text>
                  <TextInput style={styles.modalInput} placeholder="Enter email" value={newTeacher.email} onChangeText={v => setNewTeacher(t => ({ ...t, email: v }))} keyboardType="email-address" />
                </View>
                <View style={styles.inputGroup}>
                  <Text style={styles.modalLabel}>Contact Number</Text>
                  <TextInput style={styles.modalInput} placeholder="Enter contact number" value={newTeacher.contact} onChangeText={v => setNewTeacher(t => ({ ...t, contact: v }))} keyboardType="phone-pad" />
                </View>
                <View style={styles.inputGroup}>
                  <Text style={styles.modalLabel}>School</Text>
                  <TextInput style={styles.modalInput} placeholder="Enter school" value={newTeacher.school} onChangeText={v => setNewTeacher(t => ({ ...t, school: v }))} />
                </View>
                <View style={styles.inputGroup}>
                  <Text style={styles.modalLabel}>Password</Text>
                  <TextInput style={styles.modalInput} placeholder="Enter password" value={newTeacher.password} onChangeText={v => setNewTeacher(t => ({ ...t, password: v }))} secureTextEntry />
                </View>
              </ScrollView>
              <View style={styles.modalBtnRow}>
                <TouchableOpacity style={styles.modalBtn} onPress={() => setModalVisible(false)}>
                  <Text style={styles.modalBtnText}>Cancel</Text>
                </TouchableOpacity>
                <TouchableOpacity style={[styles.modalBtn, styles.modalBtnPrimary]} onPress={handleRegisterTeacher}>
                  <Text style={[styles.modalBtnText, styles.modalBtnTextPrimary]}>Register</Text>
                </TouchableOpacity>
              </View>
            </View>
          </View>
        </Modal>
        {/* Teacher Details Modal */}
        <Modal visible={!!selectedTeacher} transparent animationType="fade" onRequestClose={() => setSelectedTeacher(null)}>
          <View style={styles.modalOverlay}>
            <View style={[styles.modalBox, { padding: 0, overflow: 'hidden', shadowOpacity: 0.18, shadowRadius: 24, maxWidth: 370, width: '92%' }]}> 
              {/* Enhanced Header Bar */}
              <LinearGradient colors={['#27ae60', '#2ecc71']} style={{ paddingVertical: 20, alignItems: 'center', borderTopLeftRadius: 22, borderTopRightRadius: 22, flexDirection: 'row', justifyContent: 'center', position: 'relative' }}>
                <MaterialCommunityIcons name="account-tie" size={28} color="#fff" style={{ marginRight: 10 }} />
                <Text style={{ color: '#fff', fontSize: 20, fontWeight: 'bold', letterSpacing: 0.5 }}>Teacher Details</Text>
              </LinearGradient>
              <ScrollView style={{ maxHeight: 480, width: '100%' }} contentContainerStyle={{ padding: 24, backgroundColor: 'rgba(255,255,255,0.98)', borderBottomLeftRadius: 22, borderBottomRightRadius: 22 }} showsVerticalScrollIndicator={false}>
              {editTeacher && (
                <>
                    <View style={styles.teacherIdSection}>
                      <Text style={styles.teacherIdLabel}>Teacher ID</Text>
                      <View style={styles.teacherIdContainer}>
                        <Text style={styles.teacherIdText}>{editTeacher.teacherId}</Text>
                      </View>
                      <Text style={styles.teacherIdLabel}>Account ID</Text>
                      <View style={styles.teacherIdContainer}>
                        <Text style={styles.accountIdText}>{editTeacher.accountId}</Text>
                      </View>
                    </View>
                    <View style={styles.divider} />
                    <View style={styles.inputGroup}>
                      <Text style={styles.modalLabel}>Full Name</Text>
                      <TextInput style={[styles.modalInput, editMode && styles.modalInputEditable]} editable={editMode} value={editTeacher.name} onChangeText={v => setEditTeacher(t => t ? { ...t, name: v } : null)} placeholder="Full Name" />
                    </View>
                    <View style={styles.inputGroup}>
                      <Text style={styles.modalLabel}>Email</Text>
                      <TextInput style={[styles.modalInput, editMode && styles.modalInputEditable]} editable={editMode} value={editTeacher.email} onChangeText={v => setEditTeacher(t => t ? { ...t, email: v } : null)} placeholder="Email" />
                    </View>
                    <View style={styles.inputGroup}>
                      <Text style={styles.modalLabel}>Contact Number</Text>
                      <TextInput style={[styles.modalInput, editMode && styles.modalInputEditable]} editable={editMode} value={editTeacher.contact} onChangeText={v => setEditTeacher(t => t ? { ...t, contact: v } : null)} placeholder="Contact Number" />
                    </View>
                    <View style={styles.inputGroup}>
                      <Text style={styles.modalLabel}>School</Text>
                      <TextInput style={[styles.modalInput, editMode && styles.modalInputEditable]} editable={editMode} value={editTeacher.school} onChangeText={v => setEditTeacher(t => t ? { ...t, school: v } : null)} placeholder="School" />
                    </View>
                    <View style={styles.divider} />
                    <View style={styles.teacherStatsGrid}>
                      {[
                        { label: 'Classes', value: editTeacher.numClasses ?? 0, icon: 'google-classroom', color: '#27ae60' },
                        { label: 'Students', value: editTeacher.numStudents ?? 0, icon: 'account-group', color: '#27ae60' },
                        { label: 'Avg. Improvement', value: formatImprovement(editTeacher.avgImprovement ?? 0), icon: 'trending-up', color: (editTeacher.avgImprovement ?? 0) > 0 ? '#27ae60' : (editTeacher.avgImprovement ?? 0) < 0 ? '#ff5a5a' : '#ffe066' }
                      ].map((stat, idx) => (
                        <View key={stat.label + '-' + idx} style={styles.teacherStatCard}>
                          <MaterialCommunityIcons name={stat.icon as any} size={20} color={stat.color} style={{ marginBottom: 4 }} />
                          <Text style={[styles.teacherStatValue, { color: stat.color }]}>{stat.value}</Text>
                          <Text style={[styles.teacherStatLabel, { maxWidth: 90, textAlign: 'center' }]} numberOfLines={1} ellipsizeMode="tail">{stat.label}</Text>
                        </View>
                      ))}
                    </View>
                    <View style={styles.modalActionButtons}>
                      <TouchableOpacity style={[styles.modalBtn, styles.modalBtnSecondary]} onPress={() => { setSelectedTeacher(null); setEditMode(false); }}>
                        <Text style={[styles.modalBtnText, styles.modalBtnTextSecondary]}>Close</Text>
                      </TouchableOpacity>
                      {!editMode ? (
                        <TouchableOpacity style={[styles.modalBtn, styles.modalBtnPrimary]} onPress={() => setEditMode(true)}>
                          <Text style={[styles.modalBtnText, styles.modalBtnTextPrimary]}>Edit</Text>
                        </TouchableOpacity>
                      ) : (
                        <TouchableOpacity style={[styles.modalBtn, styles.modalBtnPrimary]} onPress={async () => {
                          try {
                            const current = teachers.find(t => t.accountId === editTeacher.accountId);
                            if (!current) throw new Error('Teacher not found');
                            const updated = {
                              ...current,
                              name: editTeacher.name,
                              email: editTeacher.email,
                              contact: editTeacher.contact,
                              school: editTeacher.school,
                            };
                            await set(ref(db, `Teachers/${editTeacher.accountId}`), updated);
                            setTeachers(prev => prev.map(t => t.accountId === editTeacher.accountId ? updated : t));
                            setSelectedTeacher(null);
                            setEditMode(false);
                          } catch (error) {
                            Alert.alert('Error', 'Failed to save changes.');
                          }
                        }}>
                          <Text style={[styles.modalBtnText, styles.modalBtnTextPrimary]}>Save</Text>
                        </TouchableOpacity>
                      )}
                      <TouchableOpacity style={[styles.modalBtn, styles.modalBtnDanger]} onPress={() => handleDeleteTeacher(editTeacher)}>
                        <Text style={[styles.modalBtnText, styles.modalBtnTextDanger]}>Delete</Text>
                      </TouchableOpacity>
                    </View>
                </>
              )}
              </ScrollView>
            </View>
          </View>
        </Modal>
        {/* Remove the Modal for profile menu. Instead, add this just before </SafeAreaView> at the end of the main return: */}
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
                    await auth.signOut();
                    router.replace('/RoleSelection');
                  } catch (e) {
                    Alert.alert('Logout Failed', 'Could not log out.');
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
      </SafeAreaView>
    </ImageBackground>
  );
}

const styles = StyleSheet.create({
  scrollContent: {
    alignItems: 'center',
    paddingBottom: 40,
    paddingHorizontal: 20,
    width: '100%',
    minHeight: '100%',
  },
  headerWrap: {
    width: '100%',
    paddingTop: 8,
    paddingBottom: 20,
    backgroundColor: 'rgba(255,255,255,0.96)',
    borderBottomLeftRadius: 28,
    borderBottomRightRadius: 28,
    marginBottom: 24,
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
    paddingHorizontal: 28,
    marginTop: 0,
    marginBottom: 0,
  },
  welcome: {
    fontSize: 23,
    fontWeight: '600',
    color: '#222',
    letterSpacing: 0.5,
  },
  adminName: {
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
  statsRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    width: '100%',
    marginBottom: 24,
    gap: 12,
    alignSelf: 'center',
  },
  statsCard: {
    flex: 1,
    minWidth: 90,
    maxWidth: 140,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 18,
    paddingVertical: 14,
    marginBottom: 0,
    shadowColor: '#27ae60',
    shadowOpacity: 0.10,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 2 },
    elevation: 4,
  },
  statsIcon: {
    marginBottom: 4,
  },
  statsIconContainer: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(255,255,255,0.8)',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 8,
    shadowColor: '#000',
    shadowOpacity: 0.1,
    shadowRadius: 4,
    shadowOffset: { width: 0, height: 2 },
    elevation: 2,
  },
  statsValue: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#222',
    marginBottom: 2,
  },
  statsLabel: {
    fontSize: 13,
    color: '#444',
    fontWeight: '600',
    textAlign: 'center',
  },
  registerBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#27ae60',
    borderRadius: 16,
    paddingVertical: 14,
    paddingHorizontal: 20,
    alignSelf: 'center',
    marginBottom: 24,
    marginTop: 0,
    gap: 10,
    shadowColor: '#27ae60',
    shadowOpacity: 0.13,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 2 },
  },
  registerBtnText: {
    color: '#fff',
    fontWeight: 'bold',
    fontSize: 16,
    marginLeft: 6,
  },
  sectionTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#27ae60',
    marginTop: 11,
    marginBottom: 12,
    alignSelf: 'flex-start',
  },
  teacherGridCard: {
    width: '47.5%',
    backgroundColor: '#fff',
    borderRadius: 20,
    padding: 16,
    marginRight: 8,
    marginLeft: 4,
    marginBottom: 16,
    elevation: 3,
    shadowColor: '#27ae60',
    shadowOpacity: 0.12,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 3 },
  },
  teacherCardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
  },
  teacherAvatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#27ae60',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  teacherAvatarText: {
    color: '#fff',
    fontSize: 18,
    fontWeight: 'bold',
  },
  teacherCardInfo: {
    flex: 1,
  },
  teacherCardStats: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  teacherStatItem: {
    alignItems: 'center',
    flex: 1,
  },
  teacherStatValue: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#27ae60',
    marginTop: 2,
  },
  teacherStatLabel: {
    fontSize: 10,
    color: '#666',
    fontWeight: '500',
    marginTop: 2,
  },
  teacherGridName: {
    fontWeight: 'bold',
    fontSize: 15,
    color: '#222',
    marginBottom: 0,
  },
  teacherGridSchool: {
    color: '#888',
    fontSize: 12,
    fontWeight: '600',
    marginBottom: 2,
  },
  teacherGridId: {
    color: '#888',
    fontSize: 10,
    fontWeight: '600',
    marginBottom: 2,
  },
  teacherGridStatsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginBottom: 2,
  },
  teacherGridStat: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
  },
  teacherGridStatNum: {
    fontWeight: 'bold',
    fontSize: 15,
    color: '#27ae60',
    marginLeft: 2,
  },
  teacherGridImprovementRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginTop: 2,
  },
  teacherGridImprovementText: {
    fontWeight: 'bold',
    fontSize: 13,
    color: '#27ae60',
    marginLeft: -3,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.18)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  modalBox: {
    width: Dimensions.get('window').width < 400 ? '98%' : '85%',
    maxWidth: 420,
    backgroundColor: 'rgba(255,255,255,0.98)',
    borderRadius: 22,
    padding: Dimensions.get('window').width < 400 ? 18 : 32,
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
    marginBottom: 0,
    textAlign: 'center',
  },
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 20,
    paddingBottom: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#e0e0e0',
  },
  modalContent: {
    marginBottom: 20,
  },
  inputGroup: {
    marginBottom: 16,
  },
  modalInput: {
    backgroundColor: '#f8f9fa',
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 12,
    fontSize: 15,
    color: '#222',
    borderWidth: 1,
    borderColor: '#e9ecef',
    marginTop: 4,
  },
  modalBtnRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 12,
    marginTop: 6,
  },
  modalBtn: {
    backgroundColor: '#f8f9fa',
    borderRadius: 12,
    paddingVertical: 12,
    paddingHorizontal: 24,
    borderWidth: 1,
    borderColor: '#e9ecef',
    flex: 1,
    alignItems: 'center',
  },
  modalBtnPrimary: {
    backgroundColor: '#27ae60',
    borderColor: '#27ae60',
  },
  modalBtnSecondary: {
    backgroundColor: '#f8f9fa',
    borderColor: '#e9ecef',
  },
  modalBtnDanger: {
    backgroundColor: '#ff5a5a',
    borderColor: '#ff5a5a',
  },
  modalActionButtons: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 12,
    marginTop: 16,
  },
  modalBtnText: {
    color: '#444',
    fontWeight: 'bold',
    fontSize: 14,
  },
  modalBtnTextPrimary: {
    color: '#fff',
  },
  modalBtnTextSecondary: {
    color: '#666',
  },
  modalBtnTextDanger: {
    color: '#fff',
  },
  moreStatsRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    width: '100%',
    marginBottom: 16,
    gap: 10,
    alignSelf: 'center',
  },
  moreStatsCard: {
    flex: 1,
    minWidth: 70,
    maxWidth: 110,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 14,
    backgroundColor: '#f3f3f3',
    paddingVertical: 12,
    marginBottom: 0,
    marginHorizontal: 2,
    elevation: 1,
  },
  moreStatsLabel: {
    fontSize: 12,
    color: '#888',
    fontWeight: '600',
    marginBottom: 2,
  },
  moreStatsValue: {
    fontSize: 16,
    color: '#27ae60',
    fontWeight: 'bold',
  },
  top3Card: {
    backgroundColor: '#e0ffe6',
    borderRadius: 16,
    padding: 18,
    marginBottom: 16,
    width: '100%',
    alignSelf: 'center',
    elevation: 2,
  },
  top3Title: {
    fontSize: 14,
    color: '#888',
    fontWeight: '600',
    marginBottom: 12,
  },
  top3List: {
    gap: 12,
  },
  top3Item: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 4,
  },
  top3First: {
    backgroundColor: 'rgba(39, 174, 96, 0.1)',
    borderRadius: 12,
    padding: 8,
    marginHorizontal: -8,
  },
  top3Rank: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: '#fff',
    alignItems: 'center',
    justifyContent: 'center',
  },
  top3RankText: {
    fontWeight: 'bold',
    fontSize: 14,
    color: '#222',
  },
  top3RankTextFirst: {
    backgroundColor: '#27ae60',
    color: '#fff',
  },
  top3Info: {
    flex: 1,
  },
  top3Name: {
    fontWeight: 'bold',
    fontSize: 16,
    color: '#222',
    marginBottom: 2,
  },
  top3NameFirst: {
    color: '#27ae60',
    fontSize: 18,
  },
  top3School: {
    color: '#888',
    fontSize: 13,
    fontWeight: '600',
    marginBottom: 2,
  },
  top3SchoolFirst: {
    color: '#27ae60',
  },
  top3Improvement: {
    fontSize: 14,
    color: '#222',
    fontWeight: '600',
  },
  top3ImprovementFirst: {
    color: '#27ae60',
  },
  teacherStat: {
    fontSize: 14,
    color: '#27ae60',
    fontWeight: '600',
    marginBottom: 2,
  },
  modalLabel: {
    fontSize: 15,
    color: '#27ae60',
    fontWeight: '600',
    marginBottom: 4,
    marginLeft: 2,
  },
  teacherIdSection: {
    marginBottom: 16,
  },
  teacherIdLabel: {
    color: '#666',
    fontSize: 13,
    fontWeight: '600',
    marginBottom: 4,
  },
  teacherIdContainer: {
    backgroundColor: '#f8f9fa',
    borderRadius: 8,
    padding: 12,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: '#e9ecef',
  },
  teacherIdText: {
    color: '#27ae60',
    fontWeight: 'bold',
    fontSize: 15,
  },
  accountIdText: {
    color: '#666',
    fontSize: 13,
    fontFamily: 'monospace',
  },
  divider: {
    borderBottomWidth: 1,
    borderColor: '#e6e6e6',
    marginBottom: 16,
  },
  modalInputEditable: {
    backgroundColor: '#f0f8f0',
    borderColor: '#27ae60',
  },
  teacherStatsGrid: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 16,
  },
  teacherStatCard: {
    alignItems: 'center',
    flex: 1,
    backgroundColor: '#f8f9fa',
    borderRadius: 12,
    padding: 12,
    marginHorizontal: 4,
  },
  chartContainer: {
    backgroundColor: 'rgba(255,255,255,0.9)',
    borderRadius: 16,
    padding: 8,
    marginTop: 18,
    marginVertical: 8,
    shadowColor: '#27ae60',
    shadowOpacity: 0.1,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 2 },
    elevation: 3,
  },
  chartHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 16,
  },
  chartTitle: {
    fontWeight: 'bold',
    marginTop: 16,
    marginBottom: -12,
    fontSize: 20,
    color: '#27ae60',
  },
  barContainer: {
    alignItems: 'center',
    justifyContent: 'flex-end',
    height: 100,
  },
  bar: {
    borderRadius: 8,
    marginBottom: 8,
  },
  barLabel: {
    color: '#222',
    fontWeight: '600',
    textAlign: 'center',
    marginBottom: 2,
    fontSize: 12,
  },
  barValue: {
    color: '#888',
    textAlign: 'center',
    fontWeight: '500',
  },
  chartDescription: {
    fontSize: 11,
    color: '#666',
    marginTop: 8,
    marginBottom: 8,
    textAlign: 'center',
    fontStyle: 'italic',
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 24,
    marginBottom: 16,
    paddingHorizontal: 4,
  },
  sectionTitleContainer: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  addButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#27ae60',
    borderRadius: 20,
    paddingHorizontal: 16,
    paddingVertical: 8,
    shadowColor: '#27ae60',
    shadowOpacity: 0.3,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 2 },
    elevation: 4,
  },
  addButtonText: {
    color: '#fff',
    fontWeight: '600',
    fontSize: 14,
    marginLeft: 6,
  },
  statsModernCard: { 
    backgroundColor: '#fff', 
    marginTop: -22, 
    borderRadius: 20, 
    padding: 18, 
    marginVertical: 0, 
    shadowColor: '#27ae60', 
    shadowOpacity: 0.08, 
    shadowRadius: 12, 
    shadowOffset: { width: 0, height: 4 }, 
    elevation: 3,
  },
  statsModernRow: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 8, },
  statsModernItem: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingVertical: 10, },
  statsModernIcon: { marginBottom: 2, },
  statsModernValue: { fontSize: 22, fontWeight: 'bold', color: '#27ae60', marginBottom: 2, },
  statsModernLabel: { fontSize: 13, color: '#666', fontWeight: '600', },
  // API Health Test Styles
  apiHealthCard: {
    backgroundColor: '#fff',
    borderRadius: 16,
    padding: 16,
    marginTop: 16,
    marginBottom: 8,
    shadowColor: '#27ae60',
    shadowOpacity: 0.08,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 2 },
    elevation: 3,
    borderWidth: 1,
    borderColor: '#e6e6e6',
  },
  apiHealthHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 12,
  },
  apiHealthTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#222',
    flex: 1,
    marginLeft: 8,
  },
  apiHealthTestBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#27ae60',
    borderRadius: 20,
    paddingHorizontal: 12,
    paddingVertical: 6,
    shadowColor: '#27ae60',
    shadowOpacity: 0.3,
    shadowRadius: 4,
    shadowOffset: { width: 0, height: 2 },
    elevation: 3,
  },
  apiHealthTestBtnDisabled: {
    backgroundColor: '#ccc',
    shadowOpacity: 0.1,
  },
  apiHealthTestBtnText: {
    color: '#fff',
    fontWeight: '600',
    fontSize: 12,
    marginLeft: 4,
  },
  apiHealthContent: {
    minHeight: 60,
  },
  apiHealthStatus: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    flexWrap: 'wrap',
  },
  apiHealthIndicator: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 20,
    paddingHorizontal: 12,
    paddingVertical: 6,
    minWidth: 80,
    justifyContent: 'center',
  },
  apiHealthLive: {
    backgroundColor: '#27ae60',
  },
  apiHealthDown: {
    backgroundColor: '#ff5a5a',
  },
  apiHealthRestarting: {
    backgroundColor: '#f59e0b',
  },
  apiHealthRestartTime: {
    fontSize: 12,
    color: '#f59e0b',
    fontWeight: '600',
    marginLeft: 8,
  },
  apiHealthStatusText: {
    color: '#fff',
    fontWeight: '700',
    fontSize: 12,
    marginLeft: 4,
    textTransform: 'uppercase',
  },
  apiHealthInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    flexWrap: 'wrap',
    gap: 8,
  },
  apiHealthResponseTime: {
    alignItems: 'center',
    backgroundColor: '#f0f8f0',
    borderRadius: 12,
    padding: 8,
    minWidth: 120,
  },
  apiHealthResponseTimeLabel: {
    fontSize: 11,
    color: '#666',
    fontWeight: '600',
    marginBottom: 2,
  },
  apiHealthResponseTimeValue: {
    fontSize: 16,
    color: '#27ae60',
    fontWeight: '700',
  },
  apiHealthVersion: {
    alignItems: 'center',
    backgroundColor: '#e8f4fd',
    borderRadius: 12,
    padding: 8,
    minWidth: 100,
  },
  apiHealthVersionLabel: {
    fontSize: 11,
    color: '#666',
    fontWeight: '600',
    marginBottom: 2,
  },
  apiHealthVersionValue: {
    fontSize: 14,
    color: '#0097a7',
    fontWeight: '700',
  },
  apiHealthGitVersion: {
    alignItems: 'center',
    backgroundColor: '#fff3e0',
    borderRadius: 12,
    padding: 8,
    minWidth: 120,
  },
  apiHealthGitVersionLabel: {
    fontSize: 11,
    color: '#666',
    fontWeight: '600',
    marginBottom: 2,
  },
  apiHealthGitVersionValue: {
    fontSize: 12,
    color: '#ff9800',
    fontWeight: '700',
    textAlign: 'center',
  },
  apiHealthError: {
    flex: 1,
    backgroundColor: '#fff5f5',
    borderRadius: 12,
    padding: 8,
    marginLeft: 12,
    borderWidth: 1,
    borderColor: '#fed7d7',
  },
  apiHealthErrorLabel: {
    fontSize: 11,
    color: '#c53030',
    fontWeight: '600',
    marginBottom: 2,
  },
  apiHealthErrorText: {
    fontSize: 12,
    color: '#c53030',
    fontWeight: '500',
  },
  apiHealthLoading: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 20,
  },
  apiHealthLoadingText: {
    fontSize: 14,
    color: '#666',
    fontStyle: 'italic',
  },
  // Combined API Health Layout Styles
  apiHealthRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#f0f0f0',
  },
  apiHealthEndpointHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  apiHealthEndpointTitle: {
    fontSize: 15,
    fontWeight: '600',
    color: '#333',
    marginLeft: 8,
  },
  apiHealthEndpointStatus: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  apiHealthInfoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  apiHealthDetails: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
  },
  apiHealthDetailItem: {
    alignItems: 'center',
  },
  apiHealthDetailLabel: {
    fontSize: 10,
    color: '#666',
    fontWeight: '500',
    marginBottom: 2,
  },
  apiHealthDetailValue: {
    fontSize: 12,
    color: '#27ae60',
    fontWeight: '600',
  },
  apiHealthResponseTimeInline: {
    fontSize: 14,
    color: '#27ae60',
    fontWeight: '600',
    backgroundColor: '#f0f8f0',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
  },
  
  // TTS Styles
  ttsCard: {
    backgroundColor: '#fff',
    borderRadius: 16,
    padding: 20,
    marginBottom: 20,
    shadowColor: '#27ae60',
    shadowOpacity: 0.1,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 2 },
    elevation: 4,
  },
  ttsHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
  },
  ttsTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#27ae60',
    marginLeft: 8,
  },
  ttsContent: {
    gap: 12,
  },
  ttsSubtitle: {
    fontSize: 14,
    color: '#666',
    marginBottom: 8,
  },
  ttsInput: {
    borderWidth: 1,
    borderColor: '#e0e0e0',
    borderRadius: 12,
    padding: 12,
    backgroundColor: '#fafafa',
    fontSize: 16,
    color: '#333',
    minHeight: 80,
  },
  ttsButtons: {
    flexDirection: 'row',
    gap: 12,
    alignItems: 'center',
  },
  ttsButton: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 10,
    gap: 6,
  },
  ttsSpeakButton: {
    backgroundColor: '#27ae60',
  },
  ttsStopButton: {
    backgroundColor: '#ff5a5a',
  },
  ttsButtonDisabled: {
    backgroundColor: '#ccc',
  },
  ttsButtonText: {
    color: '#fff',
    fontWeight: '600',
    fontSize: 14,
  },
  ttsNote: {
    color: '#888',
    fontStyle: 'italic',
    marginTop: 4,
  },
}); 