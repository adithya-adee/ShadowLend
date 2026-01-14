import { View, Text, StyleSheet, ScrollView, Pressable, Alert, Modal } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { colors, spacing, fontSize, fontWeight, borderRadius } from '@/constants/theme'
import { Icon, Toggle, Card } from '@/components/ui'
import { useState } from 'react'
import { ellipsify } from '@/utils/ellipsify'
import { useTheme } from '@/features/theme'
import { useWallet } from '@/features/account/use-wallet'
import { useRouter } from 'expo-router'

interface SettingItemProps {
  icon: string
  title: string
  subtitle?: string
  onPress?: () => void
  rightElement?: React.ReactNode
  isDark?: boolean
}

function SettingItem({ icon, title, subtitle, onPress, rightElement, isDark }: SettingItemProps) {
  return (
    <Pressable 
      style={[styles.settingItem, isDark && styles.settingItemDark]} 
      onPress={onPress}
    >
      <View style={[styles.settingIcon, isDark && styles.settingIconDark]}>
        <Icon name={icon as any} size={24} color={colors.primary} />
      </View>
      <View style={styles.settingContent}>
        <Text style={[styles.settingTitle, isDark && styles.textDark]}>{title}</Text>
        {subtitle && <Text style={[styles.settingSubtitle, isDark && styles.textSecondaryDark]}>{subtitle}</Text>}
      </View>
      {rightElement || <Icon name="chevron-right" size={24} color={isDark ? colors.dark.textSecondary : colors.textMuted} />}
    </Pressable>
  )
}

