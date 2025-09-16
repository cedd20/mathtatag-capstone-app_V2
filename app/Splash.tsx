import React, { useEffect } from 'react';
import { View, Text, StyleSheet, ImageBackground } from 'react-native';
import { useRouter } from 'expo-router';

export default function Splash() {
  const router = useRouter();

  useEffect(() => {
    const timer = setTimeout(() => {
      router.replace('/RoleSelection');
    }, 2000);
    return () => clearTimeout(timer);
  }, [router]);

  return (
    <ImageBackground
      source={require('../assets/images/splash-icon.png')}
      style={styles.background}
      resizeMode="contain"
      imageStyle={{ opacity: 0.01 }}
    >
      <View style={styles.container}>
        <Text style={styles.logoGreen}>MATH</Text>
        <Text style={styles.logoBlack}>TATAG</Text>
        <Text style={styles.version}>V1.1</Text>
      </View>
    </ImageBackground>
  );
}

const styles = StyleSheet.create({
  background: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    width: '100%',
    height: '100%',
    backgroundColor: '#fff',
  },
  container: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    width: '100%',
  },
  logoGreen: {
    fontSize: 60,
    fontWeight: 'bold',
    color: '#19c403',
    letterSpacing: 2,
  },
  logoBlack: {
    fontSize: 60,
    fontWeight: 'bold',
    color: '#222',
    letterSpacing: 2,
    marginTop: -15,
  },
  version: {
    position: 'absolute',
    bottom: 30,
    color: '#222',
    fontSize: 14,
    letterSpacing: 1,
  },
}); 