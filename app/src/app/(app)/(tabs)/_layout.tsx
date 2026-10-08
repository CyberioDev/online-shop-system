import { usePathname } from 'expo-router';
import { TabList, TabSlot, TabTrigger, Tabs, type TabTriggerSlotProps } from 'expo-router/ui';
import type { ReactNode } from 'react';
import { Pressable, View, type ViewProps } from 'react-native';
import { SafeAreaInsetsContext, useSafeAreaInsets } from 'react-native-safe-area-context';

import { api } from '@/api';
import { useUser } from '@/auth/auth-context';
import { BrandMark } from '@/components/brand-mark';
import { Icon, type IconName } from '@/components/ui/icon';
import { Text } from '@/components/ui/text';
import { Fonts, Radius, Spacing } from '@/constants/theme';
import { makeStyles, useColors } from '@/theme';
import { useIsWide } from '@/hooks/use-is-wide';
import { useResource } from '@/hooks/use-resource';

/**
 * Main navigation: a tab bar along the top on phones and a left sidebar on wide screens.
 * Both come from the same `TabList`, which only changes position and styling.
 */
export default function TabsLayout() {
  const styles = useStyles();
  const isWide = useIsWide();
  // Refetch the open-case count on every navigation so the badge stays current.
  const pathname = usePathname();
  const { data: review } = useResource(() => api.getReviewSummary(), [pathname]);

  const tabList = (
    <TabList asChild>
      <NavContainer isWide={isWide}>
        <TabTrigger name="index" href="/" asChild>
          <NavButton icon="home" isWide={isWide}>
            Өнөөдөр
          </NavButton>
        </TabTrigger>
        <TabTrigger name="review" href="/review" asChild>
          <NavButton icon="check-square" isWide={isWide} badge={review?.open}>
            Шалгах
          </NavButton>
        </TabTrigger>
        <TabTrigger name="orders" href="/orders" asChild>
          <NavButton icon="shopping-bag" isWide={isWide}>
            Захиалга
          </NavButton>
        </TabTrigger>
        <TabTrigger name="transactions" href="/transactions" asChild>
          <NavButton icon="credit-card" isWide={isWide}>Гүйлгээ</NavButton>
        </TabTrigger>
        <TabTrigger name="products" href="/products" asChild>
          <NavButton icon="box" isWide={isWide}>
            Бараа
          </NavButton>
        </TabTrigger>
        <TabTrigger name="report" href="/report" asChild>
          <NavButton icon="file-text" isWide={isWide}>
            Тайлан
          </NavButton>
        </TabTrigger>
        <TabTrigger name="settings" href="/settings" asChild>
          <NavButton icon="settings" isWide={isWide}>
            Тохиргоо
          </NavButton>
        </TabTrigger>
      </NavContainer>
    </TabList>
  );

  return (
    <Tabs style={[styles.root, isWide && styles.rootWide]}>
      {tabList}
      <ContentInsets isWide={isWide}>
        <TabSlot style={styles.slot} />
      </ContentInsets>
    </Tabs>
  );
}

/**
 * On phones the top bar already sits below the status bar, so screens under it get a
 * zero top inset; otherwise they would pad for the status bar a second time.
 */
function ContentInsets({ isWide, children }: { isWide: boolean; children: ReactNode }) {
  const insets = useSafeAreaInsets();
  if (isWide) return children;
  return (
    <SafeAreaInsetsContext.Provider value={{ ...insets, top: 0 }}>
      {children}
    </SafeAreaInsetsContext.Provider>
  );
}

function NavContainer({ isWide, children, ...props }: ViewProps & { isWide: boolean }) {
  const styles = useStyles();
  const insets = useSafeAreaInsets();

  if (!isWide) {
    return (
      <View {...props} style={[styles.topBar, { paddingTop: insets.top + Spacing.one }]}>
        {children}
      </View>
    );
  }

  return (
    <View {...props} style={[styles.sidebar, { paddingTop: insets.top + Spacing.eight }]}>
      <View style={styles.sidebarBrand}>
        <BrandMark size="sm" />
      </View>
      <View style={styles.sidebarItems}>{children}</View>
      <SidebarFooter />
    </View>
  );
}

