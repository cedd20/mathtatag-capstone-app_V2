import AsyncStorage from '@react-native-async-storage/async-storage';
import { useFonts } from 'expo-font';
import { useRouter } from 'expo-router';
import { get, ref } from 'firebase/database';
import { useEffect, useRef, useState } from 'react';
import { Animated, Dimensions, ImageBackground, PanResponder, Pressable, StyleSheet, Text, View } from 'react-native';
import { db } from '../constants/firebaseConfig';

const { width, height } = Dimensions.get('window');

// Import game assets
const map10Bg = require('../assets/game pngs/map10.10.png');
const stageImg = require('../assets/game pngs/Stage.png');
const lockImg = require('../assets/game pngs/stageLock.png');

const wrongImg = require('../assets/game pngs/wrong.png');
const correctImg = require('../assets/game pngs/correct.png');
const logo = require('../assets/game pngs/logo.png');

const STAGES = [
  { label: 'Level 1', x: 0.15, y: 0.75},
  { label: 'Level 2', x: 0.7, y: 0.65},
  { label: 'Level 3', x: 0.25, y: 0.55 },
  { label: 'Level 4', x: 0.6, y: 0.45 },
  { label: 'Level 5', x: 0.2, y: 0.35},
  { label: 'Level 6', x: 0.65, y: 0.25},
];

