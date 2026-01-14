import { View, StyleSheet, ViewStyle } from 'react-native'
import { colors, borderRadius } from '@/constants/theme'

interface ProgressBarProps {
  progress: number // 0-100
  height?: number
  variant?: 'default' | 'water'
  style?: ViewStyle
}

export function ProgressBar({ progress, height = 24, variant = 'default', style }: ProgressBarProps) {
  const clampedProgress = Math.min(100, Math.max(0, progress))

  return (
    <View style={[styles.track, { height }, style]}>
      <View style={[styles.fill, { width: `${clampedProgress}%` }]}>
        <View style={[variant === 'water' ? styles.waterFill : styles.defaultFill, { height }]} />
      </View>
    </View>
  )
}

const styles = StyleSheet.create({
  track: {
    width: '100%',
    borderRadius: borderRadius.full,
    backgroundColor: colors.backgroundLight,
    borderWidth: 1,
    borderColor: colors.borderLight,
    overflow: 'hidden',
  },
  fill: {
    height: '100%',
    borderRadius: borderRadius.full,
    overflow: 'hidden',
  },
  defaultFill: {
    backgroundColor: colors.primary,
  },
  waterFill: {
    backgroundColor: colors.primary,
    opacity: 0.9,
  },
})
