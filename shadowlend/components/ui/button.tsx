import { Pressable, StyleSheet, Text, View, ViewStyle, TextStyle } from 'react-native'
import { colors, borderRadius, fontSize, fontWeight, spacing } from '@/constants/theme'
import { Icon, IconName } from './icon'
import { useTheme } from '@/features/theme'

interface ButtonProps {
  title: string
  onPress?: () => void
  variant?: 'primary' | 'secondary' | 'outline' | 'ghost'
  size?: 'sm' | 'md' | 'lg'
  icon?: IconName
  iconPosition?: 'left' | 'right'
  disabled?: boolean
  fullWidth?: boolean
  style?: ViewStyle
}

export function Button({
  title,
  onPress,
  variant = 'primary',
  size = 'md',
  icon,
  iconPosition = 'right',
  disabled = false,
  fullWidth = false,
  style,
}: ButtonProps) {
  const { isDark } = useTheme()

  const buttonStyles: ViewStyle[] = [
    styles.base,
    styles[variant],
    isDark && variant === 'outline' && styles.outlineDark,
    styles[`size_${size}`],
    fullWidth && styles.fullWidth,
    disabled && styles.disabled,
    style,
  ].filter(Boolean) as ViewStyle[]

  const textStyles: TextStyle[] = [
    styles.text,
    styles[`text_${variant}`],
    isDark && variant === 'outline' && styles.text_outlineDark,
    styles[`textSize_${size}`],
  ].filter(Boolean) as TextStyle[]

  const iconColor = variant === 'primary' ? colors.white : 
    (variant === 'outline' && isDark ? colors.dark.text : colors.primary)

  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      style={({ pressed }) => [
        ...buttonStyles,
        pressed && styles.pressed,
      ]}
    >
      <View style={styles.content}>
        {icon && iconPosition === 'left' && (
          <Icon name={icon} size={size === 'lg' ? 24 : 20} color={iconColor} />
        )}
        <Text style={textStyles}>{title}</Text>
        {icon && iconPosition === 'right' && (
          <Icon name={icon} size={size === 'lg' ? 24 : 20} color={iconColor} />
        )}
      </View>
    </Pressable>
  )
}

const styles = StyleSheet.create({
  base: {
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: borderRadius.xl,
  },
  primary: {
    backgroundColor: colors.primary,
    shadowColor: colors.primary,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.25,
    shadowRadius: 8,
    elevation: 4,
  },
  secondary: {
    backgroundColor: colors.primaryLight,
  },
  outline: {
    backgroundColor: 'transparent',
    borderWidth: 1,
    borderColor: colors.border,
  },
  outlineDark: {
    borderColor: colors.dark.border,
  },
  ghost: {
    backgroundColor: 'transparent',
  },
  size_sm: {
    height: 36,
    paddingHorizontal: spacing.md,
  },
  size_md: {
    height: 48,
    paddingHorizontal: spacing.lg,
  },
  size_lg: {
    height: 56,
    paddingHorizontal: spacing.xl,
  },
  fullWidth: {
    width: '100%',
  },
  disabled: {
    opacity: 0.5,
  },
  pressed: {
    transform: [{ scale: 0.98 }],
  },
  content: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  text: {
    fontWeight: fontWeight.bold,
  },
  text_primary: {
    color: colors.white,
  },
  text_secondary: {
    color: colors.primary,
  },
  text_outline: {
    color: colors.textPrimary,
  },
  text_outlineDark: {
    color: colors.dark.text,
  },
  text_ghost: {
    color: colors.primary,
  },
  textSize_sm: {
    fontSize: fontSize.sm,
  },
  textSize_md: {
    fontSize: fontSize.md,
  },
  textSize_lg: {
    fontSize: fontSize.lg,
  },
})
