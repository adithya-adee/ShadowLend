import { View, Text, StyleSheet, Animated, Easing, Pressable } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { colors, spacing, fontSize, fontWeight, borderRadius } from '@/constants/theme'
import { Button, Icon, ShadowLendLogo } from '@/components/ui'
import { useEffect, useRef, useCallback, useState } from 'react'
import { useTheme } from '@/features/theme'
import { useWallet } from '@/features/account/use-wallet'
import { useRouter } from 'expo-router'

export function ConnectScreen() {
  const { connect, connecting, connected } = useWallet()
  const { isDark, toggleTheme } = useTheme()
  const router = useRouter()
  const [hasAttemptedConnect, setHasAttemptedConnect] = useState(false)

  // Navigate to home only after user initiated connection succeeds
  useEffect(() => {
    if (hasAttemptedConnect && connected) {
      const timer = setTimeout(() => {
        router.replace('/(tabs)' as any)
      }, 300)
      return () => clearTimeout(timer)
    }
  }, [connected, hasAttemptedConnect, router])

  const handleConnect = useCallback(async () => {
    setHasAttemptedConnect(true)
    await connect()
  }, [connect])
  
  // Animations
  const fadeAnim = useRef(new Animated.Value(0)).current
  const slideAnim = useRef(new Animated.Value(30)).current
  const scaleAnim = useRef(new Animated.Value(0.9)).current
  const feature1Anim = useRef(new Animated.Value(0)).current
  const feature2Anim = useRef(new Animated.Value(0)).current
  const feature3Anim = useRef(new Animated.Value(0)).current

  useEffect(() => {
    // Staggered entrance animations
    Animated.sequence([
      Animated.parallel([
        Animated.timing(fadeAnim, {
          toValue: 1,
          duration: 800,
          easing: Easing.out(Easing.cubic),
          useNativeDriver: true,
        }),
        Animated.timing(slideAnim, {
          toValue: 0,
          duration: 800,
          easing: Easing.out(Easing.cubic),
          useNativeDriver: true,
        }),
        Animated.spring(scaleAnim, {
          toValue: 1,
          friction: 8,
          tension: 40,
          useNativeDriver: true,
        }),
      ]),
      Animated.stagger(150, [
        Animated.spring(feature1Anim, { toValue: 1, friction: 8, useNativeDriver: true }),
        Animated.spring(feature2Anim, { toValue: 1, friction: 8, useNativeDriver: true }),
        Animated.spring(feature3Anim, { toValue: 1, friction: 8, useNativeDriver: true }),
      ]),
    ]).start()
  }, [])

  const getFeatureStyle = (anim: Animated.Value) => ({
    opacity: anim,
    transform: [
      { translateY: anim.interpolate({ inputRange: [0, 1], outputRange: [20, 0] }) },
      { scale: anim.interpolate({ inputRange: [0, 1], outputRange: [0.95, 1] }) },
    ],
  })

  return (
    <SafeAreaView style={[styles.container, isDark && styles.containerDark]}>
      {/* Theme Toggle */}
      <View style={styles.topBar}>
        <View style={styles.spacer} />
        <Pressable style={[styles.themeButton, isDark && styles.themeButtonDark]} onPress={toggleTheme}>
          <Icon name={isDark ? 'light-mode' : 'dark-mode'} size={20} color={isDark ? colors.dark.text : colors.textPrimary} />
        </Pressable>
      </View>

      <View style={styles.content}>
        <Animated.View 
          style={[
            styles.logoContainer,
            {
              opacity: fadeAnim,
              transform: [
                { translateY: slideAnim },
                { scale: scaleAnim },
              ],
            },
          ]}
        >
          <ShadowLendLogo size={100} color={colors.primary} />
        </Animated.View>

        <Animated.View 
          style={[
            styles.textContainer,
            {
              opacity: fadeAnim,
              transform: [{ translateY: slideAnim }],
            },
          ]}
        >
          <Text style={[styles.title, isDark && styles.textDark]}>ShadowLend</Text>
          <Text style={styles.subtitle}>Private Lending on Solana</Text>
          <Text style={[styles.description, isDark && styles.textSecondaryDark]}>
            Access liquidity while keeping your financial data private using Arcium's confidential computing network.
          </Text>
        </Animated.View>

        <View style={styles.features}>
          <Animated.View style={[styles.featureItem, isDark && styles.featureItemDark, getFeatureStyle(feature1Anim)]}>
            <View style={[styles.featureIcon, isDark && styles.featureIconDark]}>
              <Icon name="visibility-off" size={22} color={colors.primary} />
            </View>
            <View style={styles.featureText}>
              <Text style={[styles.featureTitle, isDark && styles.textDark]}>Private Positions</Text>
              <Text style={[styles.featureDescription, isDark && styles.textSecondaryDark]}>Your balances stay hidden</Text>
            </View>
            <View style={styles.featureCheck}>
              <Icon name="check-circle" size={20} color={colors.success} />
            </View>
          </Animated.View>

          <Animated.View style={[styles.featureItem, isDark && styles.featureItemDark, getFeatureStyle(feature2Anim)]}>
            <View style={[styles.featureIcon, isDark && styles.featureIconDark]}>
              <Icon name="lock" size={22} color={colors.primary} />
            </View>
            <View style={styles.featureText}>
              <Text style={[styles.featureTitle, isDark && styles.textDark]}>Secure Computation</Text>
              <Text style={[styles.featureDescription, isDark && styles.textSecondaryDark]}>MXE-powered calculations</Text>
            </View>
            <View style={styles.featureCheck}>
              <Icon name="check-circle" size={20} color={colors.success} />
            </View>
          </Animated.View>

          <Animated.View style={[styles.featureItem, isDark && styles.featureItemDark, getFeatureStyle(feature3Anim)]}>
            <View style={[styles.featureIcon, isDark && styles.featureIconDark]}>
              <Icon name="verified" size={22} color={colors.primary} />
            </View>
            <View style={styles.featureText}>
              <Text style={[styles.featureTitle, isDark && styles.textDark]}>Attestation Verified</Text>
              <Text style={[styles.featureDescription, isDark && styles.textSecondaryDark]}>Trustless proof system</Text>
            </View>
            <View style={styles.featureCheck}>
              <Icon name="check-circle" size={20} color={colors.success} />
            </View>
          </Animated.View>
        </View>
      </View>

      <View style={[styles.footer, isDark && styles.footerDark]}>
        <Button
          title={connecting ? "Connecting..." : "Connect Wallet"}
          icon="account-balance-wallet"
          iconPosition="left"
          size="lg"
          fullWidth
          onPress={handleConnect}
          disabled={connecting}
        />
        <Text style={styles.footerText}>
          Powered by Arcium MXE Network
        </Text>
      </View>
    </SafeAreaView>
  )
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.backgroundLight,
  },
  containerDark: {
    backgroundColor: colors.dark.background,
  },
  topBar: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.sm,
  },
  spacer: {
    width: 40,
  },
  themeButton: {
    width: 40,
    height: 40,
    borderRadius: borderRadius.full,
    backgroundColor: colors.white,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: colors.border,
  },
  themeButtonDark: {
    backgroundColor: colors.dark.card,
    borderColor: colors.dark.border,
  },
  textDark: {
    color: colors.dark.text,
  },
  textSecondaryDark: {
    color: colors.dark.textSecondary,
  },
  content: {
    flex: 1,
    paddingHorizontal: spacing.lg,
    justifyContent: 'center',
  },
  logoContainer: {
    alignItems: 'center',
    marginBottom: spacing.lg,
  },
  textContainer: {
    alignItems: 'center',
    marginBottom: spacing.xl,
  },
  title: {
    color: colors.textPrimary,
    fontSize: 36,
    fontWeight: fontWeight.bold,
    marginBottom: spacing.xs,
    letterSpacing: -0.5,
  },
  subtitle: {
    color: colors.primary,
    fontSize: fontSize.lg,
    fontWeight: fontWeight.semibold,
    marginBottom: spacing.md,
  },
  description: {
    color: colors.textSecondary,
    fontSize: fontSize.md,
    textAlign: 'center',
    lineHeight: 24,
    maxWidth: 320,
  },
  features: {
    gap: spacing.sm,
  },
  featureItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    backgroundColor: colors.white,
    padding: spacing.md,
    paddingVertical: spacing.md + 2,
    borderRadius: borderRadius.xl,
    borderWidth: 1,
    borderColor: 'rgba(0, 0, 0, 0.04)',
    shadowColor: colors.black,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.04,
    shadowRadius: 8,
    elevation: 2,
  },
  featureItemDark: {
    backgroundColor: colors.dark.card,
    borderColor: colors.dark.border,
  },
  featureIcon: {
    width: 44,
    height: 44,
    borderRadius: borderRadius.lg,
    backgroundColor: colors.primaryLight,
    alignItems: 'center',
    justifyContent: 'center',
  },
  featureIconDark: {
    backgroundColor: 'rgba(19, 109, 236, 0.2)',
  },
  featureText: {
    flex: 1,
    gap: 2,
  },
  featureTitle: {
    color: colors.textPrimary,
    fontSize: fontSize.md,
    fontWeight: fontWeight.semibold,
  },
  featureDescription: {
    color: colors.textSecondary,
    fontSize: fontSize.sm,
  },
  featureCheck: {
    opacity: 0.8,
  },
  footer: {
    padding: spacing.lg,
    paddingBottom: spacing.xl,
    gap: spacing.md,
  },
  footerDark: {
    backgroundColor: colors.dark.card,
  },
  footerText: {
    color: '#00D4AA',
    fontSize: fontSize.xs,
    textAlign: 'center',
    textTransform: 'uppercase',
    letterSpacing: 1.5,
  },
})
