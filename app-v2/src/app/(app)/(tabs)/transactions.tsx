import { useState } from 'react';
import { Pressable, View } from 'react-native';
import { api, type ListQuery } from '@/api';
import { DateTimeFilter, Pagination } from '@/components/list-controls';
import { Card } from '@/components/ui/card';
import { LoadState } from '@/components/ui/load-state';
import { Screen } from '@/components/ui/screen';
import { Text } from '@/components/ui/text';
import { TextField } from '@/components/ui/text-field';
import { usePagedResource } from '@/hooks/use-paged-resource';
import { useReloadOnFocus } from '@/hooks/use-resource';
import { formatMoney, formatDateTime } from '@/lib/format';
import { Icon } from '@/components/ui/icon';
import { makeStyles, useColors } from '@/theme';
import { Radius, Spacing } from '@/constants/theme';

export default function TransactionsScreen() {
  const colors = useColors();
  const styles = useStyles();
  const [expanded, setExpanded] = useState<string | null>(null);
  const [range, setRange] = useState<ListQuery>({});
  const [query, setQuery] = useState('');
  const filters = { ...range, q: query.trim() || undefined, limit: 25 };
  const paging = usePagedResource(cursor => api.getTransactionsPage({ ...filters, cursor }), JSON.stringify(filters));
  const { data, error, reload } = paging;
  useReloadOnFocus(reload);
  return <Screen>
    <Text variant="display">Гүйлгээ</Text>

    <DateTimeFilter onRefresh={reload} onChange={setRange} />
    <TextField placeholder="Гүйлгээний утга эсвэл илгээгч хайх" value={query} onChangeText={setQuery} autoCorrect={false} />
    {!data ? <LoadState error={error} onRetry={reload} /> : <View style={{ gap: Spacing.three, marginTop: Spacing.three }}>
      {data.transactions.length === 0 && <Text>Энэ хугацаанд гүйлгээ алга. “Нийт” эсвэл өөр хугацаа сонгоно уу.</Text>}
      {data.transactions.map(payment => <Card key={payment.id}>
        <Pressable accessibilityRole="button" accessibilityLabel="SMS дэлгэрэнгүй" accessibilityState={{ expanded: expanded === payment.id }} onPress={() => setExpanded(expanded === payment.id ? null : payment.id)} style={styles.row}>
          <View style={styles.icon}><Icon name="arrow-down-left" color={colors.primary} /></View>
          <View style={styles.details}>
            <Text variant="heading" color={colors.primary}>+{formatMoney(payment.amount)}</Text>
            <Text variant="bodyMedium" numberOfLines={2}>{payment.note || payment.senderName || 'Банкны орлого'}</Text>
            <Text variant="caption" color={colors.textSecondary}>{formatDateTime(new Date(payment.receivedAt))} · {payment.bank}</Text>
          </View>
          <Icon name={expanded === payment.id ? 'chevron-up' : 'chevron-down'} size={16} color={colors.textMuted} />
        </Pressable>
        {expanded === payment.id && <View style={styles.raw}><Text variant="caption" color={colors.textSecondary}>{payment.rawMessage}</Text></View>}
      </Card>)}
      <Pagination {...paging} total={data.total} count={data.transactions.length} hasNext={!!data.nextCursor} />
    </View>}
  </Screen>;
}

const useStyles = makeStyles(colors => ({
  row: { flexDirection: 'row', alignItems: 'center', gap: Spacing.three },
  icon: { width: 40, height: 40, borderRadius: Radius.md, backgroundColor: colors.primarySoft, alignItems: 'center', justifyContent: 'center' },
  details: { flex: 1, gap: Spacing.one, minWidth: 0 },
  raw: { marginTop: Spacing.four, paddingTop: Spacing.four, borderTopWidth: 1, borderTopColor: colors.border },
}));
