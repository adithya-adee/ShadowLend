import { View, Text, StyleSheet, TextInput, Pressable, ScrollView, KeyboardAvoidingView, Platform } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { colors, spacing, fontSize, fontWeight, borderRadius } from '@/constants/theme'
import { Button, Icon, Toggle } from '@/components/ui'
import { useState } from 'react'
import { useRouter } from 'expo-router'
import { useTheme } from '@/features/theme'
import { useWallet } from '@/features/account/use-wallet'

const QUICK_PERCENTAGES = ['25%', '50%', '75%', 'Max']

export function GrowScreen() {
  const router = useRouter()
  const { isDark, toggleTheme } = useTheme()
  const { disconnect } = useWallet()
  const [amount, setAmount] = useState('')
  const [privacyEnabled, setPrivacyEnabled] = useState(true)
  const availableBalance = 1240.5

  const handleQuickSelect = (percentage: string) => {
    if (percentage === 'Max') {
      setAmount(availableBalance.toString())
    } else {
      const pct = parseInt(percentage) / 100
      setAmount((availableBalance * pct).toFixed(2))
    }
  }

  const handleDisconnect = async () => {
    await disconnect()
    router.replace('/(tabs)' as any)
  }

  return (
    <SafeAreaView style={[styles.container, isDark && styles.containerDark]} edges={['top']}>
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} style={styles.closeButton}>
          <Icon name="close" size={24} color={isDark ? colors.dark.text : colors.textPrimary} />
        </Pressable>
        <View style={styles.headerCenter}>
          <Text style={[styles.headerTitle, isDark && styles.textDark]}>Grow Assets</Text>
          <Text style={styles.headerStep}>Step 1 of 3</Text>
        </View>
        <View style={styles.headerRight}>
          <Pressable style={[styles.iconButton, isDark && styles.iconButtonDark]} onPress={toggleTheme}>
            <Icon name={isDark ? 'light-mode' : 'dark-mode'} size={20} color={isDark ? colors.dark.text : colors.textPrimary} />
          </Pressable>
          <Pressable style={[styles.iconButton, isDark && styles.iconButtonDark]} onPress={handleDisconnect}>
            <Icon name="logout" size={20} color={colors.error} />
          </Pressable>
        </View>
      </View>

      <View style={styles.progressContainer}>
        <View style={[styles.progressDot, styles.progressActive]} />
        <View style={[styles.progressDot, isDark && styles.progressDotDark]} />
        <View style={[styles.progressDot, isDark && styles.progressDotDark]} />
      </View>

      <KeyboardAvoidingView 
        style={styles.keyboardView} 
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      >
        <ScrollView 
          style={styles.scrollView}
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
        >
          <View style={styles.titleSection}>
            <Text style={[styles.title, isDark && styles.textDark]}>How much would you like to grow?</Text>
            <Text style={[styles.subtitle, isDark && styles.textSecondaryDark]}>Select amount to deposit into the vault.</Text>
          </View>

          <Pressable style={[styles.assetSelector, isDark && styles.assetSelectorDark]}>
            <View style={styles.assetIcon}>
              <Text style={styles.assetIconText}>USDC</Text>
            </View>
            <Text style={[styles.assetName, isDark && styles.textDark]}>USDC</Text>
            <Icon name="expand-more" size={20} color={isDark ? colors.dark.text : colors.textPrimary} />
          </Pressable>

          <View style={styles.inputSection}>
            <View style={styles.inputRow}>
              <Text style={[styles.currencySymbol, isDark && styles.textDark]}>$</Text>
              <TextInput
                style={[styles.amountInput, isDark && styles.textDark]}
                value={amount}
                onChangeText={setAmount}
                placeholder="0"
                placeholderTextColor={isDark ? colors.dark.textSecondary : colors.textMuted}
                keyboardType="decimal-pad"
              />
            </View>
            <View style={[styles.availableBadge, isDark && styles.availableBadgeDark]}>
              <Text style={styles.availableText}>
                Available: {availableBalance.toLocaleString()} USDC
              </Text>
            </View>
          </View>

          <View style={styles.quickSelectRow}>
            {QUICK_PERCENTAGES.map((pct) => (
              <Pressable
                key={pct}
                style={[styles.quickSelectButton, isDark && styles.quickSelectButtonDark]}
                onPress={() => handleQuickSelect(pct)}
              >
                <Text style={[styles.quickSelectText, isDark && styles.textDark]}>{pct}</Text>
              </Pressable>
            ))}
          </View>

          <View style={[styles.privacyCard, isDark && styles.privacyCardDark]}>
            <View style={styles.privacyHeader}>
              <View style={[styles.privacyIconContainer, isDark && styles.privacyIconContainerDark]}>
                <Icon name="shield" size={24} color={colors.primary} />
              </View>
              <View style={styles.privacyTextContainer}>
                <Text style={[styles.privacyTitle, isDark && styles.textDark]}>Privacy Shield</Text>
                <Text style={[styles.privacySubtitle, isDark && styles.textSecondaryDark]}>Powered by Arcium MXE</Text>
              </View>
              <Toggle value={privacyEnabled} onValueChange={setPrivacyEnabled} />
            </View>
            <View style={[styles.privacyDivider, isDark && styles.dividerDark]} />
            <Text style={[styles.privacyDescription, isDark && styles.textSecondaryDark]}>
              Your transaction is automatically shielded for privacy. Your wallet history remains hidden from public view.
            </Text>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>

      <View style={[styles.footer, isDark && styles.footerDark]}>
        <Button
          title="Continue"
          icon="arrow-forward"
          size="lg"
          fullWidth
          onPress={() => router.push({ pathname: '/grow-confirm', params: { amount: amount || '0', asset: 'USDC' } } as any)}
        />
      </View>
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
  textDark: {
    color: colors.dark.text,
  },
  textSecondaryDark: {
    color: colors.dark.textSecondary,
  },
  dividerDark: {
    backgroundColor: colors.dark.border,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  closeButton: {
    width: 48,
    height: 48,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerCenter: {
    alignItems: 'center',
  },
  headerTitle: {
    color: colors.textPrimary,
    fontSize: fontSize.sm,
    fontWeight: fontWeight.bold,
  },
  headerStep: {
    color: colors.primary,
    fontSize: fontSize.xs,
    fontWeight: fontWeight.medium,
  },
  helpButton: {
    width: 48,
    height: 48,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
  },
  iconButton: {
    width: 36,
    height: 36,
    borderRadius: borderRadius.full,
    backgroundColor: colors.white,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: colors.border,
  },
  iconButtonDark: {
    backgroundColor: colors.dark.card,
    borderColor: colors.dark.border,
  },
  progressContainer: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: spacing.sm,
    paddingVertical: spacing.md,
  },
  progressDot: {
    width: 48,
    height: 6,
    borderRadius: borderRadius.full,
    backgroundColor: colors.textMuted,
  },
  progressDotDark: {
    backgroundColor: colors.dark.border,
  },
  progressActive: {
    backgroundColor: colors.primary,
  },
  content: {
    flex: 1,
    paddingHorizontal: spacing.lg,
  },
  titleSection: {
    alignItems: 'center',
    paddingTop: spacing.xl,
    paddingBottom: spacing.md,
  },
  title: {
    color: colors.textPrimary,
    fontSize: fontSize.xxxl,
    fontWeight: fontWeight.bold,
    textAlign: 'center',
  },
  subtitle: {
    color: colors.textSecondary,
    fontSize: fontSize.sm,
    marginTop: spacing.sm,
  },
  assetSelector: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'center',
    gap: spacing.sm,
    backgroundColor: colors.white,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: borderRadius.full,
    borderWidth: 1,
    borderColor: colors.border,
    marginTop: spacing.lg,
  },
  assetSelectorDark: {
    backgroundColor: colors.dark.card,
    borderColor: colors.dark.border,
  },
  assetIcon: {
    width: 24,
    height: 24,
    borderRadius: borderRadius.full,
    backgroundColor: '#2775ca',
    alignItems: 'center',
    justifyContent: 'center',
  },
  assetIconText: {
    color: colors.white,
    fontSize: 6,
    fontWeight: fontWeight.bold,
  },
  assetName: {
    color: colors.textPrimary,
    fontSize: fontSize.sm,
    fontWeight: fontWeight.semibold,
  },
  inputSection: {
    alignItems: 'center',
    marginTop: spacing.xl,
  },
  inputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
  },
  currencySymbol: {
    color: colors.textPrimary,
    fontSize: fontSize.display,
    fontWeight: fontWeight.bold,
  },
  amountInput: {
    color: colors.textPrimary,
    fontSize: 48,
    fontWeight: fontWeight.bold,
    textAlign: 'center',
    minWidth: 100,
    borderWidth: 0,
    outlineWidth: 0,
    outlineStyle: 'none',
    backgroundColor: 'transparent',
  } as any,
  availableBadge: {
    backgroundColor: colors.primaryLight,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
    borderRadius: borderRadius.full,
    marginTop: spacing.sm,
  },
  availableBadgeDark: {
    backgroundColor: 'rgba(19, 109, 236, 0.2)',
  },
  availableText: {
    color: colors.primary,
    fontSize: fontSize.xs,
    fontWeight: fontWeight.semibold,
  },
  quickSelectRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: spacing.md,
    marginTop: spacing.xl,
  },
  quickSelectButton: {
    backgroundColor: colors.white,
    borderWidth: 1,
    borderColor: colors.border,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
    borderRadius: borderRadius.xl,
  },
  quickSelectButtonDark: {
    backgroundColor: colors.dark.card,
    borderColor: colors.dark.border,
  },
  quickSelectText: {
    color: colors.textPrimary,
    fontSize: fontSize.sm,
    fontWeight: fontWeight.medium,
  },
  privacyCard: {
    backgroundColor: colors.white,
    borderRadius: borderRadius.xxl,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.lg,
    marginTop: 'auto',
    marginBottom: spacing.lg,
    gap: spacing.md,
  },
  privacyCardDark: {
    backgroundColor: colors.dark.card,
    borderColor: colors.dark.border,
  },
  privacyHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
  },
  privacyIconContainer: {
    width: 40,
    height: 40,
    backgroundColor: colors.primaryLight,
    borderRadius: borderRadius.full,
    alignItems: 'center',
    justifyContent: 'center',
  },
  privacyIconContainerDark: {
    backgroundColor: 'rgba(19, 109, 236, 0.2)',
  },
  privacyTextContainer: {
    flex: 1,
  },
  privacyTitle: {
    color: colors.textPrimary,
    fontSize: fontSize.lg,
    fontWeight: fontWeight.bold,
  },
  privacySubtitle: {
    color: colors.textSecondary,
    fontSize: fontSize.xs,
  },
  privacyDivider: {
    height: 1,
    backgroundColor: colors.border,
  },
  privacyDescription: {
    color: colors.textSecondary,
    fontSize: fontSize.xs,
    fontStyle: 'italic',
    lineHeight: 18,
  },
  keyboardView: {
    flex: 1,
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.lg,
  },
  footer: {
    padding: spacing.lg,
    paddingBottom: spacing.xl,
    backgroundColor: colors.white,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  footerDark: {
    backgroundColor: colors.dark.card,
    borderTopColor: colors.dark.border,
  },
  ctaContainer: {
    paddingBottom: spacing.xl,
  },
})
