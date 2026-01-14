import { View, Text, StyleSheet, ScrollView, Pressable } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { colors, spacing, fontSize, fontWeight, borderRadius } from '@/constants/theme'
import { Button, Icon, Card } from '@/components/ui'
import { useTheme } from '@/features/theme'

const POOLS = [
  {
    id: 'usdc',
    name: 'USDC Pool',
    symbol: 'USDC',
    apy: '8.2%',
    tvl: '$2.4M',
    color: '#2775ca',
  },
  {
    id: 'sol',
    name: 'SOL Pool',
    symbol: 'SOL',
    apy: '5.8%',
    tvl: '$1.8M',
    color: '#9945FF',
  },
  {
    id: 'usdt',
    name: 'USDT Pool',
    symbol: 'USDT',
    apy: '7.5%',
    tvl: '$1.2M',
    color: '#26A17B',
  },
]

export function LendScreen() {
  const { isDark, toggleTheme } = useTheme()

  return (
    <SafeAreaView style={[styles.container, isDark && styles.containerDark]} edges={['top']}>
      <View style={styles.header}>
        <Text style={[styles.headerTitle, isDark && styles.textDark]}>Lend</Text>
        <View style={styles.headerRight}>
          <Pressable style={[styles.themeButton, isDark && styles.themeButtonDark]} onPress={toggleTheme}>
            <Icon name={isDark ? 'light-mode' : 'dark-mode'} size={20} color={isDark ? colors.dark.text : colors.textPrimary} />
          </Pressable>
          <Pressable style={styles.infoButton}>
            <Icon name="info-outline" size={24} color={isDark ? colors.dark.textSecondary : colors.textSecondary} />
          </Pressable>
        </View>
      </View>

      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.statsRow}>
          <Card style={[styles.statCard, isDark && styles.cardDark] as any}>
            <Text style={[styles.statLabel, isDark && styles.textSecondaryDark]}>Your Deposits</Text>
            <Text style={[styles.statValue, isDark && styles.textDark]}>$4,250.00</Text>
            <View style={styles.statBadge}>
              <Icon name="trending-up" size={14} color={colors.success} />
              <Text style={styles.statBadgeText}>+$32.50 earned</Text>
            </View>
          </Card>
          <Card style={[styles.statCard, isDark && styles.cardDark] as any}>
            <Text style={[styles.statLabel, isDark && styles.textSecondaryDark]}>Avg. APY</Text>
            <Text style={[styles.statValue, isDark && styles.textDark]}>7.2%</Text>
            <View style={styles.statBadge}>
              <Icon name="verified" size={14} color={colors.primary} />
              <Text style={[styles.statBadgeText, { color: colors.primary }]}>Protected</Text>
            </View>
          </Card>
        </View>

        <View style={styles.section}>
          <Text style={[styles.sectionTitle, isDark && styles.textDark]}>Available Pools</Text>
          <Text style={[styles.sectionSubtitle, isDark && styles.textSecondaryDark]}>
            Earn yield while keeping your deposits private
          </Text>
        </View>

        <View style={styles.poolList}>
          {POOLS.map((pool) => (
            <Card key={pool.id} style={[styles.poolCard, isDark && styles.cardDark] as any}>
              <View style={styles.poolHeader}>
                <View style={[styles.poolIcon, { backgroundColor: pool.color }]}>
                  <Text style={styles.poolIconText}>{pool.symbol.charAt(0)}</Text>
                </View>
                <View style={styles.poolInfo}>
                  <Text style={[styles.poolName, isDark && styles.textDark]}>{pool.name}</Text>
                  <Text style={[styles.poolTvl, isDark && styles.textSecondaryDark]}>TVL: {pool.tvl}</Text>
                </View>
                <View style={styles.poolApy}>
                  <Text style={[styles.apyLabel, isDark && styles.textSecondaryDark]}>APY</Text>
                  <Text style={styles.apyValue}>{pool.apy}</Text>
                </View>
              </View>
              <View style={styles.poolActions}>
                <Button
                  title="Supply"
                  variant="primary"
                  size="sm"
                  style={styles.supplyButton}
                />
                <Button
                  title="Details"
                  variant="outline"
                  size="sm"
                  style={styles.detailsButton}
                />
              </View>
            </Card>
          ))}
        </View>

        <View style={[styles.privacyNote, isDark && styles.privacyNoteDark]}>
          <Icon name="shield" size={20} color={colors.primary} />
          <Text style={[styles.privacyNoteText, isDark && { color: colors.primary }]}>
            All deposits are shielded using Arcium MXE. Your balance remains private.
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
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
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
  headerTitle: {
    color: colors.textPrimary,
    fontSize: fontSize.xxl,
    fontWeight: fontWeight.bold,
  },
  infoButton: {
    width: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: spacing.md,
    paddingBottom: spacing.xxl,
  },
  statsRow: {
    flexDirection: 'row',
    gap: spacing.md,
    marginBottom: spacing.lg,
  },
  statCard: {
    flex: 1,
    gap: spacing.xs,
  },
  statLabel: {
    color: colors.textSecondary,
    fontSize: fontSize.xs,
    fontWeight: fontWeight.medium,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  statValue: {
    color: colors.textPrimary,
    fontSize: fontSize.xxl,
    fontWeight: fontWeight.bold,
  },
  statBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
  },
  statBadgeText: {
    color: colors.success,
    fontSize: fontSize.xs,
    fontWeight: fontWeight.semibold,
  },
  section: {
    marginBottom: spacing.md,
  },
  sectionTitle: {
    color: colors.textPrimary,
    fontSize: fontSize.xl,
    fontWeight: fontWeight.bold,
    marginBottom: spacing.xs,
  },
  sectionSubtitle: {
    color: colors.textSecondary,
    fontSize: fontSize.sm,
  },
  poolList: {
    gap: spacing.md,
  },
  poolCard: {
    gap: spacing.md,
  },
  poolHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
  },
  poolIcon: {
    width: 48,
    height: 48,
    borderRadius: borderRadius.full,
    alignItems: 'center',
    justifyContent: 'center',
  },
  poolIconText: {
    color: colors.white,
    fontSize: fontSize.lg,
    fontWeight: fontWeight.bold,
  },
  poolInfo: {
    flex: 1,
    gap: 2,
  },
  poolName: {
    color: colors.textPrimary,
    fontSize: fontSize.lg,
    fontWeight: fontWeight.semibold,
  },
  poolTvl: {
    color: colors.textSecondary,
    fontSize: fontSize.sm,
  },
  poolApy: {
    alignItems: 'flex-end',
  },
  apyLabel: {
    color: colors.textSecondary,
    fontSize: fontSize.xs,
    textTransform: 'uppercase',
  },
  apyValue: {
    color: colors.success,
    fontSize: fontSize.xl,
    fontWeight: fontWeight.bold,
  },
  poolActions: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  supplyButton: {
    flex: 1,
  },
  detailsButton: {
    flex: 1,
  },
  privacyNote: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    backgroundColor: colors.primaryLight,
    padding: spacing.md,
    borderRadius: borderRadius.lg,
    marginTop: spacing.lg,
  },
  privacyNoteDark: {
    backgroundColor: 'rgba(19, 109, 236, 0.15)',
  },
  privacyNoteText: {
    flex: 1,
    color: colors.primary,
    fontSize: fontSize.sm,
    lineHeight: 20,
  },
})
