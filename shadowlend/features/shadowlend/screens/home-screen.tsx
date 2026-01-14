import { View, Text, StyleSheet, ScrollView, Pressable, Animated, Easing } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { colors, spacing, fontSize, fontWeight, borderRadius } from '@/constants/theme'
import { Button, Icon, ShadowLendLogo } from '@/components/ui'
import { useRef, useEffect } from 'react'
import { useRouter } from 'expo-router'
import { ConnectScreen } from './connect-screen'
import { useTheme } from '@/features/theme'
import { useWallet } from '@/features/account/use-wallet'

export function HomeScreen() {
  const router = useRouter()
  const { account, disconnect } = useWallet()
  const { isDark, toggleTheme } = useTheme()

  const handleDisconnect = async () => {
    await disconnect()
  }

  // Animations
  const fadeAnim = useRef(new Animated.Value(0)).current
  const slideAnim = useRef(new Animated.Value(20)).current
  const cardAnim = useRef(new Animated.Value(0)).current
  const pulseAnim = useRef(new Animated.Value(1)).current

  useEffect(() => {
    Animated.parallel([
      Animated.timing(fadeAnim, {
        toValue: 1,
        duration: 600,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }),
      Animated.timing(slideAnim, {
        toValue: 0,
        duration: 600,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }),
      Animated.spring(cardAnim, {
        toValue: 1,
        friction: 8,
        delay: 200,
        useNativeDriver: true,
      }),
    ]).start()

    // Pulse animation for status
    Animated.loop(
      Animated.sequence([
        Animated.timing(pulseAnim, {
          toValue: 1.05,
          duration: 2000,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: true,
        }),
        Animated.timing(pulseAnim, {
          toValue: 1,
          duration: 2000,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: true,
        }),
      ])
    ).start()
  }, [])

  if (!account) {
    return <ConnectScreen />
  }

  return (
    <SafeAreaView style={[styles.container, isDark && styles.containerDark]} edges={['top']}>
      <Animated.View 
        style={[
          styles.header,
          {
            opacity: fadeAnim,
            transform: [{ translateY: slideAnim }],
          },
        ]}
      >
        <View style={styles.headerLeft}>
          <ShadowLendLogo size={32} color={colors.primary} />
          <Text style={[styles.welcomeText, isDark && styles.textSecondaryDark]}>Welcome to ShadowLend</Text>
        </View>
        <View style={styles.headerRight}>
          <Pressable style={[styles.themeButton, isDark && styles.themeButtonDark]} onPress={toggleTheme}>
            <Icon name={isDark ? 'light-mode' : 'dark-mode'} size={20} color={isDark ? colors.dark.text : colors.textPrimary} />
          </Pressable>
          <Pressable style={[styles.themeButton, isDark && styles.themeButtonDark]} onPress={handleDisconnect}>
            <Icon name="logout" size={20} color={colors.error} />
          </Pressable>
        </View>
      </Animated.View>

      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        {/* Status Card */}
        <Animated.View 
          style={[
            styles.statusCard,
            isDark && styles.statusCardDark,
            {
              opacity: cardAnim,
              transform: [
                { scale: cardAnim.interpolate({ inputRange: [0, 1], outputRange: [0.95, 1] }) },
              ],
            },
          ]}
        >
          <View style={[styles.statusHeader, isDark && styles.statusHeaderDark]}>
            <Animated.View style={[styles.statusBadge, { transform: [{ scale: pulseAnim }] }]}>
              <Icon name="verified-user" size={32} color={colors.success} />
            </Animated.View>
            <Text style={styles.statusText}>Your position is Safe</Text>
          </View>

          <View style={styles.statusBody}>
            <Text style={[styles.portfolioLabel, isDark && styles.textSecondaryDark]}>Total Portfolio Value</Text>
            <Text style={[styles.portfolioValue, isDark && styles.textDark]}>$12,450.00</Text>
            <View style={styles.portfolioChange}>
              <Icon name="trending-up" size={16} color={colors.success} />
              <Text style={styles.portfolioChangeText}>+$245.50 (2.0%)</Text>
            </View>
          </View>
        </Animated.View>

        {/* Grow Button */}
        <Button
          title="Grow Now"
          icon="trending-up"
          size="lg"
          fullWidth
          onPress={() => router.push('/grow')}
          style={styles.growButton}
        />

        {/* Quick Stats */}
        <View style={styles.statsRow}>
          <View style={[styles.statCard, isDark && styles.cardDark]}>
            <Icon name="account-balance" size={20} color={colors.primary} />
            <Text style={[styles.statValue, isDark && styles.textDark]}>$8,200</Text>
            <Text style={[styles.statLabel, isDark && styles.textSecondaryDark]}>Deposited</Text>
          </View>
          <View style={[styles.statCard, isDark && styles.cardDark]}>
            <Icon name="payments" size={20} color={colors.warning} />
            <Text style={[styles.statValue, isDark && styles.textDark]}>$4,250</Text>
            <Text style={[styles.statLabel, isDark && styles.textSecondaryDark]}>Borrowed</Text>
          </View>
        </View>

        {/* Info Footer */}
        <View style={styles.infoSection}>
          <View style={[styles.divider, isDark && styles.dividerDark]} />
          <Text style={[styles.infoText, isDark && styles.textSecondaryDark]}>
            ShadowLend uses Arcium MXE for confidential computation to keep your assets anonymous and secure.
          </Text>
        </View>
      </ScrollView>
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
  cardDark: {
    backgroundColor: colors.dark.card,
    borderColor: colors.dark.border,
  },
  iconBgDark: {
    backgroundColor: 'rgba(19, 109, 236, 0.2)',
  },
  dividerDark: {
    backgroundColor: colors.dark.border,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  welcomeText: {
    color: colors.textSecondary,
    fontSize: fontSize.sm,
    fontWeight: fontWeight.medium,
  },
  headerRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
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
  avatar: {
    width: 48,
    height: 48,
    borderRadius: borderRadius.full,
    backgroundColor: colors.primaryLight,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarDark: {
    backgroundColor: 'rgba(19, 109, 236, 0.2)',
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    padding: spacing.md,
    gap: spacing.md,
    paddingBottom: spacing.xxl,
  },
  statusCard: {
    backgroundColor: colors.white,
    borderRadius: borderRadius.xxl,
    borderWidth: 1,
    borderColor: 'rgba(34, 197, 94, 0.2)',
    overflow: 'hidden',
    shadowColor: colors.success,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.1,
    shadowRadius: 20,
    elevation: 4,
  },
  statusCardDark: {
    backgroundColor: colors.dark.card,
    borderColor: 'rgba(34, 197, 94, 0.3)',
  },
  statusHeader: {
    backgroundColor: 'rgba(34, 197, 94, 0.06)',
    paddingVertical: spacing.lg,
    alignItems: 'center',
    gap: spacing.sm,
  },
  statusHeaderDark: {
    backgroundColor: 'rgba(34, 197, 94, 0.1)',
  },
  statusBadge: {
    backgroundColor: 'rgba(34, 197, 94, 0.1)',
    padding: spacing.sm,
    borderRadius: borderRadius.full,
  },
  statusText: {
    color: colors.success,
    fontSize: fontSize.sm,
    fontWeight: fontWeight.bold,
    textTransform: 'uppercase',
    letterSpacing: 1.5,
  },
  statusBody: {
    alignItems: 'center',
    paddingVertical: spacing.xl,
    paddingHorizontal: spacing.lg,
  },
  portfolioLabel: {
    color: colors.textSecondary,
    fontSize: fontSize.xs,
    fontWeight: fontWeight.medium,
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
  portfolioValue: {
    color: colors.textPrimary,
    fontSize: 44,
    fontWeight: fontWeight.bold,
    letterSpacing: -1,
    marginTop: spacing.xs,
  },
  portfolioChange: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginTop: spacing.sm,
    backgroundColor: 'rgba(34, 197, 94, 0.1)',
    paddingHorizontal: spacing.sm,
    paddingVertical: 4,
    borderRadius: borderRadius.full,
  },
  portfolioChangeText: {
    color: colors.success,
    fontSize: fontSize.sm,
    fontWeight: fontWeight.semibold,
  },
  growButton: {
    marginTop: spacing.xs,
  },
  statsRow: {
    flexDirection: 'row',
    gap: spacing.md,
  },
  statCard: {
    flex: 1,
    backgroundColor: colors.white,
    borderRadius: borderRadius.xl,
    borderWidth: 1,
    borderColor: 'rgba(0, 0, 0, 0.04)',
    padding: spacing.md,
    alignItems: 'center',
    gap: spacing.xs,
    shadowColor: colors.black,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.03,
    shadowRadius: 8,
    elevation: 2,
  },
  statValue: {
    color: colors.textPrimary,
    fontSize: fontSize.xl,
    fontWeight: fontWeight.bold,
  },
  statLabel: {
    color: colors.textSecondary,
    fontSize: fontSize.xs,
    fontWeight: fontWeight.medium,
  },
  infoSection: {
    alignItems: 'center',
    paddingVertical: spacing.md,
    gap: spacing.sm,
  },
  divider: {
    width: 40,
    height: 4,
    backgroundColor: colors.textMuted,
    borderRadius: borderRadius.full,
    opacity: 0.5,
  },
  infoText: {
    color: colors.textSecondary,
    fontSize: fontSize.xs,
    textAlign: 'center',
    maxWidth: 260,
    lineHeight: 18,
    opacity: 0.7,
  },
})
