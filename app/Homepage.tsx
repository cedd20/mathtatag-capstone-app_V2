import AsyncStorage from '@react-native-async-storage/async-storage';
import Slider from '@react-native-community/slider';
import { Audio } from 'expo-av';
import { useRouter } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { Animated, Dimensions, Image, Modal, Pressable, ScrollView, StyleSheet, Switch, Text, TouchableOpacity, View } from 'react-native';


const bgWelcome = require('../assets/game pngs/bgWelcome.png');
const logo = require('../assets/game pngs/logo.png');
const settings = require('../assets/game pngs/settings.png');
const play = require('../assets/game pngs/play.png');
const about = require('../assets/game pngs/about.png');
const home = require('../assets/game pngs/home.png');
const lock = require('../assets/game pngs/lock.png');
const map1 = require('../assets/game pngs/map1.png');
const map2 = require('../assets/game pngs/map2.png');
const map3 = require('../assets/game pngs/map3.png');
const map4 = require('../assets/game pngs/map4.png');
const map5 = require('../assets/game pngs/map5.png');
const map6 = require('../assets/game pngs/map6.png');
const map7 = require('../assets/game pngs/map7.png');
const map8 = require('../assets/game pngs/map8.png');
const map9 = require('../assets/game pngs/map9.png');
const map10 = require('../assets/game pngs/map10.png');
const map11 = require('../assets/game pngs/map11.png');
const map12 = require('../assets/game pngs/map12.png');
const deck = require('../assets/game pngs/deck.png');
const arrowL = require('../assets/game pngs/arrowL.png');
const arrowR = require('../assets/game pngs/arrowR.png');
const bgMusic = require('../assets/music/Kids Playing Funny Background Music For Videos.mp3');

const { width, height } = Dimensions.get('window');

