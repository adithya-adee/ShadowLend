import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { PropsWithChildren } from 'react'
import { Platform } from 'react-native'
import { NetworkProvider } from '@/features/network/network-provider'
import { MobileWalletProvider } from '@wallet-ui/react-native-web3js'
import { useNetwork } from '@/features/network/use-network'
import { ThemeProvider } from '@/features/theme'

const queryClient = new QueryClient()
export function AppProviders({ children }: PropsWithChildren) {
  return (
    <QueryClientProvider client={queryClient}>
      <ThemeProvider>
        <NetworkProvider>
          <WalletProviderWrapper>{children}</WalletProviderWrapper>
        </NetworkProvider>
      </ThemeProvider>
    </QueryClientProvider>
  )
}

// Platform-aware wallet provider - only use MobileWalletProvider on native
function WalletProviderWrapper({ children }: PropsWithChildren) {
  if (Platform.OS === 'web') {
    // On web, we handle wallet connection directly via Phantom extension
    return <>{children}</>
  }
  return <SolanaNetworkProvider>{children}</SolanaNetworkProvider>
}

// We have this SolanaNetworkProvider because of the network switching logic.
// If you only connect to a single network, use MobileWalletProvider directly.
function SolanaNetworkProvider({ children }: PropsWithChildren) {
  const { selectedNetwork } = useNetwork()
  return (
    <MobileWalletProvider
      chain={selectedNetwork.id}
      endpoint={selectedNetwork.url}
      identity={{ name: 'ShadowLend' }}
    >
      {children}
    </MobileWalletProvider>
  )
}
