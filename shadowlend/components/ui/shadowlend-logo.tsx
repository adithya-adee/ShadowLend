import { View, StyleSheet, Platform } from 'react-native'

interface ShadowLendLogoProps {
  size?: number
  color?: string
}

// Web SVG component
function WebSvgLogo({ width, height, color }: { width: number; height: number; color: string }) {
  return (
    <svg width={width} height={height} viewBox="0 0 410 309" fill="none">
      <path
        d="M10 299L76 231H194L142.5 167L190.882 107.344L194 103.5L400 10L348 107.344H196.995L287.5 223.5L232.5 299H10Z"
        fill={color}
      />
    </svg>
  )
}

export function ShadowLendLogo({ size = 100, color = '#000000' }: ShadowLendLogoProps) {
  const aspectRatio = 410 / 309
  const width = size * aspectRatio
  const height = size

  return (
    <View style={[styles.container, { width, height }]}>
      <WebSvgLogo width={width} height={height} color={color} />
    </View>
  )
}

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
    justifyContent: 'center',
  },
})
