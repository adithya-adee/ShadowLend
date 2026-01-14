import { View, Text, StyleSheet } from 'react-native'
import { colors, borderRadius, spacing, fontSize, fontWeight } from '@/constants/theme'
import { Icon, Toggle } from '@/components/ui'

interface PrivacyShieldProps {
  enabled: boolean
  onToggle: (value: boolean) => void
  compact?: boolean
}

export function PrivacyShield({ enabled, onToggle, compact = false }: PrivacyShieldProps) {
  if (compact) {
    return (
      <View style={styles.compactContainer}>
        <View style={styles.row}>
          <View style={styles.iconContainer}>
            <Icon name="shield" size={24} color={colors.primary} />
          </View>
          <View style={styles.textContainer}>
            <Text style={styles.title}>Privacy Shield</Text>
            <Text style={styles.subtitle}>Your financial data is encrypted and private.</Text>
          </View>
          <Toggle value={enabled} onValueChange={onToggle} />
        </View>
      </View>
    )
  }

  return (
    <View style={styles.container}>
      <View style={styles.row}>
        <View style={styles.iconContainerLarge}>
          <Icon name="person" size={24} color={colors.primary} />
        </View>
        <View style={styles.textContainer}>
          <Text style={styles.title}>Privacy Shield</Text>
          <Text style={styles.subtitle}>Powered by Arcium MXE</Text>
        </View>
        <Toggle value={enabled} onValueChange={onToggle} />
      </View>
      <View style={styles.divider} />
      <Text style={styles.description}>
        "Your transaction is automatically shielded for privacy. Your wallet history remains hidden from public view."
      </Text>
    </View>
  )
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: colors.cardBackground,
    borderRadius: borderRadius.xxl,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.lg,
    gap: spacing.md,
  },
  compactContainer: {
    backgroundColor: colors.cardBackground,
    borderRadius: borderRadius.xl,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.lg,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
  },
  iconContainer: {
    backgroundColor: colors.primaryLight,
    padding: spacing.sm,
    borderRadius: borderRadius.lg,
  },
  iconContainerLarge: {
    width: 40,
    height: 40,
    backgroundColor: colors.primaryLight,
    borderRadius: borderRadius.full,
    alignItems: 'center',
    justifyContent: 'center',
  },
  textContainer: {
    flex: 1,
    gap: 2,
  },
  title: {
    color: colors.textPrimary,
    fontSize: fontSize.lg,
    fontWeight: fontWeight.bold,
  },
  subtitle: {
    color: colors.textSecondary,
    fontSize: fontSize.xs,
  },
  divider: {
    height: 1,
    backgroundColor: colors.border,
  },
  description: {
    color: colors.textSecondary,
    fontSize: fontSize.xs,
    fontStyle: 'italic',
    lineHeight: 18,
  },
})
