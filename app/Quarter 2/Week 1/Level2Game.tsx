import AsyncStorage from '@react-native-async-storage/async-storage';
import { useFonts } from 'expo-font';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Animated, Dimensions, Image, ImageBackground, PanResponder, Pressable, StyleSheet, Text, View } from 'react-native';

const { width, height } = Dimensions.get('window');

interface Level2GameProps {
  onComplete: (score: number) => void;
  onExit: () => void;
}

interface ElementData {
  id: number;
  x: number;
  y: number;
  width: number;
  height: number;
  scale: number;
  image: any;
  name: string;
  emoji: string;
  isSelected?: boolean;
}

const Level2Game: React.FC<Level2GameProps> = ({ onComplete, onExit }) => {
  const [score, setScore] = useState(0);
  const [selectedElement, setSelectedElement] = useState<number | null>(null);
  const [showResult, setShowResult] = useState(false);
  const [isCorrect, setIsCorrect] = useState(false);
  const [showQuestion, setShowQuestion] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [debugMode, setDebugMode] = useState(false);
  const [isResizing, setIsResizing] = useState(false);
  const [resizeHandle, setResizeHandle] = useState<string | null>(null);
  
  const scaleAnim = useRef(new Animated.Value(1)).current;
  
  // Individual animations for each element
  const elementAnimations = useRef<{[key: number]: Animated.Value}>({
    1: new Animated.Value(1), // Steps
    2: new Animated.Value(1), // Apple
    3: new Animated.Value(1), // Vase
    4: new Animated.Value(1), // Bear
  }).current;

  const [fontsLoaded] = useFonts({
    'LeagueSpartan-Bold': require('../../../assets/fonts/LeagueSpartan-Bold.ttf'),
    'LuckiestGuy-Regular': require('../../../assets/fonts/LuckiestGuy-Regular.ttf'),
  });

  // Memoized game elements for performance
  const defaultElements = useMemo(() => [
    {
      id: 1,
      x: 50,
      y: 200,
      width: 80,
      height: 80,
      scale: 1,
      image: require('../../../assets/Quarter 2/Week 1/steps.png'),
      name: 'Mga hakbang',
      emoji: '👣'
    },
    {
      id: 2,
      x: 200,
      y: 200,
      width: 80,
      height: 80,
      scale: 1,
      image: require('../../../assets/Quarter 2/Week 1/apple.png'),
      name: 'Mansanas',
      emoji: '🍎'
    },
    {
      id: 3,
      x: 350,
      y: 200,
      width: 80,
      height: 80,
      scale: 1,
      image: require('../../../assets/Quarter 2/Week 1/vase.png'),
      name: 'Asin sa bote',
      emoji: '🏺'
    },
    {
      id: 4,
      x: 150,
      y: 350,
      width: 80,
      height: 80,
      scale: 1,
      image: require('../../../assets/Quarter 2/Week 1/bear.png'),
      name: 'Stuff toy',
      emoji: '🧸'
    }
  ], []);

  const [elements, setElements] = useState<ElementData[]>(defaultElements);

  const correctAnswer = 1; // Steps are the best for measuring length

  // Load saved layout on component mount
  useEffect(() => {
    loadSavedLayout();
  }, []);

  // Start element animations when component mounts
  useEffect(() => {
    startElementAnimations();
  }, []);

  const startElementAnimations = useCallback(() => {
    // Create a sequence of animations for each element
    const animations = [
      // Steps animation - gentle bounce
      Animated.loop(
        Animated.sequence([
          Animated.timing(elementAnimations[1], {
            toValue: 1.1,
            duration: 1500,
            useNativeDriver: true,
          }),
          Animated.timing(elementAnimations[1], {
            toValue: 1,
            duration: 1500,
            useNativeDriver: true,
          }),
        ])
      ),
      
      // Apple animation - subtle pulse
      Animated.loop(
        Animated.sequence([
          Animated.timing(elementAnimations[2], {
            toValue: 1.05,
            duration: 2000,
            useNativeDriver: true,
          }),
          Animated.timing(elementAnimations[2], {
            toValue: 1,
            duration: 2000,
            useNativeDriver: true,
          }),
        ])
      ),
      
      // Vase animation - gentle sway
      Animated.loop(
        Animated.sequence([
          Animated.timing(elementAnimations[3], {
            toValue: 1.08,
            duration: 1800,
            useNativeDriver: true,
          }),
          Animated.timing(elementAnimations[3], {
            toValue: 1,
            duration: 1800,
            useNativeDriver: true,
          }),
        ])
      ),
      
      // Bear animation - gentle bounce
      Animated.loop(
        Animated.sequence([
          Animated.timing(elementAnimations[4], {
            toValue: 1.06,
            duration: 1600,
            useNativeDriver: true,
          }),
          Animated.timing(elementAnimations[4], {
            toValue: 1,
            duration: 1600,
            useNativeDriver: true,
          }),
        ])
      ),
    ];

    // Start all animations with slight delays
    animations.forEach((animation, index) => {
      setTimeout(() => {
        animation.start();
      }, index * 500); // Stagger the start times
    });
  }, [elementAnimations]);

  const createPanResponder = useCallback((elementId: number) => {
    return PanResponder.create({
      onStartShouldSetPanResponder: () => debugMode, // Only allow dragging in debug mode
      onMoveShouldSetPanResponder: () => debugMode, // Only allow dragging in debug mode
      onPanResponderGrant: () => {
        if (!debugMode) return; // Exit if not in debug mode
        
        // Always select element when starting to drag
        setSelectedElement(elementId);
        setElements(prev => prev.map(el => ({ ...el, isSelected: el.id === elementId })));
        Animated.timing(scaleAnim, {
          toValue: 1.1,
          duration: 100,
          useNativeDriver: true,
        }).start();
      },
      onPanResponderMove: (evt, gestureState) => {
        if (!debugMode) return; // Exit if not in debug mode
        
        if (isResizing && resizeHandle) {
          // Handle resizing in debug mode
          setElements(prev => prev.map(element => {
            if (element.id === elementId) {
              let newWidth = element.width;
              let newHeight = element.height;
              let newX = element.x;
              let newY = element.y;

              switch (resizeHandle) {
                case 'se': // Southeast corner
                  newWidth = Math.max(40, element.width + gestureState.dx);
                  newHeight = Math.max(40, element.height + gestureState.dy);
                  break;
                case 'sw': // Southwest corner
                  newWidth = Math.max(40, element.width - gestureState.dx);
                  newHeight = Math.max(40, element.height + gestureState.dy);
                  newX = element.x + gestureState.dx;
                  break;
                case 'ne': // Northeast corner
                  newWidth = Math.max(40, element.width + gestureState.dx);
                  newHeight = Math.max(40, element.height - gestureState.dy);
                  newY = element.y + gestureState.dy;
                  break;
                case 'nw': // Northwest corner
                  newWidth = Math.max(40, element.width - gestureState.dx);
                  newHeight = Math.max(40, element.height - gestureState.dy);
                  newX = element.x + gestureState.dx;
                  newY = element.y + gestureState.dy;
                  break;
              }

              return {
                ...element,
                width: newWidth,
                height: newHeight,
                x: Math.max(0, Math.min(width - newWidth, newX)),
                y: Math.max(0, Math.min(height - newHeight - 200, newY))
              };
            }
            return element;
          }));
        } else {
          // Handle moving
          setElements(prev => prev.map(element => 
            element.id === elementId 
              ? {
                  ...element,
                  x: Math.max(0, Math.min(width - element.width, element.x + gestureState.dx)),
                  y: Math.max(0, Math.min(height - element.height - 200, element.y + gestureState.dy))
                }
              : element
          ));
        }
      },
      onPanResponderRelease: () => {
        if (!debugMode) return; // Exit if not in debug mode
        
        setSelectedElement(null);
        setIsResizing(false);
        setResizeHandle(null);
        setElements(prev => prev.map(el => ({ ...el, isSelected: false })));
        Animated.timing(scaleAnim, {
          toValue: 1,
          duration: 100,
          useNativeDriver: true,
        }).start();
      },
    });
  }, [debugMode, isResizing, resizeHandle, scaleAnim]);

  const createResizePanResponder = (elementId: number, handle: string) => {
    return PanResponder.create({
      onStartShouldSetPanResponder: () => debugMode, // Only allow resizing in debug mode
      onMoveShouldSetPanResponder: () => debugMode, // Only allow resizing in debug mode
      onPanResponderGrant: (evt) => {
        if (!debugMode) return; // Exit if not in debug mode
        
        evt.stopPropagation();
        setIsResizing(true);
        setResizeHandle(handle);
        setSelectedElement(elementId);
      },
      onPanResponderMove: (evt, gestureState) => {
        if (!debugMode) return; // Exit if not in debug mode
        
        evt.stopPropagation();
        setElements(prev => prev.map(element => {
          if (element.id === elementId) {
            let newWidth = element.width;
            let newHeight = element.height;
            let newX = element.x;
            let newY = element.y;

            switch (handle) {
              case 'se': // Southeast corner
                newWidth = Math.max(40, element.width + gestureState.dx);
                newHeight = Math.max(40, element.height + gestureState.dy);
                break;
              case 'sw': // Southwest corner
                newWidth = Math.max(40, element.width - gestureState.dx);
                newHeight = Math.max(40, element.height + gestureState.dy);
                newX = element.x + gestureState.dx;
                break;
              case 'ne': // Northeast corner
                newWidth = Math.max(40, element.width + gestureState.dx);
                newHeight = Math.max(40, element.height - gestureState.dy);
                newY = element.y + gestureState.dy;
                break;
              case 'nw': // Northwest corner
                newWidth = Math.max(40, element.width - gestureState.dx);
                newHeight = Math.max(40, element.height - gestureState.dy);
                newX = element.x + gestureState.dx;
                newY = element.y + gestureState.dy;
                break;
            }

            return {
              ...element,
              width: newWidth,
              height: newHeight,
              x: Math.max(0, Math.min(width - newWidth, newX)),
              y: Math.max(0, Math.min(height - newHeight - 200, newY))
            };
          }
          return element;
        }));
      },
      onPanResponderRelease: (evt) => {
        if (!debugMode) return; // Exit if not in debug mode
        
        evt.stopPropagation();
        setIsResizing(false);
        setResizeHandle(null);
      },
    });
  };


  const handleElementPress = (elementId: number) => {
    
    // Stop the element's animation and add click animation
    if (elementAnimations[elementId]) {
      elementAnimations[elementId].stopAnimation();
      Animated.sequence([
        Animated.timing(elementAnimations[elementId], {
          toValue: 1.3,
          duration: 150,
          useNativeDriver: true,
        }),
        Animated.timing(elementAnimations[elementId], {
          toValue: 1,
          duration: 150,
          useNativeDriver: true,
        }),
      ]).start(() => {
        // Restart the element's animation after click
        if (elementId === 1) {
          Animated.loop(
            Animated.sequence([
              Animated.timing(elementAnimations[1], {
                toValue: 1.1,
                duration: 1500,
                useNativeDriver: true,
              }),
              Animated.timing(elementAnimations[1], {
                toValue: 1,
                duration: 1500,
                useNativeDriver: true,
              }),
            ])
          ).start();
        } else if (elementId === 2) {
          Animated.loop(
            Animated.sequence([
              Animated.timing(elementAnimations[2], {
                toValue: 1.05,
                duration: 2000,
                useNativeDriver: true,
              }),
              Animated.timing(elementAnimations[2], {
                toValue: 1,
                duration: 2000,
                useNativeDriver: true,
              }),
            ])
          ).start();
        } else if (elementId === 3) {
          Animated.loop(
            Animated.sequence([
              Animated.timing(elementAnimations[3], {
                toValue: 1.08,
                duration: 1800,
                useNativeDriver: true,
              }),
              Animated.timing(elementAnimations[3], {
                toValue: 1,
                duration: 1800,
                useNativeDriver: true,
              }),
            ])
          ).start();
        } else if (elementId === 4) {
          Animated.loop(
            Animated.sequence([
              Animated.timing(elementAnimations[4], {
                toValue: 1.06,
                duration: 1600,
                useNativeDriver: true,
              }),
              Animated.timing(elementAnimations[4], {
                toValue: 1,
                duration: 1600,
                useNativeDriver: true,
              }),
            ])
          ).start();
        }
      });
    }
    
    // Only proceed with game answer if question is active AND debug mode is off
    if (showQuestion && !debugMode) {
      const correct = elementId === correctAnswer;
      setIsCorrect(correct);
      
      if (correct) {
        setScore(100);
      }
      
      setShowResult(true);
      
      // Animate result
      Animated.sequence([
        Animated.timing(scaleAnim, {
          toValue: 1.2,
          duration: 200,
          useNativeDriver: true,
        }),
        Animated.timing(scaleAnim, {
          toValue: 1,
          duration: 200,
          useNativeDriver: true,
        }),
      ]).start();
    }
    // In debug mode, allow element selection for editing
    else if (debugMode) {
      setSelectedElement(elementId);
      setElements(prev => prev.map(el => ({ ...el, isSelected: el.id === elementId })));
    }
    // When question is not active and not in debug mode, do nothing (elements are unclickable)
  };

  const adjustElementSize = (elementId: number, direction: 'increase' | 'decrease') => {
    
    setElements(prev => prev.map(element => 
      element.id === elementId 
        ? {
            ...element,
            scale: direction === 'increase' 
              ? Math.min(2, element.scale + 0.1)
              : Math.max(0.5, element.scale - 0.1),
            width: direction === 'increase' 
              ? Math.min(160, element.width + 10)
              : Math.max(40, element.width - 10),
            height: direction === 'increase' 
              ? Math.min(160, element.height + 10)
              : Math.max(40, element.height - 10)
          }
        : element
    ));
  };


  const startQuestion = useCallback(() => {
    setShowQuestion(true);
  }, []);

  const finishGame = useCallback(() => {
    onComplete(score);
  }, [onComplete, score]);

  const exitGame = useCallback(() => {
    onExit();
  }, [onExit]);

  const retryGame = useCallback(() => {
    setScore(0);
    setSelectedElement(null);
    setShowResult(false);
    setIsCorrect(false);
    setShowQuestion(false);
    setShowSettings(false);
    
    // Reset elements to original positions using memoized defaultElements
    setElements(defaultElements);
  }, [defaultElements]);

  const saveLayout = async () => {
    try {
      const layoutData = {
        elements: elements.map(el => ({
          id: el.id,
          x: el.x,
          y: el.y,
          width: el.width,
          height: el.height,
          scale: el.scale
        })),
        timestamp: new Date().toISOString()
      };
      
      // Save to AsyncStorage permanently
      await AsyncStorage.setItem('level2_layout', JSON.stringify(layoutData));
      console.log('Layout saved permanently:', layoutData);
      alert('Layout saved permanently!');
    } catch (error) {
      console.error('Error saving layout:', error);
      alert('Error saving layout!');
    }
  };

  const loadSavedLayout = async () => {
    try {
      // Try to load saved layout from AsyncStorage
      const savedLayout = await AsyncStorage.getItem('level2_layout');
      
      if (savedLayout) {
        const layoutData = JSON.parse(savedLayout);
        console.log('Loading saved layout:', layoutData);
        
        setElements(prev => prev.map(el => {
          const savedEl = layoutData.elements.find((saved: any) => saved.id === el.id);
          return savedEl ? { ...el, ...savedEl } : el;
        }));
      } else {
        console.log('No saved layout found, using default positions');
      }
    } catch (error) {
      console.error('Error loading saved layout:', error);
    }
  };

  const loadLayout = async () => {
    try {
      // Load from AsyncStorage
      const savedLayout = await AsyncStorage.getItem('level2_layout');
      
      if (savedLayout) {
        const layoutData = JSON.parse(savedLayout);
        console.log('Loading saved layout:', layoutData);
        
        setElements(prev => prev.map(el => {
          const savedEl = layoutData.elements.find((saved: any) => saved.id === el.id);
          return savedEl ? { ...el, ...savedEl } : el;
        }));
        
        alert('Layout loaded from saved data!');
      } else {
        // Fallback to default layout if no saved data
        const defaultLayout = {
          elements: [
            { id: 1, x: 50, y: 200, width: 80, height: 80, scale: 1 },
            { id: 2, x: 200, y: 200, width: 100, height: 80, scale: 1 },
            { id: 3, x: 350, y: 200, width: 70, height: 80, scale: 1 },
            { id: 4, x: 150, y: 350, width: 120, height: 100, scale: 1 }
          ]
        };
        
        setElements(prev => prev.map(el => {
          const savedEl = defaultLayout.elements.find(saved => saved.id === el.id);
          return savedEl ? { ...el, ...savedEl } : el;
        }));
        
        alert('No saved layout found, loaded default positions!');
      }
    } catch (error) {
      console.error('Error loading layout:', error);
      alert('Error loading layout!');
    }
  };

  const clearSavedLayout = async () => {
    try {
      await AsyncStorage.removeItem('level2_layout');
      console.log('Saved layout cleared');
      alert('Saved layout cleared!');
    } catch (error) {
      console.error('Error clearing saved layout:', error);
      alert('Error clearing saved layout!');
    }
  };

  if (!fontsLoaded) return null;

  return (
    <ImageBackground 
      source={require('../../../assets/Quarter 2/Week 1/bgLevel2.png')} 
      style={styles.container} 
      resizeMode="cover"
    >
      <View style={styles.header}>
        <Text style={styles.title}>Level 2: Panukat ng Haba ng Lamesa</Text>
        <Text style={styles.score}>Score: {score}</Text>
      </View>

      {!showQuestion ? (
        <View style={styles.instructionContainer}>
          <Text style={styles.instruction}>
            Gusto sukatin ni Miko ang haba ng kanilang lamesa, pero wala siyang ruler.
          </Text>
          <Text style={styles.question}>
            Alin sa mga bagay na ito ang pinakamainam gamitin bilang panukat ng haba ng lamesa?
          </Text>
          <Pressable style={styles.startButton} onPress={startQuestion}>
            <Text style={styles.startButtonText}>Simulan ang Tanong</Text>
          </Pressable>
        </View>
      ) : (
        <View style={styles.questionContainer}>
          <Text style={styles.questionText}>
            Alin sa mga bagay na ito ang pinakamainam gamitin bilang panukat ng haba ng lamesa?
          </Text>
          <Text style={styles.choicesText}>Pagpipilian:</Text>
        </View>
      )}

      <View style={styles.canvas}>
        {elements.map((element) => (
          <Animated.View
            key={element.id}
            style={[
              styles.elementContainer,
              {
                left: element.x,
                top: element.y,
                transform: [
                  { scale: selectedElement === element.id ? scaleAnim : (elementAnimations[element.id] || new Animated.Value(1)) }
                ],
                zIndex: selectedElement === element.id ? 1000 : 1,
              }
            ]}
{...debugMode ? createPanResponder(element.id).panHandlers : {}}
          >
            <Pressable
              style={[
                styles.element,
                {
                  width: element.width,
                  height: element.height,
                },
                !showQuestion && !debugMode && styles.disabledElement,
              ]}
              onPress={() => handleElementPress(element.id)}
              disabled={!showQuestion && !debugMode}
              hitSlop={{ top: -20, bottom: -20, left: -20, right: -20 }}
            >
              <Image
                source={element.image}
                style={styles.elementImage}
                resizeMode="contain"
              />
            </Pressable>
            
            {/* Debug Resize Handles */}
            {selectedElement === element.id && debugMode && (
              <>
                {/* Corner handles */}
                <View 
                  style={[styles.resizeHandle, styles.resizeHandleNW]}
                  {...debugMode ? createResizePanResponder(element.id, 'nw').panHandlers : {}}
                />
                <View 
                  style={[styles.resizeHandle, styles.resizeHandleNE]}
                  {...debugMode ? createResizePanResponder(element.id, 'ne').panHandlers : {}}
                />
                <View 
                  style={[styles.resizeHandle, styles.resizeHandleSW]}
                  {...debugMode ? createResizePanResponder(element.id, 'sw').panHandlers : {}}
                />
                <View 
                  style={[styles.resizeHandle, styles.resizeHandleSE]}
                  {...debugMode ? createResizePanResponder(element.id, 'se').panHandlers : {}}
                />
              </>
            )}
            
            {/* Size controls */}
            {selectedElement === element.id && !showQuestion && debugMode && (
              <View style={styles.sizeControls}>
                <Pressable 
                  style={styles.sizeButton} 
                  onPress={() => adjustElementSize(element.id, 'increase')}
                >
                  <Text style={styles.sizeButtonText}>+</Text>
                </Pressable>
                <Pressable 
                  style={styles.sizeButton} 
                  onPress={() => adjustElementSize(element.id, 'decrease')}
                >
                  <Text style={styles.sizeButtonText}>-</Text>
                </Pressable>
              </View>
            )}
          </Animated.View>
        ))}
      </View>

      {showResult && (
        <Animated.View style={styles.resultContainer}>
          <Text style={[styles.resultText, { color: isCorrect ? '#27ae60' : '#e74c3c' }]}>
            {isCorrect ? '✅ Tamang Sagot!' : '❌ Subukan Muli!'}
          </Text>
          <Text style={styles.resultExplanation}>
            {isCorrect 
              ? 'Tama! Ang mga hakbang ang pinakamainam gamitin bilang panukat ng haba ng lamesa.'
              : 'Ang mga hakbang ang pinakamainam gamitin bilang panukat ng haba ng lamesa.'
            }
          </Text>
          <Pressable style={styles.nextButton} onPress={finishGame}>
            <Text style={styles.nextButtonText}>Tapusin</Text>
          </Pressable>
        </Animated.View>
      )}


      {/* Settings Button */}
      <Pressable 
        style={styles.settingsButton} 
        onPress={() => setShowSettings(!showSettings)}
      >
        <Image
          source={require('../../../assets/game pngs/settings.png')}
          style={styles.settingsButtonImage}
          resizeMode="contain"
        />
      </Pressable>

      {/* Settings Panel */}
      {showSettings && (
        <>
          {/* Blurred Background Overlay */}
          <View style={styles.blurOverlay} />
          
          <View style={styles.settingsPanel}>
            <View style={styles.settingsHeader}>
              <Text style={styles.settingsTitle}>Settings</Text>
              <Pressable 
                style={styles.settingsCloseButton} 
                onPress={() => setShowSettings(false)}
              >
                <Text style={styles.settingsCloseButtonText}>✕</Text>
              </Pressable>
            </View>
          
          <View style={styles.settingsContent}>
            <Pressable style={styles.settingsOption} onPress={retryGame}>
              <Text style={styles.settingsOptionText}>Retry Game</Text>
            </Pressable>
            
            <Pressable style={styles.settingsOption} onPress={exitGame}>
              <Text style={styles.settingsOptionText}>Back to Main Menu</Text>
            </Pressable>
            
            <Pressable 
              style={[styles.settingsOption, debugMode ? styles.debugActiveOption : styles.debugOption]} 
              onPress={() => setDebugMode(!debugMode)}
            >
              <Text style={styles.settingsOptionText}>
                {debugMode ? '🔧 Debug Mode: ON' : '🔧 Debug Mode: OFF'}
              </Text>
            </Pressable>
            
            {debugMode && (
              <>
                <Pressable style={styles.debugSubOption} onPress={saveLayout}>
                  <Text style={styles.debugSubOptionText}>💾 Save Layout Permanently</Text>
                </Pressable>
                
                <Pressable style={styles.debugSubOption} onPress={loadLayout}>
                  <Text style={styles.debugSubOptionText}>📁 Load Saved Layout</Text>
                </Pressable>
                
                <Pressable style={styles.debugSubOption} onPress={clearSavedLayout}>
                  <Text style={styles.debugSubOptionText}>🗑️ Clear Saved Layout</Text>
                </Pressable>
              </>
            )}
          </View>
        </View>
        </>
      )}

    </ImageBackground>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    width: '100%',
    height: '100%',
  },
  header: {
    position: 'absolute',
    top: 20,
    left: 0,
    right: 0,
    alignItems: 'center',
    zIndex: 100,
  },
  title: {
    fontSize: 15,
    fontWeight: 'bold',
    color: '#fff',
    fontFamily: 'LeagueSpartan-Bold',
    textAlign: 'center',
    marginBottom: 5,
    textShadowColor: '#000',
    textShadowOffset: { width: 1, height: 1 },
    textShadowRadius: 3,
  },
  score: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#FFD700',
    textShadowColor: '#000',
    textShadowOffset: { width: 1, height: 1 },
    textShadowRadius: 2,
  },
  instructionContainer: {
    position: 'absolute',
    top: 80,
    left: 20,
    right: 20,
    backgroundColor: 'rgba(255, 255, 255, 0.95)',
    padding: 20,
    borderRadius: 15,
    zIndex: 100,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 4,
    elevation: 5,
  },
  instruction: {
    fontSize: 16,
    color: '#2c3e50',
    textAlign: 'center',
    fontFamily: 'LeagueSpartan-Bold',
    marginBottom: 10,
    lineHeight: 22,
  },
  question: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#e74c3c',
    textAlign: 'center',
    marginBottom: 10,
  },
  hint: {
    fontSize: 14,
    color: '#7f8c8d',
    textAlign: 'center',
    fontStyle: 'italic',
    marginBottom: 15,
  },
  startButton: {
    backgroundColor: '#27ae60',
    paddingHorizontal: 30,
    paddingVertical: 12,
    borderRadius: 25,
    alignSelf: 'center',
  },
  startButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: 'bold',
  },
  questionContainer: {
    position: 'absolute',
    top: 80,
    left: 20,
    right: 20,
    backgroundColor: 'rgba(255, 255, 255, 0.95)',
    padding: 20,
    borderRadius: 15,
    zIndex: 100,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 4,
    elevation: 5,
  },
  questionText: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#e74c3c',
    textAlign: 'center',
    marginBottom: 10,
  },
  choicesText: {
    fontSize: 16,
    color: '#2c3e50',
    textAlign: 'center',
    fontFamily: 'LeagueSpartan-Bold',
  },
  canvas: {
    flex: 1,
    position: 'relative',
  },
  elementContainer: {
    position: 'absolute',
  },
  element: {
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 4,
    elevation: 5,
  },
  // Removed selectedElement style - no blue border on selection
  disabledElement: {
    opacity: 0.6,
  },
  elementImage: {
    width: '100%',
    height: '100%',
  },
  elementLabel: {
    position: 'absolute',
    bottom: -30,
    left: 0,
    right: 0,
    backgroundColor: 'rgba(255, 255, 255, 0.9)',
    padding: 5,
    borderRadius: 10,
    alignItems: 'center',
  },
  elementEmoji: {
    fontSize: 20,
    marginBottom: 2,
  },
  elementName: {
    fontSize: 12,
    fontWeight: 'bold',
    color: '#2c3e50',
  },
  sizeControls: {
    position: 'absolute',
    top: -40,
    left: 0,
    right: 0,
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 10,
  },
  sizeButton: {
    backgroundColor: '#3498db',
    width: 30,
    height: 30,
    borderRadius: 15,
    justifyContent: 'center',
    alignItems: 'center',
  },
  sizeButtonText: {
    color: '#fff',
    fontSize: 18,
    fontWeight: 'bold',
  },
  resultContainer: {
    position: 'absolute',
    top: '50%',
    left: 20,
    right: 20,
    backgroundColor: 'rgba(255, 255, 255, 0.98)',
    padding: 30,
    borderRadius: 20,
    alignItems: 'center',
    zIndex: 200,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 10,
  },
  resultText: {
    fontSize: 24,
    fontWeight: 'bold',
    marginBottom: 15,
  },
  resultExplanation: {
    fontSize: 16,
    color: '#2c3e50',
    textAlign: 'center',
    marginBottom: 20,
    lineHeight: 22,
  },
  nextButton: {
    backgroundColor: '#27ae60',
    paddingHorizontal: 40,
    paddingVertical: 15,
    borderRadius: 25,
  },
  nextButtonText: {
    color: '#fff',
    fontSize: 18,
    fontWeight: 'bold',
  },
  settingsButton: {
    position: 'absolute',
    top: 2,
    left: 55,
    width: 700,
    height: 50,
    borderRadius: 25,
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 1000,
  },
  settingsButtonImage: {
    width: 155,
    height: 140,
  },
  settingsPanel: {
    position: 'absolute',
    top: '35%',
    left: '50%',
    transform: [{ translateX: -150 }, { translateY: -100 }],
    backgroundColor: 'rgba(255, 255, 255, 0.95)',
    width: 300,
    borderRadius: 20,
    zIndex: 2000,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.25,
    shadowRadius: 8,
    elevation: 10,
    borderWidth: 3,
    borderColor: '#3498db',
  },
  settingsHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 20,
    borderBottomWidth: 2,
    borderBottomColor: '#3498db',
    backgroundColor: 'rgba(52, 152, 219, 0.1)',
    borderTopLeftRadius: 17,
    borderTopRightRadius: 17,
  },
  settingsTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#2c3e50',
    fontFamily: 'LeagueSpartan-Bold',
    textShadowColor: '#000',
    textShadowOffset: { width: 1, height: 1 },
    textShadowRadius: 2,
  },
  settingsCloseButton: {
    backgroundColor: '#e74c3c',
    width: 35,
    height: 35,
    borderRadius: 17,
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 4,
    elevation: 5,
  },
  settingsCloseButtonText: {
    color: '#fff',
    fontSize: 18,
    fontWeight: 'bold',
  },
  settingsContent: {
    padding: 20,
    backgroundColor: 'rgba(255, 255, 255, 0.8)',
    borderBottomLeftRadius: 17,
    borderBottomRightRadius: 17,
  },
  settingsOption: {
    backgroundColor: '#27ae60',
    paddingHorizontal: 25,
    paddingVertical: 18,
    borderRadius: 20,
    marginBottom: 15,
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 4,
    elevation: 5,
    borderWidth: 2,
    borderColor: '#2ecc71',
  },
  settingsOptionText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: 'bold',
    fontFamily: 'LeagueSpartan-Bold',
    textShadowColor: '#000',
    textShadowOffset: { width: 1, height: 1 },
    textShadowRadius: 2,
  },
  debugOption: {
    backgroundColor: '#95a5a6',
  },
  debugActiveOption: {
    backgroundColor: '#e67e22',
    borderColor: '#d35400',
  },
  debugSubOption: {
    backgroundColor: '#34495e',
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderRadius: 15,
    marginBottom: 10,
    marginLeft: 20,
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 4,
    elevation: 5,
    borderWidth: 1,
    borderColor: '#2c3e50',
  },
  debugSubOptionText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: 'bold',
    fontFamily: 'LeagueSpartan-Bold',
  },
  resizeHandle: {
    position: 'absolute',
    backgroundColor: '#e74c3c',
    borderWidth: 3,
    borderColor: '#fff',
    borderRadius: 8,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.5,
    shadowRadius: 4,
    elevation: 8,
  },
  resizeHandleNW: {
    top: -10,
    left: -10,
    width: 20,
    height: 20,
  },
  resizeHandleNE: {
    top: -10,
    right: -10,
    width: 20,
    height: 20,
  },
  resizeHandleSW: {
    bottom: -10,
    left: -10,
    width: 20,
    height: 20,
  },
  resizeHandleSE: {
    bottom: -10,
    right: -10,
    width: 20,
    height: 20,
  },
  blurOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    zIndex: 100,
  },
});

export default Level2Game;
