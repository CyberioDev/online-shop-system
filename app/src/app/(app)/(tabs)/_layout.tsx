import { usePathname } from 'expo-router';
import { TabList, TabSlot, TabTrigger, Tabs, type TabTriggerSlotProps } from 'expo-router/ui';
import type { ReactNode } from 'react';
import { Pressable, StyleSheet, View, type ViewProps } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { api } from '@/api';
import { useUser } from '@/auth/auth-context';
import { BrandMark } from '@/components/brand-mark';
import { Icon, type IconName } from '@/components/ui/icon';
import { Text } from '@/components/ui/text';
import { Colors, Fonts, Radius, Spacing } from '@/constants/theme';
import { useIsWide } from '@/hooks/use-is-wide';
import { useResource } from '@/hooks/use-resource';

/**
 * Main navigation: a bottom tab bar on phones and a left sidebar on wide screens.
 * Both come from the same `TabList`, which only changes position and styling.
 */
export default function TabsLayout() {
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
        <TabTrigger name="integrations" href="/integrations" asChild>
          <NavButton icon="link-2" isWide={isWide}>
            Холболт
          </NavButton>
        </TabTrigger>
      </NavContainer>
    </TabList>
  );

  return (
    <Tabs style={[styles.root, isWide && styles.rootWide]}>
      {isWide && tabList}
      <TabSlot style={styles.slot} />
      {!isWide && tabList}
    </Tabs>
  );
}

function NavContainer({ isWide, children, ...props }: ViewProps & { isWide: boolean }) {
  const insets = useSafeAreaInsets();

  if (!isWide) {
    return (
      <View
        {...props}
        style={[styles.bottomBar, { paddingBottom: Math.max(insets.bottom, Spacing.two) }]}>
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
  const user = useUser();
  return (
    <View style={styles.sidebarFooter}>
      <Text variant="label" numberOfLines={1}>
        {user.shopName}
      </Text>
      <Text variant="caption" color={Colors.textSecondary}>
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
  const color = isFocused ? Colors.primary : Colors.textSecondary;
  const badgeView = badge ? (
    <View style={[styles.badge, !isWide && styles.badgeOnIcon]}>
      <Text style={styles.badgeText} color={Colors.textOnPrimary}>
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
        isWide ? styles.sideItem : styles.bottomItem,
        isWide && isFocused && styles.sideItemActive,
        pressed && { opacity: 0.7 },
      ]}>
      <View>
        <Icon name={icon} size={isWide ? 20 : 22} color={color} />
        {!isWide && badgeView}
      </View>
      <Text
        variant={isFocused ? 'captionMedium' : 'caption'}
        color={isFocused ? Colors.primary : Colors.textSecondary}
        style={isWide ? styles.sideLabel : styles.bottomLabel}>
        {children}
      </Text>
      {isWide && badgeView}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: Colors.background,
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
    backgroundColor: Colors.warningStrong,
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
    borderColor: Colors.surface,
    height: 22,
    minWidth: 22,
  },
  badgeText: {
    fontSize: 11,
    lineHeight: 14,
    fontFamily: Fonts.bold,
  },
  bottomBar: {
    flexDirection: 'row',
    backgroundColor: Colors.surface,
    borderTopWidth: 1,
    borderTopColor: Colors.border,
    paddingTop: Spacing.two,
  },
  bottomItem: {
    flex: 1,
    alignItems: 'center',
    gap: Spacing.one,
    paddingVertical: Spacing.one,
  },
  bottomLabel: {
    fontSize: 12,
    lineHeight: 16,
  },
  sidebar: {
    width: 248,
    backgroundColor: Colors.surface,
    borderRightWidth: 1,
    borderRightColor: Colors.border,
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
    backgroundColor: Colors.primarySoft,
  },
  sideLabel: {
    fontSize: 15,
  },
  sidebarFooter: {
    paddingHorizontal: Spacing.three,
    paddingTop: Spacing.four,
    borderTopWidth: 1,
    borderTopColor: Colors.border,
    gap: Spacing.half,
  },
});
