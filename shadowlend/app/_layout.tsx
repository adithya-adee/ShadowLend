import { Stack } from 'expo-router'
import { StatusBar } from 'expo-status-bar'
import 'react-native-reanimated'
import { AppProviders } from '@/components/app-providers'
import { useFonts } from 'expo-font'
import { MaterialIcons } from '@expo/vector-icons'
import * as SplashScreenExpo from 'expo-splash-screen'
import { useEffect, useState } from 'react'
import { View, ActivityIndicator } from 'react-native'
import { SplashScreen } from '@/features/shadowlend/screens'

SplashScreenExpo.preventAutoHideAsync()

export default function RootLayout() {
  const [fontsLoaded] = useFonts({
    ...MaterialIcons.font,
  })
  const [showSplash, setShowSplash] = useState(true)

  useEffect(() => {
    if (fontsLoaded) {
      SplashScreenExpo.hideAsync()
    }
  }, [fontsLoaded])

  if (!fontsLoaded) {
    return (
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
        <ActivityIndicator size="large" color="#136dec" />
      </View>
    )
  }

  if (showSplash) {
    return <SplashScreen onFinish={() => setShowSplash(false)} />
  }

  return (
    <AppProviders>
      <Stack screenOptions={{ headerShown: false }}>
        <Stack.Screen name="(tabs)" />
        <Stack.Screen
          name="grow"
          options={{
            presentation: 'modal',
            animation: 'slide_from_bottom',
          }}
        />
        <Stack.Screen
          name="processing"
          options={{
            presentation: 'modal',
            animation: 'fade',
          }}
        />
        <Stack.Screen
          name="activity"
          options={{
            animation: 'slide_from_right',
          }}
        />
      </Stack>
      <StatusBar style="auto" />
    </AppProviders>
  )
}
