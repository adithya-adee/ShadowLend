import { View, Text, StyleSheet, Animated, Easing } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { colors, spacing, fontSize, fontWeight, borderRadius } from '@/constants/theme'
import { Button, Icon, Card } from '@/components/ui'
import { useRouter, useLocalSearchParams } from 'expo-router'
import { useTheme } from '@/features/theme'
import { useEffect, useRef } from 'react'

export function GrowSuccessScreen() {
  const router = useRouter()
  const { isDark } = useTheme()
  const params = useLocalSearchParams<{ amount: string; asset: string }>()
  const amount = params.amount || '500'
  const asset = params.asset || 'USDC'

  // Animations
  const scaleAnim = useRef(new Animated.Value(0)).current
  const fadeAnim = useRef(new Animated.Value(0)).current
  const checkAnim = useRef(new Animated.Value(0)).current

  useEffect(() => {
    Animated.sequence([
      Animated.spring(scaleAnim, {
        toValue: 1,
        friction: 5,
        tension: 100,
        useNativeDriver: true,
      }),
      Animated.parallel([
        Animated.timing(fadeAnim, {
          toValue: 1,
          duration: 400,
          easing: Easing.out(Easing.cubic),
          useNativeDriver: true,
        }),
        Animated.spring(checkAnim, {
          toValue: 1,
          friction: 4,
          useNativeDriver: true,
        }),
      ]),
    ]).start()
  }, [])

  return (
    <SafeAreaView style={[styles.container, isDark && styles.containerDark]} edges={['top']}>
      <View style={styles.header}>
        <View style={styles.placeholder} />
        <View style={styles.headerCenter}>
          <Text style={[styles.headerTitle, isDark && styles.textDark]}>Grow Assets</Text>
          <Text style={styles.headerStep}>Step 3 of 3</Text>
        </View>
        <View style={styles.placeholder} />
      </View>

      <View style={styles.progressContainer}>
        <View style={[styles.progressDot, styles.progressComplete]} />
        <View style={[styles.progressDot, styles.progressComplete]} />
        <View style={[styles.progressDot, styles.progressComplete]} />
      </View>

      <View style={styles.content}>
        {/* Success Animation */}
        <Animated.View 
          style={[
            styles.successIcon,
            {
              transform: [{ scale: scaleAnim }],
            },
          ]}
        >
          <View style={styles.successCircle}>
            <Animated.View style={{ transform: [{ scale: checkAnim }] }}>
              <Icon name="check" size={48} color={colors.white} />
            </Animated.View>
          </View>
        </Animated.View>

        <Animated.View style={[styles.textSection, { opacity: fadeAnim }]}>
          <Text style={[styles.title, isDark && styles.textDark]}>Deposit Successful!</Text>
          <Text style={[styles.subtitle, isDark && styles.textSecondaryDark]}>
            Your funds are now growing in the Shadow Vault
          </Text>
        </Animated.View>

        {/* Summary Card */}
        <Animated.View style={{ opacity: fadeAnim }}>
          <Card style={[styles.summaryCard, isDark && styles.cardDark] as any}>
            <View style={styles.summaryRow}>
              <Text style={[styles.summaryLabel, isDark && styles.textSecondaryDark]}>Amount Deposited</Text>
              <Text style={[styles.summaryValue, isDark && styles.textDark]}>${parseFloat(amount).toLocaleString()} {asset}</Text>
            </View>
            <View style={[styles.divider, isDark && styles.dividerDark]} />
            <View style={styles.summaryRow}>
              <Text style={[styles.summaryLabel, isDark && styles.textSecondaryDark]}>Current APY</Text>
              <Text style={styles.summaryValueGreen}>8.2%</Text>
            </View>
            <View style={[styles.divider, isDark && styles.dividerDark]} />
            <View style={styles.summaryRow}>
              <Text style={[styles.summaryLabel, isDark && styles.textSecondaryDark]}>Privacy Status</Text>
              <View style={styles.privacyBadge}>
                <Icon name="shield" size={14} color={colors.success} />
                <Text style={styles.privacyBadgeText}>Shielded</Text>
              </View>
            </View>
            <View style={[styles.divider, isDark && styles.dividerDark]} />
            <View style={styles.summaryRow}>
              <Text style={[styles.summaryLabel, isDark && styles.textSecondaryDark]}>Transaction ID</Text>
              <Text style={[styles.txId, isDark && styles.textSecondaryDark]}>5xK7...mN9p</Text>
            </View>
          </Card>
        </Animated.View>

        {/* Info Box */}
        <Animated.View style={[styles.infoBox, isDark && styles.infoBoxDark, { opacity: fadeAnim }]}>
          <Icon name="trending-up" size={20} color={colors.success} />
          <Text style={[styles.infoText, isDark && styles.textSecondaryDark]}>
            Your yield will start accruing immediately. Check your portfolio to track earnings.
          </Text>
        </Animated.View>
      </View>

      <View style={[styles.footer, isDark && styles.footerDark]}>
        <Button
          title="View Portfolio"
          icon="account-balance-wallet"
          iconPosition="left"
          size="lg"
          fullWidth
          onPress={() => router.replace('/(tabs)' as any)}
        />
        <Button
          title="Make Another Deposit"
          variant="outline"
          size="lg"
          fullWidth
          onPress={() => router.replace('/grow' as any)}
          style={styles.secondaryButton}
        />
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
  dividerDark: {
    backgroundColor: colors.dark.border,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  headerCenter: {
    alignItems: 'center',
  },
  headerTitle: {
    color: colors.textPrimary,
    fontSize: fontSize.sm,
    fontWeight: fontWeight.bold,
  },
  headerStep: {
    color: colors.primary,
    fontSize: fontSize.xs,
    fontWeight: fontWeight.medium,
  },
  placeholder: {
    width: 48,
  },
  progressContainer: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: spacing.sm,
    paddingVertical: spacing.md,
  },
  progressDot: {
    width: 48,
    height: 6,
    borderRadius: borderRadius.full,
    backgroundColor: colors.textMuted,
  },
  progressComplete: {
    backgroundColor: colors.success,
  },
  content: {
    flex: 1,
    paddingHorizontal: spacing.lg,
    alignItems: 'center',
  },
  successIcon: {
    marginTop: spacing.xl,
    marginBottom: spacing.lg,
  },
  successCircle: {
    width: 96,
    height: 96,
    borderRadius: borderRadius.full,
    backgroundColor: colors.success,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: colors.success,
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.3,
    shadowRadius: 16,
    elevation: 8,
  },
  textSection: {
    alignItems: 'center',
    marginBottom: spacing.xl,
  },
  title: {
    color: colors.textPrimary,
    fontSize: fontSize.xxl,
    fontWeight: fontWeight.bold,
    textAlign: 'center',
    marginBottom: spacing.xs,
  },
  subtitle: {
    color: colors.textSecondary,
    fontSize: fontSize.md,
    textAlign: 'center',
  },
  summaryCard: {
    width: '100%',
    marginBottom: spacing.md,
  },
  summaryRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: spacing.sm,
  },
  summaryLabel: {
    color: colors.textSecondary,
    fontSize: fontSize.sm,
  },
  summaryValue: {
    color: colors.textPrimary,
    fontSize: fontSize.sm,
    fontWeight: fontWeight.semibold,
  },
  summaryValueGreen: {
    color: colors.success,
    fontSize: fontSize.md,
    fontWeight: fontWeight.bold,
  },
  privacyBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: colors.successLight,
    paddingHorizontal: spacing.sm,
    paddingVertical: 4,
    borderRadius: borderRadius.full,
  },
  privacyBadgeText: {
    color: colors.success,
    fontSize: fontSize.xs,
    fontWeight: fontWeight.semibold,
  },
  txId: {
    color: colors.textSecondary,
    fontSize: fontSize.sm,
    fontFamily: 'monospace',
  },
  divider: {
    height: 1,
    backgroundColor: colors.border,
  },
  infoBox: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.sm,
    padding: spacing.md,
    backgroundColor: colors.successLight,
    borderRadius: borderRadius.lg,
    width: '100%',
  },
  infoBoxDark: {
    backgroundColor: 'rgba(34, 197, 94, 0.15)',
  },
  infoText: {
    flex: 1,
    color: colors.textSecondary,
    fontSize: fontSize.sm,
    lineHeight: 20,
  },
  footer: {
    padding: spacing.lg,
    paddingBottom: spacing.xl,
    backgroundColor: colors.white,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    gap: spacing.sm,
  },
  footerDark: {
    backgroundColor: colors.dark.card,
    borderTopColor: colors.dark.border,
  },
  secondaryButton: {
    marginTop: 0,
  },
})
