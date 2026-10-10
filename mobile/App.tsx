import { lazy, Suspense, useCallback, useEffect, useRef, useState } from 'react'
import { ActivityIndicator, Alert, AppState, Image, Linking, Pressable, SafeAreaView, ScrollView, StyleSheet, Text, View } from 'react-native'
import { StatusBar } from 'expo-status-bar'
import * as WebBrowser from 'expo-web-browser'
import { setApiAvailability } from './src/apiClient'
import { readServiceAvailability } from './src/serviceAvailability'

// Native bundles contain the full application, but do not initialize it while paused.
const RuntimeApp = lazy(() => import('./RuntimeApp'))
type Availability = 'checking' | 'available' | 'paused' | 'unavailable'
const SUPPORT_EMAIL = 'shimizutechnology@gmail.com'

export default function App() {
  const [availability, setAvailability] = useState<Availability>('checking')
  const [runtimeOpened, setRuntimeOpened] = useState(false)
  const request = useRef<AbortController | null>(null)

  const checkAvailability = useCallback(async () => {
    request.current?.abort()
    const controller = new AbortController()
    request.current = controller
    setApiAvailability(false)
    setAvailability('checking')

    try {
      const state = await readServiceAvailability(controller.signal)
      if (request.current !== controller || controller.signal.aborted) return
      setApiAvailability(state === 'available')
      setRuntimeOpened(state === 'available')
      setAvailability(state)
    } catch {
      if (request.current !== controller || controller.signal.aborted) return
      setApiAvailability(false)
      setRuntimeOpened(false)
      setAvailability('unavailable')
    }
  }, [])

  useEffect(() => {
    void checkAvailability()
    const subscription = AppState.addEventListener('change', (state) => {
      if (state === 'active') {
        void checkAvailability()
      } else {
        request.current?.abort()
        request.current = null
        setApiAvailability(false)
      }
    })
    return () => {
      subscription.remove()
      request.current?.abort()
      request.current = null
      setApiAvailability(false)
    }
  }, [checkAvailability])

  const paused = availability === 'paused'
  const checking = availability === 'checking'
  const openPrivacy = async () => {
    try {
      await WebBrowser.openBrowserAsync('https://hafahomes.com/privacy')
    } catch {
      Alert.alert('Privacy policy', 'Visit hafahomes.com/privacy when you’re connected to the internet.')
    }
  }
  const openSupport = async () => {
    try {
      await Linking.openURL(`mailto:${SUPPORT_EMAIL}?subject=Hafa%20Homes%20support`)
    } catch {
      Alert.alert('Email support', `Please email ${SUPPORT_EMAIL} for help with your account.`)
    }
  }

  return (
    <View style={styles.root}>
      {runtimeOpened && (
        <View style={[styles.runtime, availability !== 'available' && styles.hidden]} accessibilityElementsHidden={availability !== 'available'} importantForAccessibility={availability === 'available' ? 'auto' : 'no-hide-descendants'}>
          <Suspense fallback={<View style={styles.loading}><ActivityIndicator color="#0f3d35" /><Text style={styles.body}>Opening Hafa Homes…</Text></View>}>
            <RuntimeApp />
          </Suspense>
        </View>
      )}
      {availability !== 'available' && (
        <SafeAreaView style={styles.pause}>
          <StatusBar style="dark" />
          <ScrollView contentContainerStyle={styles.content}>
            <View style={styles.brand}>
              <Image source={require('./assets/hafa-homes-icon.png')} accessibilityLabel="Hafa Homes" style={styles.logo} />
              <Text style={styles.brandName}>Hafa Homes</Text>
            </View>
            <View style={styles.message}>
              <Text style={styles.kicker}>{paused ? 'TEMPORARILY PAUSED' : 'HAFA HOMES'}</Text>
              <Text accessibilityRole="header" style={styles.title}>{checking ? 'Opening Hafa Homes…' : paused ? 'We’re working on Hafa Homes.' : 'Hafa Homes is temporarily unavailable.'}</Text>
              <Text style={styles.body}>{checking ? 'Checking availability. This will only take a moment.' : paused ? 'We’ve temporarily paused home search while we improve the experience. Please check back for updates.' : 'We couldn’t check availability. Connect to the internet and try again for updates.'}</Text>
              {!checking && <Text style={styles.body}>Home search, saved homes, and new requests are unavailable for now. Existing account information remains stored.</Text>}
              <Pressable accessibilityRole="button" accessibilityLabel="Check for updates" accessibilityState={{ disabled: checking, busy: checking }} disabled={checking} onPress={() => void checkAvailability()} style={({ pressed }) => [styles.button, checking && styles.disabled, pressed && styles.pressed]}>
                {checking ? <ActivityIndicator color="#fff" /> : <Text style={styles.buttonText}>Check for updates</Text>}
              </Pressable>
            </View>
            <View style={styles.support}>
              <Text accessibilityRole="header" style={styles.supportTitle}>Need help with your account?</Text>
              <Text style={styles.supportBody}>Shimizu Technology support remains available during the pause.</Text>
              <Pressable accessibilityRole="button" accessibilityLabel="Email Shimizu Technology support" onPress={() => void openSupport()} style={styles.link}>
                <Text selectable style={styles.linkText}>{SUPPORT_EMAIL}</Text>
              </Pressable>
              <Pressable accessibilityRole="button" accessibilityLabel="Open privacy policy" onPress={() => void openPrivacy()} style={styles.link}>
                <Text style={styles.linkText}>Privacy policy</Text>
              </Pressable>
            </View>
            <Text style={styles.footer}>Hafa Homes · Find your home on Guam.</Text>
          </ScrollView>
        </SafeAreaView>
      )}
    </View>
  )
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#f6f1e8' },
  runtime: { flex: 1 },
  hidden: { display: 'none' },
  pause: { flex: 1, backgroundColor: '#f6f1e8' },
  content: { flexGrow: 1, padding: 24, gap: 30, maxWidth: 640, width: '100%', alignSelf: 'center' },
  brand: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingTop: 12 },
  logo: { width: 52, height: 52, borderRadius: 14 },
  brandName: { color: '#0f3d35', fontSize: 22, fontWeight: '700' },
  message: { gap: 20, paddingTop: 24 },
  kicker: { fontSize: 12, letterSpacing: 2, fontWeight: '700', color: '#0f705e' },
  title: { fontSize: 36, fontWeight: '700', color: '#0f3d35', letterSpacing: -1, lineHeight: 42 },
  body: { color: '#52645d', fontSize: 17, lineHeight: 27 },
  button: { minHeight: 52, padding: 14, borderRadius: 14, backgroundColor: '#0f3d35', alignItems: 'center', justifyContent: 'center' },
  disabled: { opacity: 0.7 },
  pressed: { opacity: 0.8 },
  buttonText: { color: '#fff', fontSize: 16, fontWeight: '700' },
  support: { borderTopWidth: 1, borderTopColor: '#cfdbd3', paddingTop: 24, gap: 12 },
  supportTitle: { fontSize: 17, color: '#17211f', fontWeight: '600' },
  supportBody: { color: '#52645d', fontSize: 14, lineHeight: 22 },
  link: { minHeight: 48, justifyContent: 'center' },
  linkText: { color: '#0f705e', fontWeight: '600', fontSize: 15, textDecorationLine: 'underline' },
  footer: { color: '#52645d', fontSize: 12, paddingBottom: 12 },
  loading: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 16 },
})
