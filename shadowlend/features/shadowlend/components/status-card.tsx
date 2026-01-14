import { View, Text, StyleSheet } from 'react-native'
import { colors, borderRadius, spacing, fontSize, fontWeight } from '@/constants/theme'
import { Icon } from '@/components/ui'

interface StatusCardProps {
  isHealthy: boolean
  portfolioValue: string
}

export function StatusCard({ isHealthy, portfolioValue }: StatusCardProps) {
  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <View style={styles.statusBadge}>
          <Icon name="verified-user" size={28} color={colors.success} />
        </View>
        <Text style={styles.statusText}>
          {isHealthy ? 'Your position is Safe' : 'Position at Risk'}
        </Text>
      </View>

      <View style={styles.body}>
        <Text style={styles.label}>Total Portfolio Value</Text>
        <Text style={styles.value}>{portfolioValue}</Text>
      </View>
    </View>
  )
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: colors.cardBackground,
    borderRadius: borderRadius.xl,
    borderWidth: 1,
    borderColor: colors.border,
    overflow: 'hidden',
    shadowColor: colors.success,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.2,
    shadowRadius: 20,
    elevation: 4,
  },
  header: {
    height: 128,
    backgroundColor: colors.primaryLight,
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
  },
  statusBadge: {
    backgroundColor: colors.successLight,
    padding: spacing.sm,
    borderRadius: borderRadius.full,
  },
  statusText: {
    color: colors.success,
    fontSize: fontSize.sm,
    fontWeight: fontWeight.bold,
    textTransform: 'uppercase',
    letterSpacing: 2,
  },
  body: {
    alignItems: 'center',
    paddingVertical: spacing.xl,
    paddingHorizontal: spacing.lg,
    gap: spacing.sm,
  },
  label: {
    color: colors.textSecondary,
    fontSize: fontSize.sm,
    fontWeight: fontWeight.medium,
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
  value: {
    color: colors.textPrimary,
    fontSize: fontSize.display,
    fontWeight: fontWeight.extrabold,
  },
})