export default function Map10Stages() {
  const router = useRouter();
  
  // Change completed state to track status
  const [stageStatus, setStageStatus] = useState<Array<'pending' | 'correct' | 'wrong'>>([
    'pending', 'pending', 'pending', 'pending', 'pending', 'pending',
  ]);
  const [currentGame, setCurrentGame] = useState<number | null>(null);
  const logoScale = useRef(new Animated.Value(1)).current;
  const [showCongrats, setShowCongrats] = useState(false);
  
  // Debug mode for stage positioning
  const [debugMode, setDebugMode] = useState(false);
  const [stagePositions, setStagePositions] = useState(STAGES);
  const [draggingStage, setDraggingStage] = useState<number | null>(null);
  const [savedPositions, setSavedPositions] = useState(STAGES);

  // Animation values for each stage
  const stageScales = useRef(STAGES.map(() => new Animated.Value(1))).current;

  const [fontsLoaded] = useFonts({
    'LeagueSpartan-Bold': require('../assets/fonts/LeagueSpartan-Bold.ttf'),
    'LuckiestGuy-Regular': require('../assets/fonts/LuckiestGuy-Regular.ttf'),
  });

  // Logo pulse animation
  useEffect(() => {
    Animated.loop(
      Animated.sequence([
        Animated.timing(logoScale, { toValue: 1.08, duration: 800, useNativeDriver: true }),
        Animated.timing(logoScale, { toValue: 1, duration: 800, useNativeDriver: true }),
      ])
    ).start();
  }, [logoScale]);

  // Animate unlocked (next available) stage: pulse
  useEffect(() => {
    stageStatus.forEach((status, idx) => {
      const isLocked = idx !== 0 && stageStatus[idx - 1] === 'pending';
      if (!isLocked && status === 'pending') {
        Animated.loop(
          Animated.sequence([
            Animated.timing(stageScales[idx], { toValue: 1.13, duration: 700, useNativeDriver: true }),
            Animated.timing(stageScales[idx], { toValue: 1, duration: 700, useNativeDriver: true }),
          ])
        ).start();
      } else {
        stageScales[idx].setValue(1);
      }
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stageStatus]);

  // Add a new Animated.Value array for result pop
  const resultPops = useRef(STAGES.map(() => new Animated.Value(0))).current;

  // Animate pop when a stage is marked correct or wrong
  useEffect(() => {
    stageStatus.forEach((status, idx) => {
      if (status === 'correct' || status === 'wrong') {
        Animated.sequence([
          Animated.timing(resultPops[idx], { toValue: 1, duration: 0, useNativeDriver: true }),
          Animated.spring(resultPops[idx], { toValue: 1.2, friction: 3, useNativeDriver: true }),
          Animated.spring(resultPops[idx], { toValue: 1, friction: 3, useNativeDriver: true }),
        ]).start();
      } else {
        resultPops[idx].setValue(0);
      }
    });
  }, [stageStatus, resultPops]);

  // Calculate score summary
  const patternsCorrect = stageStatus[2] === 'correct' ? 1 : 0;
  const numbersCorrect = [0, 1, 3, 4, 5].reduce((acc, idx) => acc + (stageStatus[idx] === 'correct' ? 1 : 0), 0);

  useEffect(() => {
    if (stageStatus.every(s => s !== 'pending')) {
      setTimeout(() => setShowCongrats(true), 800);
    }
  }, [stageStatus]);

  // Load saved positions on mount
  useEffect(() => {
    const loadSavedPositions = async () => {
      try {
        const saved = await AsyncStorage.getItem('stagePositions10');
        if (saved) {
          const parsed = JSON.parse(saved);
          setStagePositions(parsed);
          setSavedPositions(parsed);
        }
      } catch (e) {
        console.error('Error loading saved positions:', e);
      }
    };
    loadSavedPositions();
  }, []);

  // Fetch student name on mount
  useEffect(() => {
    const fetchStudentName = async () => {
      try {
        const studentId = await AsyncStorage.getItem('lastStudentId');
        if (studentId) {
          const snap = await get(ref(db, `Students/${studentId}`));
          if (snap.exists()) {
            const student = snap.val();
            // Student data fetched successfully
            console.log('Student data:', student);
          }
        }
      } catch (e) {
        console.error('Error fetching student data:', e);
      }
    };
    fetchStudentName();
  }, []);

  const handleStagePress = (idx: number) => {
    // Only allow if unlocked and pending
    const isLocked = idx !== 0 && stageStatus[idx - 1] === 'pending';
    if (!isLocked && stageStatus[idx] === 'pending') {
      setCurrentGame(idx);
    }
  };

  const handleGameComplete = (result?: { correct?: boolean }) => {
    if (currentGame !== null) {
      setStageStatus(prev => {
        const updated = [...prev];
        updated[currentGame!] = result?.correct ? 'correct' : 'wrong';
        return updated;
      });
      setCurrentGame(null);
    }
  };

  // Stage position adjustment functions
  const adjustStagePosition = (index: number, direction: 'up' | 'down' | 'left' | 'right', amount: number = 0.02) => {
    setStagePositions(prev => {
      const updated = [...prev];
      const stage = updated[index];
      
      switch (direction) {
        case 'up':
          stage.y = Math.max(0.1, stage.y - amount);
          break;
        case 'down':
          stage.y = Math.min(0.9, stage.y + amount);
          break;
        case 'left':
          stage.x = Math.max(0.05, stage.x - amount);
          break;
        case 'right':
          stage.x = Math.min(0.95, stage.x + amount);
          break;
      }
      
      return updated;
    });
  };

  const resetStagePositions = () => {
    setStagePositions(STAGES);
  };

  const logStagePositions = () => {
    console.log('Week 10 - Current stage positions:');
    stagePositions.forEach((stage, index) => {
      console.log(`${stage.label}: x: ${stage.x.toFixed(3)}, y: ${stage.y.toFixed(3)}`);
    });
  };

  const saveStagePositions = async () => {
    try {
      await AsyncStorage.setItem('stagePositions10', JSON.stringify(stagePositions));
      setSavedPositions([...stagePositions]);
      console.log('Week 10 positions saved successfully!');
    } catch (e) {
      console.error('Error saving positions:', e);
    }
  };

  const createPanResponder = (index: number) => {
    return PanResponder.create({
      onStartShouldSetPanResponder: () => debugMode,
      onMoveShouldSetPanResponder: () => debugMode,
      onPanResponderGrant: () => {
        setDraggingStage(index);
      },
      onPanResponderMove: (evt, gestureState) => {
        if (debugMode) {
          const newX = Math.max(0.05, Math.min(0.95, stagePositions[index].x + gestureState.dx / width));
          const newY = Math.max(0.1, Math.min(0.9, stagePositions[index].y + gestureState.dy / height));
          
          setStagePositions(prev => {
            const updated = [...prev];
            updated[index] = { ...updated[index], x: newX, y: newY };
            return updated;
          });
        }
      },
      onPanResponderRelease: () => {
        setDraggingStage(null);
      },
    });
  };

  if (!fontsLoaded) return null;

  // Render current game if one is active
  if (currentGame !== null) {
    // For now, navigate to LoadingScreen when a game is selected
    router.push('/LoadingScreen');
    return null;
  }

  return (
    <ImageBackground source={map10Bg} style={styles.bg} resizeMode="cover">
      <View style={styles.introContainer}>
        <Animated.Image
          source={logo}
          style={[styles.logo, { transform: [{ scale: logoScale }] }]}
          resizeMode="contain"
        />
      </View>
      {/* Congratulatory Panel */}
      {showCongrats && (
        <View style={congratsStyles.card}>
          <Text style={congratsStyles.title}>🎉 Congratulations!</Text>
          <Text style={congratsStyles.text}>You finished all Week 10 games!</Text>
          <Text style={congratsStyles.score}>Scores:</Text>
          <Text style={congratsStyles.scoreLine}>Patterns: {patternsCorrect}   |   Numbers: {numbersCorrect}</Text>
          <Pressable style={congratsStyles.finishBtn} onPress={() => setShowCongrats(false)}>
            <Text style={congratsStyles.finishBtnText}>Close</Text>
          </Pressable>
        </View>
      )}
      {/* Debug Controls */}
      {debugMode && (
        <View style={debugStyles.debugPanel}>
          <Text style={debugStyles.debugTitle}>Week 10 - Stage Position Debug</Text>
          <Text style={debugStyles.debugSubtitle}>Drag stages to reposition</Text>
          <Pressable style={debugStyles.debugButton} onPress={logStagePositions}>
            <Text style={debugStyles.debugButtonText}>Log Positions</Text>
          </Pressable>
          <Pressable style={debugStyles.debugButton} onPress={resetStagePositions}>
            <Text style={debugStyles.debugButtonText}>Reset</Text>
          </Pressable>
          <Pressable style={[debugStyles.debugButton, debugStyles.saveButton]} onPress={saveStagePositions}>
            <Text style={debugStyles.debugButtonText}>💾 Save</Text>
          </Pressable>
          <Pressable style={debugStyles.debugButton} onPress={() => setDebugMode(false)}>
            <Text style={debugStyles.debugButtonText}>Exit Debug</Text>
          </Pressable>
        </View>
      )}

      {/* Debug Toggle Button */}
      <Pressable 
        style={debugStyles.toggleButton} 
        onPress={() => setDebugMode(!debugMode)}
      >
        <Text style={debugStyles.toggleButtonText}>🔧</Text>
      </Pressable>

      {/* Map Stages */}
      {stagePositions.map((stage, idx) => {
        const isLocked = idx !== 0 && stageStatus[idx - 1] === 'pending';
        const status = stageStatus[idx];
        let icon = stageImg;
        let iconStyle = [styles.stageIcon, { transform: [{ scale: stageScales[idx] }] }];
        if (isLocked) icon = lockImg;
        // Badge logic
        let badge = null;
        if (status === 'correct' || status === 'wrong') {
          const badgeIcon = status === 'correct' ? correctImg : wrongImg;
          badge = (
            <Animated.Image
              source={badgeIcon}
              style={[
                styles.badgeIcon,
                { transform: [{ scale: resultPops[idx] }] },
              ]}
              resizeMode="contain"
            />
          );
        }

        const panResponder = createPanResponder(idx);
        const isDragging = draggingStage === idx;

        return (
          <View
            key={stage.label}
            style={[
              styles.stageContainer,
              {
                left: width * stage.x,
                top: height * stage.y,
                opacity: isDragging ? 0.7 : 1,
                zIndex: isDragging ? 1000 : 1,
              },
            ]}
            {...panResponder.panHandlers}
          >
            <Pressable
              disabled={isLocked || status !== 'pending' || debugMode}
              onPress={() => handleStagePress(idx)}
              style={styles.stagePressable}
            >
              <View style={{ position: 'relative' }}>
                <Animated.Image source={icon} style={StyleSheet.flatten(iconStyle)} />
                {badge && (
                  <View style={styles.badgeWrapper}>{badge}</View>
                )}
              </View>
              <Text style={styles.stageLabel}>{stage.label}</Text>
            </Pressable>
            
            {/* Debug Controls for each stage */}
            {debugMode && (
              <View style={debugStyles.stageDebugControls}>
                <Text style={debugStyles.stageDebugText}>
                  {stage.label}: x:{stage.x.toFixed(2)}, y:{stage.y.toFixed(2)}
                </Text>
                <View style={debugStyles.stageDebugButtons}>
                  <Pressable 
                    style={debugStyles.stageDebugBtn} 
                    onPress={() => adjustStagePosition(idx, 'up')}
                  >
                    <Text style={debugStyles.stageDebugBtnText}>↑</Text>
                  </Pressable>
                  <Pressable 
                    style={debugStyles.stageDebugBtn} 
                    onPress={() => adjustStagePosition(idx, 'down')}
                  >
                    <Text style={debugStyles.stageDebugBtnText}>↓</Text>
                  </Pressable>
                  <Pressable 
                    style={debugStyles.stageDebugBtn} 
                    onPress={() => adjustStagePosition(idx, 'left')}
                  >
                    <Text style={debugStyles.stageDebugBtnText}>←</Text>
                  </Pressable>
                  <Pressable 
                    style={debugStyles.stageDebugBtn} 
                    onPress={() => adjustStagePosition(idx, 'right')}
                  >
                    <Text style={debugStyles.stageDebugBtnText}>→</Text>
                  </Pressable>
                </View>
              </View>
            )}
          </View>
        );
      })}
    </ImageBackground>
  );
}

const STAGE_SIZE = 150;

const styles = StyleSheet.create({
  bg: {
    flex: 1,
    width: '100%',
    height: '100%',
    justifyContent: 'flex-start',
    alignItems: 'center',
  },
  stageContainer: {
    position: 'absolute',
    alignItems: 'center',
  },
  stagePressable: {
    alignItems: 'center',
  },
  stageIcon: {
    width: STAGE_SIZE,
    height: STAGE_SIZE,
    marginBottom: -45,
  },
  stageLabel: {
    color: '#fff',
    fontWeight: 'bold',
    fontSize: 13,
    textShadowColor: '#000',
    textShadowOffset: { width: 1, height: 1 },
    textShadowRadius: 2,
  },
  introContainer: {
    width: '100%',
    alignItems: 'center',
    justifyContent: 'flex-start',
    marginTop: 20,
    minHeight: 80,
    zIndex: 10,
  },
  logo: {
    width: width * 0.5,
    height: height * 0.50,
    marginTop: -155,
    marginBottom: 5,
    zIndex: 2,
  },
  badgeWrapper: {
    position: 'absolute',
    top: -25,
    right: 35,
    zIndex: 10,
  },
  badgeIcon: {
    width: 40,
    height: 150,
  },
});

const congratsStyles = StyleSheet.create({
  card: {
    position: 'absolute',
    top: '28%',
    left: '7%',
    right: '7%',
    backgroundColor: 'rgba(255,255,255,0.98)',
    borderRadius: 25,
    padding: 32,
    alignItems: 'center',
    zIndex: 300,
    shadowColor: '#000',
    shadowOpacity: 0.25,
    shadowRadius: 15,
    shadowOffset: { width: 0, height: 8 },
    elevation: 16,
  },
  title: {
    fontSize: 28,
    fontWeight: 'bold',
    color: '#27ae60',
    marginBottom: 12,
    textAlign: 'center',
  },
  text: {
    fontSize: 20,
    color: '#2c3e50',
    marginBottom: 18,
    textAlign: 'center',
  },
  score: {
    fontSize: 22,
    fontWeight: 'bold',
    color: '#3498db',
    marginBottom: 6,
    textAlign: 'center',
  },
  scoreLine: {
    fontSize: 20,
    color: '#2c3e50',
    marginBottom: 18,
    textAlign: 'center',
  },
  finishBtn: {
    backgroundColor: '#3498db',
    borderRadius: 20,
    paddingVertical: 15,
    paddingHorizontal: 30,
    marginTop: 8,
    shadowColor: '#3498db',
    shadowOpacity: 0.3,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 4 },
    elevation: 6,
    alignSelf: 'center',
  },
  finishBtnText: {
    color: '#fff',
    fontSize: 18,
    fontWeight: 'bold',
    textAlign: 'center',
  },
});

const debugStyles = StyleSheet.create({
  debugPanel: {
    position: 'absolute',
    top: 100,
    left: 10,
    backgroundColor: 'rgba(0, 0, 0, 0.8)',
    padding: 15,
    borderRadius: 10,
    zIndex: 1000,
  },
  debugTitle: {
    color: '#fff',
    fontSize: 16,
    fontWeight: 'bold',
    marginBottom: 10,
  },
  debugSubtitle: {
    color: '#ccc',
    fontSize: 12,
    marginBottom: 10,
    fontStyle: 'italic',
  },
  debugButton: {
    backgroundColor: '#3498db',
    padding: 8,
    borderRadius: 5,
    marginBottom: 5,
  },
  saveButton: {
    backgroundColor: '#27ae60',
  },
  debugButtonText: {
    color: '#fff',
    fontSize: 12,
    textAlign: 'center',
  },
  toggleButton: {
    position: 'absolute',
    top: 20,
    right: 20,
    backgroundColor: 'rgba(0, 0, 0, 0.7)',
    width: 50,
    height: 50,
    borderRadius: 25,
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 1000,
  },
  toggleButtonText: {
    fontSize: 20,
  },
  stageDebugControls: {
    position: 'absolute',
    top: -80,
    left: -50,
    backgroundColor: 'rgba(0, 0, 0, 0.8)',
    padding: 8,
    borderRadius: 5,
    zIndex: 1001,
    minWidth: 120,
  },
  stageDebugText: {
    color: '#fff',
    fontSize: 10,
    textAlign: 'center',
    marginBottom: 5,
  },
  stageDebugButtons: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  stageDebugBtn: {
    backgroundColor: '#e74c3c',
    width: 20,
    height: 20,
    borderRadius: 10,
    justifyContent: 'center',
    alignItems: 'center',
  },
  stageDebugBtnText: {
    color: '#fff',
    fontSize: 12,
    fontWeight: 'bold',
  },
});
