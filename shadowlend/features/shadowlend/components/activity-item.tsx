import { View, Text, StyleSheet } from 'react-native'
import { colors, borderRadius, spacing, fontSize, fontWeight } from '@/constants/theme'
import { Icon, IconName } from '@/components/ui'

interface ActivityItemProps {
  icon: IconName
  iconColor: string
  iconBgColor: string
  title: string
  description: string
  timestamp: string
  gradientColors?: string[]
}

export function ActivityItem({
  icon,
  iconColor,
  iconBgColor,
  title,
  description,
  timestamp,
}: ActivityItemProps) {
  return (
    <View style={styles.container}>
      <View style={[styles.iconContainer, { backgroundColor: iconBgColor }]}>
        <Icon name={icon} size={24} color={iconColor} />
      </View>
      <View style={styles.content}>
        <Text style={styles.title}>{title}</Text>
        <Text style={styles.description}>{description}</Text>
        <Text style={styles.timestamp}>{timestamp}</Text>
      </View>
      <View style={styles.thumbnail} />
    </View>
  )
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.cardBackground,
    borderRadius: borderRadius.xl,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.md,
    gap: spacing.md,
    shadowColor: colors.black,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 4,
    elevation: 2,
  },
  iconContainer: {
    width: 48,
    height: 48,
    borderRadius: borderRadius.full,
    alignItems: 'center',
    justifyContent: 'center',
  },
  content: {
    flex: 1,
    gap: 2,
  },
  title: {
    color: colors.textPrimary,
    fontSize: fontSize.lg,
    fontWeight: fontWeight.semibold,
  },
  description: {
    color: colors.textSecondary,
    fontSize: fontSize.sm,
  },
  timestamp: {
    color: colors.textSecondary,
    fontSize: fontSize.xs,
    marginTop: spacing.xs,
  },
  thumbnail: {
    width: 64,
    height: 48,
    borderRadius: borderRadius.lg,
    backgroundColor: colors.orcaBlue,
  },
})
