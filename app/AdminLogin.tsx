import { AntDesign } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useFonts } from 'expo-font';
import { useRouter } from 'expo-router';
import { signInWithEmailAndPassword } from 'firebase/auth';
import { get, ref } from 'firebase/database';
import React, { useEffect, useState } from 'react';
import { Alert, Dimensions, ImageBackground, KeyboardAvoidingView, Platform, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { auth, db } from '../constants/firebaseConfig';

const bgImage = require('../assets/images/bg.jpg');
const { width } = Dimensions.get('window');
const LOGO_WIDTH = width * 0.55;

export default function AdminLogin() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [rememberMe, setRememberMe] = useState(false);
  const [showPassword, setShowPassword] = useState(false);

  const [fontsLoaded] = useFonts({
    'LeagueSpartan-Bold': require('../assets/fonts/LeagueSpartan-Bold.ttf'),
  });

  useEffect(() => {
    (async () => {
      const saved = await AsyncStorage.getItem('admin-credentials');
      if (saved) {
        const { email, password } = JSON.parse(saved);
        setEmail(email);
        setPassword(password);
        setRememberMe(true);
      }
    })();
  }, []);

  if (!fontsLoaded) return null;

  async function handleLogin() {
    setLoading(true);
    try {
      const userCredential = await signInWithEmailAndPassword(auth, email, password);
      // Fetch admin UID from Realtime Database
      const adminRef = ref(db, 'Roles/Admin');
      const snapshot = await get(adminRef);
      const adminUid = snapshot.exists() ? snapshot.val() : null;
      setLoading(false);
      if (userCredential.user.uid === adminUid) {
        if (rememberMe) {
          await AsyncStorage.setItem('admin-credentials', JSON.stringify({ email, password }));
        } else {
          await AsyncStorage.removeItem('admin-credentials');
        }
        router.replace('/AdminDashboard');
      } else {
        Alert.alert('Access Denied', 'You do not have permission to access the admin dashboard.');
      }
    } catch (error: any) {
      setLoading(false);
      let message = 'Unable to log in. Please try again.';
      if (error.code === 'auth/user-not-found') message = 'No account found with that email address.';
      else if (error.code === 'auth/wrong-password') message = 'The password you entered is incorrect.';
      else if (error.code === 'auth/invalid-email') message = 'Please enter a valid email address.';
      else if (error.code === 'auth/invalid-credential') message = 'The email or password you entered is invalid.';
      Alert.alert('Login Failed', message);
    }
  }

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: '#f7fafc' }} edges={['left','right','bottom']}>
      <ImageBackground source={bgImage} style={styles.bg} imageStyle={{ opacity: 0.13, resizeMode: 'cover' }}>
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={styles.container}>
          <View style={styles.card}>
            <View style={styles.iconCircle}>
              <AntDesign name="user" size={38} color="#27ae60" />
            </View>
            <View style={styles.logoBox}>
              <Text style={[styles.logoMath, { fontFamily: 'LeagueSpartan-Bold' }]}>MATH</Text>
              <Text style={[styles.logoTatag, { fontFamily: 'LeagueSpartan-Bold' }]}>TATAG</Text>
            </View>
            <Text style={styles.title}>Admin Login</Text>
            <View style={styles.inputWrap}>
              <AntDesign name="mail" size={22} color="#27ae60" style={styles.inputIcon} />
              <TextInput
                style={styles.input}
                placeholder="Email"
                value={email}
                onChangeText={setEmail}
                autoCapitalize="none"
                keyboardType="email-address"
                textContentType="emailAddress"
                placeholderTextColor="#aaa"
              />
            </View>
            <View style={styles.inputWrap}>
              <AntDesign name="lock" size={22} color="#27ae60" style={styles.inputIcon} />
              <TextInput
                style={styles.input}
                placeholder="Password"
                value={password}
                onChangeText={setPassword}
                secureTextEntry={!showPassword}
                textContentType="password"
                placeholderTextColor="#aaa"
              />
              <TouchableOpacity onPress={() => setShowPassword(v => !v)} style={{ padding: 6, marginRight: 8 }}>
                <AntDesign name={showPassword ? 'eye' : 'eyeo'} size={22} color="#27ae60" />
              </TouchableOpacity>
            </View>
            <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 12, alignSelf: 'flex-start' }}>
              <TouchableOpacity
                onPress={() => setRememberMe(v => !v)}
                style={{ width: 22, height: 22, borderRadius: 6, borderWidth: 2, borderColor: '#27ae60', alignItems: 'center', justifyContent: 'center', marginRight: 8 }}
              >
                {rememberMe ? (
                  <View style={{ width: 14, height: 14, backgroundColor: '#27ae60', borderRadius: 3 }} />
                ) : null}
              </TouchableOpacity>
              <Text style={{ color: '#222', fontSize: 15 }}>Remember Me</Text>
            </View>
            <TouchableOpacity style={styles.loginBtn} onPress={handleLogin} disabled={loading} activeOpacity={0.85}>
              <Text style={styles.loginBtnText}>{loading ? 'Logging in...' : 'Login'}</Text>
            </TouchableOpacity>
          </View>
        </KeyboardAvoidingView>
      </ImageBackground>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  bg: {
    flex: 1,
    backgroundColor: '#f7fafc',
    width: '100%',
    height: '100%',
  },
  container: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    width: '100%',
    paddingHorizontal: 24,
  },
  card: {
    width: '90%',
    maxWidth: 400,
    backgroundColor: 'rgba(255,255,255,0.82)',
    borderRadius: 28,
    paddingVertical: 36,
    paddingHorizontal: 24,
    alignItems: 'center',
    shadowColor: '#27ae60',
    shadowOpacity: 0.13,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 6 },
    elevation: 8,
    borderWidth: 1.5,
    borderColor: 'rgba(39,174,96,0.09)',
    marginBottom: 18,
  },
  iconCircle: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: '#e0ffe6',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 8,
    shadowColor: '#27ae60',
    shadowOpacity: 0.10,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 2 },
  },
  logoBox: {
    alignItems: 'center',
    marginBottom: 8,
  },
  logoMath: {
    fontSize: LOGO_WIDTH / 7,
    fontWeight: '900',
    color: '#2ecc40',
    letterSpacing: 2,
    width: LOGO_WIDTH,
    textAlign: 'center',
    textShadowColor: 'rgba(40,40,40,0.32)',
    textShadowOffset: { width: 0, height: 2 },
    textShadowRadius: 3,
    marginBottom: -8,
  },
  logoTatag: {
    fontSize: LOGO_WIDTH / 8,
    fontWeight: '900',
    color: '#111',
    letterSpacing: 2,
    width: LOGO_WIDTH,
    textAlign: 'center',
    textShadowColor: 'rgba(40,40,40,0.32)',
    textShadowOffset: { width: 0, height: 2 },
    textShadowRadius: 3,
    marginTop: 0,
  },
  inputWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    width: '100%',
    backgroundColor: 'rgba(255,255,255,0.92)',
    borderRadius: 24,
    borderWidth: 1.5,
    borderColor: '#e0f7e2',
    marginBottom: 16,
    shadowColor: '#27ae60',
    shadowOpacity: 0.07,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 2 },
  },
  inputIcon: {
    marginLeft: 16,
    marginRight: 8,
  },
  input: {
    flex: 1,
    height: 48,
    fontSize: 17,
    color: '#222',
    paddingHorizontal: 0,
    backgroundColor: 'transparent',
  },
  loginBtn: {
    width: '100%',
    borderRadius: 30,
    paddingVertical: 16,
    alignItems: 'center',
    marginTop: 10,
    elevation: 3,
    shadowColor: '#27ae60',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.18,
    shadowRadius: 8,
    backgroundColor: '#27ae60',
  },
  loginBtnText: {
    color: '#fff',
    fontWeight: 'bold',
    fontSize: 18,
    letterSpacing: 0.5,
  },
  title: {
    fontSize: 26,
    fontWeight: 'bold',
    color: '#27ae60',
    marginBottom: 28,
    letterSpacing: 0.5,
  },
}); 