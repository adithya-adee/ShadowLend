import { View, Text, StyleSheet, ScrollView, Pressable } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { colors, spacing, fontSize, fontWeight, borderRadius } from '@/constants/theme'
import { Icon, ShadowLendLogo } from '@/components/ui'
import { ActivityItem } from '../components'
import { useTheme } from '@/features/theme'

const ACTIVITY_DATA = {
  today: [
    {
      id: '1',
      icon: 'trending-up' as const,
      iconColor: colors.success,
      iconBgColor: colors.successSoft,
      title: 'You grew your USDC',
      description: 'Yield earned from Shadow Pool',
      timestamp: '2 hours ago',
    },
    {
      id: '2',
      icon: 'verified-user' as const,
      iconColor: colors.primary,
      iconBgColor: colors.orcaBlue,
      title: 'Privacy Shield activated',
      description: 'Transaction obfuscated successfully',
      timestamp: '5 hours ago',
    },
  ],
  yesterday: [
    {
      id: '3',
      icon: 'water-drop' as const,
      iconColor: colors.textSecondary,
      iconBgColor: colors.backgroundLight,
      title: 'Added to Deep Water Pool',
      description: 'You supplied 500.00 SOL',
      timestamp: 'Yesterday, 4:12 PM',
    },
    {
      id: '4',
      icon: 'check-circle' as const,
      iconColor: colors.success,
      iconBgColor: colors.successSoft,
      title: 'Loan successfully repaid',
      description: 'Collateral released to wallet',
      timestamp: 'Yesterday, 9:30 AM',
    },
  ],
  lastWeek: [
    {
      id: '5',
      icon: 'sailing' as const,
      iconColor: colors.primary,
      iconBgColor: colors.primaryLight,
      title: 'Your journey began',
      description: 'First deposit into ShadowLend',
      timestamp: 'Oct 24, 2023',
    },
  ],
}

export function ActivityScreen() {
  const { isDark } = useTheme()

  return (
    <SafeAreaView style={[styles.container, isDark && styles.containerDark]} edges={['top']}>
      <View style={[styles.header, isDark && styles.headerDark]}>
        <Pressable style={styles.backButton}>
          <Icon name="arrow-back-ios" size={24} color={isDark ? colors.dark.text : colors.textPrimary} />
        </Pressable>
        <Text style={[styles.headerTitle, isDark && styles.textDark]}>Recent Activity</Text>
        <Pressable style={styles.shieldButton}>
          <ShadowLendLogo size={24} color={colors.primary} />
        </Pressable>
      </View>

      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.section}>
          <Text style={[styles.sectionTitle, isDark && styles.textDark]}>Today</Text>
          <View style={styles.activityList}>
            {ACTIVITY_DATA.today.map((item) => (
              <ActivityItem key={item.id} {...item} isDark={isDark} />
            ))}
          </View>
        </View>

        <View style={styles.section}>
          <Text style={[styles.sectionTitle, isDark && styles.textDark]}>Yesterday</Text>
          <View style={styles.activityList}>
            {ACTIVITY_DATA.yesterday.map((item) => (
              <ActivityItem key={item.id} {...item} isDark={isDark} />
            ))}
          </View>
        </View>

        <View style={styles.section}>
          <Text style={[styles.sectionTitle, isDark && styles.textDark]}>Last Week</Text>
          <View style={styles.activityList}>
            {ACTIVITY_DATA.lastWeek.map((item) => (
              <ActivityItem key={item.id} {...item} isDark={isDark} />
            ))}
          </View>
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
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    backgroundColor: colors.backgroundLight,
  },
  headerDark: {
    backgroundColor: colors.dark.background,
  },
  backButton: {
    width: 48,
    height: 48,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitle: {
    color: colors.textPrimary,
    fontSize: fontSize.lg,
    fontWeight: fontWeight.bold,
  },
  shieldButton: {
    width: 48,
    height: 48,
    alignItems: 'center',
    justifyContent: 'center',
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    paddingBottom: spacing.xxl,
  },
  section: {
    paddingHorizontal: spacing.md,
    paddingTop: spacing.lg,
  },
  sectionTitle: {
    color: colors.textPrimary,
    fontSize: fontSize.xl,
    fontWeight: fontWeight.bold,
    marginBottom: spacing.sm,
  },
  activityList: {
    gap: spacing.sm,
  },
})
