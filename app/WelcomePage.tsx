import { useFonts } from 'expo-font';
import { useRouter } from 'expo-router';
import { useEffect, useRef } from 'react';
import { Animated, Dimensions, Image, StyleSheet, Text, TouchableOpacity, View } from 'react-native';

const { width, height } = Dimensions.get('window');

export default function WelcomePage() {
  const router = useRouter();
  const [fontsLoaded] = useFonts({
    'LeagueSpartan-Bold': require('../assets/fonts/LeagueSpartan-Bold.ttf'),
    'LuckiestGuy-Regular': require('../assets/fonts/LuckiestGuy-Regular.ttf'),
  });

  // Happy bouncy animation for logo
  const logoScale = useRef(new Animated.Value(1)).current;
  // Slow beating animation for start button
  const startButtonScale = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    // Beating animation for logo
    Animated.loop(
      Animated.sequence([
        Animated.timing(logoScale, { toValue: 1.1, duration: 800, useNativeDriver: true }),
        Animated.timing(logoScale, { toValue: 1, duration: 800, useNativeDriver: true }),
      ])
    ).start();

    // Slow beating animation for start button
    Animated.loop(
      Animated.sequence([
        Animated.timing(startButtonScale, { toValue: 1.1, duration: 1000, useNativeDriver: true }),
        Animated.timing(startButtonScale, { toValue: 1, duration: 1000, useNativeDriver: true }),
      ])
    ).start();
  }, []);

  if (!fontsLoaded) return null;

  return (
    <View style={styles.container}>
      {/* Background Image - Full screen schoolyard scene */}
      <Image 
        source={require('../assets/game pngs/bgWelcome.png')} 
        style={styles.backgroundImage} 
        resizeMode="cover" 
      />
      
      {/* Game Logo - 3D "MATH TATAG GAME" text with happy bouncy animation */}
      <View style={styles.logoContainer}>
        <Animated.Image 
          source={require('../assets/game pngs/logo.png')}
          style={[styles.gameLogo, { transform: [{ scale: logoScale }] }]}
          resizeMode="contain"
        />
      </View>

      {/* Quarter Name Display - 3D Effect */}
      <View style={styles.quarterContainer}>
        {/* Background shadow layer */}
        <Text style={[styles.quarterText, styles.quarterShadow]}>QUARTER 1</Text>
        {/* Main text layer */}
        <Text style={[styles.quarterText, styles.quarterMain]}>QUARTER 1</Text>
        {/* Highlight layer */}
      </View>

      {/* Start Game Button - Orange button with "START GAME" text */}
      <View style={styles.startButtonContainer}>
        <Animated.View style={{ transform: [{ scale: startButtonScale }] }}>
          <TouchableOpacity 
            style={styles.startButton}
            onPress={() => router.push('/LoadingScreen')}
            activeOpacity={0.8}
          >
            <Image 
              source={require('../assets/game pngs/start.png')}
              style={styles.startButtonImage}
              resizeMode="contain"
            />
          </TouchableOpacity>
        </Animated.View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#e3f2fd',
  },
  backgroundImage: {
    position: 'absolute',
    width: '100%',
    height: '100%',
    top: 0,
    left: 0,
    zIndex: 0,
  },
  logoContainer: {
    position: 'absolute',
    top: Math.max(30, height * 0.06),
    left: 0,
    right: 0,
    alignItems: 'center',
    zIndex: 2,
    paddingHorizontal: Math.max(20, width * 0.05),
  },
  gameLogo: {
    width: width * 0.7,
    height: 600,
    marginTop: -200,
    marginBottom: 0,
    zIndex: 2,
  },
  quarterContainer: {
    position: 'absolute',
    top: height * 0.6, // Adjust as needed
    left: 115,
    right: 0,
    alignItems: 'center',
    zIndex: 2,
    paddingHorizontal: Math.max(20, width * 0.05),
  },
  quarterText: {
    fontFamily: 'LuckiestGuy-Regular',
    fontSize: 36,
    letterSpacing: 2,
    position: 'absolute',
  },
  quarterShadow: {
    color: 'rgba(0,0,0,0.6)',
    top: 6,
    left: 6,
    zIndex: 1,
  },
  quarterMain: {
    color: '#FF6B35', // Vibrant orange that matches game theme
    top: 0,
    left: 0,
    zIndex: 2,
    textShadowColor: 'rgba(0,0,0,0.8)',
    textShadowOffset: { width: 2, height: 2 },
    textShadowRadius: 4,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.8,
    shadowRadius: 8,
    elevation: 10, // Android shadow
  },
  quarterHighlight: {
    color: '#FFB366', // Lighter orange for highlight
    top: -2,
    left: -2,
    zIndex: 3,
    fontSize: 34,
    opacity: 0.8,
  },
  startButtonContainer: {
    position: 'absolute',
    bottom: -50,
    left: 0,
    right: 0,
    alignItems: 'center',
    zIndex: 3,
  },
  startButton: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  startButtonImage: {
    width: 500,
    height: 500,
  },
}); 