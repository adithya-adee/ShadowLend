import { View, Text, StyleSheet } from 'react-native'
import { colors, borderRadius, spacing, fontSize, fontWeight } from '@/constants/theme'
import { Icon } from '@/components/ui'

interface AmountSliderProps {
  value: number
  maxValue: number
  label?: string
  formatValue?: (value: number) => string
}

export function AmountSlider({
  value,
  maxValue,
  label = 'Amount',
  formatValue = (v) => `$${v.toLocaleString()}`,
}: AmountSliderProps) {
  const percentage = (value / maxValue) * 100

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.label}>{label}</Text>
        <View style={styles.safetyBadge}>
          <Icon name="verified-user" size={14} color={colors.success} />
          <Text style={styles.safetyText}>Safety Level: High</Text>
        </View>
      </View>

      <View style={styles.valueRow}>
        <Text style={styles.minValue}>$0</Text>
        <Text style={styles.currentValue}>{formatValue(value)}</Text>
        <Text style={styles.maxValue}>{formatValue(maxValue)}</Text>
      </View>

      <View style={styles.sliderTrack}>
        <View style={[styles.sliderFill, { width: `${percentage}%` }]} />
        <View style={[styles.sliderHandle, { left: `${percentage}%` }]}>
          <Icon name="unfold-more" size={16} color={colors.primary} />
        </View>
      </View>
    </View>
  )
}

const styles = StyleSheet.create({
  container: {
    gap: spacing.md,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  label: {
    color: colors.textPrimary,
    fontSize: fontSize.xl,
    fontWeight: fontWeight.bold,
  },
  safetyBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    backgroundColor: colors.successLight,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
    borderRadius: borderRadius.full,
  },
  safetyText: {
    color: colors.success,
    fontSize: fontSize.xs,
    fontWeight: fontWeight.bold,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  valueRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  minValue: {
    color: colors.textSecondary,
    fontSize: fontSize.sm,
    fontWeight: fontWeight.medium,
  },
  currentValue: {
    color: colors.primary,
    fontSize: fontSize.xxxl,
    fontWeight: fontWeight.bold,
  },
  maxValue: {
    color: colors.textSecondary,
    fontSize: fontSize.sm,
    fontWeight: fontWeight.medium,
  },
  sliderTrack: {
    height: 12,
    backgroundColor: colors.backgroundLight,
    borderRadius: borderRadius.full,
    position: 'relative',
  },
  sliderFill: {
    height: '100%',
    backgroundColor: colors.primary,
    borderRadius: borderRadius.full,
  },
  sliderHandle: {
    position: 'absolute',
    top: -10,
    marginLeft: -16,
    width: 32,
    height: 32,
    backgroundColor: colors.white,
    borderRadius: borderRadius.full,
    borderWidth: 4,
    borderColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: colors.black,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.15,
    shadowRadius: 4,
    elevation: 4,
  },
})
