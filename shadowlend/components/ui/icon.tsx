import { MaterialIcons } from '@expo/vector-icons'
import { ComponentProps } from 'react'

type IconName = ComponentProps<typeof MaterialIcons>['name']

interface IconProps {
  name: IconName
  size?: number
  color?: string
}

export function Icon({ name, size = 24, color = '#0d131b' }: IconProps) {
  return <MaterialIcons name={name} size={size} color={color} />
}

export type { IconName }
