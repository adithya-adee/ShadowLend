import { Platform, Alert } from 'react-native'
import { useMobileWallet } from '@wallet-ui/react-native-web3js'
import { PublicKey } from '@solana/web3.js'
import { useState, useEffect, useCallback } from 'react'

interface WalletAccount {
  publicKey: PublicKey
}

interface UseWalletReturn {
  account: WalletAccount | null
  connect: () => Promise<void>
  disconnect: () => Promise<void>
  connected: boolean
  connecting: boolean
}

// Get Phantom provider
function getPhantomProvider() {
  if (typeof window === 'undefined') return null
  
  // Check for Phantom
  const phantom = (window as any).phantom?.solana
  if (phantom?.isPhantom) return phantom
  
  // Check for injected solana (Phantom or other wallets)
  const solana = (window as any).solana
  if (solana?.isPhantom || solana?.isConnected !== undefined) return solana
  
  return null
}

// Check if Phantom is installed
function isPhantomInstalled() {
  return getPhantomProvider() !== null
}

// Module-level flag to track manual disconnect (persists across component remounts)
let wasManuallyDisconnected = false

// Web wallet hook using Phantom browser extension directly
function useWebWallet(): UseWalletReturn {
  const [account, setAccount] = useState<WalletAccount | null>(null)
  const [connecting, setConnecting] = useState(false)

  // Check for existing connection on mount (only if not manually disconnected)
  useEffect(() => {
    const checkConnection = async () => {
      // Don't auto-reconnect if user manually disconnected
      if (wasManuallyDisconnected) return
      
      const phantom = getPhantomProvider()
      if (!phantom) return

      // Try to eagerly connect (reconnect if previously connected)
      try {
        const response = await phantom.connect({ onlyIfTrusted: true })
        if (response?.publicKey) {
          setAccount({ publicKey: new PublicKey(response.publicKey.toString()) })
        }
      } catch (error: any) {
        // User hasn't connected before, rejected, or service worker issue - that's fine
        if (error?.message?.includes('disconnected port') || error?.message?.includes('service worker')) {
          console.log('Phantom service worker not ready, skipping eager connect')
        } else {
          console.log('No existing connection')
        }
      }
    }

    // Small delay to ensure window is ready
    const timer = setTimeout(checkConnection, 100)
    return () => clearTimeout(timer)
  }, [])

  // Listen for account changes
  useEffect(() => {
    const phantom = getPhantomProvider()
    if (!phantom) return

    const handleAccountChange = (publicKey: any) => {
      if (publicKey) {
        setAccount({ publicKey: new PublicKey(publicKey.toString()) })
      } else {
        setAccount(null)
      }
    }

    const handleDisconnect = () => {
      setAccount(null)
    }

    const handleConnect = (publicKey: any) => {
      if (publicKey) {
        setAccount({ publicKey: new PublicKey(publicKey.toString()) })
      }
    }

    phantom.on?.('accountChanged', handleAccountChange)
    phantom.on?.('disconnect', handleDisconnect)
    phantom.on?.('connect', handleConnect)
    
    return () => {
      phantom.off?.('accountChanged', handleAccountChange)
      phantom.off?.('disconnect', handleDisconnect)
      phantom.off?.('connect', handleConnect)
    }
  }, [])

  const connect = useCallback(async () => {
    if (!isPhantomInstalled()) {
      // Open Phantom website if not installed
      if (typeof window !== 'undefined') {
        const confirmed = window.confirm(
          'Phantom wallet is not installed. Would you like to install it?'
        )
        if (confirmed) {
          window.open('https://phantom.app/', '_blank')
        }
      }
      return
    }

    const phantom = getPhantomProvider()
    if (!phantom) return

    try {
      setConnecting(true)
      wasManuallyDisconnected = false // Reset the flag when user connects
      const response = await phantom.connect()
      if (response?.publicKey) {
        setAccount({ publicKey: new PublicKey(response.publicKey.toString()) })
      }
    } catch (error: any) {
      console.error('Failed to connect:', error)
      // Handle specific error cases
      if (error?.code === 4001) {
        // User rejected the connection
        console.log('User rejected the connection')
      } else if (error?.message?.includes('disconnected port') || error?.message?.includes('service worker')) {
        // Phantom extension service worker issue - retry once
        console.log('Phantom service worker issue, retrying...')
        try {
          // Small delay before retry
          await new Promise(resolve => setTimeout(resolve, 500))
          const retryResponse = await phantom.connect()
          if (retryResponse?.publicKey) {
            setAccount({ publicKey: new PublicKey(retryResponse.publicKey.toString()) })
          }
        } catch (retryError) {
          console.error('Retry failed:', retryError)
        }
      }
    } finally {
      setConnecting(false)
    }
  }, [])

  const disconnect = useCallback(async () => {
    // Set flag FIRST to prevent auto-reconnect
    wasManuallyDisconnected = true
    setAccount(null)
    
    const phantom = getPhantomProvider()
    if (!phantom) return
    
    try {
      await phantom.disconnect()
    } catch (error) {
      console.error('Failed to disconnect from Phantom:', error)
      // Account is already cleared, so disconnect is effectively done
    }
  }, [])

  return {
    account,
    connect,
    disconnect,
    connected: !!account,
    connecting,
  }
}

// Mobile wallet hook
function useMobileWalletHook(): UseWalletReturn {
  const { account, connect, disconnect } = useMobileWallet()

  return {
    account: account ? { publicKey: account.publicKey } : null,
    connect: async () => { connect() },
    disconnect: async () => { disconnect() },
    connected: !!account,
    connecting: false,
  }
}

// Custom hook that must be called at the top level
const useWebWalletInstance = Platform.OS === 'web' ? useWebWallet : () => null
const useMobileWalletInstance = Platform.OS !== 'web' ? useMobileWalletHook : () => null

export function useWallet(): UseWalletReturn {
  const webWallet = useWebWalletInstance()
  const mobileWallet = useMobileWalletInstance()

  if (Platform.OS === 'web') {
    return webWallet as UseWalletReturn
  }
  return mobileWallet as UseWalletReturn
}
