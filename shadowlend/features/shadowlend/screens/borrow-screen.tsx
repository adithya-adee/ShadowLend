import { View, Text, StyleSheet, ScrollView, Pressable, Animated, Easing, PanResponder } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { colors, spacing, fontSize, fontWeight, borderRadius } from '@/constants/theme'
import { Button, Icon, ShadowLendLogo } from '@/components/ui'
import { useState, useRef, useEffect } from 'react'
import { useTheme } from '@/features/theme'

export function BorrowScreen() {
  const { isDark, toggleTheme } = useTheme()
  const [borrowAmount, setBorrowAmount] = useState(5000)
  const maxBorrow = 12400
  const percentage = (borrowAmount / maxBorrow) * 100
  const sliderWidth = useRef(0)

  // Animations
  const fadeAnim = useRef(new Animated.Value(0)).current
  const slideAnim = useRef(new Animated.Value(20)).current
  const cardAnim = useRef(new Animated.Value(0)).current

  // Pan responder for slider
  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: () => true,
      onPanResponderGrant: () => {},
      onPanResponderMove: (_, gestureState) => {
        if (sliderWidth.current > 0) {
          const newPercentage = Math.max(0, Math.min(100, (gestureState.moveX - 40) / sliderWidth.current * 100))
          const newAmount = Math.round((newPercentage / 100) * maxBorrow)
          setBorrowAmount(newAmount)
        }
      },
      onPanResponderRelease: () => {},
    })
  ).current

  useEffect(() => {
    Animated.sequence([
      Animated.parallel([
        Animated.timing(fadeAnim, {
          toValue: 1,
          duration: 600,
          easing: Easing.out(Easing.cubic),
          useNativeDriver: true,
        }),
        Animated.timing(slideAnim, {
          toValue: 0,
          duration: 600,
          easing: Easing.out(Easing.cubic),
          useNativeDriver: true,
        }),
      ]),
      Animated.spring(cardAnim, {
        toValue: 1,
        friction: 8,
        useNativeDriver: true,
      }),
    ]).start()
  }, [])

  const getSafetyColor = () => {
    if (percentage < 50) return colors.success
    if (percentage < 75) return colors.warning
    return colors.error
  }

  const getSafetyLevel = () => {
    if (percentage < 50) return 'High'
    if (percentage < 75) return 'Medium'
    return 'Low'
  }

  const handleSliderPress = (event: any) => {
    const { locationX } = event.nativeEvent
    if (sliderWidth.current > 0) {
      const newPercentage = Math.max(0, Math.min(100, (locationX / sliderWidth.current) * 100))
      const newAmount = Math.round((newPercentage / 100) * maxBorrow)
      setBorrowAmount(newAmount)
    }
  }

  return (
    <SafeAreaView style={[styles.container, isDark && styles.containerDark]} edges={['top']}>
      <View style={[styles.header, isDark && styles.headerDark]}>
        <View style={styles.logoContainer}>
          <ShadowLendLogo size={24} color={colors.primary} />
        </View>
        <Text style={[styles.headerTitle, isDark && styles.textDark]}>ShadowLend</Text>
        <View style={styles.headerRight}>
          <Pressable style={[styles.themeButton, isDark && styles.themeButtonDark]} onPress={toggleTheme}>
            <Icon name={isDark ? 'light-mode' : 'dark-mode'} size={18} color={isDark ? colors.dark.text : colors.textPrimary} />
          </Pressable>
          <Pressable style={styles.helpButton}>
            <Icon name="help-outline" size={22} color={isDark ? colors.dark.textSecondary : colors.textSecondary} />
          </Pressable>
        </View>
      </View>

      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        <Animated.View 
          style={[
            styles.heroSection,
            {
              opacity: fadeAnim,
              transform: [{ translateY: slideAnim }],
            },
          ]}
        >
          <Text style={[styles.heroTitle, isDark && styles.textDark]}>Access liquidity safely.</Text>
          <Text style={[styles.heroSubtitle, isDark && styles.textSecondaryDark]}>
            Choose how much you'd like to borrow. We'll handle the privacy and security.
          </Text>
        </Animated.View>

        <Animated.View 
          style={[
            styles.card,
            isDark && styles.cardDark,
            {
              opacity: cardAnim,
              transform: [
                { scale: cardAnim.interpolate({ inputRange: [0, 1], outputRange: [0.95, 1] }) },
              ],
            },
          ]}
        >
          <View style={styles.cardBody}>
            <View style={styles.amountHeader}>
              <Text style={[styles.amountLabel, isDark && styles.textDark]}>Amount to Borrow</Text>
              <View style={[styles.safetyBadge, { backgroundColor: `${getSafetyColor()}15` }]}>
                <Icon name="verified-user" size={14} color={getSafetyColor()} />
                <Text style={[styles.safetyText, { color: getSafetyColor() }]}>
                  Safety: {getSafetyLevel()}
                </Text>
              </View>
            </View>

            <View style={styles.amountDisplay}>
              <Text style={styles.amountValue}>${borrowAmount.toLocaleString()}</Text>
              <Text style={[styles.amountMax, isDark && styles.textSecondaryDark]}>of ${maxBorrow.toLocaleString()}</Text>
            </View>

            <View style={styles.sliderContainer}>
              <Pressable
                onPress={handleSliderPress}
                onLayout={(e) => { sliderWidth.current = e.nativeEvent.layout.width }}
                style={[styles.sliderTrack, isDark && styles.sliderTrackDark]}
              >
                <View style={[styles.sliderFill, { width: `${percentage}%` }]} />
                <View 
                  {...panResponder.panHandlers}
                  style={[styles.sliderHandle, { left: `${percentage}%` }]}
                >
                  <View style={styles.sliderHandleInner} />
                </View>
              </Pressable>
              <View style={styles.sliderLabels}>
                <Text style={[styles.sliderLabel, isDark && styles.textSecondaryDark]}>$0</Text>
                <Text style={[styles.sliderLabel, isDark && styles.textSecondaryDark]}>${maxBorrow.toLocaleString()}</Text>
              </View>
            </View>

            {/* Quick amount buttons */}
            <View style={styles.quickAmounts}>
              {[25, 50, 75, 100].map((pct) => (
                <Pressable
                  key={pct}
                  style={[
                    styles.quickAmountBtn,
                    isDark && styles.quickAmountBtnDark,
                    Math.round(percentage) === pct && styles.quickAmountBtnActive
                  ]}
                  onPress={() => setBorrowAmount(Math.round((pct / 100) * maxBorrow))}
                >
                  <Text style={[
                    styles.quickAmountText,
                    isDark && styles.textSecondaryDark,
                    Math.round(percentage) === pct && styles.quickAmountTextActive
                  ]}>
                    {pct}%
                  </Text>
                </Pressable>
              ))}
            </View>

            <View style={[styles.divider, isDark && styles.dividerDark]} />

            <View style={styles.summaryGrid}>
              <View style={styles.summaryItem}>
                <Text style={[styles.summaryLabel, isDark && styles.textSecondaryDark]}>You Receive</Text>
                <Text style={[styles.summaryValue, isDark && styles.textDark]}>${borrowAmount.toLocaleString()}.00</Text>
              </View>
              <View style={[styles.summaryDivider, isDark && styles.dividerDark]} />
              <View style={styles.summaryItem}>
                <Text style={[styles.summaryLabel, isDark && styles.textSecondaryDark]}>Interest Rate</Text>
                <Text style={[styles.summaryValue, styles.summaryValueGreen]}>2.4% APR</Text>
              </View>
            </View>
          </View>
        </Animated.View>

        <View style={[styles.shieldedInfo, isDark && styles.shieldedInfoDark]}>
          <View style={[styles.shieldedIcon, isDark && styles.shieldedIconDark]}>
            <Icon name="visibility-off" size={20} color={colors.primary} />
          </View>
          <View style={styles.shieldedText}>
            <Text style={[styles.shieldedTitle, isDark && styles.textDark]}>Shielded Transaction</Text>
            <Text style={[styles.shieldedDescription, isDark && styles.textSecondaryDark]}>
              Your wallet history is hidden. Only you can see the source of these funds.
            </Text>
          </View>
        </View>
      </ScrollView>

      <View style={[styles.footer, isDark && styles.footerDark]}>
        <Button
          title="Borrow Safely"
          icon="lock"
          iconPosition="left"
          size="lg"
          fullWidth
        />
        <Text style={styles.footerText}>Powered by ShadowLend Privacy Layer</Text>
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
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(0, 0, 0, 0.04)',
  },
  headerDark: {
    borderBottomColor: colors.dark.border,
  },
  headerRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
  },
  themeButton: {
    width: 36,
    height: 36,
    borderRadius: borderRadius.full,
    backgroundColor: colors.white,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: colors.border,
  },
  themeButtonDark: {
    backgroundColor: colors.dark.card,
    borderColor: colors.dark.border,
  },
  textDark: {
    color: colors.dark.text,
  },
  textSecondaryDark: {
    color: colors.dark.textSecondary,
  },
  logoContainer: {
    width: 44,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitle: {
    color: colors.textPrimary,
    fontSize: fontSize.lg,
    fontWeight: fontWeight.bold,
    letterSpacing: -0.3,
  },
  helpButton: {
    width: 44,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: borderRadius.full,
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    paddingBottom: spacing.lg,
  },
  heroSection: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.xl,
    paddingBottom: spacing.lg,
  },
  heroTitle: {
    color: colors.textPrimary,
    fontSize: 28,
    fontWeight: fontWeight.bold,
    marginBottom: spacing.sm,
    letterSpacing: -0.5,
  },
  heroSubtitle: {
    color: colors.textSecondary,
    fontSize: fontSize.md,
    lineHeight: 22,
  },
  card: {
    marginHorizontal: spacing.md,
    backgroundColor: colors.white,
    borderRadius: borderRadius.xxl,
    borderWidth: 1,
    borderColor: 'rgba(0, 0, 0, 0.04)',
    shadowColor: colors.black,
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.06,
    shadowRadius: 24,
    elevation: 4,
  },
  cardDark: {
    backgroundColor: colors.dark.card,
    borderColor: colors.dark.border,
  },
  cardBody: {
    padding: spacing.lg,
    gap: spacing.lg,
  },
  amountHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  amountLabel: {
    color: colors.textPrimary,
    fontSize: fontSize.lg,
    fontWeight: fontWeight.semibold,
  },
  safetyBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: spacing.sm,
    paddingVertical: 4,
    borderRadius: borderRadius.full,
  },
  safetyText: {
    fontSize: fontSize.xs,
    fontWeight: fontWeight.bold,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  amountDisplay: {
    alignItems: 'center',
    paddingVertical: spacing.md,
  },
  amountValue: {
    color: colors.primary,
    fontSize: 48,
    fontWeight: fontWeight.bold,
    letterSpacing: -1,
  },
  amountMax: {
    color: colors.textMuted,
    fontSize: fontSize.sm,
    marginTop: 4,
  },
  sliderContainer: {
    gap: spacing.sm,
  },
  sliderTrack: {
    height: 8,
    backgroundColor: colors.backgroundLight,
    borderRadius: borderRadius.full,
    position: 'relative',
  },
  sliderTrackDark: {
    backgroundColor: colors.dark.background,
  },
  sliderFill: {
    height: '100%',
    backgroundColor: colors.primary,
    borderRadius: borderRadius.full,
  },
  sliderHandle: {
    position: 'absolute',
    top: -10,
    marginLeft: -14,
    width: 28,
    height: 28,
    backgroundColor: colors.white,
    borderRadius: borderRadius.full,
    borderWidth: 3,
    borderColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: colors.primary,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 4,
    elevation: 4,
  },
  sliderHandleInner: {
    width: 8,
    height: 8,
    backgroundColor: colors.primary,
    borderRadius: borderRadius.full,
  },
  sliderLabels: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  sliderLabel: {
    color: colors.textMuted,
    fontSize: fontSize.xs,
    fontWeight: fontWeight.medium,
  },
  quickAmounts: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  quickAmountBtn: {
    flex: 1,
    paddingVertical: spacing.sm,
    borderRadius: borderRadius.lg,
    backgroundColor: colors.backgroundLight,
    alignItems: 'center',
  },
  quickAmountBtnDark: {
    backgroundColor: colors.dark.background,
  },
  quickAmountBtnActive: {
    backgroundColor: colors.primary,
  },
  quickAmountText: {
    color: colors.textSecondary,
    fontSize: fontSize.sm,
    fontWeight: fontWeight.semibold,
  },
  quickAmountTextActive: {
    color: colors.white,
  },
  divider: {
    height: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.06)',
  },
  dividerDark: {
    backgroundColor: colors.dark.border,
  },
  summaryGrid: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  summaryItem: {
    flex: 1,
    gap: 4,
  },
  summaryDivider: {
    width: 1,
    height: 40,
    backgroundColor: 'rgba(0, 0, 0, 0.06)',
    marginHorizontal: spacing.md,
  },
  summaryLabel: {
    color: colors.textSecondary,
    fontSize: fontSize.xs,
    fontWeight: fontWeight.medium,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  summaryValue: {
    color: colors.textPrimary,
    fontSize: fontSize.xl,
    fontWeight: fontWeight.bold,
  },
  summaryValueGreen: {
    color: colors.success,
  },
  shieldedInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    marginHorizontal: spacing.md,
    marginTop: spacing.lg,
    padding: spacing.md,
    backgroundColor: 'rgba(19, 109, 236, 0.04)',
    borderRadius: borderRadius.xl,
  },
  shieldedInfoDark: {
    backgroundColor: 'rgba(19, 109, 236, 0.1)',
  },
  shieldedIcon: {
    width: 40,
    height: 40,
    backgroundColor: colors.primaryLight,
    borderRadius: borderRadius.full,
    alignItems: 'center',
    justifyContent: 'center',
  },
  shieldedIconDark: {
    backgroundColor: 'rgba(19, 109, 236, 0.2)',
  },
  shieldedText: {
    flex: 1,
    gap: 2,
  },
  shieldedTitle: {
    color: colors.textPrimary,
    fontSize: fontSize.sm,
    fontWeight: fontWeight.semibold,
  },
  shieldedDescription: {
    color: colors.textSecondary,
    fontSize: fontSize.xs,
    lineHeight: 16,
  },
  footer: {
    padding: spacing.lg,
    paddingBottom: spacing.xl,
    backgroundColor: colors.white,
    borderTopWidth: 1,
    borderTopColor: 'rgba(0, 0, 0, 0.04)',
  },
  footerDark: {
    backgroundColor: colors.dark.card,
    borderTopColor: colors.dark.border,
  },
  footerText: {
    color: '#00D4AA',
    fontSize: fontSize.xs,
    textAlign: 'center',
    marginTop: spacing.md,
    textTransform: 'uppercase',
    letterSpacing: 1.5,
  },
})