export default function Homepage() {
  const router = useRouter();
  const fadeAnim = useRef(new Animated.Value(0)).current;
  const playScale = useRef(new Animated.Value(1)).current;
  const logoBeat = useRef(new Animated.Value(1)).current;
  const [settingsVisible, setSettingsVisible] = useState(false);
  const [sfxVolume, setSfxVolume] = useState(0.5);
  const [musicVolume, setMusicVolume] = useState(0.3);
  const [isMusicEnabled, setIsMusicEnabled] = useState(true);
  const [isEnglish, setIsEnglish] = useState(true);
  const [sound, setSound] = useState<Audio.Sound | null>(null);

  // Animated values for map pulsing
  const mapScales = [
    useRef(new Animated.Value(1)).current,
    useRef(new Animated.Value(1)).current,
    useRef(new Animated.Value(1)).current,
    useRef(new Animated.Value(1)).current,
    useRef(new Animated.Value(1)).current,
    useRef(new Animated.Value(1)).current,
    useRef(new Animated.Value(1)).current,
    useRef(new Animated.Value(1)).current,
    useRef(new Animated.Value(1)).current,
    useRef(new Animated.Value(1)).current,
    useRef(new Animated.Value(1)).current,
    useRef(new Animated.Value(1)).current,
  ];
  // Animated values for map 3D rotation
  const mapRotations = [
    useRef(new Animated.Value(0)).current,
    useRef(new Animated.Value(0)).current,
    useRef(new Animated.Value(0)).current,
    useRef(new Animated.Value(0)).current,
    useRef(new Animated.Value(0)).current,
    useRef(new Animated.Value(0)).current,
    useRef(new Animated.Value(0)).current,
    useRef(new Animated.Value(0)).current,
    useRef(new Animated.Value(0)).current,
    useRef(new Animated.Value(0)).current,
    useRef(new Animated.Value(0)).current,
    useRef(new Animated.Value(0)).current,
  ];
  // Animated value for lock beating
  const lockBeat = useRef(new Animated.Value(1)).current;

  // Load settings from storage on mount
  useEffect(() => {
    (async () => {
      try {
        const storedSfx = await AsyncStorage.getItem('sfxVolume');
        if (storedSfx !== null) setSfxVolume(Number(storedSfx));
        const storedMusic = await AsyncStorage.getItem('musicVolume');
        if (storedMusic !== null) setMusicVolume(Number(storedMusic));
        const storedMusicEnabled = await AsyncStorage.getItem('isMusicEnabled');
        if (storedMusicEnabled !== null) setIsMusicEnabled(JSON.parse(storedMusicEnabled));
        const lang = await AsyncStorage.getItem('isEnglish');
        if (lang !== null) setIsEnglish(JSON.parse(lang));
      } catch {}
    })();
  }, []);

  // Persist SFX volume when changed
  useEffect(() => {
    AsyncStorage.setItem('sfxVolume', String(sfxVolume));
  }, [sfxVolume]);

  // Persist music volume when changed
  useEffect(() => {
    AsyncStorage.setItem('musicVolume', String(musicVolume));
  }, [musicVolume]);

  // Persist music enabled setting
  useEffect(() => {
    AsyncStorage.setItem('isMusicEnabled', JSON.stringify(isMusicEnabled));
  }, [isMusicEnabled]);

  // Persist language setting
  useEffect(() => {
    AsyncStorage.setItem('isEnglish', JSON.stringify(isEnglish));
  }, [isEnglish]);

  // Initialize and play background music
  useEffect(() => {
    let isMounted = true;

    const setupMusic = async () => {
      try {
        await Audio.setAudioModeAsync({
          allowsRecordingIOS: false,
          staysActiveInBackground: false,
          playsInSilentModeIOS: true,
          shouldDuckAndroid: true,
          playThroughEarpieceAndroid: false,
        });

        const { sound: newSound } = await Audio.Sound.createAsync(bgMusic, {
          shouldPlay: isMusicEnabled,
          isLooping: true,
          volume: musicVolume,
        });

        if (isMounted) {
          setSound(newSound);
        }
      } catch (error) {
        console.log('Error loading background music:', error);
      }
    };

    setupMusic();

    return () => {
      isMounted = false;
      if (sound) {
        sound.unloadAsync();
      }
    };
  }, []);

  // Update music volume when changed
  useEffect(() => {
    if (sound) {
      sound.setVolumeAsync(musicVolume);
    }
  }, [musicVolume, sound]);

  // Play/pause music when enabled/disabled
  useEffect(() => {
    if (sound) {
      if (isMusicEnabled) {
        sound.playAsync();
      } else {
        sound.pauseAsync();
      }
    }
  }, [isMusicEnabled, sound]);

  // Home button handler
  const handleHome = async () => {
    // Retrieve last studentId and classId from AsyncStorage
    const studentId = await AsyncStorage.getItem('lastStudentId');
    const classId = await AsyncStorage.getItem('lastClassId');
    if (studentId) {
      router.replace({ pathname: '/WelcomePage', params: { studentId, classId } });
    } else {
      router.replace('/WelcomePage');
    }
  };

  const handlePlay = async () => {
    // Map navigation based on selected week
    const mapRoutes = [
      '/Map1Stages',   // Week 1 → Map1
      '/Map2Stages',   // Week 2 → Map2
      '/Map3Stages',   // Week 3 → Map3
      '/Map4Stages',   // Week 4 → Map4
      '/Map5Stages',   // Week 5 → Map5
      '/Map6Stages',   // Week 6 → Map6
      '/Map7Stages',   // Week 7 → Map7
      '/Map8Stages',   // Week 8 → Map8
      '/Map9Stages',   // Week 9 → Map9
      '/Map10Stages',  // Week 10 → Map10
      '/Map11Stages',  // Week 11 → Map11
      '/Map12Stages',  // Week 12 → Map12
    ];

    if (currentMapIdx < mapRoutes.length) {
      router.push(mapRoutes[currentMapIdx] as any);
    } else {
      alert(isEnglish 
        ? 'Sorry this map is not Available yet. The map is under Maintenance!'
        : 'Paumanhin, ang mapang ito ay hindi pa available. Ang mapa ay kasalukuyang nasa ilalim ng maintenance!');
    }
  };

  useEffect(() => {
    Animated.timing(fadeAnim, {
      toValue: 1,
      duration: 500,
      useNativeDriver: true,
    }).start();

    // Heartbeat animation for play button
    Animated.loop(
      Animated.sequence([
        // First beat (stronger)
        Animated.timing(playScale, { toValue: 1.15, duration: 200, useNativeDriver: true }),
        Animated.timing(playScale, { toValue: 1, duration: 200, useNativeDriver: true }),
        // Small pause
        Animated.delay(100),
        // Second beat (weaker)
        Animated.timing(playScale, { toValue: 1.08, duration: 200, useNativeDriver: true }),
        Animated.timing(playScale, { toValue: 1, duration: 200, useNativeDriver: true }),
        // Rest period
        Animated.delay(800),
      ])
    ).start();

    // Pulse animation for logo (classic smooth in-and-out)
    Animated.loop(
      Animated.sequence([
        Animated.timing(logoBeat, { toValue: 1.12, duration: 900, useNativeDriver: true }),
        Animated.timing(logoBeat, { toValue: 1, duration: 900, useNativeDriver: true }),
      ])
    ).start();

    // Pulsing maps in succession
    const pulseMap = (idx: number) => {
      Animated.loop(
        Animated.sequence([
          Animated.delay(idx * 500), // stagger start (slower)
          Animated.timing(mapScales[idx], { toValue: 1.15, duration: 700, useNativeDriver: true }),
          Animated.timing(mapScales[idx], { toValue: 1, duration: 700, useNativeDriver: true }),
          Animated.delay(2000 - idx * 500), // keep total cycle time consistent (slower)
        ])
      ).start();
    };
    mapScales.forEach((_, idx) => pulseMap(idx));

    // 3D rotation animation for maps
    const animateRotation = (idx: number) => {
      Animated.loop(
        Animated.sequence([
          Animated.timing(mapRotations[idx], {
            toValue: 1,
            duration: 1800,
            useNativeDriver: true,
          }),
          Animated.timing(mapRotations[idx], {
            toValue: 0,
            duration: 1800,
            useNativeDriver: true,
          }),
        ])
      ).start();
    };
    mapRotations.forEach((_, idx) => animateRotation(idx));

    // Beating animation for lock icon
    Animated.loop(
      Animated.sequence([
        Animated.timing(lockBeat, { toValue: 1.18, duration: 600, useNativeDriver: true }),
        Animated.timing(lockBeat, { toValue: 1, duration: 600, useNativeDriver: true }),
        Animated.delay(400),
        Animated.timing(lockBeat, { toValue: 1.10, duration: 400, useNativeDriver: true }),
        Animated.timing(lockBeat, { toValue: 1, duration: 400, useNativeDriver: true }),
        Animated.delay(1200),
      ])
    ).start();
  }, []);

  // About modal state
  const [aboutVisible, setAboutVisible] = useState(false);
  // Add state for terms checkbox
  const [termsChecked, setTermsChecked] = useState(false);

  // Language-aware text
  const t = {
    welcome: isEnglish ? 'Welcome to Mathtatag!' : 'Maligayang pagdating sa Mathtatag!',
    play: isEnglish ? 'Play' : 'Maglaro',
    about: isEnglish ? 'About' : 'Tungkol',
    home: isEnglish ? 'Home' : 'Bahay',
    settings: isEnglish ? 'Settings' : 'Mga Setting',
    sfxVolume: isEnglish ? 'SFX Volume:' : 'Dami ng SFX:',
    musicVolume: isEnglish ? 'Music Volume:' : 'Dami ng Musika:',
    musicEnabled: isEnglish ? 'Background Music:' : 'Musika sa Likod:',
    language: isEnglish ? 'Language:' : 'Wika:',
    english: 'ENGLISH',
    tagalog: 'TAGALOG',
    close: isEnglish ? 'Close' : 'Isara',
    termsTitle: isEnglish ? 'Terms & Conditions' : 'Mga Tuntunin at Kundisyon',
    terms: isEnglish
      ? `Welcome to Mathtatag! By using this app, you agree to the following:\n\n1. Educational Use: This app is designed for students, parents, and teachers to support math learning and progress tracking.\n2. Data Privacy: Your personal information and progress data are stored securely and used only for educational purposes within the app.\n3. Parental Consent: Parents must supervise and consent to their child's use of the app.\n4. No Cheating: Users agree not to misuse the app or falsify test results.\n5. Content Ownership: All images, music, and content are property of Mathtatag or their respective owners.\n6. Updates: The app may update features or terms at any time.\n7. Support: For questions or issues, contact your teacher or app support.\n\nBy continuing to use Mathtatag, you accept these terms.`
      : `Maligayang pagdating sa Mathtatag! Sa paggamit ng app na ito, sumasang-ayon ka sa mga sumusunod:\n\n1. Para sa Edukasyon: Ang app na ito ay para sa mga mag-aaral, magulang, at guro upang suportahan ang pagkatuto sa matematika at pagsubaybay ng progreso.\n2. Privacy ng Data: Ang iyong impormasyon at datos ng progreso ay ligtas at ginagamit lamang para sa edukasyonal na layunin sa app.\n3. Pahintulot ng Magulang: Kailangang may gabay at pahintulot ng magulang ang paggamit ng app ng bata.\n4. Iwasan ang Pandaraya: Sumasang-ayon ang mga gumagamit na hindi gagamitin ang app sa maling paraan o magpepeke ng resulta.\n5. Karapatan sa Nilalaman: Lahat ng larawan, musika, at nilalaman ay pag-aari ng Mathtatag o ng may-ari nito.\n6. Update: Maaring magbago ang app ng mga tampok o tuntunin anumang oras.\n7. Suporta: Para sa tanong o isyu, kontakin ang iyong guro o app support.\n\nSa pagpapatuloy ng paggamit ng Mathtatag, tinatanggap mo ang mga tuntuning ito.`
  };

  const mapImages = [map1, map2, map3, map4, map5, map6, map7, map8, map9, map10, map11, map12];
  const mapNames = [
    'SCHOOL', 'MALL', 'ISLAND', 'FOREST',
    'HOUSE', 'TEMPLE', 'LABORATORY', 'ATLANTIC',
    'ICELAND', 'LAND', 'Haunted House', 'VOLCANO'
  ];
  const [currentMapIdx, setCurrentMapIdx] = useState(0);

  return (
    <Animated.View style={[styles.container, { opacity: fadeAnim }]}> 
      {/* Background */}
      <Image source={bgWelcome} style={styles.bg} resizeMode="cover" />

      {/* Settings Button */}
      <TouchableOpacity style={styles.settingsBtn} onPress={() => setSettingsVisible(true)}>
        <Image source={settings} style={styles.settingsIcon} resizeMode="contain" />
      </TouchableOpacity>

      {/* Settings Panel Modal */}
      <Modal
        visible={settingsVisible}
        transparent
        animationType="slide"
        onRequestClose={() => setSettingsVisible(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.settingsPanel}>
            <Text style={styles.panelTitle}>{t.settings}</Text>
            {/* SFX Volume */}
            <View style={styles.settingRow}>
              <Text style={styles.settingLabel}>{t.sfxVolume}</Text>
              <Slider
                style={{ width: 150, height: 40 }}
                minimumValue={0}
                maximumValue={1}
                value={sfxVolume}
                onValueChange={setSfxVolume}
                minimumTrackTintColor="#1fb28a"
                maximumTrackTintColor="#d3d3d3"
                thumbTintColor="#1fb28a"
              />
              <Text style={styles.settingValue}>{Math.round(sfxVolume * 100)}%</Text>
            </View>
            {/* Music Volume */}
            <View style={styles.settingRow}>
              <Text style={styles.settingLabel}>{t.musicVolume}</Text>
              <Slider
                style={{ width: 150, height: 40 }}
                minimumValue={0}
                maximumValue={1}
                value={musicVolume}
                onValueChange={setMusicVolume}
                minimumTrackTintColor="#1fb28a"
                maximumTrackTintColor="#d3d3d3"
                thumbTintColor="#1fb28a"
              />
              <Text style={styles.settingValue}>{Math.round(musicVolume * 100)}%</Text>
            </View>
            {/* Music Toggle */}
            <View style={styles.settingRow}>
              <Text style={styles.settingLabel}>{t.musicEnabled}</Text>
              <Switch
                value={isMusicEnabled}
                onValueChange={setIsMusicEnabled}
                thumbColor={isMusicEnabled ? '#1fb28a' : '#ccc'}
                trackColor={{ false: '#d3d3d3', true: '#1fb28a' }}
              />
            </View>
            {/* Language Selector */}
            <View style={styles.settingRow}>
              <Text style={styles.settingLabel}>{t.language}</Text>
              <View style={styles.languageToggle}>
                <Text style={[styles.langOption, isEnglish && styles.langSelected]}>{t.english}</Text>
                <Switch
                  value={!isEnglish}
                  onValueChange={() => setIsEnglish((prev) => !prev)}
                  thumbColor={isEnglish ? '#ccc' : '#1fb28a'}
                  trackColor={{ false: '#d3d3d3', true: '#1fb28a' }}
                />
                <Text style={[styles.langOption, !isEnglish && styles.langSelected]}>{t.tagalog}</Text>
              </View>
            </View>
            {/* Close Button */}
            <Pressable style={styles.closeBtn} onPress={() => setSettingsVisible(false)}>
              <Text style={styles.closeBtnText}>{t.close}</Text>
            </Pressable>
          </View>
        </View>
      </Modal>

      {/* About Modal (Terms & Conditions) */}
      <Modal
        visible={aboutVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setAboutVisible(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.aboutPanel}>
            <Text style={styles.termsTitle}>{t.termsTitle}</Text>
            <ScrollView style={styles.termsScroll} contentContainerStyle={{ paddingHorizontal: 8 }}>
              {/* Render terms up to 7th condition, then add checkbox */}
              <Text style={styles.termsText}>
                {(() => {
                  // Split terms into lines for English and Tagalog
                  const lines = t.terms.split('\n');
                  // Find the line with '7. Support:'
                  const idx7 = lines.findIndex(l => l.trim().startsWith('7.'));
                  if (idx7 === -1) return t.terms;
                  // Render up to and including 7th condition
                  return [
                    ...lines.slice(0, idx7 + 1).map((l, i) => l + '\n'),
                  ];
                })()}
              </Text>
              {/* Checkbox for agreement */}
              <View style={{ flexDirection: 'row', alignItems: 'center', marginVertical: 10 }}>
                <Switch
                  value={termsChecked}
                  onValueChange={setTermsChecked}
                  thumbColor={termsChecked ? '#1fb28a' : '#ccc'}
                  trackColor={{ false: '#d3d3d3', true: '#1fb28a' }}
                />
                <Text style={{ marginLeft: 10, fontSize: 14, color: '#333' }}>
                  {isEnglish ? 'I have read and agree to the Terms & Conditions' : 'Nabasa at sumasang-ayon ako sa Mga Tuntunin at Kundisyon'}
                </Text>
              </View>
              {/* Render the rest of the terms (if any) */}
              <Text style={styles.termsText}>
                {(() => {
                  const lines = t.terms.split('\n');
                  const idx7 = lines.findIndex(l => l.trim().startsWith('7.'));
                  if (idx7 === -1) return '';
                  return lines.slice(idx7 + 1).join('\n');
                })()}
              </Text>
            </ScrollView>
            <Pressable style={[styles.closeBtn, { opacity: termsChecked ? 1 : 0.5 }]} onPress={() => { if (termsChecked) { setAboutVisible(false); setTermsChecked(false); } }} disabled={!termsChecked}>
              <Text style={styles.closeBtnText}>{t.close}</Text>
            </Pressable>
          </View>
        </View>
      </Modal>

      {/* Logo with heartbeat animation */}
      <Animated.Image 
        source={logo} 
        style={[
          styles.logo, 
          { 
            transform: [{ scale: logoBeat }] 
          }
        ]} 
        resizeMode="contain" 
      />

      {/* Deck with arrows and map inside, centered below logo */}
      <View style={styles.deckContainer}>
        <TouchableOpacity onPress={() => setCurrentMapIdx(idx => idx > 0 ? idx - 1 : mapImages.length - 1)} style={{position:'absolute',left:0,top:'50%',zIndex:5}}>
          <Image source={arrowL} style={styles.arrowLeft} resizeMode="contain" />
        </TouchableOpacity>
        <Image source={deck} style={styles.deckImage} resizeMode="contain" />
        {/* Map image centered on deck */}
        <View style={{position:'absolute',left:'50%',top:'50%',width:320,height:500,marginLeft:-160,marginTop:-235,zIndex:4,alignItems:'center',justifyContent:'center'}}>
          <Image source={mapImages[currentMapIdx]} style={styles.mapOnDeck} resizeMode="contain" />
          
          {/* Week Number at top of panel */}
          <Text style={styles.weekNumberTop}>Week {currentMapIdx + 1}</Text>
          
          {/* Map Name at bottom of panel */}
          <Text style={styles.mapNameBottom}>{mapNames[currentMapIdx].toUpperCase()}</Text>
          
          {/* All maps are now unlocked */}
        </View>
        <TouchableOpacity onPress={() => setCurrentMapIdx(idx => idx < mapImages.length - 1 ? idx + 1 : 0)} style={{position:'absolute',right:0,top:'50%',zIndex:5}}>
          <Image source={arrowR} style={styles.arrowRight} resizeMode="contain" />
        </TouchableOpacity>
      </View>

      {/* Play Button with pulse effect */}
      <TouchableOpacity style={styles.playBtn} onPress={handlePlay}>
        <Animated.Image source={play} style={[styles.playIcon, { transform: [{ scale: playScale }] }]} resizeMode="contain" />
      </TouchableOpacity>

      {/* Home Button (bottom left) */}
      <TouchableOpacity style={styles.homeBtn} onPress={handleHome}>
        <Image source={home} style={styles.homeIcon} resizeMode="contain" />
      </TouchableOpacity>

      {/* About Button (bottom right) */}
      <TouchableOpacity style={styles.aboutBtn} onPress={() => setAboutVisible(true)}>
        <Image source={about} style={styles.aboutIcon} resizeMode="contain" />
      </TouchableOpacity>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'flex-start',
    backgroundColor: '#e3f2fd',
  },
  bg: {
    position: 'absolute',
    width: '100%',
    height: '100%',
    top: 0,
    left: 0,
    zIndex: 0,
    resizeMode: 'cover',
  },
  settingsBtn: {
    position: 'absolute',
    top: 30,
    right: 20,
    zIndex: 10,
    width: 23,
    height: 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  settingsIcon: {
    width: 80,
    height: 250,
  },
  logo: {
    width: width * 0.6,
    height: 565,
    marginTop: -180,
    marginBottom: 0,
    zIndex: 2,
  },
  playBtn: {
    position: 'absolute',
    bottom: 30,
    alignSelf: 'center',
    zIndex: 10,
    width: 100,
    height: 230,
    alignItems: 'center',
    justifyContent: 'center',
  },
  playIcon: {
    width: 150,
    height: 320,
  },
  homeBtn: {
    position: 'absolute',
    bottom: 30,
    left: 30,
    width: 70,
    height: 70,
    borderRadius: 35,
    alignItems: 'center',
    justifyContent: 'center',
  },
  homeIcon: {
    width: 75,
    height: 300,
  },
  aboutBtn: {
    position: 'absolute',
    bottom: 30,
    right: 30,
    width: 70,
    height: 70,
    borderRadius: 35,
    alignItems: 'center',
    justifyContent: 'center',
  },
  aboutIcon: {
    width: 75,
    height: 300,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.4)',
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 100,
  },
  settingsPanel: {
    width: 350,
    backgroundColor: '#fff',
    borderRadius: 20,
    padding: 25,
    alignItems: 'center',
    elevation: 8,
  },
  panelTitle: {
    fontSize: 22,
    fontWeight: 'bold',
    marginBottom: 18,
    color: '#1fb28a',
  },
  settingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 18,
    width: '100%',
    justifyContent: 'space-between',
  },
  settingLabel: {
    fontSize: 16,
    flex: 1,
    color: '#333',
  },
  settingValue: {
    fontSize: 15,
    marginLeft: 8,
    color: '#1fb28a',
    width: 40,
    textAlign: 'right',
  },
  languageToggle: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 1,
  },
  langOption: {
    fontSize: 13,
    color: '#888',
    fontWeight: 'bold',
    marginHorizontal: 5,
  },
  langSelected: {
    color: '#1fb28a',
    textDecorationLine: 'underline',
  },
  closeBtn: {
    marginTop: 20,
    backgroundColor: '#1fb28a',
    borderRadius: 10,
    paddingVertical: 10,
    paddingHorizontal: 25,
  },
  closeBtnText: {
    color: '#fff',
    fontWeight: 'bold',
    fontSize: 15,
  },
  aboutPanel: {
    width: 340,
    maxWidth: 360,
    maxHeight: 480,
    backgroundColor: '#fff',
    borderRadius: 20,
    padding: 24,
    alignItems: 'center',
    elevation: 10,
    shadowColor: '#000',
    shadowOpacity: 0.15,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 4 },
  },
  termsTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#1fb28a',
    marginBottom: 12,
    textAlign: 'center',
  },
  termsScroll: {
    maxHeight: 320,
    marginBottom: 18,
  },
  termsText: {
    fontSize: 13,
    color: '#333',
    textAlign: 'left',
    lineHeight: 19,
    flexShrink: 1,
    flexGrow: 1,
  },
  deckContainer: {
    width: 500,
    height: 700,
    alignSelf: 'center',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    position: 'relative',
    marginTop: -320,
    marginBottom: 20,
    zIndex: 3,
  },
  deckImage: {
    width: 500,
    height: 700,
    alignSelf: 'center',
    zIndex: 3,
  },
  arrowLeft: {
    position: 'absolute',
    left: 0,
    top: '50%',
    width: 280,
    height: 150,
    marginTop: -60,
    zIndex: 4,
  },
  arrowRight: {
    position: 'absolute',
    right: 0,
    top: '50%',
    width: 280,
    height: 150,
    marginTop: -60,
    zIndex: 4,
  },
  mapOnDeck: {
    position: 'absolute',
    left: '50%',
    top: '50%',
    width: 320,
    height: 500,
    marginLeft: -160,
    marginTop: -253,
    zIndex: 4,
  },
  lockOverlay: {
    position: 'absolute',
    left: '50%',
    top: '50%',
    width: 80,
    height: 150,
    marginLeft: -41,
    marginTop: -80,
    zIndex: 10,
    opacity: 0.85,
  },
  weekNumberTop: {
    position: 'absolute',
    top: 138,
    left: 0,
    right: 0,
    color: '#000',
    fontSize: 20,
    fontWeight: 'bold',
    textAlign: 'center',
    zIndex: 6,
    fontFamily: 'LuckiestGuy-Regular',
    textShadowColor: 'rgba(255, 255, 255, 0.8)',
    textShadowOffset: { width: 1, height: 1 },
    textShadowRadius: 2,
  },
  mapNameBottom: {
    position: 'absolute',
    bottom: 133,
    left: 0,
    right: 0,
    color: '#FFD700',
    fontSize: 27,
    fontWeight: 'bold',
    textAlign: 'center',
    zIndex: 6,
    fontFamily: 'LuckiestGuy-Regular',
    textShadowColor: 'rgba(0, 0, 0, 0.8)',
    textShadowOffset: { width: 2, height: 2 },
    textShadowRadius: 4,
  },
}); 
