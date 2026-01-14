import { View, Text, StyleSheet, Pressable, ScrollView } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { colors, spacing, fontSize, fontWeight, borderRadius } from '@/constants/theme'
import { Button, Icon, Card } from '@/components/ui'
import { useRouter, useLocalSearchParams } from 'expo-router'
import { useTheme } from '@/features/theme'

export function GrowConfirmScreen() {
  const router = useRouter()
  const { isDark } = useTheme()
  const params = useLocalSearchParams<{ amount: string; asset: string }>()
  const amount = params.amount || '500'
  const asset = params.asset || 'USDC'

  const estimatedApy = '8.2%'
  const estimatedEarnings = (parseFloat(amount) * 0.082 / 12).toFixed(2)
  const networkFee = '0.00025 SOL'

  return (
    <SafeAreaView style={[styles.container, isDark && styles.containerDark]} edges={['top']}>
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} style={styles.backButton}>
          <Icon name="arrow-back-ios" size={24} color={isDark ? colors.dark.text : colors.textPrimary} />
        </Pressable>
        <View style={styles.headerCenter}>
          <Text style={[styles.headerTitle, isDark && styles.textDark]}>Grow Assets</Text>
          <Text style={styles.headerStep}>Step 2 of 3</Text>
        </View>
        <View style={styles.placeholder} />
      </View>

      <View style={styles.progressContainer}>
        <View style={[styles.progressDot, styles.progressComplete]} />
        <View style={[styles.progressDot, styles.progressActive]} />
        <View style={[styles.progressDot, isDark && styles.progressDotDark]} />
      </View>

      <ScrollView style={styles.scrollView} contentContainerStyle={styles.content}>
        <View style={styles.titleSection}>
          <Text style={[styles.title, isDark && styles.textDark]}>Confirm your deposit</Text>
          <Text style={[styles.subtitle, isDark && styles.textSecondaryDark]}>
            Review the details before proceeding
          </Text>
        </View>

        {/* Amount Card */}
        <Card style={[styles.amountCard, isDark && styles.cardDark] as any}>
          <View style={styles.amountHeader}>
            <Text style={[styles.amountLabel, isDark && styles.textSecondaryDark]}>You're depositing</Text>
            <View style={styles.assetBadge}>
              <View style={styles.assetIcon}>
                <Text style={styles.assetIconText}>{asset.charAt(0)}</Text>
              </View>
              <Text style={[styles.assetName, isDark && styles.textDark]}>{asset}</Text>
            </View>
          </View>
          <Text style={styles.amountValue}>${parseFloat(amount).toLocaleString()}</Text>
        </Card>

        {/* Details Card */}
        <Card style={[styles.detailsCard, isDark && styles.cardDark] as any}>
          <View style={styles.detailRow}>
            <Text style={[styles.detailLabel, isDark && styles.textSecondaryDark]}>Estimated APY</Text>
            <Text style={styles.detailValueGreen}>{estimatedApy}</Text>
          </View>
          <View style={[styles.divider, isDark && styles.dividerDark]} />
          <View style={styles.detailRow}>
            <Text style={[styles.detailLabel, isDark && styles.textSecondaryDark]}>Est. Monthly Earnings</Text>
            <Text style={[styles.detailValue, isDark && styles.textDark]}>${estimatedEarnings}</Text>
          </View>
          <View style={[styles.divider, isDark && styles.dividerDark]} />
          <View style={styles.detailRow}>
            <Text style={[styles.detailLabel, isDark && styles.textSecondaryDark]}>Network Fee</Text>
            <Text style={[styles.detailValue, isDark && styles.textDark]}>{networkFee}</Text>
          </View>
          <View style={[styles.divider, isDark && styles.dividerDark]} />
          <View style={styles.detailRow}>
            <Text style={[styles.detailLabel, isDark && styles.textSecondaryDark]}>Pool</Text>
            <Text style={[styles.detailValue, isDark && styles.textDark]}>Shadow Vault</Text>
          </View>
        </Card>

        {/* Privacy Info */}
        <View style={[styles.privacyInfo, isDark && styles.privacyInfoDark]}>
          <Icon name="visibility-off" size={20} color={colors.primary} />
          <Text style={[styles.privacyText, isDark && styles.textSecondaryDark]}>
            This transaction will be shielded. Your deposit amount and wallet history remain private.
          </Text>
        </View>

        {/* Warning */}
        <View style={styles.warningBox}>
          <Icon name="info" size={18} color={colors.warning} />
          <Text style={styles.warningText}>
            Funds can be withdrawn at any time. Early withdrawal may affect earned yield.
          </Text>
        </View>
      </ScrollView>

      <View style={[styles.footer, isDark && styles.footerDark]}>
        <Button
          title="Confirm Deposit"
          icon="lock"
          iconPosition="left"
          size="lg"
          fullWidth
          onPress={() => router.push({ pathname: '/grow-success', params: { amount, asset } } as any)}
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
  backButton: {
    width: 48,
    height: 48,
    alignItems: 'center',
    justifyContent: 'center',
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
  progressDotDark: {
    backgroundColor: colors.dark.border,
  },
  progressActive: {
    backgroundColor: colors.primary,
  },
  progressComplete: {
    backgroundColor: colors.success,
  },
  scrollView: {
    flex: 1,
  },
  content: {
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.xl,
  },
  titleSection: {
    alignItems: 'center',
    paddingTop: spacing.lg,
    paddingBottom: spacing.lg,
  },
  title: {
    color: colors.textPrimary,
    fontSize: fontSize.xxl,
    fontWeight: fontWeight.bold,
    textAlign: 'center',
  },
  subtitle: {
    color: colors.textSecondary,
    fontSize: fontSize.sm,
    marginTop: spacing.xs,
  },
  amountCard: {
    alignItems: 'center',
    paddingVertical: spacing.xl,
    marginBottom: spacing.md,
  },
  amountHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    marginBottom: spacing.md,
  },
  amountLabel: {
    color: colors.textSecondary,
    fontSize: fontSize.sm,
  },
  assetBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    backgroundColor: colors.primaryLight,
    paddingHorizontal: spacing.sm,
    paddingVertical: 4,
    borderRadius: borderRadius.full,
  },
  assetIcon: {
    width: 20,
    height: 20,
    borderRadius: borderRadius.full,
    backgroundColor: '#2775ca',
    alignItems: 'center',
    justifyContent: 'center',
  },
  assetIconText: {
    color: colors.white,
    fontSize: 8,
    fontWeight: fontWeight.bold,
  },
  assetName: {
    color: colors.textPrimary,
    fontSize: fontSize.sm,
    fontWeight: fontWeight.semibold,
  },
  amountValue: {
    color: colors.primary,
    fontSize: 44,
    fontWeight: fontWeight.bold,
  },
  detailsCard: {
    marginBottom: spacing.md,
  },
  detailRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: spacing.sm,
  },
  detailLabel: {
    color: colors.textSecondary,
    fontSize: fontSize.sm,
  },
  detailValue: {
    color: colors.textPrimary,
    fontSize: fontSize.sm,
    fontWeight: fontWeight.semibold,
  },
  detailValueGreen: {
    color: colors.success,
    fontSize: fontSize.md,
    fontWeight: fontWeight.bold,
  },
  divider: {
    height: 1,
    backgroundColor: colors.border,
  },
  privacyInfo: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.sm,
    padding: spacing.md,
    backgroundColor: colors.primaryLight,
    borderRadius: borderRadius.lg,
    marginBottom: spacing.md,
  },
  privacyInfoDark: {
    backgroundColor: 'rgba(19, 109, 236, 0.15)',
  },
  privacyText: {
    flex: 1,
    color: colors.textSecondary,
    fontSize: fontSize.sm,
    lineHeight: 20,
  },
  warningBox: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.sm,
    padding: spacing.md,
    backgroundColor: colors.warningLight,
    borderRadius: borderRadius.lg,
  },
  warningText: {
    flex: 1,
    color: colors.warning,
    fontSize: fontSize.sm,
    lineHeight: 20,
  },
  footer: {
    padding: spacing.lg,
    paddingBottom: spacing.xl,
    backgroundColor: colors.white,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  footerDark: {
    backgroundColor: colors.dark.card,
    borderTopColor: colors.dark.border,
  },
})
