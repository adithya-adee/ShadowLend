import { View, Text, StyleSheet, Animated } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { colors, spacing, fontSize, fontWeight, borderRadius } from '@/constants/theme'
import { Icon, ProgressBar } from '@/components/ui'
import { useEffect, useRef, useState } from 'react'
import { useRouter } from 'expo-router'
import { Pressable } from 'react-native'
import { useTheme } from '@/features/theme'

export function ProcessingScreen() {
  const router = useRouter()
  const { isDark } = useTheme()
  const [progress, setProgress] = useState(0)
  const pulseAnim = useRef(new Animated.Value(1)).current

  useEffect(() => {
    // Pulse animation
    Animated.loop(
      Animated.sequence([
        Animated.timing(pulseAnim, {
          toValue: 1.1,
          duration: 1000,
          useNativeDriver: true,
        }),
        Animated.timing(pulseAnim, {
          toValue: 1,
          duration: 1000,
          useNativeDriver: true,
        }),
      ])
    ).start()

    // Progress simulation
    const interval = setInterval(() => {
      setProgress((prev) => {
        if (prev >= 100) {
          clearInterval(interval)
          setTimeout(() => router.replace('/(tabs)' as any), 500)
          return 100
        }
        return prev + 2
      })
    }, 100)

    return () => clearInterval(interval)
  }, [pulseAnim, router])

  return (
    <SafeAreaView style={[styles.container, isDark && styles.containerDark]} edges={['top']}>
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} style={styles.closeButton}>
          <Icon name="close" size={24} color={isDark ? colors.dark.textSecondary : colors.textSecondary} />
        </Pressable>
        <Text style={[styles.headerTitle, isDark && styles.textDark]}>Proof Engine</Text>
        <View style={styles.placeholder} />
      </View>

      <View style={styles.content}>
        <View style={styles.statusIndicator}>
          <Animated.View
            style={[
              styles.pulseOuter,
              isDark && styles.pulseOuterDark,
              { transform: [{ scale: pulseAnim }] },
            ]}
          />
          <View style={[styles.pulseMiddle, isDark && styles.pulseMiddleDark]}>
            <View style={[styles.pulseInner, isDark && styles.pulseInnerDark]}>
              <Icon name="shield" size={32} color={colors.primary} />
            </View>
          </View>
        </View>

        <View style={styles.statusBadge}>
          <View style={styles.statusDot} />
          <Text style={styles.statusText}>Engine Active</Text>
        </View>

        <Text style={[styles.title, isDark && styles.textDark]}>Securing your position...</Text>
        <Text style={[styles.subtitle, isDark && styles.textSecondaryDark]}>Finalizing protection.</Text>

        <View style={styles.progressSection}>
          <View style={styles.progressHeader}>
            <View>
              <Text style={[styles.progressLabel, isDark && styles.textSecondaryDark]}>Protection Level</Text>
              <Text style={[styles.progressDescription, isDark && styles.textDark]}>Filling security vessel</Text>
            </View>
            <Text style={styles.progressValue}>{progress}%</Text>
          </View>
          <ProgressBar progress={progress} variant="water" />
          <View style={styles.protocolBadge}>
            <Icon name="verified-user" size={16} color={isDark ? colors.dark.textSecondary : colors.textSecondary} />
            <Text style={[styles.protocolText, isDark && styles.textSecondaryDark]}>ShadowLend Privacy Protocol Active</Text>
          </View>
        </View>
      </View>

      <View style={styles.footer}>
        <View style={[styles.zkBadge, isDark && styles.zkBadgeDark]}>
          <Icon name="lock" size={16} color={colors.primary} />
          <Text style={styles.zkText}>Arcium MXE Verified</Text>
        </View>
        <View style={[styles.homeIndicator, isDark && styles.homeIndicatorDark]} />
      </View>

      <View style={[styles.backgroundGlow, isDark && styles.backgroundGlowDark]} />
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
  textDark: {
    color: colors.dark.text,
  },
  textSecondaryDark: {
    color: colors.dark.textSecondary,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
  },
  closeButton: {
    width: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: borderRadius.full,
  },
  headerTitle: {
    color: colors.textPrimary,
    fontSize: fontSize.sm,
    fontWeight: fontWeight.semibold,
    textTransform: 'uppercase',
    letterSpacing: 2,
  },
  placeholder: {
    width: 40,
  },
  content: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.xl,
  },
  statusIndicator: {
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.lg,
  },
  pulseOuter: {
    position: 'absolute',
    width: 112,
    height: 112,
    borderRadius: borderRadius.full,
    backgroundColor: colors.primaryLight,
  },
  pulseOuterDark: {
    backgroundColor: 'rgba(19, 109, 236, 0.15)',
  },
  pulseMiddle: {
    width: 80,
    height: 80,
    borderRadius: borderRadius.full,
    backgroundColor: 'rgba(19, 109, 236, 0.2)',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: 'rgba(19, 109, 236, 0.3)',
  },
  pulseMiddleDark: {
    backgroundColor: 'rgba(19, 109, 236, 0.25)',
    borderColor: 'rgba(19, 109, 236, 0.4)',
  },
  pulseInner: {
    width: 56,
    height: 56,
    borderRadius: borderRadius.full,
    backgroundColor: colors.white,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: colors.primary,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.3,
    shadowRadius: 20,
    elevation: 8,
  },
  pulseInnerDark: {
    backgroundColor: colors.dark.card,
  },
  statusBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    marginBottom: spacing.xl,
  },
  statusDot: {
    width: 8,
    height: 8,
    borderRadius: borderRadius.full,
    backgroundColor: colors.primary,
  },
  statusText: {
    color: colors.primary,
    fontSize: fontSize.sm,
    fontWeight: fontWeight.semibold,
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
  title: {
    color: colors.textPrimary,
    fontSize: fontSize.xxxl,
    fontWeight: fontWeight.bold,
    textAlign: 'center',
    marginBottom: spacing.sm,
  },
  subtitle: {
    color: colors.textSecondary,
    fontSize: fontSize.lg,
    textAlign: 'center',
    marginBottom: spacing.xxl,
  },
  progressSection: {
    width: '100%',
    maxWidth: 320,
    gap: spacing.md,
  },
  progressHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-end',
  },
  progressLabel: {
    color: colors.textSecondary,
    fontSize: fontSize.xs,
    fontWeight: fontWeight.bold,
    textTransform: 'uppercase',
    letterSpacing: 1,
    marginBottom: spacing.xs,
  },
  progressDescription: {
    color: colors.textPrimary,
    fontSize: fontSize.lg,
    fontWeight: fontWeight.medium,
  },
  progressValue: {
    color: colors.primary,
    fontSize: fontSize.xl,
    fontWeight: fontWeight.bold,
  },
  protocolBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
  },
  protocolText: {
    color: colors.textSecondary,
    fontSize: fontSize.sm,
    fontWeight: fontWeight.medium,
    fontStyle: 'italic',
  },
  footer: {
    alignItems: 'center',
    paddingBottom: spacing.xl,
    paddingTop: spacing.md,
  },
  zkBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    backgroundColor: colors.primaryLight,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: borderRadius.full,
    borderWidth: 1,
    borderColor: 'rgba(19, 109, 236, 0.1)',
  },
  zkBadgeDark: {
    backgroundColor: 'rgba(19, 109, 236, 0.2)',
    borderColor: 'rgba(19, 109, 236, 0.3)',
  },
  zkText: {
    color: colors.primary,
    fontSize: fontSize.xs,
    fontWeight: fontWeight.bold,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  homeIndicator: {
    width: 128,
    height: 4,
    backgroundColor: colors.textMuted,
    borderRadius: borderRadius.full,
    marginTop: spacing.xl,
    opacity: 0.5,
  },
  homeIndicatorDark: {
    backgroundColor: colors.dark.border,
  },
  backgroundGlow: {
    position: 'absolute',
    top: -100,
    right: -100,
    width: 400,
    height: 400,
    borderRadius: 200,
    backgroundColor: colors.primaryLight,
    opacity: 0.3,
    zIndex: -1,
  },
  backgroundGlowDark: {
    backgroundColor: 'rgba(19, 109, 236, 0.1)',
    opacity: 0.5,
  },
})
