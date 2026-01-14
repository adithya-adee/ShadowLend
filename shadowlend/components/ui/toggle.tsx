import { Pressable, StyleSheet, View, Animated } from 'react-native'
import { colors, borderRadius } from '@/constants/theme'
import { useRef, useEffect } from 'react'

interface ToggleProps {
  value: boolean
  onValueChange: (value: boolean) => void
  disabled?: boolean
}

export function Toggle({ value, onValueChange, disabled = false }: ToggleProps) {
  const translateX = useRef(new Animated.Value(value ? 20 : 0)).current

  useEffect(() => {
    Animated.spring(translateX, {
      toValue: value ? 20 : 0,
      useNativeDriver: true,
      friction: 8,
    }).start()
  }, [value, translateX])

  return (
    <Pressable
      onPress={() => !disabled && onValueChange(!value)}
      style={[
        styles.track,
        value ? styles.trackActive : styles.trackInactive,
        disabled && styles.disabled,
      ]}
    >
      <Animated.View
        style={[
          styles.thumb,
          { transform: [{ translateX }] },
        ]}
      />
    </Pressable>
  )
}

const styles = StyleSheet.create({
  track: {
    width: 51,
    height: 31,
    borderRadius: borderRadius.full,
    padding: 2,
    justifyContent: 'center',
  },
  trackActive: {
    backgroundColor: colors.primary,
  },
  trackInactive: {
    backgroundColor: colors.textMuted,
  },
  thumb: {
    width: 27,
    height: 27,
    borderRadius: borderRadius.full,
    backgroundColor: colors.white,
    shadowColor: colors.black,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 4,
    elevation: 2,
  },
  disabled: {
    opacity: 0.5,
  },
})