export function SettingsScreen() {
  const { account, disconnect } = useWallet()
  const { isDark, toggleTheme } = useTheme()
  const router = useRouter()
  const [privacyMode, setPrivacyMode] = useState(true)
  const [notifications, setNotifications] = useState(true)
  const [showSecurityModal, setShowSecurityModal] = useState(false)
  const [showBackupModal, setShowBackupModal] = useState(false)
  const [showHelpModal, setShowHelpModal] = useState(false)
  const [showContactModal, setShowContactModal] = useState(false)
  const [showNetworkModal, setShowNetworkModal] = useState(false)
  const [selectedNetwork, setSelectedNetwork] = useState<'devnet' | 'mainnet' | 'testnet'>('devnet')
  const [biometricsEnabled, setBiometricsEnabled] = useState(false)
  const [pinEnabled, setPinEnabled] = useState(true)

  const handleDisconnect = async () => {
    await disconnect()
    // Navigate to home which will show connect screen
    router.replace('/(tabs)' as any)
  }

  const handleSecuritySettings = () => {
    setShowSecurityModal(true)
  }

  const handleBackupWallet = () => {
    setShowBackupModal(true)
  }

  const handleCopyRecoveryPhrase = () => {
    Alert.alert(
      'Recovery Phrase Copied',
      'Your recovery phrase has been copied to clipboard. Store it safely!',
      [{ text: 'OK' }]
    )
  }

  const containerStyle = [styles.container, isDark && styles.containerDark]
  const cardStyle = isDark ? styles.cardDark : undefined

  return (
    <SafeAreaView style={containerStyle} edges={['top']}>
      <View style={styles.header}>
        <Text style={[styles.headerTitle, isDark && styles.textDark]}>Settings</Text>
      </View>

      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        {account && (
          <Card style={[styles.walletCard, cardStyle] as any}>
            <View style={styles.walletInfo}>
              <View style={[styles.walletAvatar, isDark && styles.walletAvatarDark]}>
                <Icon name="account-balance-wallet" size={28} color={colors.primary} />
              </View>
              <View style={styles.walletDetails}>
                <Text style={[styles.walletLabel, isDark && styles.textSecondaryDark]}>Connected Wallet</Text>
                <Text style={[styles.walletAddress, isDark && styles.textDark]}>
                  {ellipsify(account.publicKey.toString(), 8)}
                </Text>
              </View>
            </View>
            <Pressable style={styles.disconnectButton} onPress={handleDisconnect}>
              <Text style={styles.disconnectText}>Disconnect</Text>
            </Pressable>
          </Card>
        )}

        <View style={styles.section}>
          <Text style={[styles.sectionTitle, isDark && styles.textSecondaryDark]}>Privacy & Security</Text>
          <Card padding="none" style={cardStyle}>
            <SettingItem
              icon="shield"
              title="Privacy Mode"
              subtitle="Hide transaction details"
              rightElement={<Toggle value={privacyMode} onValueChange={setPrivacyMode} />}
              isDark={isDark}
            />
            <View style={[styles.divider, isDark && styles.dividerDark]} />
            <SettingItem
              icon="lock"
              title="Security Settings"
              subtitle="Biometrics, PIN, recovery"
              onPress={handleSecuritySettings}
              isDark={isDark}
            />
            <View style={[styles.divider, isDark && styles.dividerDark]} />
            <SettingItem
              icon="vpn-key"
              title="Backup Wallet"
              subtitle="Export recovery phrase"
              onPress={handleBackupWallet}
              isDark={isDark}
            />
          </Card>
        </View>

        <View style={styles.section}>
          <Text style={[styles.sectionTitle, isDark && styles.textSecondaryDark]}>Preferences</Text>
          <Card padding="none" style={cardStyle}>
            <SettingItem
              icon="notifications"
              title="Notifications"
              subtitle="Push notifications"
              rightElement={<Toggle value={notifications} onValueChange={setNotifications} />}
              isDark={isDark}
            />
            <View style={[styles.divider, isDark && styles.dividerDark]} />
            <SettingItem
              icon="language"
              title="Network"
              subtitle={selectedNetwork.charAt(0).toUpperCase() + selectedNetwork.slice(1)}
              onPress={() => setShowNetworkModal(true)}
              isDark={isDark}
            />
            <View style={[styles.divider, isDark && styles.dividerDark]} />
            <SettingItem
              icon="dark-mode"
              title="Dark Mode"
              subtitle={isDark ? 'On' : 'Off'}
              rightElement={<Toggle value={isDark} onValueChange={toggleTheme} />}
              isDark={isDark}
            />
          </Card>
        </View>

        <View style={styles.section}>
          <Text style={[styles.sectionTitle, isDark && styles.textSecondaryDark]}>Support</Text>
          <Card padding="none" style={cardStyle}>
            <SettingItem
              icon="help"
              title="Help Center"
              subtitle="FAQs and guides"
              onPress={() => setShowHelpModal(true)}
              isDark={isDark}
            />
            <View style={[styles.divider, isDark && styles.dividerDark]} />
            <SettingItem
              icon="chat"
              title="Contact Support"
              subtitle="Get help from our team"
              onPress={() => setShowContactModal(true)}
              isDark={isDark}
            />
          </Card>
        </View>

        <View style={styles.footer}>
          <Text style={[styles.version, isDark && styles.textSecondaryDark]}>ShadowLend v1.0.0</Text>
          <Text style={styles.poweredBy}>Powered by Arcium MXE</Text>
        </View>
      </ScrollView>

      {/* Security Settings Modal */}
      <Modal
        visible={showSecurityModal}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={() => setShowSecurityModal(false)}
      >
        <SafeAreaView style={[styles.modalContainer, isDark && styles.containerDark]}>
          <View style={[styles.modalHeader, isDark && styles.modalHeaderDark]}>
            <Text style={[styles.modalTitle, isDark && styles.textDark]}>Security Settings</Text>
            <Pressable onPress={() => setShowSecurityModal(false)} style={styles.closeButton}>
              <Icon name="close" size={24} color={isDark ? colors.dark.text : colors.textPrimary} />
            </Pressable>
          </View>
          
          <ScrollView style={styles.modalContent}>
            <Card style={[styles.securityCard, cardStyle] as any}>
              <View style={styles.securityItem}>
                <View style={styles.securityInfo}>
                  <Icon name="fingerprint" size={28} color={colors.primary} />
                  <View style={styles.securityText}>
                    <Text style={[styles.securityTitle, isDark && styles.textDark]}>Biometric Authentication</Text>
                    <Text style={[styles.securitySubtitle, isDark && styles.textSecondaryDark]}>Use Face ID or fingerprint</Text>
                  </View>
                </View>
                <Toggle value={biometricsEnabled} onValueChange={setBiometricsEnabled} />
              </View>
              
              <View style={[styles.divider, isDark && styles.dividerDark, { marginVertical: spacing.md }]} />
              
              <View style={styles.securityItem}>
                <View style={styles.securityInfo}>
                  <Icon name="pin" size={28} color={colors.primary} />
                  <View style={styles.securityText}>
                    <Text style={[styles.securityTitle, isDark && styles.textDark]}>PIN Code</Text>
                    <Text style={[styles.securitySubtitle, isDark && styles.textSecondaryDark]}>6-digit PIN for transactions</Text>
                  </View>
                </View>
                <Toggle value={pinEnabled} onValueChange={setPinEnabled} />
              </View>
              
              <View style={[styles.divider, isDark && styles.dividerDark, { marginVertical: spacing.md }]} />
              
              <Pressable style={styles.securityAction}>
                <Icon name="lock-reset" size={28} color={colors.primary} />
                <View style={styles.securityText}>
                  <Text style={[styles.securityTitle, isDark && styles.textDark]}>Change PIN</Text>
                  <Text style={[styles.securitySubtitle, isDark && styles.textSecondaryDark]}>Update your security PIN</Text>
                </View>
                <Icon name="chevron-right" size={24} color={colors.textMuted} />
              </Pressable>
            </Card>

            <View style={styles.securityNote}>
              <Icon name="info" size={20} color={colors.primary} />
              <Text style={[styles.securityNoteText, isDark && styles.textSecondaryDark]}>
                Enable biometrics for faster and more secure access to your wallet.
              </Text>
            </View>
          </ScrollView>
        </SafeAreaView>
      </Modal>

      {/* Backup Wallet Modal */}
      <Modal
        visible={showBackupModal}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={() => setShowBackupModal(false)}
      >
        <SafeAreaView style={[styles.modalContainer, isDark && styles.containerDark]}>
          <View style={[styles.modalHeader, isDark && styles.modalHeaderDark]}>
            <Text style={[styles.modalTitle, isDark && styles.textDark]}>Backup Wallet</Text>
            <Pressable onPress={() => setShowBackupModal(false)} style={styles.closeButton}>
              <Icon name="close" size={24} color={isDark ? colors.dark.text : colors.textPrimary} />
            </Pressable>
          </View>
          
          <ScrollView style={styles.modalContent}>
            <View style={styles.warningBanner}>
              <Icon name="warning" size={24} color={colors.warning} />
              <Text style={styles.warningText}>
                Never share your recovery phrase with anyone. Store it in a safe place.
              </Text>
            </View>

            <Card style={[styles.phraseCard, cardStyle] as any}>
              <Text style={[styles.phraseTitle, isDark && styles.textDark]}>Recovery Phrase</Text>
              <Text style={[styles.phraseSubtitle, isDark && styles.textSecondaryDark]}>
                Write down these 12 words in order
              </Text>
              
              <View style={styles.phraseGrid}>
                {['abandon', 'ability', 'able', 'about', 'above', 'absent', 
                  'absorb', 'abstract', 'absurd', 'abuse', 'access', 'accident'].map((word, index) => (
                  <View key={index} style={[styles.phraseWord, isDark && styles.phraseWordDark]}>
                    <Text style={[styles.phraseNumber, isDark && styles.textSecondaryDark]}>{index + 1}</Text>
                    <Text style={[styles.phraseText, isDark && styles.textDark]}>{word}</Text>
                  </View>
                ))}
              </View>

              <Pressable style={styles.copyButton} onPress={handleCopyRecoveryPhrase}>
                <Icon name="content-copy" size={20} color={colors.white} />
                <Text style={styles.copyButtonText}>Copy to Clipboard</Text>
              </Pressable>
            </Card>

            <View style={styles.backupTips}>
              <Text style={[styles.tipsTitle, isDark && styles.textDark]}>Security Tips</Text>
              <View style={styles.tipItem}>
                <Icon name="check-circle" size={18} color={colors.success} />
                <Text style={[styles.tipText, isDark && styles.textSecondaryDark]}>Write it down on paper</Text>
              </View>
              <View style={styles.tipItem}>
                <Icon name="check-circle" size={18} color={colors.success} />
                <Text style={[styles.tipText, isDark && styles.textSecondaryDark]}>Store in a secure location</Text>
              </View>
              <View style={styles.tipItem}>
                <Icon name="check-circle" size={18} color={colors.success} />
                <Text style={[styles.tipText, isDark && styles.textSecondaryDark]}>Never share with anyone</Text>
              </View>
              <View style={styles.tipItem}>
                <Icon name="cancel" size={18} color={colors.error} />
                <Text style={[styles.tipText, isDark && styles.textSecondaryDark]}>Don't store digitally</Text>
              </View>
            </View>
          </ScrollView>
        </SafeAreaView>
      </Modal>

      {/* Help Center Modal */}
      <Modal
        visible={showHelpModal}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={() => setShowHelpModal(false)}
      >
        <SafeAreaView style={[styles.modalContainer, isDark && styles.containerDark]}>
          <View style={[styles.modalHeader, isDark && styles.modalHeaderDark]}>
            <Text style={[styles.modalTitle, isDark && styles.textDark]}>Help Center</Text>
            <Pressable onPress={() => setShowHelpModal(false)} style={styles.closeButton}>
              <Icon name="close" size={24} color={isDark ? colors.dark.text : colors.textPrimary} />
            </Pressable>
          </View>
          
          <ScrollView style={styles.modalContent}>
            <View style={styles.helpSection}>
              <Text style={[styles.helpSectionTitle, isDark && styles.textDark]}>Frequently Asked Questions</Text>
              
              <Card style={[styles.faqCard, cardStyle] as any}>
                <Pressable style={styles.faqItem}>
                  <Text style={[styles.faqQuestion, isDark && styles.textDark]}>What is ShadowLend?</Text>
                  <Icon name="expand-more" size={24} color={isDark ? colors.dark.textSecondary : colors.textSecondary} />
                </Pressable>
                <Text style={[styles.faqAnswer, isDark && styles.textSecondaryDark]}>
                  ShadowLend is a private lending protocol on Solana that uses Arcium's confidential computing to keep your financial data private while accessing DeFi services.
                </Text>
              </Card>

              <Card style={[styles.faqCard, cardStyle] as any}>
                <Pressable style={styles.faqItem}>
                  <Text style={[styles.faqQuestion, isDark && styles.textDark]}>How does privacy work?</Text>
                  <Icon name="expand-more" size={24} color={isDark ? colors.dark.textSecondary : colors.textSecondary} />
                </Pressable>
                <Text style={[styles.faqAnswer, isDark && styles.textSecondaryDark]}>
                  We use Arcium's MXE (Multi-party eXecution Environment) to process transactions privately. Your wallet balances and transaction history remain hidden from public view.
                </Text>
              </Card>

              <Card style={[styles.faqCard, cardStyle] as any}>
                <Pressable style={styles.faqItem}>
                  <Text style={[styles.faqQuestion, isDark && styles.textDark]}>What are the fees?</Text>
                  <Icon name="expand-more" size={24} color={isDark ? colors.dark.textSecondary : colors.textSecondary} />
                </Pressable>
                <Text style={[styles.faqAnswer, isDark && styles.textSecondaryDark]}>
                  ShadowLend charges a small protocol fee of 0.1% on transactions. Network fees (gas) are paid in SOL and vary based on network congestion.
                </Text>
              </Card>

              <Card style={[styles.faqCard, cardStyle] as any}>
                <Pressable style={styles.faqItem}>
                  <Text style={[styles.faqQuestion, isDark && styles.textDark]}>Is my collateral safe?</Text>
                  <Icon name="expand-more" size={24} color={isDark ? colors.dark.textSecondary : colors.textSecondary} />
                </Pressable>
                <Text style={[styles.faqAnswer, isDark && styles.textSecondaryDark]}>
                  Yes, your collateral is secured by smart contracts that have been audited. You maintain full custody of your assets until liquidation conditions are met.
                </Text>
              </Card>
            </View>

            <View style={styles.helpSection}>
              <Text style={[styles.helpSectionTitle, isDark && styles.textDark]}>Quick Guides</Text>
              
              <Card style={[styles.guideCard, cardStyle] as any}>
                <View style={[styles.guideIcon, isDark && styles.guideIconDark]}>
                  <Icon name="account-balance-wallet" size={24} color={colors.primary} />
                </View>
                <View style={styles.guideText}>
                  <Text style={[styles.guideTitle, isDark && styles.textDark]}>Getting Started</Text>
                  <Text style={[styles.guideDescription, isDark && styles.textSecondaryDark]}>Learn how to connect your wallet and make your first deposit</Text>
                </View>
                <Icon name="chevron-right" size={24} color={isDark ? colors.dark.textSecondary : colors.textMuted} />
              </Card>

              <Card style={[styles.guideCard, cardStyle] as any}>
                <View style={[styles.guideIcon, isDark && styles.guideIconDark]}>
                  <Icon name="shield" size={24} color={colors.primary} />
                </View>
                <View style={styles.guideText}>
                  <Text style={[styles.guideTitle, isDark && styles.textDark]}>Privacy Features</Text>
                  <Text style={[styles.guideDescription, isDark && styles.textSecondaryDark]}>Understand how your data is protected</Text>
                </View>
                <Icon name="chevron-right" size={24} color={isDark ? colors.dark.textSecondary : colors.textMuted} />
              </Card>

              <Card style={[styles.guideCard, cardStyle] as any}>
                <View style={[styles.guideIcon, isDark && styles.guideIconDark]}>
                  <Icon name="trending-up" size={24} color={colors.primary} />
                </View>
                <View style={styles.guideText}>
                  <Text style={[styles.guideTitle, isDark && styles.textDark]}>Earning Yield</Text>
                  <Text style={[styles.guideDescription, isDark && styles.textSecondaryDark]}>Maximize your returns with lending pools</Text>
                </View>
                <Icon name="chevron-right" size={24} color={isDark ? colors.dark.textSecondary : colors.textMuted} />
              </Card>
            </View>
          </ScrollView>
        </SafeAreaView>
      </Modal>

      {/* Contact Support Modal */}
      <Modal
        visible={showContactModal}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={() => setShowContactModal(false)}
      >
        <SafeAreaView style={[styles.modalContainer, isDark && styles.containerDark]}>
          <View style={[styles.modalHeader, isDark && styles.modalHeaderDark]}>
            <Text style={[styles.modalTitle, isDark && styles.textDark]}>Contact Support</Text>
            <Pressable onPress={() => setShowContactModal(false)} style={styles.closeButton}>
              <Icon name="close" size={24} color={isDark ? colors.dark.text : colors.textPrimary} />
            </Pressable>
          </View>
          
          <ScrollView style={styles.modalContent}>
            <View style={styles.contactHeader}>
              <View style={[styles.contactIconLarge, isDark && styles.contactIconLargeDark]}>
                <Icon name="support-agent" size={48} color={colors.primary} />
              </View>
              <Text style={[styles.contactTitle, isDark && styles.textDark]}>We're here to help!</Text>
              <Text style={[styles.contactSubtitle, isDark && styles.textSecondaryDark]}>
                Choose how you'd like to reach us
              </Text>
            </View>

            <View style={styles.contactOptions}>
              <Card style={[styles.contactCard, cardStyle] as any}>
                <Pressable style={styles.contactOption} onPress={() => Alert.alert('Email Support', 'Opening email client...')}>
                  <View style={[styles.contactOptionIcon, isDark && styles.contactOptionIconDark]}>
                    <Icon name="email" size={28} color={colors.primary} />
                  </View>
                  <View style={styles.contactOptionText}>
                    <Text style={[styles.contactOptionTitle, isDark && styles.textDark]}>Email Us</Text>
                    <Text style={[styles.contactOptionDescription, isDark && styles.textSecondaryDark]}>support@shadowlend.io</Text>
                  </View>
                  <Icon name="chevron-right" size={24} color={isDark ? colors.dark.textSecondary : colors.textMuted} />
                </Pressable>
              </Card>

              <Card style={[styles.contactCard, cardStyle] as any}>
                <Pressable style={styles.contactOption} onPress={() => Alert.alert('Discord', 'Opening Discord...')}>
                  <View style={[styles.contactOptionIcon, { backgroundColor: 'rgba(88, 101, 242, 0.1)' }]}>
                    <Icon name="forum" size={28} color="#5865F2" />
                  </View>
                  <View style={styles.contactOptionText}>
                    <Text style={[styles.contactOptionTitle, isDark && styles.textDark]}>Discord Community</Text>
                    <Text style={[styles.contactOptionDescription, isDark && styles.textSecondaryDark]}>Join our community for help</Text>
                  </View>
                  <Icon name="chevron-right" size={24} color={isDark ? colors.dark.textSecondary : colors.textMuted} />
                </Pressable>
              </Card>

              <Card style={[styles.contactCard, cardStyle] as any}>
                <Pressable style={styles.contactOption} onPress={() => Alert.alert('Twitter', 'Opening Twitter...')}>
                  <View style={[styles.contactOptionIcon, { backgroundColor: 'rgba(29, 161, 242, 0.1)' }]}>
                    <Icon name="alternate-email" size={28} color="#1DA1F2" />
                  </View>
                  <View style={styles.contactOptionText}>
                    <Text style={[styles.contactOptionTitle, isDark && styles.textDark]}>Twitter / X</Text>
                    <Text style={[styles.contactOptionDescription, isDark && styles.textSecondaryDark]}>@ShadowLend</Text>
                  </View>
                  <Icon name="chevron-right" size={24} color={isDark ? colors.dark.textSecondary : colors.textMuted} />
                </Pressable>
              </Card>
            </View>

            <View style={[styles.responseTime, isDark && styles.responseTimeDark]}>
              <Icon name="schedule" size={20} color={colors.primary} />
              <Text style={[styles.responseTimeText, isDark && styles.textSecondaryDark]}>
                Average response time: 2-4 hours
              </Text>
            </View>
          </ScrollView>
        </SafeAreaView>
      </Modal>

      {/* Network Selection Modal */}
      <Modal
        visible={showNetworkModal}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={() => setShowNetworkModal(false)}
      >
        <SafeAreaView style={[styles.modalContainer, isDark && styles.containerDark]}>
          <View style={[styles.modalHeader, isDark && styles.modalHeaderDark]}>
            <Text style={[styles.modalTitle, isDark && styles.textDark]}>Select Network</Text>
            <Pressable onPress={() => setShowNetworkModal(false)} style={styles.closeButton}>
              <Icon name="close" size={24} color={isDark ? colors.dark.text : colors.textPrimary} />
            </Pressable>
          </View>
          
          <ScrollView style={styles.modalContent}>
            <View style={styles.networkInfo}>
              <Icon name="info" size={20} color={colors.primary} />
              <Text style={[styles.networkInfoText, isDark && styles.textSecondaryDark]}>
                Choose the Solana network for your transactions. Devnet is recommended for testing.
              </Text>
            </View>

            <View style={styles.networkOptions}>
              <Pressable 
                style={[
                  styles.networkOption, 
                  isDark && styles.networkOptionDark,
                  selectedNetwork === 'mainnet' && styles.networkOptionSelected
                ]}
                onPress={() => {
                  setSelectedNetwork('mainnet')
                  setShowNetworkModal(false)
                }}
              >
                <View style={styles.networkOptionLeft}>
                  <View style={[styles.networkDot, { backgroundColor: colors.success }]} />
                  <View>
                    <Text style={[styles.networkName, isDark && styles.textDark]}>Mainnet</Text>
                    <Text style={[styles.networkDescription, isDark && styles.textSecondaryDark]}>Production network with real assets</Text>
                  </View>
                </View>
                {selectedNetwork === 'mainnet' && (
                  <Icon name="check-circle" size={24} color={colors.primary} />
                )}
              </Pressable>

              <Pressable 
                style={[
                  styles.networkOption, 
                  isDark && styles.networkOptionDark,
                  selectedNetwork === 'devnet' && styles.networkOptionSelected
                ]}
                onPress={() => {
                  setSelectedNetwork('devnet')
                  setShowNetworkModal(false)
                }}
              >
                <View style={styles.networkOptionLeft}>
                  <View style={[styles.networkDot, { backgroundColor: colors.warning }]} />
                  <View>
                    <Text style={[styles.networkName, isDark && styles.textDark]}>Devnet</Text>
                    <Text style={[styles.networkDescription, isDark && styles.textSecondaryDark]}>Development network for testing</Text>
                  </View>
                </View>
                {selectedNetwork === 'devnet' && (
                  <Icon name="check-circle" size={24} color={colors.primary} />
                )}
              </Pressable>

              <Pressable 
                style={[
                  styles.networkOption, 
                  isDark && styles.networkOptionDark,
                  selectedNetwork === 'testnet' && styles.networkOptionSelected
                ]}
                onPress={() => {
                  setSelectedNetwork('testnet')
                  setShowNetworkModal(false)
                }}
              >
                <View style={styles.networkOptionLeft}>
                  <View style={[styles.networkDot, { backgroundColor: colors.primary }]} />
                  <View>
                    <Text style={[styles.networkName, isDark && styles.textDark]}>Testnet</Text>
                    <Text style={[styles.networkDescription, isDark && styles.textSecondaryDark]}>Test network for validators</Text>
                  </View>
                </View>
                {selectedNetwork === 'testnet' && (
                  <Icon name="check-circle" size={24} color={colors.primary} />
                )}
              </Pressable>
            </View>

            {selectedNetwork === 'mainnet' && (
              <View style={styles.mainnetWarning}>
                <Icon name="warning" size={20} color={colors.warning} />
                <Text style={styles.mainnetWarningText}>
                  You are using Mainnet. Real assets will be used for transactions.
                </Text>
              </View>
            )}
          </ScrollView>
        </SafeAreaView>
      </Modal>
    </SafeAreaView>
  )
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.backgroundLight,
  },
  containerDark: {
    backgroundColor: colors.dark.background,
  },
  header: {
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
  },
  headerTitle: {
    color: colors.textPrimary,
    fontSize: fontSize.xxl,
    fontWeight: fontWeight.bold,
  },
  textDark: {
    color: colors.dark.text,
  },
  textSecondaryDark: {
    color: colors.dark.textSecondary,
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: spacing.md,
    paddingBottom: spacing.xxl,
  },
  walletCard: {
    marginBottom: spacing.lg,
  },
  cardDark: {
    backgroundColor: colors.dark.card,
    borderColor: colors.dark.border,
  },
  walletInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    marginBottom: spacing.md,
  },
  walletAvatar: {
    width: 56,
    height: 56,
    borderRadius: borderRadius.full,
    backgroundColor: colors.primaryLight,
    alignItems: 'center',
    justifyContent: 'center',
  },
  walletAvatarDark: {
    backgroundColor: 'rgba(19, 109, 236, 0.2)',
  },
  walletDetails: {
    flex: 1,
    gap: spacing.xs,
  },
  walletLabel: {
    color: colors.textSecondary,
    fontSize: fontSize.sm,
  },
  walletAddress: {
    color: colors.textPrimary,
    fontSize: fontSize.lg,
    fontWeight: fontWeight.semibold,
  },
  disconnectButton: {
    backgroundColor: colors.errorLight,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
    borderRadius: borderRadius.lg,
    alignSelf: 'flex-start',
  },
  disconnectText: {
    color: colors.error,
    fontSize: fontSize.sm,
    fontWeight: fontWeight.semibold,
  },
  section: {
    marginBottom: spacing.lg,
  },
  sectionTitle: {
    color: colors.textSecondary,
    fontSize: fontSize.sm,
    fontWeight: fontWeight.semibold,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: spacing.sm,
    paddingHorizontal: spacing.xs,
  },
  settingItem: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: spacing.md,
    gap: spacing.md,
  },
  settingItemDark: {
    backgroundColor: colors.dark.card,
  },
  settingIcon: {
    width: 40,
    height: 40,
    borderRadius: borderRadius.lg,
    backgroundColor: colors.primaryLight,
    alignItems: 'center',
    justifyContent: 'center',
  },
  settingIconDark: {
    backgroundColor: 'rgba(19, 109, 236, 0.2)',
  },
  settingContent: {
    flex: 1,
    gap: 2,
  },
  settingTitle: {
    color: colors.textPrimary,
    fontSize: fontSize.lg,
    fontWeight: fontWeight.medium,
  },
  settingSubtitle: {
    color: colors.textSecondary,
    fontSize: fontSize.sm,
  },
  divider: {
    height: 1,
    backgroundColor: colors.border,
    marginLeft: 68,
  },
  dividerDark: {
    backgroundColor: colors.dark.border,
  },
  footer: {
    alignItems: 'center',
    paddingVertical: spacing.xl,
    gap: spacing.xs,
  },
  version: {
    color: colors.textSecondary,
    fontSize: fontSize.sm,
    fontWeight: fontWeight.medium,
  },
  poweredBy: {
    color: '#00D4AA',
    fontSize: fontSize.xs,
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
  // Modal styles
  modalContainer: {
    flex: 1,
    backgroundColor: colors.backgroundLight,
  },
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  modalHeaderDark: {
    borderBottomColor: 'transparent',
    borderBottomWidth: 0,
  },
  modalTitle: {
    color: colors.textPrimary,
    fontSize: fontSize.xl,
    fontWeight: fontWeight.bold,
  },
  closeButton: {
    padding: spacing.sm,
  },
  modalContent: {
    flex: 1,
    padding: spacing.md,
  },
  securityCard: {
    gap: spacing.sm,
  },
  securityItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  securityInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    flex: 1,
  },
  securityText: {
    flex: 1,
    gap: 2,
  },
  securityTitle: {
    color: colors.textPrimary,
    fontSize: fontSize.md,
    fontWeight: fontWeight.semibold,
  },
  securitySubtitle: {
    color: colors.textSecondary,
    fontSize: fontSize.sm,
  },
  securityAction: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
  },
  securityNote: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.sm,
    padding: spacing.md,
    backgroundColor: colors.primaryLight,
    borderRadius: borderRadius.lg,
    marginTop: spacing.md,
  },
  securityNoteText: {
    flex: 1,
    color: colors.textSecondary,
    fontSize: fontSize.sm,
    lineHeight: 20,
  },
  warningBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    padding: spacing.md,
    backgroundColor: colors.warningLight,
    borderRadius: borderRadius.lg,
    marginBottom: spacing.md,
  },
  warningText: {
    flex: 1,
    color: colors.warning,
    fontSize: fontSize.sm,
    fontWeight: fontWeight.medium,
  },
  phraseCard: {
    gap: spacing.md,
  },
  phraseTitle: {
    color: colors.textPrimary,
    fontSize: fontSize.lg,
    fontWeight: fontWeight.bold,
  },
  phraseSubtitle: {
    color: colors.textSecondary,
    fontSize: fontSize.sm,
  },
  phraseGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
    marginTop: spacing.sm,
  },
  phraseWord: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    backgroundColor: colors.backgroundLight,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
    borderRadius: borderRadius.lg,
    width: '48%',
  },
  phraseWordDark: {
    backgroundColor: colors.dark.background,
  },
  phraseNumber: {
    color: colors.textMuted,
    fontSize: fontSize.xs,
    fontWeight: fontWeight.bold,
    width: 20,
  },
  phraseText: {
    color: colors.textPrimary,
    fontSize: fontSize.sm,
    fontWeight: fontWeight.medium,
  },
  copyButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    backgroundColor: colors.primary,
    paddingVertical: spacing.md,
    borderRadius: borderRadius.lg,
    marginTop: spacing.md,
  },
  copyButtonText: {
    color: colors.white,
    fontSize: fontSize.md,
    fontWeight: fontWeight.semibold,
  },
  backupTips: {
    marginTop: spacing.lg,
    gap: spacing.sm,
  },
  tipsTitle: {
    color: colors.textPrimary,
    fontSize: fontSize.md,
    fontWeight: fontWeight.semibold,
    marginBottom: spacing.xs,
  },
  tipItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  tipText: {
    color: colors.textSecondary,
    fontSize: fontSize.sm,
  },
  // Help Center styles
  helpSection: {
    marginBottom: spacing.lg,
  },
  helpSectionTitle: {
    color: colors.textPrimary,
    fontSize: fontSize.lg,
    fontWeight: fontWeight.bold,
    marginBottom: spacing.md,
  },
  faqCard: {
    marginBottom: spacing.sm,
  },
  faqItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  faqQuestion: {
    color: colors.textPrimary,
    fontSize: fontSize.md,
    fontWeight: fontWeight.semibold,
    flex: 1,
  },
  faqAnswer: {
    color: colors.textSecondary,
    fontSize: fontSize.sm,
    lineHeight: 20,
    marginTop: spacing.sm,
  },
  guideCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    marginBottom: spacing.sm,
  },
  guideIcon: {
    width: 48,
    height: 48,
    borderRadius: borderRadius.lg,
    backgroundColor: colors.primaryLight,
    alignItems: 'center',
    justifyContent: 'center',
  },
  guideIconDark: {
    backgroundColor: 'rgba(19, 109, 236, 0.2)',
  },
  guideText: {
    flex: 1,
    gap: 2,
  },
  guideTitle: {
    color: colors.textPrimary,
    fontSize: fontSize.md,
    fontWeight: fontWeight.semibold,
  },
  guideDescription: {
    color: colors.textSecondary,
    fontSize: fontSize.sm,
  },
  // Contact Support styles
  contactHeader: {
    alignItems: 'center',
    paddingVertical: spacing.xl,
  },
  contactIconLarge: {
    width: 96,
    height: 96,
    borderRadius: borderRadius.full,
    backgroundColor: colors.primaryLight,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.md,
  },
  contactIconLargeDark: {
    backgroundColor: 'rgba(19, 109, 236, 0.2)',
  },
  contactTitle: {
    color: colors.textPrimary,
    fontSize: fontSize.xxl,
    fontWeight: fontWeight.bold,
    marginBottom: spacing.xs,
  },
  contactSubtitle: {
    color: colors.textSecondary,
    fontSize: fontSize.md,
  },
  contactOptions: {
    gap: spacing.sm,
  },
  contactCard: {
    marginBottom: 0,
  },
  contactOption: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
  },
  contactOptionIcon: {
    width: 56,
    height: 56,
    borderRadius: borderRadius.lg,
    backgroundColor: colors.primaryLight,
    alignItems: 'center',
    justifyContent: 'center',
  },
  contactOptionIconDark: {
    backgroundColor: 'rgba(19, 109, 236, 0.2)',
  },
  contactOptionText: {
    flex: 1,
    gap: 2,
  },
  contactOptionTitle: {
    color: colors.textPrimary,
    fontSize: fontSize.lg,
    fontWeight: fontWeight.semibold,
  },
  contactOptionDescription: {
    color: colors.textSecondary,
    fontSize: fontSize.sm,
  },
  responseTime: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    marginTop: spacing.xl,
    padding: spacing.md,
    backgroundColor: colors.primaryLight,
    borderRadius: borderRadius.lg,
  },
  responseTimeDark: {
    backgroundColor: 'rgba(19, 109, 236, 0.15)',
  },
  responseTimeText: {
    color: colors.textSecondary,
    fontSize: fontSize.sm,
    fontWeight: fontWeight.medium,
  },
  // Network Modal styles
  networkInfo: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.sm,
    padding: spacing.md,
    backgroundColor: colors.primaryLight,
    borderRadius: borderRadius.lg,
    marginBottom: spacing.lg,
  },
  networkInfoText: {
    flex: 1,
    color: colors.textSecondary,
    fontSize: fontSize.sm,
    lineHeight: 20,
  },
  networkOptions: {
    gap: spacing.sm,
  },
  networkOption: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: spacing.lg,
    backgroundColor: colors.white,
    borderRadius: borderRadius.xl,
    borderWidth: 2,
    borderColor: 'transparent',
  },
  networkOptionDark: {
    backgroundColor: colors.dark.card,
  },
  networkOptionSelected: {
    borderColor: colors.primary,
    backgroundColor: 'rgba(19, 109, 236, 0.05)',
  },
  networkOptionLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
  },
  networkDot: {
    width: 12,
    height: 12,
    borderRadius: borderRadius.full,
  },
  networkName: {
    color: colors.textPrimary,
    fontSize: fontSize.lg,
    fontWeight: fontWeight.semibold,
  },
  networkDescription: {
    color: colors.textSecondary,
    fontSize: fontSize.sm,
    marginTop: 2,
  },
  mainnetWarning: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    padding: spacing.md,
    backgroundColor: colors.warningLight,
    borderRadius: borderRadius.lg,
    marginTop: spacing.lg,
  },
  mainnetWarningText: {
    flex: 1,
    color: colors.warning,
    fontSize: fontSize.sm,
    fontWeight: fontWeight.medium,
  },
})
