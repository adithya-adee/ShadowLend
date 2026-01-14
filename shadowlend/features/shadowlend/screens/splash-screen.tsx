import { View, Text, StyleSheet, Animated, Easing } from 'react-native'
import { colors, spacing, fontSize, fontWeight } from '@/constants/theme'
import { ShadowLendLogo } from '@/components/ui'
import { useEffect, useRef, useState } from 'react'

interface SplashScreenProps {
  onFinish: () => void
}

// Arcium brand colors
const arciumColors = {
  primary: '#00D4AA',
  dark: '#0A0B0D',
  text: '#FFFFFF',
}

export function SplashScreen({ onFinish }: SplashScreenProps) {
  const [stage, setStage] = useState<'shadowlend' | 'arcium'>('shadowlend')
  
  const fadeAnim = useRef(new Animated.Value(0)).current
  const scaleAnim = useRef(new Animated.Value(0.9)).current

  useEffect(() => {
    // Stage 1: ShadowLend - quick and smooth
    Animated.parallel([
      Animated.timing(fadeAnim, {
        toValue: 1,
        duration: 400,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }),
      Animated.spring(scaleAnim, {
        toValue: 1,
        friction: 10,
        tension: 80,
        useNativeDriver: true,
      }),
    ]).start()

    // Transition to Arcium after 1.2s
    const timer1 = setTimeout(() => {
      Animated.timing(fadeAnim, {
        toValue: 0,
        duration: 250,
        easing: Easing.in(Easing.cubic),
        useNativeDriver: true,
      }).start(() => {
        setStage('arcium')
        fadeAnim.setValue(0)
        scaleAnim.setValue(0.9)
        
        Animated.parallel([
          Animated.timing(fadeAnim, {
            toValue: 1,
            duration: 400,
            easing: Easing.out(Easing.cubic),
            useNativeDriver: true,
          }),
          Animated.spring(scaleAnim, {
            toValue: 1,
            friction: 10,
            tension: 80,
            useNativeDriver: true,
          }),
        ]).start()
      })
    }, 1200)

    // Finish splash after 2.4s total
    const timer2 = setTimeout(() => {
      Animated.timing(fadeAnim, {
        toValue: 0,
        duration: 250,
        easing: Easing.in(Easing.cubic),
        useNativeDriver: true,
      }).start(() => {
        onFinish()
      })
    }, 2400)

    return () => {
      clearTimeout(timer1)
      clearTimeout(timer2)
    }
  }, [fadeAnim, scaleAnim, onFinish])

  return (
    <View style={[styles.container, stage === 'arcium' && styles.arciumBg]}>
      <Animated.View
        style={[
          styles.content,
          {
            opacity: fadeAnim,
            transform: [{ scale: scaleAnim }],
          },
        ]}
      >
        {stage === 'shadowlend' ? (
          <>
            <ShadowLendLogo size={110} color={colors.primary} />
            <Text style={styles.title}>ShadowLend</Text>
            <Text style={styles.subtitle}>Private Lending on Solana</Text>
          </>
        ) : (
          <>
            <Text style={styles.poweredBy}>Powered by</Text>
            <View style={styles.arciumLogoContainer}>
              <ArciumLogo size={50} />
              <Text style={styles.arciumTitle}>arcium</Text>
            </View>
            <Text style={styles.arciumTagline}>The Confidential Computing Network</Text>
          </>
        )}
      </Animated.View>

      <View style={styles.loader}>
        <View style={[
          styles.loaderDot, 
          stage === 'shadowlend' && styles.loaderDotActive
        ]} />
        <View style={[
          styles.loaderDot, 
          stage === 'arcium' && styles.loaderDotActiveArcium
        ]} />
      </View>
    </View>
  )
}

function ArciumLogo({ size = 50 }: { size?: number }) {
  return (
    <View style={{ width: size, height: size }}>
      <svg width={size} height={size} viewBox="0 0 100 100" fill="none">
        <path
          d="M50 5 L90 90 L72 90 L60 68 L40 68 L28 90 L10 90 L50 5Z"
          fill={arciumColors.primary}
        />
        <path
          d="M50 32 L60 52 L40 52 L50 32Z"
          fill={arciumColors.dark}
        />
      </svg>
    </View>
  )
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.backgroundLight,
    alignItems: 'center',
    justifyContent: 'center',
  },
  arciumBg: {
    backgroundColor: arciumColors.dark,
  },
  content: {
    alignItems: 'center',
    gap: spacing.sm,
  },
  title: {
    color: colors.textPrimary,
    fontSize: 38,
    fontWeight: fontWeight.bold,
    letterSpacing: -0.5,
    marginTop: spacing.lg,
  },
  subtitle: {
    color: colors.primary,
    fontSize: fontSize.lg,
    fontWeight: fontWeight.medium,
    letterSpacing: 0.5,
  },
  poweredBy: {
    color: 'rgba(255, 255, 255, 0.5)',
    fontSize: fontSize.sm,
    fontWeight: fontWeight.medium,
    marginBottom: spacing.lg,
    letterSpacing: 2,
    textTransform: 'uppercase',
  },
  arciumLogoContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
  },
  arciumTitle: {
    color: arciumColors.text,
    fontSize: 52,
    fontWeight: fontWeight.bold,
    letterSpacing: -1,
  },
  arciumTagline: {
    color: arciumColors.primary,
    fontSize: fontSize.md,
    fontWeight: fontWeight.medium,
    marginTop: spacing.md,
    letterSpacing: 0.5,
  },
  loader: {
    position: 'absolute',
    bottom: 80,
    flexDirection: 'row',
    gap: spacing.sm,
  },
  loaderDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: 'rgba(0, 0, 0, 0.15)',
  },
  loaderDotActive: {
    backgroundColor: colors.primary,
    width: 24,
  },
  loaderDotActiveArcium: {
    backgroundColor: arciumColors.primary,
    width: 24,
  },
})
