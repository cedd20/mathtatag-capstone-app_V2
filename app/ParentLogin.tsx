import { AntDesign, MaterialCommunityIcons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useFonts } from 'expo-font';
import { useRouter } from 'expo-router';
import { get, ref } from 'firebase/database';
import React, { useEffect, useState } from 'react';
import { Dimensions, ImageBackground, KeyboardAvoidingView, Platform, StyleSheet, Text, TextInput, TouchableOpacity, View, Modal, ScrollView, NativeSyntheticEvent, NativeScrollEvent } from 'react-native';
import { db } from '../constants/firebaseConfig';

const { width } = Dimensions.get('window'); // Removed unused height variable

export default function ParentLogin() {
  const router = useRouter();
  const [parentKey, setParentKey] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [fontsLoaded] = useFonts({
    'LeagueSpartan-Bold': require('../assets/fonts/LeagueSpartan-Bold.ttf'),
  });

  const TERMS_KEY = 'parentAgreedToTerms';
  const TERMS_TEXT = `MATH TATAG - TERMS AND CONDITIONS\n\n1. Data Privacy: We comply with the Philippine Data Privacy Act (RA 10173). Your personal information is collected, processed, and stored solely for educational purposes. We do not sell or share your data with third parties except as required by law.\n\n2. Consent: By using this app, you consent to the collection and use of your data for learning analytics, progress tracking, and communication with your school.\n\n3. User Responsibilities: You agree to use this app for lawful, educational purposes only. Do not share your login credentials.\n\n4. Intellectual Property: All content, including lessons and activities, is owned by the app developers and licensors.\n\n5. Limitation of Liability: The app is provided as-is. We are not liable for any damages arising from its use.\n\n6. Updates: We may update these terms. Continued use means you accept the new terms.\n\n7. Contact: For privacy concerns, contact your school or the app administrator.\n\nBy agreeing, you acknowledge you have read and understood these terms in accordance with Philippine law.`;

  const [showTermsModal, setShowTermsModal] = useState(false);
  const [agreedToTerms, setAgreedToTerms] = useState(false);
  const [canCheckAgreement, setCanCheckAgreement] = useState(false);
  const [hasScrolledToEnd, setHasScrolledToEnd] = useState(false);

  useEffect(() => {
    // Load last used parent key
    AsyncStorage.getItem('lastParentKey').then(key => {
      if (key) setParentKey(key);
    });
  }, []);

  // On mount, check AsyncStorage for agreement
  useEffect(() => {
    AsyncStorage.getItem(TERMS_KEY).then(val => {
      if (val === 'true') {
        setAgreedToTerms(true);
        setCanCheckAgreement(true);
      } else {
        setShowTermsModal(true);
      }
    });
  }, []);

  // Handler for opening terms modal
  const openTerms = () => setShowTermsModal(true);

  // Handler for agreeing
  const handleAgree = async () => {
    setShowTermsModal(false);
    setAgreedToTerms(true);
    setCanCheckAgreement(true);
    await AsyncStorage.setItem(TERMS_KEY, 'true');
  };

  // Handler for scroll to end
  const handleTermsScroll = (e: NativeSyntheticEvent<NativeScrollEvent>) => {
    const { layoutMeasurement, contentOffset, contentSize } = e.nativeEvent;
    if (layoutMeasurement.height + contentOffset.y >= contentSize.height - 20) {
      setHasScrolledToEnd(true);
    }
  };

  const handleLogin = async () => {
    setError('');
    setLoading(true);
    try {
      // Search Parents node for matching authCode
      const parentsRef = ref(db, 'Parents');
      const snapshot = await get(parentsRef);
      if (!snapshot.exists()) {
        setError('No parent accounts found.');
        setLoading(false);
        return;
      }
      const parents = snapshot.val();
      let foundParent = null;
      for (const key in parents) {
        if (parents[key].authCode === parentKey.trim()) {
          foundParent = { ...parents[key], dbKey: key };
          break;
        }
      }
      if (!foundParent) {
        setError('Invalid Parent Key. Please try again.');
        setLoading(false);
        return;
      }
      // Save last used key
      await AsyncStorage.setItem('lastParentKey', parentKey.trim());
      // Check if name or contact is missing/empty
      const needsSetup = !foundParent.name || !foundParent.contact;
      // Pass parentId and setup flag to dashboard
      router.replace({
        pathname: '/ParentDashboard',
        params: { parentId: foundParent.dbKey, needsSetup: needsSetup ? '1' : '0' },
      });
    } catch {
      setError('Login failed. Please try again.');
    }
    setLoading(false);
  };

  if (!fontsLoaded) return null;

  return (
    <ImageBackground
      source={require('../assets/images/bg.jpg')}
      style={styles.background}
      resizeMode="cover"
      imageStyle={{ opacity: 0.13 }}
    >
      {/* Gradient overlay for depth */}
      <View style={styles.gradientOverlay} pointerEvents="none" />
      <KeyboardAvoidingView
        style={styles.container}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <View style={styles.card}>
          {/* Parent icon */}
          <View style={styles.iconCircle}>
            <MaterialCommunityIcons name="account-group" size={38} color="#27ae60" />
          </View>
          <View style={styles.logoBox}>
            <Text style={[styles.logoMath, { fontFamily: 'LeagueSpartan-Bold' }]}>MATH</Text>
            <Text style={[styles.logoTatag, { fontFamily: 'LeagueSpartan-Bold' }]}>TATAG</Text>
          </View>
          <Text style={styles.title}>Parent Login</Text>
          <View style={styles.inputWrap}>
            <AntDesign name="idcard" size={22} color="#27ae60" style={styles.inputIcon} />
            <TextInput
              style={styles.input}
              placeholder="Enter Parent Key"
              placeholderTextColor="#888"
              value={parentKey}
              onChangeText={setParentKey}
              autoCapitalize="characters"
              autoCorrect={false}
            />
          </View>
          {error ? <Text style={{ color: '#ff5a5a', marginBottom: 8 }}>{error}</Text> : null}
          <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: 10, marginBottom: 6 }}>
            <TouchableOpacity
              style={{ width: 22, height: 22, borderRadius: 6, borderWidth: 2, borderColor: '#27ae60', alignItems: 'center', justifyContent: 'center', marginRight: 8 }}
              disabled={!canCheckAgreement}
              onPress={() => canCheckAgreement && setAgreedToTerms(v => !v)}
            >
              {agreedToTerms ? (
                <View style={{ width: 14, height: 14, backgroundColor: '#27ae60', borderRadius: 3 }} />
              ) : null}
            </TouchableOpacity>
            <Text style={{ color: '#222', fontSize: 15 }}>
              I agree to the 
              <Text style={{ color: '#27ae60', textDecorationLine: 'underline' }} onPress={openTerms}>Terms and Conditions</Text>
            </Text>
          </View>
          <TouchableOpacity style={styles.button} onPress={handleLogin} activeOpacity={0.85} disabled={loading || !agreedToTerms}>
            <Text style={styles.buttonText}>{loading ? 'Logging in...' : 'Login'}</Text>
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>
      <Modal visible={showTermsModal} animationType="slide" transparent>
        <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.18)', justifyContent: 'center', alignItems: 'center' }}>
          <View style={{ width: '90%', maxWidth: 420, backgroundColor: '#fff', borderRadius: 18, padding: 0, overflow: 'hidden', maxHeight: '85%' }}>
            <Text style={{ fontWeight: 'bold', fontSize: 20, color: '#27ae60', textAlign: 'center', marginTop: 18, marginBottom: 8 }}>Terms and Conditions</Text>
            <ScrollView style={{ paddingHorizontal: 18, paddingBottom: 18, maxHeight: 380 }} onScroll={handleTermsScroll} scrollEventThrottle={16} showsVerticalScrollIndicator={true}>
              <Text style={{ fontSize: 15, color: '#222', lineHeight: 22 }}>{TERMS_TEXT}</Text>
            </ScrollView>
            <TouchableOpacity
              style={{ backgroundColor: hasScrolledToEnd ? '#27ae60' : '#bbb', borderRadius: 16, margin: 18, paddingVertical: 12, alignItems: 'center' }}
              disabled={!hasScrolledToEnd}
              onPress={handleAgree}
            >
              <Text style={{ color: '#fff', fontWeight: 'bold', fontSize: 16 }}>Agree</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </ImageBackground>
  );
}

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
    paddingHorizontal: 24,
  },
  gradientOverlay: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 1,
    backgroundColor: '#e0ffe6',
    opacity: 0.18,
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
  button: {
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
  buttonText: {
    color: '#fff',
    fontSize: 20,
    fontWeight: 'bold',
    letterSpacing: 1,
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
  title: {
    fontSize: 24,
    fontWeight: '700',
    color: '#111',
    marginBottom: 24,
    textAlign: 'center',
  },
}); 