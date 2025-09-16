import { useFonts } from 'expo-font';
import { useRouter } from 'expo-router';
import React, { useEffect, useRef } from 'react';
import { Animated, Dimensions, ImageBackground, StyleSheet, Text, View } from 'react-native';

const { width, height } = Dimensions.get('window');

export default function Index() {
  const router = useRouter();
  const bounceAnim = useRef(new Animated.Value(0.5)).current;
  const mathColorAnim = useRef(new Animated.Value(0)).current;
  const versionAnim = useRef(new Animated.Value(0)).current;
  const [fontsLoaded] = useFonts({
    'LeagueSpartan-Bold': require('../assets/fonts/LeagueSpartan-Bold.ttf'),
  });

  useEffect(() => {
    // Logo bounce
    Animated.spring(bounceAnim, {
      toValue: 1,
      friction: 4,
      tension: 80,
      useNativeDriver: true,
    }).start();
    // rcolor pulse
    Animated.loop(
      Animated.sequence([
        Animated.timing(mathColorAnim, {
          toValue: 1,
          duration: 600,
          useNativeDriver: false,
        }),
        Animated.timing(mathColorAnim, {
          toValue: 0,
          duration: 600,
          useNativeDriver: false,
        }),
      ])
    ).start();
    // Version pop-in
    setTimeout(() => {
      Animated.spring(versionAnim, {
        toValue: 1,
        friction: 5,
        tension: 60,
        useNativeDriver: true,
      }).start();
    }, 1200);
    // Navigate after 2s
    const timer = setTimeout(() => {
      router.replace('/RoleSelection');
    }, 2000);
    return () => clearTimeout(timer);
  }, [router, bounceAnim, mathColorAnim, versionAnim]);

  // Interpolate color for MATH
  const mathColor = mathColorAnim.interpolate({
    inputRange: [0, 1],
    outputRange: ['#2ecc40', '#27c33a'],
  });

  if (!fontsLoaded) {
    return (
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#fff' }}>
        <Text>Loading...</Text>
      </View>
    );
  }

  return (
    <ImageBackground
      source={require('../assets/images/bg2.jpg')}
      style={styles.background}
      resizeMode="cover"
      imageStyle={{ opacity: 0.13 }}
    >
      <View style={styles.container}>
        <Animated.View style={{ alignItems: 'center', transform: [{ scale: bounceAnim }] }}>
          <Animated.Text
            style={[
              styles.logoMath,
              { color: mathColor, fontFamily: 'LeagueSpartan-Bold' },
            ]}
            numberOfLines={1}
            adjustsFontSizeToFit
          >
            MATH
          </Animated.Text>
          <Text
            style={[
              styles.logoTatag,
              { fontFamily: 'LeagueSpartan-Bold' },
            ]}
            numberOfLines={1}
            adjustsFontSizeToFit
          >
            TATAG
          </Text>
        </Animated.View>
        <Animated.Text style={[styles.version, { transform: [{ scale: versionAnim }] }]}>V1.1</Animated.Text>
      </View>
    </ImageBackground>
  );
}

// Make the logo a little smaller
const LOGO_WIDTH = width * 0.55;

const styles = StyleSheet.create({
  background: {
    flex: 1,
    width: '100%',
    height: '100%',
    backgroundColor: '#fff',
  },
  container: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    width: '100%',
    height: '100%',
  },
  logoMath: {
    fontSize: LOGO_WIDTH / 2.1, // Slightly smaller font size for MATH
    fontWeight: '900',
    letterSpacing: 2,
    width: LOGO_WIDTH,
    textAlign: 'center',
    textShadowColor: 'rgba(40,40,40,0.32)', // grayish black shadow
    textShadowOffset: { width: 0, height: 6 },
    textShadowRadius: 6,
    marginBottom: -8,
  },
  logoTatag: {
    fontSize: LOGO_WIDTH / 3.1, // Slightly smaller font size for TATAG
    fontWeight: '900',
    color: '#111',
    letterSpacing: 2,
    width: LOGO_WIDTH,
    textAlign: 'center',
    textShadowColor: 'rgba(40,40,40,0.32)', // grayish black shadow
    textShadowOffset: { width: 0, height: 6 },
    textShadowRadius: 6,
    marginTop: 0,
  },
  version: {
    position: 'absolute',
    bottom: height * 0.04,
    color: '#bbb',
    fontSize: 13,
    letterSpacing: 1,
    fontWeight: '400',
    alignSelf: 'center',
    opacity: 0.7,
    transform: [{ scale: 0 }], // initial scale for animation
  },
}); 