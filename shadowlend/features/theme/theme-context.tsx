import { createContext, useContext, useState, PropsWithChildren } from 'react'
import { useColorScheme } from 'react-native'

type ThemeMode = 'light' | 'dark' | 'system'

interface ThemeContextType {
  mode: ThemeMode
  isDark: boolean
  setMode: (mode: ThemeMode) => void
  toggleTheme: () => void
}

const ThemeContext = createContext<ThemeContextType | undefined>(undefined)

export function ThemeProvider({ children }: PropsWithChildren) {
  const systemColorScheme = useColorScheme()
  const [mode, setMode] = useState<ThemeMode>('light')

  const isDark = mode === 'dark' || (mode === 'system' && systemColorScheme === 'dark')

  const toggleTheme = () => {
    setMode(isDark ? 'light' : 'dark')
  }

  return (
    <ThemeContext.Provider value={{ mode, isDark, setMode, toggleTheme }}>
      {children}
    </ThemeContext.Provider>
  )
}

export function useTheme() {
  const context = useContext(ThemeContext)
  if (!context) {
    throw new Error('useTheme must be used within a ThemeProvider')
  }
  return context
}