function SidebarFooter() {
  const colors = useColors();
  const styles = useStyles();
  const user = useUser();
  return (
    <View style={styles.sidebarFooter}>
      <Text variant="label" numberOfLines={1}>
        {user.shopName}
      </Text>
      <Text variant="caption" color={colors.textSecondary}>
        +976 {user.phone}
      </Text>
    </View>
  );
}

function NavButton({
  icon,
  isWide,
  isFocused,
  badge,
  children,
  ...props
}: TabTriggerSlotProps & {
  icon: IconName;
  isWide: boolean;
  /** Count shown on the tab; hidden when 0 or undefined. */
  badge?: number;
  children: ReactNode;
}) {
  const colors = useColors();
  const styles = useStyles();
  const color = isFocused ? colors.primary : colors.textSecondary;
  const badgeView = badge ? (
    <View style={[styles.badge, !isWide && styles.badgeOnIcon]}>
      <Text style={styles.badgeText} color={colors.textOnPrimary}>
        {badge > 99 ? '99+' : badge}
      </Text>
    </View>
  ) : null;

  return (
    <Pressable
      {...props}
      accessibilityRole="tab"
      accessibilityState={{ selected: isFocused }}
      accessibilityLabel={badge ? `${children}, ${badge}` : undefined}
      style={({ pressed }) => [
        isWide ? styles.sideItem : styles.topItem,
        isWide && isFocused && styles.sideItemActive,
        !isWide && isFocused && styles.topItemActive,
        pressed && { opacity: 0.7 },
      ]}>
      <View>
        <Icon name={icon} size={isWide ? 20 : 22} color={color} />
        {!isWide && badgeView}
      </View>
      <Text
        variant={isFocused ? 'captionMedium' : 'caption'}
        color={isFocused ? colors.primary : colors.textSecondary}
        style={isWide ? styles.sideLabel : styles.topLabel}>
        {children}
      </Text>
      {isWide && badgeView}
    </Pressable>
  );
}

const useStyles = makeStyles((colors) => ({
  root: {
    flex: 1,
    backgroundColor: colors.background,
  },
  rootWide: {
    flexDirection: 'row',
  },
  slot: {
    flex: 1,
  },
  badge: {
    minWidth: 20,
    height: 20,
    paddingHorizontal: 5,
    borderRadius: Radius.pill,
    backgroundColor: colors.warningStrong,
    alignItems: 'center',
    justifyContent: 'center',
    marginLeft: 'auto',
  },
  badgeOnIcon: {
    position: 'absolute',
    top: -6,
    right: -12,
    marginLeft: 0,
    borderWidth: 2,
    borderColor: colors.surface,
    height: 22,
    minWidth: 22,
  },
  badgeText: {
    fontSize: 11,
    lineHeight: 14,
    fontFamily: Fonts.bold,
  },
  topBar: {
    flexDirection: 'row',
    backgroundColor: colors.surface,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  topItem: {
    flex: 1,
    alignItems: 'center',
    gap: Spacing.one,
    paddingTop: Spacing.two,
    paddingBottom: Spacing.two,
    // Reserve the indicator's space so the active tab doesn't shift.
    borderBottomWidth: 3,
    borderBottomColor: 'transparent',
  },
  topItemActive: {
    borderBottomColor: colors.primary,
  },
  topLabel: {
    fontSize: 12,
    lineHeight: 16,
  },
  sidebar: {
    width: 248,
    backgroundColor: colors.surface,
    borderRightWidth: 1,
    borderRightColor: colors.border,
    paddingHorizontal: Spacing.four,
    paddingBottom: Spacing.six,
  },
  sidebarBrand: {
    paddingHorizontal: Spacing.two,
    marginBottom: Spacing.eight,
  },
  sidebarItems: {
    flex: 1,
    gap: Spacing.one,
  },
  sideItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.three,
    height: 46,
    paddingHorizontal: Spacing.three,
    borderRadius: Radius.md,
  },
  sideItemActive: {
    backgroundColor: colors.primarySoft,
  },
  sideLabel: {
    fontSize: 15,
  },
  sidebarFooter: {
    paddingHorizontal: Spacing.three,
    paddingTop: Spacing.four,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    gap: Spacing.half,
  },
}));
